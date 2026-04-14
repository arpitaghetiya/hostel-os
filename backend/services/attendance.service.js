const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Gets today's date formatted as YYYY-MM-DD
 */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a daily QR token for a hostel, or returns the existing one if already generated today.
 */
function generateDailyQR(hostelId) {
  const today = getTodayString();
  
  // Check if QR already exists for today
  const existing = db.prepare('SELECT qr_token FROM daily_qr_codes WHERE hostel_id = ? AND date = ?').get(hostelId, today);
  
  if (existing) {
    return existing.qr_token;
  }
  
  // Create a new QR token
  const newToken = uuidv4();
  
  db.prepare(`
    INSERT INTO daily_qr_codes (hostel_id, date, qr_token)
    VALUES (?, ?, ?)
  `).run(hostelId, today, newToken);
  
  return newToken;
}

/**
 * Marks attendance for a user based on scanning the daily QR code.
 */
function markAttendance(userId, qrToken) {
  const user = db.prepare('SELECT id, role, hostel_id FROM users WHERE id = ?').get(userId);
  
  if (!user || user.role !== 'student') {
    throw { status: 403, message: 'Only students can mark attendance.' };
  }
  
  const today = getTodayString();
  
  // Verify token
  const validToken = db.prepare('SELECT id FROM daily_qr_codes WHERE hostel_id = ? AND date = ? AND qr_token = ?').get(user.hostel_id, today, qrToken);
  
  if (!validToken) {
    throw { status: 400, message: 'Invalid or expired QR code.' };
  }
  
  // Check if already marked today
  const existing = db.prepare('SELECT status FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
  
  if (existing) {
    throw { status: 400, message: `Already marked today as: ${existing.status}` };
  }
  
  // Determine status (Before 9:30 PM is PRESENT, after is LATE)
  const now = new Date();
  
  // Create a Date object for 9:30 PM today (local server time representing expected behavior)
  const cutoffTime = new Date();
  cutoffTime.setHours(21, 30, 0, 0); 
  
  let status = 'present';
  if (now > cutoffTime) {
    status = 'late';
  }
  
  const scannedAt = now.toISOString();
  
  // Insert attendance
  db.prepare(`
    INSERT INTO attendance (user_id, date, scanned_at, status, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, today, scannedAt, status, user.hostel_id);
  
  // Log the action
  db.prepare(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `).run(userId, 'MARKED_ATTENDANCE', userId, user.hostel_id);
  
  return { status, scannedAt };
}

/**
 * Scheduled job to mark unmarked students as ABSENT or OUT_ON_PASS at 9:30 PM.
 */
function processAbsentees(hostelId, io) {
  const today = getTodayString();
  
  console.log(`[Attendance Service] Processing absentees for hostel ${hostelId} for ${today}...`);
  
  // Get all students for this hostel
  const students = db.prepare(`SELECT id FROM users WHERE role = 'student' AND hostel_id = ?`).all(hostelId);
  
  let markedAbsent = 0;
  let markedOutOnPass = 0;
  
  // In a real DB we'd do a batch insert/update, for SQLite this is fine.
  const insertAttendance = db.prepare(`
    INSERT INTO attendance (user_id, date, scanned_at, status, hostel_id, gate_pass_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const checkPass = db.prepare(`
    SELECT id FROM gate_passes 
    WHERE student_id = ? AND status = 'active'
  `);
  
  db.transaction(() => {
    for (const student of students) {
      // Check if they have an attendance record today
      const hasRecord = db.prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?').get(student.id, today);
      
      if (!hasRecord) {
        // Check if out on pass
        const activePass = checkPass.get(student.id);
        
        if (activePass) {
          insertAttendance.run(student.id, today, new Date().toISOString(), 'out_on_pass', hostelId, activePass.id);
          markedOutOnPass++;
        } else {
          insertAttendance.run(student.id, today, new Date().toISOString(), 'absent', hostelId, null);
          markedAbsent++;
          
          // Notify wardens
          const wardens = db.prepare(`SELECT id FROM users WHERE role = 'warden' AND hostel_id = ?`).all(hostelId);
          const notify = db.prepare('INSERT INTO notifications (recipient_id, type, message, hostel_id) VALUES (?, ?, ?, ?)');
          for(const w of wardens) {
              notify.run(w.id, 'ABSENT_ALERT', `Student ID ${student.id} was marked absent.`, hostelId);
          }
        }
      }
    }
  })();
  
  console.log(`[Attendance Service] Marked ${markedAbsent} absent, ${markedOutOnPass} out on pass.`);
  
  // Emit WebSocket update to wardens in this hostel
  if (io) {
    const stats = getTodayStats(hostelId);
    io.to(`hostel-${hostelId}`).emit('attendance_updated', stats);
  }
}

/**
 * Gets aggregated stats for today for Warden Dashboard
 */
function getTodayStats(hostelId) {
  const today = getTodayString();
  
  // Total students
  const totalStudentsRes = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND hostel_id = ?`).get(hostelId);
  const totalStudents = totalStudentsRes ? totalStudentsRes.count : 0;
  
  // Get counts by status
  const statsRes = db.prepare(`
    SELECT status, COUNT(*) as count FROM attendance 
    WHERE hostel_id = ? AND date = ?
    GROUP BY status
  `).all(hostelId, today);
  
  const stats = {
    present: 0,
    late: 0,
    absent: 0,
    out_on_pass: 0,
    unmarked: totalStudents
  };
  
  for (const row of statsRes) {
    stats[row.status] = row.count;
    stats.unmarked -= row.count;
  }
  
  // Also fetch recent activity (last 20 events)
  const recentLogsRes = db.prepare(`
    SELECT l.id, l.action, l.timestamp, u.name as actor_name, t.name as target_name
    FROM logs l
    LEFT JOIN users u ON l.actor_id = u.id
    LEFT JOIN users t ON l.target_user_id = t.id
    WHERE l.hostel_id = ?
    ORDER BY l.timestamp DESC LIMIT 20
  `).all(hostelId);
  
  return { counts: stats, logs: recentLogsRes };
}

module.exports = {
  getTodayString,
  generateDailyQR,
  markAttendance,
  processAbsentees,
  getTodayStats
};
