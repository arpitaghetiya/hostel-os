const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

const SALT_ROUNDS = 12;

/**
 * Register a new user.
 * Validates uniqueness of email, hashes password, and creates the user record.
 */
function register({ name, email, password, role, room_no, hostel_id, phone }) {
  // Validate role
  const validRoles = ['student', 'warden', 'security'];
  if (!validRoles.includes(role)) {
    throw { status: 400, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` };
  }

  // Check if email already exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw { status: 409, message: 'An account with this email already exists.' };
  }

  // Students must have a room number
  if (role === 'student' && !room_no) {
    throw { status: 400, message: 'Room number is required for students.' };
  }

  const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);

  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, room_no, hostel_id, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(name, email, password_hash, role, room_no || null, hostel_id, phone || null);

  // Log the registration
  const logStmt = db.prepare(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `);
  logStmt.run(result.lastInsertRowid, 'USER_REGISTERED', result.lastInsertRowid, hostel_id);

  return {
    id: result.lastInsertRowid,
    name,
    email,
    role,
    room_no,
    hostel_id
  };
}

/**
 * Login user with email and password.
 * Returns access token, refresh token, and user profile.
 */
function login({ email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token in DB
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, refreshToken, expiresAt);

  // Log the login
  db.prepare(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `).run(user.id, 'USER_LOGIN', user.id, user.hostel_id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      room_no: user.room_no,
      hostel_id: user.hostel_id
    }
  };
}

/**
 * Refresh the access token using a valid refresh token.
 */
function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw { status: 400, message: 'Refresh token is required.' };
  }

  // Verify the refresh token JWT
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw { status: 401, message: 'Invalid or expired refresh token.' };
  }

  // Check if refresh token exists in DB and hasn't expired
  const stored = db.prepare(`
    SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')
  `).get(refreshToken);

  if (!stored) {
    throw { status: 401, message: 'Refresh token not found or expired. Please login again.' };
  }

  // Get the user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!user) {
    throw { status: 401, message: 'User not found.' };
  }

  // Generate new access token
  const accessToken = generateAccessToken(user);

  return { accessToken };
}

/**
 * Logout by removing the refresh token from DB.
 */
function logout(refreshToken) {
  if (refreshToken) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  }
}

/**
 * Get user profile by ID.
 */
function getProfile(userId) {
  const user = db.prepare('SELECT id, name, email, role, room_no, hostel_id, phone, created_at FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw { status: 404, message: 'User not found.' };
  }
  return user;
}

// ── Token Generators ──────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, hostel_id: user.hostel_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}

module.exports = { register, login, refreshAccessToken, logout, getProfile };
