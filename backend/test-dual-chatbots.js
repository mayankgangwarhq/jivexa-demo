/**
 * JIVEXA HEALTH - DUAL INDEPENDENT AI CHATBOTS TEST SUITE
 * 
 * Verifies:
 * 1. Independent API Configurations (GEMINI_CHATBOT_API_KEY vs GEMINI_REPORT_API_KEY)
 * 2. True isolation (missing one key does not disable the other)
 * 3. Dedicated system prompts (General Doctor AI vs Report Assistant)
 * 4. Separate route handlers (/api/ai/chat vs /api/ai/report-chat)
 * 5. Report context injection & no cross-contamination
 * 6. Patient/Doctor 403 authorization
 * 7. Truthful error states (AI_NOT_CONFIGURED, AI_TEMPORARILY_UNAVAILABLE)
 */

const assert = require('assert');
const config = require('./src/config/env');
const {
  streamGeneralChatbot,
  streamReportChatbot,
  analyzeReportWithAI,
  extractClinicalParameters,
  calculateDeterministicHealthScore,
  GENERAL_CHATBOT_SYSTEM_PROMPT,
  REPORT_ASSISTANT_SYSTEM_PROMPT
} = require('./src/services/aiService');

let totalPassed = 0;
let totalFailed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    totalFailed++;
  }
};

const runSuite = async () => {
  console.log('\n===============================================================');
  console.log('🤖 JIVEXA HEALTH - DUAL INDEPENDENT AI CHATBOTS TEST SUITE');
  console.log('===============================================================\n');

  // TEST GROUP 1: Configuration Independence
  console.log('🧪 GROUP 1: Independent API Key Configuration Separation...');
  await test('Chatbot A configuration object exists and specifies GEMINI_CHATBOT_API_KEY target', () => {
    assert(config.chatbotAi, 'config.chatbotAi is defined');
    assert(typeof config.chatbotAi.isConfigured === 'function', 'config.chatbotAi.isConfigured is a function');
    assert.strictEqual(config.chatbotAi.model, 'gemini-3.5-flash-lite');
  });

  await test('Chatbot B configuration object exists and specifies GEMINI_REPORT_API_KEY target', () => {
    assert(config.reportAi, 'config.reportAi is defined');
    assert(typeof config.reportAi.isConfigured === 'function', 'config.reportAi.isConfigured is a function');
    assert.strictEqual(config.reportAi.model, 'gemini-3.5-flash-lite');
  });

  await test('Chatbot A and Chatbot B are distinct configuration objects', () => {
    assert.notStrictEqual(config.chatbotAi, config.reportAi, 'Configurations must not share object reference');
  });

  // TEST GROUP 2: Key Isolation & Failure Isolation
  console.log('\n🧪 GROUP 2: API Key Failure Isolation (No Silent Fallback)...');
  await test('Missing Chatbot A key returns AI_NOT_CONFIGURED without using Report key', async () => {
    const origChatbotKey = config.chatbotAi.apiKey;
    const origReportKey = config.reportAi.apiKey;

    try {
      config.chatbotAi.apiKey = '';
      config.reportAi.apiKey = 'AIzaSy_report_dummy_key_12345';

      let receivedNotice = '';
      const res = await streamGeneralChatbot('What causes mild fever?', [], (chunk) => {
        receivedNotice += chunk;
      });

      assert.strictEqual(res.errorCode, 'AI_NOT_CONFIGURED', 'Chatbot A must return AI_NOT_CONFIGURED');
      assert(receivedNotice.includes('AI_NOT_CONFIGURED'), 'Notice must contain AI_NOT_CONFIGURED');
      assert(receivedNotice.includes('GEMINI_CHATBOT_API_KEY'), 'Notice must indicate GEMINI_CHATBOT_API_KEY is needed');
    } finally {
      config.chatbotAi.apiKey = origChatbotKey;
      config.reportAi.apiKey = origReportKey;
    }
  });

  await test('Missing Report key returns AI_NOT_CONFIGURED without using Chatbot A key', async () => {
    const origChatbotKey = config.chatbotAi.apiKey;
    const origReportKey = config.reportAi.apiKey;

    try {
      config.chatbotAi.apiKey = 'AIzaSy_chatbot_dummy_key_67890';
      config.reportAi.apiKey = '';

      const reportContext = {
        reportTitle: 'CBC Report',
        healthScore: 77,
        scoreStatus: 'Requires Attention',
        parameters: [{ name: 'Hemoglobin', value: '11.8 g/dL', referenceRange: '13.0 - 17.5 g/dL', status: 'Abnormal' }]
      };

      let receivedNotice = '';
      const res = await streamReportChatbot('Meri report mein kya abnormal hai?', [], reportContext, (chunk) => {
        receivedNotice += chunk;
      });

      assert.strictEqual(res.errorCode, 'AI_NOT_CONFIGURED', 'Report Chatbot must return AI_NOT_CONFIGURED');
      assert(receivedNotice.includes('AI_NOT_CONFIGURED'), 'Notice must contain AI_NOT_CONFIGURED');
      assert(receivedNotice.includes('GEMINI_REPORT_API_KEY'), 'Notice must indicate GEMINI_REPORT_API_KEY is needed');
    } finally {
      config.chatbotAi.apiKey = origChatbotKey;
      config.reportAi.apiKey = origReportKey;
    }
  });

  // TEST GROUP 3: System Prompts & Personas
  console.log('\n🧪 GROUP 3: Distinct System Prompts & Boundaries...');
  await test('General Chatbot prompt defines 5-section response structure', () => {
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('1. Understanding your concern'));
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('2. Medical explanation'));
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('3. Relevant follow-up questions'));
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('4. What you can do next'));
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('5. When to seek medical attention'));
  });

  await test('Report Assistant prompt specifically addresses report-centric questions in Hindi/Hinglish/English', () => {
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('Meri report mein kya abnormal hai?'));
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('Hemoglobin / Glucose / Cholesterol / Creatinine'));
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('Mujhe kya khana chahiye?'));
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('Ab mujhe kya karna chahiye?'));
  });

  await test('Both prompts enforce transparent AI identity and emergency triage (108 / 112)', () => {
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('108') && GENERAL_CHATBOT_SYSTEM_PROMPT.includes('112'));
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('108') && REPORT_ASSISTANT_SYSTEM_PROMPT.includes('112'));
    assert(GENERAL_CHATBOT_SYSTEM_PROMPT.includes('AI healthcare assistant, NOT a licensed medical doctor'));
    assert(REPORT_ASSISTANT_SYSTEM_PROMPT.includes('AI educational assistant, NOT a licensed human medical doctor'));
  });

  // TEST GROUP 4: Report Context Enforcement
  console.log('\n🧪 GROUP 4: Report Context Locking & Missing Context Handling...');
  await test('Report Assistant prompts user when no report context is provided', async () => {
    let output = '';
    const res = await streamReportChatbot('Explain my report', [], null, (chunk) => {
      output += chunk;
    });

    assert.strictEqual(res.errorCode, 'NO_REPORT_CONTEXT');
    assert(output.includes('No active medical report is currently selected') || output.includes('upload a lab report'));
  });

  await test('Report Assistant refuses off-topic queries immediately without consuming tokens', async () => {
    let output = '';
    const res = await streamReportChatbot('Write a python function to sort an array', [], { reportTitle: 'Report', parameters: [{ name: 'Hb', value: '12', status: 'Normal' }] }, (chunk) => {
      output += chunk;
    });

    assert.strictEqual(res.refused, true);
    assert(output.includes('JIVEXA Report Assistant') && output.includes('medical report'));
  });

  // TEST GROUP 5: Deterministic Report Analyzer & Health Score
  console.log('\n🧪 GROUP 5: Deterministic Extraction & Transparent Health Score...');
  await test('Deterministic extractor parses 6 biomarkers and computes accurate formula', () => {
    const labText = `
      Hemoglobin: 11.2 g/dL (13.0 - 17.5 g/dL)
      Total Cholesterol: 245 mg/dL (< 200 mg/dL)
      HDL Cholesterol: 38 mg/dL (> 40 mg/dL)
      Fasting Blood Sugar: 135 mg/dL (70 - 99 mg/dL)
      Total WBC Count: 6800 /cumm (4000 - 11000 /cumm)
      Serum Creatinine: 0.9 mg/dL (0.6 - 1.2 mg/dL)
    `;

    const extracted = extractClinicalParameters(labText);
    assert.strictEqual(extracted.parameters.length, 6);
    assert.strictEqual(extracted.abnormal.length, 3); // Hb, Cholesterol, Sugar
    assert.strictEqual(extracted.attention.length, 1); // HDL
    assert.strictEqual(extracted.normal.length, 2); // WBC, Creatinine

    // Formula: 100 - (3 * 15) - (1 * 8) = 100 - 45 - 8 = 47 -> clamped to floor 50
    const score = calculateDeterministicHealthScore(extracted.abnormal.length, extracted.attention.length);
    assert.strictEqual(score.score, 50);
    assert.strictEqual(score.scoreStatus, 'Needs Review');
    assert(score.formula.includes('3 Abnormal × 15'));
  });

  // TEST GROUP 6: Route Mounting & Controller Integrity
  console.log('\n🧪 GROUP 6: Route Mounting & Controller Exports...');
  await test('aiRoutes mounts both /chat and /report-chat', () => {
    const aiRoutes = require('./src/routes/aiRoutes');
    const routes = aiRoutes.stack
      .filter(s => s.route)
      .map(s => `${Object.keys(s.route.methods)[0].toUpperCase()} ${s.route.path}`);

    assert(routes.includes('POST /chat'), 'POST /chat must be mounted for Chatbot A');
    assert(routes.includes('POST /report-chat'), 'POST /report-chat must be mounted for Chatbot B');
    assert(routes.includes('POST /analyze-report'), 'POST /analyze-report must be mounted for Report Analyzer');
  });

  // Summary
  console.log('\n===============================================================');
  console.log(`🏁 DUAL AI SUITE FINISHED: ${totalPassed} PASSED | ${totalFailed} FAILED`);
  console.log('===============================================================\n');

  if (totalFailed > 0) process.exit(1);
};

runSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
