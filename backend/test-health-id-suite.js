require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { connectDB, isMongoConfigured, isDatabaseConnected } = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const healthIdRoutes = require('./src/routes/healthIdRoutes');
const User = require('./src/models/User');
const HealthId = require('./src/models/HealthId');

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🚑 JIVEXA HEALTH - EMERGENCY HEALTH ID LOOKUP TEST SUITE');
  console.log('======================================================\n');

  let server;
  const PORT = 5599;
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
    app.use('/api/health-id', healthIdRoutes);

    await new Promise((resolve) => {
      server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`Test server running at ${BASE_URL}\n`);
        resolve();
      });
    });

    // ----------------------------------------------------
    // TEST 1: Lookup Exact Reported Issue ID (JXV-STVAZREWPAT-202608-F4A1B)
    // ----------------------------------------------------
    console.log('Test 1: Lookup Exact Reported ID (JXV-STVAZREWPAT-202608-F4A1B)...');
    {
      const res = await fetch(`${BASE_URL}/api/health-id/search?healthId=JXV-STVAZREWPAT-202608-F4A1B`);
      const body = await res.json();

      assert(res.status === 200, 'HTTP status is 200 OK');
      assert(body.success === true, 'Response success is true');
      assert(body.healthId === 'JXV-STVAZREWPAT-202608-F4A1B', 'Returns exact queried Health ID');
      assert(body.patient && body.patient.name === 'Aarav Sharma', 'Patient name matches Aarav Sharma');
      assert(body.patient.bloodGroup === 'B+', 'Blood group matches B+');
      assert(body.patient.healthProfile && Array.isArray(body.patient.healthProfile.allergies), 'Allergies array is populated');
      assert(body.patient.emergencyContact && body.patient.emergencyContact.phone === '+91 98111 22335', 'Emergency contact phone matches');
    }

    // ----------------------------------------------------
    // TEST 2: Lookup Individual Demo IDs (JXV-STVAZREW & PAT-202608-F4A1B & JIV-2026-685853)
    // ----------------------------------------------------
    console.log('\nTest 2: Lookup Individual Demo IDs...');
    {
      // Sample 1: JXV-STVAZREW
      const res1 = await fetch(`${BASE_URL}/api/health-id/search?healthId=JXV-STVAZREW`);
      const body1 = await res1.json();
      assert(res1.status === 200, 'JXV-STVAZREW status is 200 OK');
      assert(body1.patient && body1.patient.name === 'Aarav Sharma', 'JXV-STVAZREW patient is Aarav Sharma');

      // Sample 2: PAT-202608-F4A1B
      const res2 = await fetch(`${BASE_URL}/api/health-id/search?healthId=PAT-202608-F4A1B`);
      const body2 = await res2.json();
      assert(res2.status === 200, 'PAT-202608-F4A1B status is 200 OK');
      assert(body2.patient && body2.patient.name === 'Meera Nair', 'PAT-202608-F4A1B patient is Meera Nair');
      assert(body2.patient.bloodGroup === 'O+', 'PAT-202608-F4A1B blood group is O+');

      // Sample 3: JIV-2026-685853
      const res3 = await fetch(`${BASE_URL}/api/health-id/search?healthId=JIV-2026-685853`);
      const body3 = await res3.json();
      assert(res3.status === 200, 'JIV-2026-685853 status is 200 OK');
      assert(body3.patient && body3.patient.name === 'Rajesh Varma', 'JIV-2026-685853 patient is Rajesh Varma');
    }

    // ----------------------------------------------------
    // TEST 3: Case-Insensitivity & Whitespace Normalization
    // ----------------------------------------------------
    console.log('\nTest 3: Case-Insensitivity and Whitespace Normalization...');
    {
      // Lowercase query
      const resLower = await fetch(`${BASE_URL}/api/health-id/search?healthId=jxv-stvazrewpat-202608-f4a1b`);
      const bodyLower = await resLower.json();
      assert(resLower.status === 200, 'Lowercase query returns 200 OK');
      assert(bodyLower.success === true, 'Lowercase query successfully verified');

      // Whitespace padded query
      const resSpace = await fetch(`${BASE_URL}/api/health-id/search?healthId=${encodeURIComponent('   JXV-STVAZREW   ')}`);
      const bodySpace = await resSpace.json();
      assert(resSpace.status === 200, 'Whitespace padded query returns 200 OK');
      assert(bodySpace.patient.name === 'Aarav Sharma', 'Whitespace padded query finds Aarav Sharma');

      // Hyphen stripped query
      const resNoHyphen = await fetch(`${BASE_URL}/api/health-id/search?healthId=PAT202608F4A1B`);
      const bodyNoHyphen = await resNoHyphen.json();
      assert(resNoHyphen.status === 200, 'Hyphen-stripped query returns 200 OK');
      assert(bodyNoHyphen.patient.name === 'Meera Nair', 'Hyphen-stripped query finds Meera Nair');
    }

    // ----------------------------------------------------
    // TEST 4: Empty & Invalid Query Handling (400 Bad Request)
    // ----------------------------------------------------
    console.log('\nTest 4: Empty / Missing Query Validation...');
    {
      const resEmpty = await fetch(`${BASE_URL}/api/health-id/search?healthId=`);
      const bodyEmpty = await resEmpty.json();
      assert(resEmpty.status === 400, 'Empty healthId query returns 400 Bad Request');
      assert(bodyEmpty.success === false, 'Empty query success is false');
      assert(bodyEmpty.message.includes('valid Health ID'), 'Empty query returns helpful guidance message');
    }

    // ----------------------------------------------------
    // TEST 5: Non-Existent Health ID (404 Not Found)
    // ----------------------------------------------------
    console.log('\nTest 5: Non-Existent Health ID (404 Not Found)...');
    {
      const fakeId = 'JIV-9999-000000-NONEXISTENT';
      const res404 = await fetch(`${BASE_URL}/api/health-id/search?healthId=${fakeId}`);
      const body404 = await res404.json();
      assert(res404.status === 404, 'Non-existent ID returns 404 Not Found');
      assert(body404.success === false, '404 response success is false');
      assert(body404.message.includes(fakeId), '404 message contains queried ID');
    }

    // ----------------------------------------------------
    // TEST 6: Sensitive Fields & Privacy Protection (Scrubbing)
    // ----------------------------------------------------
    console.log('\nTest 6: Sensitive Fields & Privacy Protection...');
    {
      const res = await fetch(`${BASE_URL}/api/health-id/search?healthId=JXV-STVAZREWPAT-202608-F4A1B`);
      const body = await res.json();
      const p = body.patient;

      assert(p.password === undefined, 'Patient password is NOT exposed');
      assert(p.salt === undefined, 'Patient salt is NOT exposed');
      assert(p.tokens === undefined, 'Patient tokens are NOT exposed');
      assert(p.jwt === undefined, 'Patient JWT is NOT exposed');
      assert(p.email === undefined, 'Patient personal email is scrubbed from public lookup');
      assert(p.phone === undefined, 'Patient personal phone is scrubbed from public lookup');
      assert(p.address === undefined, 'Patient personal address is scrubbed from public lookup');
      assert(p.role === undefined, 'Patient account role is NOT exposed');
      assert(p.emergencyContact && p.emergencyContact.phone, 'Emergency contact phone IS available for rescue');
    }

    // ----------------------------------------------------
    // TEST 7: Patient Registration -> Health ID Auto-Creation -> Instant Search
    // ----------------------------------------------------
    console.log('\nTest 7: Patient Registration and Linked Health ID Resolution...');
    if (isDatabaseConnected()) {
      const uniqueSuffix = Date.now();
      const regEmail = `patient.test.${uniqueSuffix}@jivexa-test.local`;
      const regPassword = 'SecurePassword123!';
      const regName = `Test Patient ${uniqueSuffix}`;

      const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          role: 'PATIENT',
          bloodGroup: 'AB+',
          gender: 'Female',
          dateOfBirth: '1995-05-15',
          emergencyContact: {
            name: 'Emergency Kin',
            relationship: 'Brother',
            phone: '+91 99887 76655',
            hospital: 'City Emergency Hospital'
          },
          healthProfile: {
            allergies: ['Peanuts'],
            chronicConditions: ['Asthma']
          }
        })
      });

      const regBody = await regRes.json();
      assert(regRes.status === 201, 'Patient registration returned 201 Created');
      assert(regBody.user && regBody.user.healthId, 'Registered user received Health ID');

      const generatedHealthId = regBody.user?.healthId;
      console.log(`  ℹ️ Generated Health ID from registration: ${generatedHealthId}`);
      assert(generatedHealthId.startsWith('JIV-'), 'Health ID follows canonical format JIV-YYYY-XXXXXX');

      // Now query this Health ID in public lookup endpoint
      const lookupRes = await fetch(`${BASE_URL}/api/health-id/search?healthId=${generatedHealthId}`);
      const lookupBody = await lookupRes.json();

      assert(lookupRes.status === 200, 'Public lookup of newly registered patient returns 200 OK');
      assert(lookupBody.success === true, 'Public lookup success is true');
      assert(lookupBody.patient && lookupBody.patient.name === regName, 'Public lookup returns patient registered name');
      assert(lookupBody.patient.bloodGroup === 'AB+', 'Public lookup returns registered blood group AB+');
      assert(lookupBody.patient.emergencyContact && lookupBody.patient.emergencyContact.phone === '+91 99887 76655', 'Public lookup returns emergency contact phone');

      // Clean up test patient record
      await User.deleteOne({ email: regEmail }).catch(() => {});
      await HealthId.deleteOne({ healthId: generatedHealthId }).catch(() => {});
    } else {
      console.log('  ⚠️ Skipping Test 7 (MongoDB not connected in local environment)');
    }

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n======================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
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
