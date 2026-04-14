require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

console.log('🔧 Setting up database tables...\n');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'warden', 'security')),
    room_no TEXT,
    hostel_id TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✅ Users table created');

// Attendance table
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    scanned_at DATETIME,
    status TEXT NOT NULL CHECK(status IN ('present', 'late', 'absent', 'out_on_pass')),
    gate_pass_id INTEGER,
    hostel_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id),
    UNIQUE(user_id, date)
  )
`);
console.log('✅ Attendance table created');

// Gate Passes table
db.exec(`
  CREATE TABLE IF NOT EXISTS gate_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_out DATETIME NOT NULL,
    expected_return DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'closed', 'overdue', 'unresolved')),
    approved_by INTEGER,
    approval_note TEXT,
    exit_scanned_at DATETIME,
    return_scanned_at DATETIME,
    qr_token TEXT UNIQUE,
    hostel_id TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  )
`);
console.log('✅ Gate Passes table created');

// Logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    action TEXT NOT NULL,
    target_user_id INTEGER,
    gate_pass_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    hostel_id TEXT,
    FOREIGN KEY (actor_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id),
    FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id)
  )
`);
console.log('✅ Logs table created');

// Notifications table
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hostel_id TEXT,
    FOREIGN KEY (recipient_id) REFERENCES users(id)
  )
`);
console.log('✅ Notifications table created');

// Refresh tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
console.log('✅ Refresh Tokens table created');

// Daily QR codes table
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostel_id TEXT NOT NULL,
    date TEXT NOT NULL,
    qr_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostel_id, date)
  )
`);
console.log('✅ Daily QR Codes table created');

console.log('\n🎉 Database setup complete!');
process.exit(0);
