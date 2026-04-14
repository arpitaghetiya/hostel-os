require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.io setup for real-time features (Module 4)
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// ── Middleware ──────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// ── Health check ──────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──────────────────────────────────
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Module 2: Attendance routes
const attendanceRoutes = require('./routes/attendance');
app.use('/api/attendance', attendanceRoutes);

// Module 3: Gate Pass routes
const gatepassRoutes = require('./routes/gatepass');
app.use('/api/gatepass', gatepassRoutes);

// Module 4: Dashboard routes
// const dashboardRoutes = require('./routes/dashboard');
// app.use('/api/dashboard', dashboardRoutes);

// ── Socket.io connection ──────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-hostel', (hostelId) => {
    socket.join(`hostel-${hostelId}`);
    console.log(`📡 Socket ${socket.id} joined hostel-${hostelId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ── Scheduled Jobs ──────────────────────────────────
const { initCronJobs } = require('./jobs/attendance.jobs');
initCronJobs(io);
const { initGatepassJobs } = require('./jobs/gatepass.jobs');
initGatepassJobs(io);

// ── Error handling ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start server ──────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🏨 Hostel Management Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health\n`);
});
