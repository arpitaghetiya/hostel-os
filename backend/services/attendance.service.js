const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function generateDailyQR(hostelId) {
  const today = getTodayString();
  
  const [existing] = await db.execute('SELECT qr_token FROM daily_qr_codes WHERE hostel_id = ? AND date = ?', [hostelId, today]);
  
  if (existing.length > 0) {
    return existing[0].qr_token;
  }
  
  const newToken = uuidv4();
  
  await db.execute(`
    INSERT INTO daily_qr_codes (hostel_id, date, qr_token)
    VALUES (?, ?, ?)
  `, [hostelId, today, newToken]);
  
  return newToken;
}

async function markAttendance(userId, qrToken) {
  const [users] = await db.execute('SELECT id, role, hostel_id FROM users WHERE id = ?', [userId]);
  const user = users[0];
  
  if (!user || user.role !== 'student') {
    throw { status: 403, message: 'Only students can mark attendance.' };
  }
  
  const today = getTodayString();
  
  const [validTokens] = await db.execute('SELECT id FROM daily_qr_codes WHERE hostel_id = ? AND date = ? AND qr_token = ?', [user.hostel_id, today, qrToken]);
  
  if (validTokens.length === 0) {
    throw { status: 400, message: 'Invalid or expired QR code.' };
  }
  
  const [existing] = await db.execute('SELECT status FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);
  
  if (existing.length > 0) {
    throw { status: 400, message: `Already marked today as: ${existing[0].status}` };
  }
  
  const now = new Date();
  const cutoffTime = new Date();
  cutoffTime.setHours(21, 30, 0, 0); 
  
  let status = 'present';
  if (now > cutoffTime) {
    status = 'late';
  }
  
  // Create MySQL compatible datetime string locally
  const scannedAt = now.toISOString().slice(0, 19).replace('T', ' ');
  
  await db.execute(`
    INSERT INTO attendance (user_id, date, scanned_at, status, hostel_id)
    VALUES (?, ?, ?, ?, ?)
  `, [userId, today, scannedAt, status, user.hostel_id]);
  
  await db.execute(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `, [userId, 'MARKED_ATTENDANCE', userId, user.hostel_id]);
  
  return { status, scannedAt };
}

async function processAbsentees(hostelId, io) {
  const today = getTodayString();
  console.log(`[Attendance Service] Processing absentees for hostel ${hostelId} for ${today}...`);
  
  const [students] = await db.execute('SELECT id FROM users WHERE role = "student" AND hostel_id = ?', [hostelId]);
  
  let markedAbsent = 0;
  let markedOutOnPass = 0;
  
  const connection = await db.getConnection();
  await connection.beginTransaction();
  
  try {
    const timeNow = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const student of students) {
      const [hasRecord] = await connection.execute('SELECT id FROM attendance WHERE user_id = ? AND date = ?', [student.id, today]);
      
      if (hasRecord.length === 0) {
        const [activePass] = await connection.execute(`SELECT id FROM gate_passes WHERE student_id = ? AND status = 'active'`, [student.id]);
        
        if (activePass.length > 0) {
          await connection.execute(`
            INSERT INTO attendance (user_id, date, scanned_at, status, hostel_id, gate_pass_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [student.id, today, timeNow, 'out_on_pass', hostelId, activePass[0].id]);
          markedOutOnPass++;
        } else {
          await connection.execute(`
            INSERT INTO attendance (user_id, date, scanned_at, status, hostel_id, gate_pass_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [student.id, today, timeNow, 'absent', hostelId, null]);
          markedAbsent++;
          
          const [wardens] = await connection.execute('SELECT id FROM users WHERE role = "warden" AND hostel_id = ?', [hostelId]);
          for(const w of wardens) {
              await connection.execute('INSERT INTO notifications (recipient_id, type, message, hostel_id) VALUES (?, ?, ?, ?)', 
              [w.id, 'ABSENT_ALERT', `Student ID ${student.id} was marked absent.`, hostelId]);
          }
        }
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error('Failed processing absentees:', err);
  } finally {
    connection.release();
  }
  
  console.log(`[Attendance Service] Marked ${markedAbsent} absent, ${markedOutOnPass} out on pass.`);
  
  if (io) {
    const stats = await getTodayStats(hostelId);
    io.to(`hostel-${hostelId}`).emit('attendance_updated', stats);
  }
}

async function getTodayStats(hostelId) {
  const today = getTodayString();
  
  const [totalStudentsRes] = await db.execute(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND hostel_id = ?`, [hostelId]);
  const totalStudents = totalStudentsRes[0].count;
  
  const [statsRes] = await db.execute(`
    SELECT status, COUNT(*) as count FROM attendance 
    WHERE hostel_id = ? AND date = ?
    GROUP BY status
  `, [hostelId, today]);
  
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
  
  const [recentLogsRes] = await db.execute(`
    SELECT l.id, l.action, l.timestamp, u.name as actor_name, t.name as target_name
    FROM logs l
    LEFT JOIN users u ON l.actor_id = u.id
    LEFT JOIN users t ON l.target_user_id = t.id
    WHERE l.hostel_id = ?
    ORDER BY l.timestamp DESC LIMIT 20
  `, [hostelId]);
  
  return { counts: stats, logs: recentLogsRes };
}

module.exports = {
  getTodayString,
  generateDailyQR,
  markAttendance,
  processAbsentees,
  getTodayStats
};
