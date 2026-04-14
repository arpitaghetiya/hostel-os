const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new gate pass request for a student.
 * Blocks requests made between 9:00 PM and 6:00 AM server time.
 */
function requestPass(studentId, reason, expectedOut, expectedReturn) {
  const now = new Date();
  const currentHour = now.getHours();

  if (currentHour >= 21 || currentHour < 6) {
    throw { status: 403, message: 'Gate pass requests are not allowed between 9:00 PM and 6:00 AM.' };
  }

  // Validate dates
  const outTime = new Date(expectedOut);
  const returnTime = new Date(expectedReturn);

  if (outTime < now) {
    throw { status: 400, message: 'Expected exit time cannot be in the past.' };
  }

  if (returnTime <= outTime) {
    throw { status: 400, message: 'Expected return time must be strictly after expected exit time.' };
  }

  const student = db.prepare(`SELECT hostel_id FROM users WHERE id = ? AND role = 'student'`).get(studentId);
  if (!student) throw { status: 404, message: 'Student not found.' };

  // Check if there are any active/pending passes right now to prevent abuse
  const activeCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM gate_passes 
    WHERE student_id = ? AND status IN ('pending', 'approved', 'active')
  `).get(studentId).cnt;

  if (activeCount > 0) {
    throw { status: 409, message: 'You already have an ongoing or pending gate pass.' };
  }

  const result = db.prepare(`
    INSERT INTO gate_passes (student_id, reason, expected_out, expected_return, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentId, reason, expectedOut, expectedReturn, student.hostel_id);

  // Note: We'd typically dispatch a real-time event or push notification here if we had Warden's active socket.
  return { id: result.lastInsertRowid, status: 'pending' };
}

/**
 * Approves or rejects a pending gate pass.
 * If approved, a secure UUID qr_token is generated for the security scanner.
 */
function updatePassStatus(passId, wardenId, status, note, io) {
  const allowedStatuses = ['approved', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    throw { status: 400, message: 'Invalid status update command.' };
  }

  const pass = db.prepare(`SELECT * FROM gate_passes WHERE id = ?`).get(passId);
  if (!pass) throw { status: 404, message: 'Pass not found.' };
  if (pass.status !== 'pending') throw { status: 400, message: `Cannot modify pass. Current status is ${pass.status}.` };

  const warden = db.prepare(`SELECT hostel_id FROM users WHERE id = ? AND role = 'warden'`).get(wardenId);
  if (!warden || warden.hostel_id !== pass.hostel_id) {
    throw { status: 403, message: 'Unauthorized permission for this hostel.' };
  }

  let qrToken = null;
  if (status === 'approved') {
    qrToken = uuidv4(); // Never sequential or guessable integers
  }

  db.prepare(`
    UPDATE gate_passes 
    SET status = ?, approved_by = ?, approval_note = ?, qr_token = ?
    WHERE id = ?
  `).run(status, wardenId, note || null, qrToken, passId);

  db.prepare(`
    INSERT INTO logs (actor_id, action, target_user_id, gate_pass_id, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(wardenId, `PASS_${status.toUpperCase()}`, pass.student_id, passId, pass.hostel_id);

  return { passId, status, qrToken };
}

/**
 * Handles security scanning the pass QR code.
 */
function scanPass(qrToken, scanAction) {
  if (!qrToken) throw { status: 400, message: 'QR token required.' };

  const pass = db.prepare(`
    SELECT gp.*, u.name as student_name, u.room_no
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.qr_token = ?
  `).get(qrToken);

  if (!pass) {
    throw { status: 404, message: 'Invalid or expired QR token.' };
  }

  const now = new Date().toISOString();

  if (scanAction === 'exit') {
    if (pass.status !== 'approved') {
      throw { status: 400, message: `Exit denied. Pass status is ${pass.status}.` };
    }

    db.prepare(`
      UPDATE gate_passes 
      SET status = 'active', exit_scanned_at = ?
      WHERE id = ?
    `).run(now, pass.id);

    return { success: true, message: 'Exit granted', student: pass.student_name, status: 'active' };

  } else if (scanAction === 'return') {
    if (pass.status !== 'active' && pass.status !== 'overdue') {
      throw { status: 400, message: `Entry denied/Irregular state. Pass status is ${pass.status}.` };
    }

    db.prepare(`
      UPDATE gate_passes 
      SET status = 'closed', return_scanned_at = ?
      WHERE id = ?
    `).run(now, pass.id);

    return { success: true, message: 'Return recorded', student: pass.student_name, status: 'closed' };
  }

  throw { status: 400, message: 'Invalid action (exit or return required).' };
}

/**
 * Get all passes for a specific student.
 */
function getStudentPasses(studentId) {
  return db.prepare(`
    SELECT * FROM gate_passes 
    WHERE student_id = ?
    ORDER BY requested_at DESC
  `).all(studentId);
}

/**
 * Get active/recent passes for the Warden Dashboard.
 */
function getWardenPasses(hostelId) {
  return db.prepare(`
    SELECT gp.*, u.name as student_name, u.room_no 
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.hostel_id = ? 
    ORDER BY 
      CASE status
        WHEN 'pending' THEN 1
        WHEN 'overdue' THEN 2
        WHEN 'active' THEN 3
        WHEN 'approved' THEN 4
        WHEN 'unresolved' THEN 5
        ELSE 6
      END,
      gp.requested_at DESC
  `).all(hostelId);
}

/**
 * Scheduled job: Runs every 15 minutes to flag overdue passes.
 */
function processOverdue() {
  console.log('[GatePass Service] Checking for overdue passes...');
  
  const now = new Date();
  const threshold = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // Expected return + 30 mins

  const overduePasses = db.prepare(`
    SELECT id, student_id, hostel_id FROM gate_passes 
    WHERE status = 'active' AND expected_return <= ?
  `).all(threshold);

  if (overduePasses.length > 0) {
    const updateStmt = db.prepare(`UPDATE gate_passes SET status = 'overdue' WHERE id = ?`);
    const notifyStmt = db.prepare(`INSERT INTO notifications (recipient_id, type, message, hostel_id) VALUES (?, ?, ?, ?)`);
    const selectWardens = db.prepare(`SELECT id FROM users WHERE role = 'warden' AND hostel_id = ?`);
    
    db.transaction(() => {
      for (const pass of overduePasses) {
        updateStmt.run(pass.id);
        
        const wardens = selectWardens.all(pass.hostel_id);
        for(const w of wardens) {
          notifyStmt.run(w.id, 'PASS_OVERDUE', `Pass #${pass.id} for Student ID ${pass.student_id} is overdue!`, pass.hostel_id);
        }
      }
    })();
    console.log(`[GatePass Service] ${overduePasses.length} passes flagged as overdue.`);
  }
}

/**
 * Scheduled job: Runs at 8:00 AM daily to flag passes with no return scan from the previous night.
 */
function processUnresolved() {
  console.log('[GatePass Service] Escalating unresolved overnight passes...');

  // Technically anything currently Overdue or Active at 8am could be considered unresolved 
  // depending on the policy, but typically it applies to passes that missed curfew strictly.
  const unresolvedPasses = db.prepare(`
    SELECT id, student_id, hostel_id FROM gate_passes 
    WHERE status IN ('active', 'overdue')
  `).all();

  if (unresolvedPasses.length > 0) {
    const updateStmt = db.prepare(`UPDATE gate_passes SET status = 'unresolved' WHERE id = ?`);
    const notifyStmt = db.prepare(`INSERT INTO notifications (recipient_id, type, message, hostel_id) VALUES (?, ?, ?, ?)`);
    const selectWardens = db.prepare(`SELECT id FROM users WHERE role = 'warden' AND hostel_id = ?`);
    
    db.transaction(() => {
      for (const pass of unresolvedPasses) {
        updateStmt.run(pass.id);
        
        const wardens = selectWardens.all(pass.hostel_id);
        for(const w of wardens) {
          notifyStmt.run(w.id, 'PASS_UNRESOLVED', `Pass #${pass.id} for Student ID ${pass.student_id} escalated to unresolved from last night.`, pass.hostel_id);
        }
      }
    })();
    console.log(`[GatePass Service] ${unresolvedPasses.length} passes escalated to unresolved.`);
  }
}

/**
 * Verifies a pass token and returns preview data for the security guard to confirm.
 */
function previewPassInfo(qrToken) {
  if (!qrToken) throw { status: 400, message: 'QR token required.' };

  const pass = db.prepare(`
    SELECT gp.*, u.name as student_name, u.room_no
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.qr_token = ?
  `).get(qrToken);

  if (!pass) {
    throw { status: 404, message: 'Invalid or expired QR token.' };
  }

  let nextAction = null;
  if (pass.status === 'approved') nextAction = 'exit';
  else if (pass.status === 'active' || pass.status === 'overdue') nextAction = 'return';
  else throw { status: 400, message: `Pass is currently ${pass.status} and cannot be scanned.` };

  return {
    student: pass.student_name,
    room: pass.room_no,
    status: pass.status,
    nextAction: nextAction
  };
}

module.exports = {
  requestPass,
  updatePassStatus,
  scanPass,
  previewPassInfo,
  getStudentPasses,
  getWardenPasses,
  processOverdue,
  processUnresolved
};
