const cron = require('node-cron');
const db = require('../config/db');
const attendanceService = require('../services/attendance.service');

function initCronJobs(io) {
  console.log('⏰ Initializing scheduled jobs...');

  // 1. Midnight QR Generation
  // Runs every day at 00:00 (Midnight)
  cron.schedule('0 0 * * *', () => {
    console.log('[CRON] Running daily QR generation at midnight');
    try {
      // Get all unique hostels
      const hostelsResult = db.prepare('SELECT DISTINCT hostel_id FROM users WHERE hostel_id IS NOT NULL').all();
      
      for (const row of hostelsResult) {
        attendanceService.generateDailyQR(row.hostel_id);
        console.log(`[CRON] Generated QR for ${row.hostel_id}`);
      }
    } catch (err) {
      console.error('[CRON] Failed to generate daily QRs:', err);
    }
  });

  // 2. Auto-ABSENT Marking & Warden Alerts
  // Runs every day at 21:30 (9:30 PM)
  cron.schedule('30 21 * * *', () => {
    console.log('[CRON] Running auto-absent job at 9:30 PM');
    try {
      const hostelsResult = db.prepare('SELECT DISTINCT hostel_id FROM users WHERE hostel_id IS NOT NULL').all();
      
      for (const row of hostelsResult) {
        attendanceService.processAbsentees(row.hostel_id, io);
      }
    } catch (err) {
      console.error('[CRON] Failed to process absentees:', err);
    }
  });
  
  // Ensure we have a QR code for today when server starts
  try {
    const hostelsResult = db.prepare('SELECT DISTINCT hostel_id FROM users WHERE hostel_id IS NOT NULL').all();
    for (const row of hostelsResult) {
      attendanceService.generateDailyQR(row.hostel_id);
    }
    console.log('✅ Initial daily QRs verified/created');
  } catch(e) {
    console.error('Failed to init QRs:', e);
  }
}

module.exports = { initCronJobs };
