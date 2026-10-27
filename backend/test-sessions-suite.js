require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { connectDB, isMongoConfigured, isDatabaseConnected } = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const User = require('./src/models/User');
const Session = require('./src/models/Session');
const config = require('./src/config/env');

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🔒 JIVEXA HEALTH - ACTIVE LOGIN SESSIONS & REVOCATION TEST SUITE');
  console.log('======================================================\n');

  let server;
  const PORT = 5597;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? '- ' + details : ''}`);
      failed++;
    }
  };

  try {
    const isMongo = isMongoConfigured();
    if (isMongo) {
      try {
        await connectDB();
        console.log('Connected to MongoDB Atlas successfully.');
      } catch (connErr) {
        console.warn('⚠️ MongoDB connection notice:', connErr.message);
      }
    }

    const app = express();
    app.set('trust proxy', 1);
    app.use(cors());
    app.use(express.json());
    app.use(cookieParser());

    app.use('/api/auth', authRoutes);

    await new Promise((resolve) => {
      server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`Test server running at ${BASE_URL}\n`);
        resolve();
      });
    });

    const uniqueSuffix = Date.now();
    const user1Email = `session.user1.${uniqueSuffix}@test.local`;
    const user2Email = `session.user2.${uniqueSuffix}@test.local`;
    const password = 'SecurePassword123!';

    let user1TokenDevice1 = '';
    let user1SessionIdDevice1 = '';
    let user1TokenDevice2 = '';
    let user1SessionIdDevice2 = '';
    let user1TokenDevice3 = '';
    let user1SessionIdDevice3 = '';
    let user2Token = '';
    let user2SessionId = '';

    // ----------------------------------------------------
    // TEST 1: Register User 1 & Authenticated Login (Device 1: Chrome on Windows)
    // ----------------------------------------------------
    console.log('Test 1: User Registration & Session Creation on Login...');
    {
      const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Session Test User 1',
          email: user1Email,
          password,
          role: 'PATIENT'
        })
      });
      assert(regRes.status === 201, 'User 1 registered successfully (201)');

      // Login from Device 1 (Chrome on Windows Desktop)
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({ email: user1Email, password })
      });
      const loginBody = await loginRes.json();

      assert(loginRes.status === 200, 'Login succeeded with HTTP 200');
      assert(Boolean(loginBody.token), 'Login returned valid JWT token');
      assert(Boolean(loginBody.sessionId), 'Login returned unique sessionId');

      user1TokenDevice1 = loginBody.token;
      user1SessionIdDevice1 = loginBody.sessionId;

      // Verify JWT payload binds sessionId
      const decoded = jwt.decode(user1TokenDevice1);
      assert(decoded && decoded.sessionId === user1SessionIdDevice1, 'JWT payload securely binds sessionId');

      // Verify session stored in MongoDB
      if (isDatabaseConnected()) {
        const storedSession = await Session.findOne({ sessionId: user1SessionIdDevice1 });
        assert(Boolean(storedSession), 'Session document exists in MongoDB');
        assert(storedSession.device.includes('Chrome on Windows'), 'Device detected as Chrome on Windows');
        assert(storedSession.isRevoked === false, 'Session is initially active (isRevoked = false)');
        assert(storedSession.location === 'Local / Private Network', 'Truthful location (Local / Private Network)');
      }
    }

    // ----------------------------------------------------
    // TEST 2: List Active Sessions & Verify "THIS DEVICE" Identification
    // ----------------------------------------------------
    console.log('\nTest 2: List Active Sessions & Current Device Detection...');
    {
      const sessRes = await fetch(`${BASE_URL}/api/auth/sessions`, {
        headers: {
          'Authorization': `Bearer ${user1TokenDevice1}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
      });
      const sessBody = await sessRes.json();

      assert(sessRes.status === 200, 'GET /api/auth/sessions returned 200 OK');
      assert(sessBody.success === true, 'Response success is true');
      assert(Array.isArray(sessBody.sessions), 'Sessions is an array');

      const currentSess = sessBody.sessions.find((s) => s.id === user1SessionIdDevice1);
      assert(Boolean(currentSess), 'Found current session in list');
      assert(currentSess && currentSess.isCurrent === true, 'Current device correctly marked with isCurrent: true');
      assert(currentSess && !currentSess.device.includes('Pixel 8'), 'No fabricated Pixel 8 device');
      assert(currentSess && !currentSess.location.includes('Bengaluru'), 'No fabricated Bengaluru location');
    }

    // ----------------------------------------------------
    // TEST 3: Multi-Device Login (Device 2: iPhone Safari)
    // ----------------------------------------------------
    console.log('\nTest 3: Multi-Device Login & Device Form Factor Parsing...');
    {
      const loginRes2 = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
        },
        body: JSON.stringify({ email: user1Email, password })
      });
      const loginBody2 = await loginRes2.json();

      assert(loginRes2.status === 200, 'Login from Device 2 succeeded with HTTP 200');
      user1TokenDevice2 = loginBody2.token;
      user1SessionIdDevice2 = loginBody2.sessionId;

      // Query sessions from Device 2
      const sessRes2 = await fetch(`${BASE_URL}/api/auth/sessions`, {
        headers: {
          'Authorization': `Bearer ${user1TokenDevice2}`
        }
      });
      const sessBody2 = await sessRes2.json();

      assert(sessBody2.sessions.length >= 2, 'User 1 now has at least 2 tracked sessions');

      const d2 = sessBody2.sessions.find((s) => s.id === user1SessionIdDevice2);
      const d1 = sessBody2.sessions.find((s) => s.id === user1SessionIdDevice1);

      assert(d2 && d2.isCurrent === true, 'Device 2 is identified as THIS DEVICE when queried with Device 2 token');
      assert(d1 && d1.isCurrent === false, 'Device 1 is identified as remote (isCurrent: false) from Device 2');
      assert(d2 && d2.device.includes('iOS (iPhone)') && d2.device.includes('Mobile'), 'Device 2 detected as iOS Mobile Safari');
    }

    // ----------------------------------------------------
    // TEST 4: User Data Isolation & Cross-Account Authorization
    // ----------------------------------------------------
    console.log('\nTest 4: User Data Isolation & Ownership Enforcement...');
    {
      // Register and login User 2
      await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Session Test User 2',
          email: user2Email,
          password,
          role: 'PATIENT'
        })
      });

      const loginResUser2 = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user2Email, password })
      });
      const loginBodyUser2 = await loginResUser2.json();
      user2Token = loginBodyUser2.token;
      user2SessionId = loginBodyUser2.sessionId;

      // User 2 lists sessions
      const user2SessRes = await fetch(`${BASE_URL}/api/auth/sessions`, {
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });
      const user2SessBody = await user2SessRes.json();

      assert(user2SessBody.sessions.every((s) => s.id !== user1SessionIdDevice1 && s.id !== user1SessionIdDevice2), 'User 2 CANNOT see User 1 sessions');

      // User 2 attempts to revoke User 1's session
      const maliciousRevokeRes = await fetch(`${BASE_URL}/api/auth/sessions/${user1SessionIdDevice1}/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });
      assert(maliciousRevokeRes.status === 404, 'User 2 cannot revoke User 1 session (404 Unauthorized/Not Found)');

      // Verify User 1 session remains active
      if (isDatabaseConnected()) {
        const u1Session = await Session.findOne({ sessionId: user1SessionIdDevice1 });
        assert(u1Session.isRevoked === false, 'User 1 session remains active and unrevoked');
      }
    }

    // ----------------------------------------------------
    // TEST 5: Single Session Revocation & Server-Side Enforcement
    // ----------------------------------------------------
    console.log('\nTest 5: Single Session Revocation & Immediate Server Invalidation...');
    {
      // User 1 revokes Device 1's session using Device 2's token
      const revokeRes = await fetch(`${BASE_URL}/api/auth/sessions/${user1SessionIdDevice1}/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user1TokenDevice2}` }
      });
      const revokeBody = await revokeRes.json();

      assert(revokeRes.status === 200, 'Revoke request returned HTTP 200');
      assert(revokeBody.success === true, 'Revoke success is true');

      // Verify in DB that isRevoked is true
      if (isDatabaseConnected()) {
        const sessDoc = await Session.findOne({ sessionId: user1SessionIdDevice1 });
        assert(sessDoc.isRevoked === true, 'Session in DB marked isRevoked = true');
        assert(Boolean(sessDoc.revokedAt), 'Session in DB has revokedAt timestamp');
      }

      // CRITICAL: Verify Device 1's token is now rejected on protected route
      const testProtectedRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1TokenDevice1}` }
      });
      const testProtectedBody = await testProtectedRes.json();

      assert(testProtectedRes.status === 401, 'Revoked session token is REJECTED with HTTP 401');
      assert(testProtectedBody.error === 'SESSION_REVOKED', 'Server returns error: SESSION_REVOKED');

      // Verify Device 2's token still works normally
      const d2TestRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1TokenDevice2}` }
      });
      assert(d2TestRes.status === 200, 'Unrevoked Device 2 token continues to work normally (200 OK)');
    }

    // ----------------------------------------------------
    // TEST 6: Logout All Other Devices (revoke-others)
    // ----------------------------------------------------
    console.log('\nTest 6: Logout All Other Devices (revoke-others)...');
    {
      // Login User 1 on Device 3 (e.g. Firefox on Linux)
      const loginRes3 = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
        },
        body: JSON.stringify({ email: user1Email, password })
      });
      const loginBody3 = await loginRes3.json();
      user1TokenDevice3 = loginBody3.token;
      user1SessionIdDevice3 = loginBody3.sessionId;

      // Verify Device 3 is active
      const d3Check = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1TokenDevice3}` }
      });
      assert(d3Check.status === 200, 'Device 3 is active before revoke-others');

      // From Device 2, call revoke-others
      const revokeOthersRes = await fetch(`${BASE_URL}/api/auth/sessions/revoke-others`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user1TokenDevice2}` }
      });
      const revokeOthersBody = await revokeOthersRes.json();

      assert(revokeOthersRes.status === 200, 'POST /revoke-others returned HTTP 200');
      assert(revokeOthersBody.success === true, 'Revoke-others success is true');
      assert(revokeOthersBody.revokedCount >= 1, 'At least 1 remote session was revoked');

      // Verify Device 3 token is now rejected
      const d3After = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1TokenDevice3}` }
      });
      assert(d3After.status === 401, 'Device 3 token is now rejected with HTTP 401 after revoke-others');

      // Verify Device 2 token remains valid
      const d2After = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1TokenDevice2}` }
      });
      assert(d2After.status === 200, 'Current Device 2 token remains valid');
    }

    // ----------------------------------------------------
    // TEST 7: Unauthorized Access Guards
    // ----------------------------------------------------
    console.log('\nTest 7: Unauthorized Access Guards...');
    {
      const unauthList = await fetch(`${BASE_URL}/api/auth/sessions`);
      assert(unauthList.status === 401, 'GET /sessions without token returns 401');

      const unauthRevoke = await fetch(`${BASE_URL}/api/auth/sessions/some-id/revoke`, { method: 'POST' });
      assert(unauthRevoke.status === 401, 'POST /sessions/:id/revoke without token returns 401');

      const unauthRevokeOthers = await fetch(`${BASE_URL}/api/auth/sessions/revoke-others`, { method: 'POST' });
      assert(unauthRevokeOthers.status === 401, 'POST /sessions/revoke-others without token returns 401');
    }

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    if (isDatabaseConnected()) {
      await User.deleteMany({ email: { $in: [user1Email, user2Email] } }).catch(() => {});
      await Session.deleteMany({ sessionId: { $in: [user1SessionIdDevice1, user1SessionIdDevice2, user1SessionIdDevice3, user2SessionId] } }).catch(() => {});
    }

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n======================================================');
    console.log(`🏁 SESSION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (server) server.close();
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    if (server) server.close();
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(1);
  }
};

runTests();
