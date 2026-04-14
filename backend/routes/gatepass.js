const express = require('express');
const router = express.Router();
const gatepassService = require('../services/gatepass.service');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

/**
 * GET /api/gatepass/student
 * Fetch all gate passes for the logged-in student.
 */
router.get('/student', authenticate, authorize('student'), async (req, res) => {
  try {
    const passes = await gatepassService.getStudentPasses(req.user.id);
    res.json(passes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve passes.' });
  }
});

/**
 * POST /api/gatepass/request
 * Student requests a new gate pass.
 */
router.post('/request', authenticate, authorize('student'), async (req, res) => {
  try {
    const { reason, expectedOut, expectedReturn } = req.body;
    
    if (!reason || !expectedOut || !expectedReturn) {
      return res.status(400).json({ error: 'Reason, expected exit, and expected return are required.' });
    }

    const result = await gatepassService.requestPass(req.user.id, reason, expectedOut, expectedReturn);
    
    // Alert wardens via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`hostel-${req.user.hostel_id}`).emit('gatepass_updated');
    }

    res.status(201).json({ message: 'Request submitted.', result });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to request gate pass.';
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/gatepass/warden
 * Fetch all gate passes for a warden's hostel.
 */
router.get('/warden', authenticate, authorize('warden'), async (req, res) => {
  try {
    const passes = await gatepassService.getWardenPasses(req.user.hostel_id);
    res.json(passes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve passes.' });
  }
});

/**
 * POST /api/gatepass/approve
 * Warden approves or rejects a pass.
 */
router.post('/approve', authenticate, authorize('warden'), async (req, res) => {
  try {
    const { passId, status, note } = req.body;
    
    if (!passId || !status) {
      return res.status(400).json({ error: 'Pass ID and status are required.' });
    }

    const io = req.app.get('io');
    const result = await gatepassService.updatePassStatus(passId, req.user.id, status, note, io);
    
    if (io) {
      io.to(`hostel-${req.user.hostel_id}`).emit('gatepass_updated');
    }

    res.json({ message: `Pass ${status}.`, result });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to update pass status.';
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/gatepass/scan
 * Security scans a student's QR to log exit/return.
 */
router.post('/scan', authenticate, authorize('security'), async (req, res) => {
  try {
    const { qrToken, action } = req.body; // action: 'exit' or 'return'
    
    if (!qrToken || !action) {
      return res.status(400).json({ error: 'QR token and action type required.' });
    }

    const result = await gatepassService.scanPass(qrToken, action);
    
    const io = req.app.get('io');
    if (io) {
      io.to(`hostel-${req.user.hostel_id}`).emit('gatepass_updated');
    }

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Scan failed.';
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/gatepass/verify/:qrToken
 * Security scans a pass to preview the student details and next action.
 */
router.get('/verify/:qrToken', authenticate, authorize('security'), async (req, res) => {
  try {
    const result = await gatepassService.previewPassInfo(req.params.qrToken);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to verify pass.';
    res.status(status).json({ error: message });
  }
});

module.exports = router;
