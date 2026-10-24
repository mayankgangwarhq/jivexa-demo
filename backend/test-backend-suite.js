require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const authRoutes = require('./src/routes/authRoutes');
const { connectDB, isMongoConfigured, checkDatabaseHealth } = require('./src/config/db');
const User = require('./src/models/User');
const HealthId = require('./src/models/HealthId');

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🚀 JIVEXA HEALTH - PATIENT AUTH & MONGODB TEST SUITE');
  console.log('======================================================\n');

  let server;
  const PORT = 5598;
  const BASE_URL = `http://localhost:${PORT}`;

  try {
    const isMongo = isMongoConfigured();
    if (isMongo) {
      console.log('ℹ️ MONGO_URI / MONGO_URL detected, connecting to MongoDB...');
      try {
        await connectDB();
        console.log('✅ Connected to MongoDB successfully.');
      } catch (connErr) {
        console.warn('⚠️ Warning: MongoDB connection attempt failed:', connErr.message);
      }
    } else {
      console.log('ℹ️ Database URI is not set in backend/.env. Testing degraded mode and schema validation.');
    }

    const app = express();
    app.set('trust proxy', 1);

    app.use(
      cors({
        origin: (origin, callback) => {
          callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
        exposedHeaders: ['Set-Cookie']
      })
    );

    app.use(express.json());
    app.use(cookieParser());

    // 503 Fail-Fast middleware identical to production server.js
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

    app.get('/api/health', async (req, res) => {
      const isConfigured = isMongoConfigured();
      let dbStatus = { configured: isConfigured, connected: false };
      try {
        dbStatus = await checkDatabaseHealth();
      } catch (e) {
        dbStatus = { configured: isConfigured, connected: false, error: e.message };
      }

      res.json({
        status: dbStatus.connected ? 'OK' : 'DEGRADED',
        service: 'JIVEXA Health OS Backend Service',
        database: 'MongoDB Atlas',
        activeDatabase: dbStatus.connected ? 'MongoDB Atlas' : 'DISCONNECTED',
        mongodb: dbStatus
      });
    });

    await new Promise((resolve) => {
      server = app.listen(PORT, () => {
        console.log(`✅ Backend test server running on ${BASE_URL}\n`);
        resolve();
      });
    });

    const testResults = [];
    const createdEmails = [];

    // TEST 1: Health Check Endpoint (Connected)
    {
      const res = await fetch(`${BASE_URL}/api/health`);
      const body = await res.json();
      const pass = res.status === 200 && body.mongodb?.connected === true && body.status === 'OK';
      console.log(`[TEST 1] /api/health -> Status: ${res.status} | DB Connected: ${body.mongodb?.connected} | Status: ${body.status} | Pass: ${pass}`);
      testResults.push({ name: 'Health Check (mongodb.connected = true)', pass, status: res.status });
    }

    if (isMongo && (await checkDatabaseHealth()).connected) {
      const runId = Date.now();
      const testUser = {
        name: `Ananya Verma ${runId}`,
        email: `test.patient.${runId}@jivexa.com`,
        password: 'Password@123',
        role: 'PATIENT',
        age: 28
      };
      createdEmails.push(testUser.email);

      let userToken = '';
      let cookieHeader = '';

      // TEST 2 (a): Signup New Patient (201, token, role PATIENT, healthId present, cookie set)
      {
        const res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testUser)
        });
        const rawCookie = res.headers.get('set-cookie');
        if (rawCookie) cookieHeader = rawCookie.split(';')[0];
        const body = await res.json();
        userToken = body.token;
        const validHealthId = typeof body.user?.healthId === 'string' && /^JIV-\d{4}-\d{6}$/.test(body.user?.healthId);
        const pass =
          res.status === 201 &&
          body.success === true &&
          Boolean(body.token) &&
          body.user?.role === 'PATIENT' &&
          validHealthId &&
          body.user?.accountStatus === 'ACTIVE';

        console.log(
          `[TEST 2] Patient Signup -> Status: ${res.status} | Token: ${body.token ? 'Issued' : 'Missing'} | Role: ${body.user?.role} | HealthID: ${body.user?.healthId} | Pass: ${pass}`
        );
        testResults.push({ name: 'Patient Signup (201, PATIENT, healthId)', pass, status: res.status });
      }

      // TEST 3 (b): Signup Same Email Again (409)
      {
        const res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testUser)
        });
        const body = await res.json();
        const pass = res.status === 409 && body.success === false && body.error === 'An account with this email already exists.';
        console.log(`[TEST 3] Duplicate Signup -> Status: ${res.status} | Error: "${body.error}" | Pass: ${pass}`);
        testResults.push({ name: 'Duplicate Signup (409)', pass, status: res.status });
      }

      // TEST 4 (c): Login with Correct Password (200 + token)
      {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: testUser.email,
            password: testUser.password
          })
        });
        const body = await res.json();
        if (body.token) userToken = body.token;
        const pass = res.status === 200 && body.success === true && Boolean(body.token) && body.user?.email === testUser.email;
        console.log(`[TEST 4] Correct Login -> Status: ${res.status} | Token: ${body.token ? 'Issued' : 'Missing'} | Pass: ${pass}`);
        testResults.push({ name: 'Correct Login (200)', pass, status: res.status });
      }

      // TEST 5 (d): Login with Wrong Password (401)
      {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: testUser.email,
            password: 'WrongPassword@999'
          })
        });
        const body = await res.json();
        const pass = res.status === 401 && body.success === false && body.error === 'Invalid email or password credentials';
        console.log(`[TEST 5] Wrong Password -> Status: ${res.status} | Error: "${body.error}" | Pass: ${pass}`);
        testResults.push({ name: 'Wrong Password (401)', pass, status: res.status });
      }

      // TEST 6 (e): GET /api/auth/me with Bearer token (200)
      {
        const res = await fetch(`${BASE_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${userToken}`
          }
        });
        const body = await res.json();
        const pass = res.status === 200 && body.success === true && body.user?.email === testUser.email && Boolean(body.user?.healthId);
        console.log(`[TEST 6] GET /api/auth/me (Bearer) -> Status: ${res.status} | HealthID: ${body.user?.healthId} | Pass: ${pass}`);
        testResults.push({ name: 'Auth Me via Bearer (200)', pass, status: res.status });
      }

      // TEST 7: GET /api/auth/me with Cookie (200)
      {
        const res = await fetch(`${BASE_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            Cookie: cookieHeader
          }
        });
        const body = await res.json();
        const pass = res.status === 200 && body.success === true && body.user?.email === testUser.email;
        console.log(`[TEST 7] GET /api/auth/me (Cookie) -> Status: ${res.status} | User: ${body.user?.name} | Pass: ${pass}`);
        testResults.push({ name: 'Auth Me via Cookie (200)', pass, status: res.status });
      }

      // TEST 8 (f1): Signup with age "21" as string (expect 201, user.age === 21)
      {
        const ageStringEmail = `test.age.str.${runId}@jivexa.com`;
        createdEmails.push(ageStringEmail);
        const res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Priya Sharma',
            email: ageStringEmail,
            password: 'Password@123',
            age: '21'
          })
        });
        const body = await res.json();
        const pass = res.status === 201 && body.success === true && body.user?.age === 21;
        console.log(`[TEST 8] Signup with Age String "21" -> Status: ${res.status} | Parsed Age: ${body.user?.age} | Pass: ${pass}`);
        testResults.push({ name: 'Signup Age String "21" (201)', pass, status: res.status });
      }

      // TEST 9 (f2): Signup with age omitted (expect 201)
      {
        const noAgeEmail = `test.no.age.${runId}@jivexa.com`;
        createdEmails.push(noAgeEmail);
        const res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rahul Kumar',
            email: noAgeEmail,
            password: 'Password@123'
          })
        });
        const body = await res.json();
        const pass = res.status === 201 && body.success === true && (body.user?.age === null || body.user?.age === undefined);
        console.log(`[TEST 9] Signup with Age Omitted -> Status: ${res.status} | Age: ${body.user?.age} | Pass: ${pass}`);
        testResults.push({ name: 'Signup Age Omitted (201)', pass, status: res.status });
      }

      // TEST 10 (g): Signup with Weak Password (expect 400 with readable error message)
      {
        const res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Weak Password Test',
            email: `weak.${runId}@jivexa.com`,
            password: 'weak'
          })
        });
        const body = await res.json();
        const readableMsg = typeof body.error === 'string' && body.error.length > 5;
        const pass = res.status === 400 && body.success === false && readableMsg;
        console.log(`[TEST 10] Weak Password -> Status: ${res.status} | Error Msg: "${body.error}" | Pass: ${pass}`);
        testResults.push({ name: 'Weak Password Rejection (400)', pass, status: res.status });
      }

      // TEST 11: Update Profile (Zod 4 issues validation)
      {
        const res = await fetch(`${BASE_URL}/api/auth/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`
          },
          body: JSON.stringify({
            name: 'Ananya Verma Updated',
            age: 29
          })
        });
        const body = await res.json();
        const pass = res.status === 200 && body.success === true && body.user?.name === 'Ananya Verma Updated' && body.user?.age === 29;
        console.log(`[TEST 11] Update Profile -> Status: ${res.status} | Name: "${body.user?.name}" | Age: ${body.user?.age} | Pass: ${pass}`);
        testResults.push({ name: 'Update Profile (200)', pass, status: res.status });
      }

      // Cleanup created users
      for (const email of createdEmails) {
        try {
          await User.deleteOne({ email });
          await HealthId.deleteOne({ email });
        } catch (_) {}
      }
      console.log(`🧹 Cleaned up ${createdEmails.length} test users from database.`);

      // TEST 12: DB Disconnected Fail-Fast Guard (503 < 100ms)
      {
        await mongoose.connection.close();
        const startTime = Date.now();
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@jivexa.com', password: 'Password@123' })
        });
        const elapsedMs = Date.now() - startTime;
        const body = await res.json();
        const pass = res.status === 503 && body.success === false && body.error === 'Database is not connected' && elapsedMs < 500;
        console.log(`[TEST 12] Disconnected Fail-Fast -> Status: ${res.status} | Elapsed: ${elapsedMs}ms (<500ms) | Error: "${body.error}" | Pass: ${pass}`);
        testResults.push({ name: 'Disconnected Fail-Fast 503 (<500ms)', pass, status: res.status });
      }
    }

    console.log('\n======================================================');
    const allPassed = testResults.every((r) => r.pass);
    console.log(
      `🏁 BACKEND TESTS SUMMARY: ${
        allPassed
          ? `✅ ALL TESTS PASSED (${testResults.length}/${testResults.length})`
          : `❌ SOME TESTS FAILED (${testResults.filter((r) => !r.pass).length} failed)`
      }`
    );
    console.log('======================================================\n');

    if (!allPassed) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error('❌ Backend test error:', e);
    process.exit(1);
  } finally {
    if (server) server.close();
    try {
      await mongoose.connection.close();
    } catch (_) {}
  }
};

runTests();
