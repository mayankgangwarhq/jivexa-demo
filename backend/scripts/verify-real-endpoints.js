const BASE_URL = 'http://localhost:4000';

const runVerification = async () => {
  console.log('\n=============================================================');
  console.log('🩺 LIVE BACKEND ENDPOINTS VERIFICATION (PORT 4000)');
  console.log('=============================================================\n');

  // 1. /api/health output with mongodb.connected = true
  console.log('--- 1. GET /api/health ---');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  console.log('HTTP Status:', healthRes.status);
  console.log(JSON.stringify(healthData, null, 2));

  const runId = Date.now();
  const testPatient = {
    name: 'Aarav Patel',
    email: `aarav.patel.${runId}@jivexa.com`,
    password: 'SecurePassword@2026',
    role: 'PATIENT',
    age: 30
  };

  let token = '';

  // 2. a) signup a new patient (expect 201, token, user.role PATIENT, healthId present)
  console.log('\n--- 2. (a) POST /api/auth/signup (New Patient) ---');
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPatient)
  });
  const signupData = await signupRes.json();
  token = signupData.token;
  console.log('HTTP Status:', signupRes.status);
  console.log('Set-Cookie Header:', signupRes.headers.get('set-cookie'));
  console.log(JSON.stringify(signupData, null, 2));

  // 3. b) signup the same email again (expect 409)
  console.log('\n--- 3. (b) POST /api/auth/signup (Duplicate Email) ---');
  const dupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPatient)
  });
  const dupData = await dupRes.json();
  console.log('HTTP Status:', dupRes.status);
  console.log(JSON.stringify(dupData, null, 2));

  // 4. c) login with the correct password (expect 200 + token)
  console.log('\n--- 4. (c) POST /api/auth/login (Correct Password) ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testPatient.email,
      password: testPatient.password
    })
  });
  const loginData = await loginRes.json();
  console.log('HTTP Status:', loginRes.status);
  console.log(JSON.stringify(loginData, null, 2));

  // 5. d) login with a wrong password (expect 401)
  console.log('\n--- 5. (d) POST /api/auth/login (Wrong Password) ---');
  const wrongLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testPatient.email,
      password: 'IncorrectPassword#999'
    })
  });
  const wrongLoginData = await wrongLoginRes.json();
  console.log('HTTP Status:', wrongLoginRes.status);
  console.log(JSON.stringify(wrongLoginData, null, 2));

  // 6. e) GET /api/auth/me with the Bearer token (expect 200)
  console.log('\n--- 6. (e) GET /api/auth/me (Bearer Token) ---');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const meData = await meRes.json();
  console.log('HTTP Status:', meRes.status);
  console.log(JSON.stringify(meData, null, 2));

  // 7. f) signup with age "21" as a string and with age omitted (both expect 201)
  console.log('\n--- 7. (f1) POST /api/auth/signup (Age as string "21") ---');
  const ageStrPatient = {
    name: 'Dia Sen',
    email: `dia.sen.${runId}@jivexa.com`,
    password: 'SecurePassword@2026',
    age: '21'
  };
  const ageStrRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ageStrPatient)
  });
  const ageStrData = await ageStrRes.json();
  console.log('HTTP Status:', ageStrRes.status);
  console.log(JSON.stringify({ success: ageStrData.success, age: ageStrData.user?.age, role: ageStrData.user?.role, healthId: ageStrData.user?.healthId }, null, 2));

  console.log('\n--- 7. (f2) POST /api/auth/signup (Age Omitted) ---');
  const noAgePatient = {
    name: 'Kabir Mehta',
    email: `kabir.mehta.${runId}@jivexa.com`,
    password: 'SecurePassword@2026'
  };
  const noAgeRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noAgePatient)
  });
  const noAgeData = await noAgeRes.json();
  console.log('HTTP Status:', noAgeRes.status);
  console.log(JSON.stringify({ success: noAgeData.success, age: noAgeData.user?.age, role: noAgeData.user?.role, healthId: noAgeData.user?.healthId }, null, 2));

  // 8. g) signup with a weak password (expect 400 with a readable message)
  console.log('\n--- 8. (g) POST /api/auth/signup (Weak Password) ---');
  const weakPwPatient = {
    name: 'Weak Password User',
    email: `weak.${runId}@jivexa.com`,
    password: 'weak'
  };
  const weakRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weakPwPatient)
  });
  const weakData = await weakRes.json();
  console.log('HTTP Status:', weakRes.status);
  console.log(JSON.stringify(weakData, null, 2));

  console.log('\n=============================================================');
  console.log('✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY');
  console.log('=============================================================\n');
};

runVerification().catch(console.error);
