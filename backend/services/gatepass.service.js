const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function requestPass(studentId, reason, expectedOut, expectedReturn) {
  const currentHour = new Date().getHours();
  if (currentHour >= 21 || currentHour < 6) {
    throw { status: 403, message: 'Gate pass requests are blocked between 9:00 PM and 6:00 AM.' };
  }

  const [users] = await db.execute('SELECT hostel_id FROM users WHERE id = ?', [studentId]);
  const hostelId = users[0].hostel_id;

  const [result] = await db.execute(`
    INSERT INTO gate_passes (student_id, reason, expected_out, expected_return, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `, [studentId, reason, expectedOut, expectedReturn, hostelId]);

  return { id: result.insertId, status: 'pending' };
}

async function updatePassStatus(passId, wardenId, status, approvalNote = '') {
  let qrToken = null;
  if (status === 'approved') {
    qrToken = uuidv4();
  }

  await db.execute(`
    UPDATE gate_passes 
    SET status = ?, approved_by = ?, approval_note = ?, qr_token = ?
    WHERE id = ?
  `, [status, wardenId, approvalNote, qrToken, passId]);

  const [passes] = await db.execute('SELECT student_id, hostel_id FROM gate_passes WHERE id = ?', [passId]);
  const pass = passes[0];

  await db.execute(`
    INSERT INTO logs (actor_id, action, target_user_id, gate_pass_id, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `, [wardenId, `SET_PASS_${status.toUpperCase()}`, pass.student_id, passId, pass.hostel_id]);

  return { passId, status, qrToken };
}

async function scanPass(qrToken, scanAction) {
  if (!qrToken) throw { status: 400, message: 'QR token required.' };

  const [passes] = await db.execute(`
    SELECT gp.*, u.name as student_name
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.qr_token = ?
  `, [qrToken]);
  const pass = passes[0];

  if (!pass) {
    throw { status: 404, message: 'Invalid or expired QR token.' };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (scanAction === 'exit') {
    if (pass.status !== 'approved') {
      throw { status: 400, message: `Pass cannot be used for exit. Current status: ${pass.status}` };
    }
    
    await db.execute(`
      UPDATE gate_passes 
      SET status = 'active', exit_scanned_at = ?
      WHERE id = ?
    `, [now, pass.id]);
    
    return { message: 'Exit granted', student: pass.student_name, status: 'active' };

  } else if (scanAction === 'return') {
    if (pass.status !== 'active' && pass.status !== 'overdue') {
      throw { status: 400, message: `Pass cannot be used for return. Current status: ${pass.status}` };
    }

    await db.execute(`
      UPDATE gate_passes 
      SET status = 'closed', return_scanned_at = ?
      WHERE id = ?
    `, [now, pass.id]);

    return { message: 'Return recorded', student: pass.student_name, status: 'closed' };

  } else {
    throw { status: 400, message: 'Invalid scan action. Must be exit or return.' };
  }
}

async function getStudentPasses(studentId) {
  const [passes] = await db.execute(`
    SELECT * FROM gate_passes WHERE student_id = ? ORDER BY requested_at DESC
  `, [studentId]);
  return passes;
}

async function getWardenPasses(hostelId) {
  const [passes] = await db.execute(`
    SELECT gp.*, u.name as student_name, u.room_no
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.hostel_id = ?
    ORDER BY gp.requested_at DESC
  `, [hostelId]);
  return passes;
}

async function processOverdue(io) {
  console.log('[GatePass Service] Checking for overdue passes...');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const [passesToUpdate] = await db.execute(`
    SELECT id, hostel_id FROM gate_passes 
    WHERE status = 'active' AND expected_return < ?
  `, [now]);

  let count = 0;
  for (const p of passesToUpdate) {
     await db.execute(`UPDATE gate_passes SET status = 'overdue' WHERE id = ?`, [p.id]);
     count++;
     if (io) {
       io.to(`hostel-${p.hostel_id}`).emit('gatepass_updated');
     }
  }

  console.log(`[GatePass Service] ${count} passes flagged as overdue.`);
}

async function processUnresolved(io) {
  console.log('[GatePass Service] Checking for unresolved passes from yesterday...');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const [passesToUpdate] = await db.execute(`
    SELECT id, hostel_id FROM gate_passes 
    WHERE status IN ('active', 'overdue') AND expected_return < ?
  `, [now]);

  let count = 0;
  for (const p of passesToUpdate) {
     await db.execute(`UPDATE gate_passes SET status = 'unresolved' WHERE id = ?`, [p.id]);
     count++;
     if (io) {
       io.to(`hostel-${p.hostel_id}`).emit('gatepass_updated');
     }
  }

  console.log(`[GatePass Service] ${count} passes escalated to unresolved.`);
}

async function previewPassInfo(qrToken) {
  if (!qrToken) throw { status: 400, message: 'QR token required.' };

  const [passes] = await db.execute(`
    SELECT gp.*, u.name as student_name, u.room_no
    FROM gate_passes gp
    JOIN users u ON gp.student_id = u.id
    WHERE gp.qr_token = ?
  `, [qrToken]);
  
  const pass = passes[0];

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
