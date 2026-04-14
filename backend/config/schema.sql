CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'warden', 'security') NOT NULL,
  room_no VARCHAR(50),
  hostel_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_qr_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hostel_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  qr_token VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_hostel_date (hostel_id, date)
);

CREATE TABLE IF NOT EXISTS gate_passes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  reason TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expected_out DATETIME NOT NULL,
  expected_return DATETIME NOT NULL,
  status ENUM('pending', 'approved', 'active', 'closed', 'overdue', 'unresolved', 'rejected') DEFAULT 'pending',
  approved_by INT,
  approval_note TEXT,
  qr_token VARCHAR(255),
  exit_scanned_at DATETIME,
  return_scanned_at DATETIME,
  hostel_id VARCHAR(50) NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  scanned_at DATETIME NOT NULL,
  status ENUM('present', 'late', 'absent', 'out_on_pass') NOT NULL,
  hostel_id VARCHAR(50) NOT NULL,
  gate_pass_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL,
  UNIQUE KEY unique_user_date (user_id, date)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NOT NULL,
  action VARCHAR(255) NOT NULL,
  target_user_id INT,
  gate_pass_id INT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hostel_id VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NOT NULL,
  type VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hostel_id VARCHAR(50) NOT NULL
);
