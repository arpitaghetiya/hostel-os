const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Register a new user (student, warden, or security)
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, room_no, hostel_id, phone } = req.body;

    // Validation
    if (!name || !email || !password || !role || !hostel_id) {
      return res.status(400).json({
        error: 'Missing required fields: name, email, password, role, hostel_id'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    const user = await authService.register({ name, email, password, role, room_no, hostel_id, phone });
    res.status(201).json({ message: 'Registration successful.', user });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Registration failed.';
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Login failed.';
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/auth/refresh
 * Get a new access token using a refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Token refresh failed.';
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (protected)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json(user);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to get profile.';
    res.status(status).json({ error: message });
  }
});

module.exports = router;
