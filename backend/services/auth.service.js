const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SALT_ROUNDS = 12;

async function register({ name, email, password, role, room_no, hostel_id, phone }) {
  const validRoles = ['student', 'warden', 'security'];
  if (!validRoles.includes(role)) {
    throw { status: 400, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` };
  }

  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    throw { status: 409, message: 'An account with this email already exists.' };
  }

  if (role === 'student' && !room_no) {
    throw { status: 400, message: 'Room number is required for students.' };
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [result] = await db.execute(`
    INSERT INTO users (name, email, password, role, room_no, hostel_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [name, email, password_hash, role, room_no || null, hostel_id]);

  await db.execute(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `, [result.insertId, 'USER_REGISTERED', result.insertId, hostel_id]);

  return {
    id: result.insertId,
    name,
    email,
    role,
    room_no,
    hostel_id
  };
}

async function login({ email, password }) {
  const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (users.length === 0) {
    throw { status: 401, message: 'Invalid email or password.' };
  }
  const user = users[0];

  // Note: users table uses 'password', previous code used 'password_hash'. I updated schema to 'password'.
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiresAt = expiresDate.toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(`
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `, [user.id, refreshToken, expiresAt]);

  await db.execute(`
    INSERT INTO logs (actor_id, action, target_user_id, hostel_id)
    VALUES (?, ?, ?, ?)
  `, [user.id, 'USER_LOGIN', user.id, user.hostel_id]);

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

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw { status: 400, message: 'Refresh token is required.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw { status: 401, message: 'Invalid or expired refresh token.' };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const [storedTokens] = await db.execute(`
    SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > ?
  `, [refreshToken, now]);

  if (storedTokens.length === 0) {
    throw { status: 401, message: 'Refresh token not found or expired. Please login again.' };
  }

  const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [decoded.id]);
  if (users.length === 0) {
    throw { status: 401, message: 'User not found.' };
  }

  const accessToken = generateAccessToken(users[0]);
  return { accessToken };
}

async function logout(refreshToken) {
  if (refreshToken) {
    await db.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  }
}

async function getProfile(userId) {
  const [users] = await db.execute('SELECT id, name, email, role, room_no, hostel_id, created_at FROM users WHERE id = ?', [userId]);
  if (users.length === 0) {
    throw { status: 404, message: 'User not found.' };
  }
  return users[0];
}

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
