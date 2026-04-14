const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const attendanceService = require('../services/attendance.service');

// Get tokens directly for testing
function generateToken(email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, hostel_id: user.hostel_id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runTest() {
  console.log('Testing Module 2: Attendance System\n');
  
  // 1. Warden generates/views today's QR
  console.log('--- WARDEN PERSPECTIVE ---');
  const wardenToken = generateToken('warden@hostel.com');
  const wardenUser = db.prepare('SELECT hostel_id FROM users WHERE email = ?').get('warden@hostel.com');
  
  const qrToken = attendanceService.generateDailyQR(wardenUser.hostel_id);
  console.log(`[Warden] Daily QR Token for ${wardenUser.hostel_id}: ${qrToken}`);
  
  const preStats = attendanceService.getTodayStats(wardenUser.hostel_id);
  console.log('[Warden] Pre-scan Attendance Stats:', preStats.counts);
  
  // 2. Student scans it
  console.log('\n--- STUDENT PERSPECTIVE ---');
  const studentEmail = 'student@hostel.com';
  const student = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail);
  
  console.log(`[Student] ${studentEmail} (ID:${student.id}) scanning the QR token...`);
  try {
    const result = attendanceService.markAttendance(student.id, qrToken);
    console.log(`[Student] Success! Marked as ${result.status} at ${result.scannedAt}`);
  } catch (e) {
    console.error(`[Student] Failed: ${e.message}`);
  }
  
  // 3. Duplicate scan test
  console.log('\n[Student] Attempting duplicate scan...');
  try {
    attendanceService.markAttendance(student.id, qrToken);
    console.error('[Student] ERROR: Duplicate scan succeeded when it should have failed!');
  } catch (e) {
    console.log(`[Student] Duplicate scan correctly rejected: ${e.message}`);
  }
  
  // 4. Warden views updated stats
  console.log('\n--- WARDEN PERSPECTIVE ---');
  const postStats = attendanceService.getTodayStats(wardenUser.hostel_id);
  console.log('[Warden] Post-scan Attendance Stats:', postStats.counts);
  console.log('\nRecent Logs:');
  postStats.logs.forEach(l => console.log(`  - ${l.actor_name} performed ${l.action}`));
  
  console.log('\nTesting complete.');
}

runTest();
