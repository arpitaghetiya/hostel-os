const express = require('express');
const router = express.Router();
const attendanceService = require('../services/attendance.service');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

/**
 * POST /api/attendance/scan
 * Student scans daily QR code.
 */
router.post('/scan', authenticate, authorize('student'), async (req, res) => {
  try {
    const { qrToken } = req.body;
    
    if (!qrToken) {
      return res.status(400).json({ error: 'QR token is required.' });
    }
    
    const result = await attendanceService.markAttendance(req.user.id, qrToken);
    
    // Emit socket event to update warden dashboard
    const io = req.app.get('io');
    if (io) {
      const stats = await attendanceService.getTodayStats(req.user.hostel_id);
      io.to(`hostel-${req.user.hostel_id}`).emit('attendance_updated', stats);
    }
    
    res.json({ message: 'Attendance marked successfully.', result });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to mark attendance.';
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/attendance/today
 * Warden fetches today's stats and QR token.
 */
router.get('/today', authenticate, authorize('warden'), async (req, res) => {
  try {
    const stats = await attendanceService.getTodayStats(req.user.hostel_id);
    const qrToken = await attendanceService.generateDailyQR(req.user.hostel_id);
    
    res.json({ stats, qrToken, date: attendanceService.getTodayString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve today\'s attendance data.' });
  }
});

module.exports = router;
