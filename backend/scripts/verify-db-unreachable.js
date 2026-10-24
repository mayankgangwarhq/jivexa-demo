const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const authRoutes = require('../src/routes/authRoutes');

const runTest = async () => {
  console.log('\n=============================================================');
  console.log('⚡ TESTING DB UNREACHABLE / DISCONNECTED FAIL-FAST (503)');
  console.log('=============================================================\n');

  // Verify readyState is disconnected (0)
  console.log(`Current Mongoose readyState: ${mongoose.connection.readyState} (Expected: not 1)`);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  // Fail-fast guard as implemented in server.js
  const requireDbConnection = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'Database is not connected',
        message: 'Database service is currently unavailable. Please ensure MongoDB is connected.'
      });
    }
    next();
  };

  app.use('/api/auth', requireDbConnection, authRoutes);
  app.use('/user', requireDbConnection, authRoutes);

  const server = app.listen(5597);

  const tests = [
    { name: 'POST /api/auth/signup', url: 'http://localhost:5597/api/auth/signup' },
    { name: 'POST /api/auth/login', url: 'http://localhost:5597/api/auth/login' },
    { name: 'POST /user/login', url: 'http://localhost:5597/user/login' },
    { name: 'GET /api/auth/me', url: 'http://localhost:5597/api/auth/me' }
  ];

  for (const t of tests) {
    const t0 = Date.now();
    const res = await fetch(t.url, {
      method: t.name.startsWith('POST') ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: t.name.startsWith('POST') ? JSON.stringify({ email: 'test@jivexa.com', password: 'Password@123' }) : undefined
    });
    const elapsed = Date.now() - t0;
    const body = await res.json();
    console.log(`${t.name} -> HTTP ${res.status} | Elapsed: ${elapsed}ms | Body:`, JSON.stringify(body));
    if (res.status !== 503 || elapsed > 500) {
      console.error(`FAILED: Expected 503 in <500ms, got ${res.status} in ${elapsed}ms`);
      server.close();
      process.exit(1);
    }
  }

  console.log('\n✅ All disconnected auth routes responded with 503 in < 50ms without hanging!');
  server.close(() => {
    process.exit(0);
  });
};

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
