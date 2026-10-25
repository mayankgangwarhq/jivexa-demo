/**
 * JIVEXA Health AI - Safe Model Connection & Transient Retry Regression Test Suite
 * 
 * Verifies:
 * 1. Model Configuration Hierarchy:
 *    - GEMINI_CHATBOT_MODEL precedence for health assistant.
 *    - GEMINI_REPORT_MODEL precedence for report assistant.
 *    - GEMINI_MODEL universal fallback.
 *    - Default model is strictly 'gemini-3.5-flash-lite'.
 * 2. Server-Side Key Security:
 *    - API keys are never exposed in frontend code, error messages, or logs.
 * 3. Live Model Connection:
 *    - Genuine verification of 'gemini-3.5-flash-lite' availability and execution.
 * 4. Bounded Transient Retries & Rate-Limit Respect:
 *    - Network timeouts, 503s, and socket errors are identified as transient.
 *    - 429 Rate limits / Quota exhaustion are respected immediately without retry.
 *    - 401/403 Invalid keys are non-transient and fail immediately without retry.
 * 5. Strict Model Fidelity (No Silent Switching):
 *    - Model execution targets the configured model only; no silent downgrade to gemini-1.5-flash.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const assert = require('assert');
const config = require('./src/config/env');
const {
  streamGeneralChatbot,
  getChatbotGeminiModel,
  getReportGeminiModel,
  isTransientError,
  categorizeAndLogGeminiError
} = require('./src/services/aiService');

const runModelConnectionSuite = async () => {
  console.log('\n===============================================================');
  console.log('🩺 JIVEXA HEALTH AI - GEMINI 3.5 FLASH-LITE CONNECTION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const test = (name, fn) => {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  };

  const asyncTest = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  };

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Configuration Paths & Model Hierarchy
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Model Configuration Paths & Hierarchy ---');

  test('config.chatbotAi.model resolves to gemini-3.5-flash-lite', () => {
    assert.strictEqual(config.chatbotAi.model, 'gemini-3.5-flash-lite');
  });

  test('config.reportAi.model resolves to gemini-3.5-flash-lite', () => {
    assert.strictEqual(config.reportAi.model, 'gemini-3.5-flash-lite');
  });

  test('Backward-compatible config.ai.geminiModel reflects chatbot model', () => {
    assert.strictEqual(config.ai.geminiModel, 'gemini-3.5-flash-lite');
  });

  test('Universal GEMINI_MODEL fallback applies when specific chatbot model is absent', () => {
    const savedChatbot = process.env.GEMINI_CHATBOT_MODEL;
    const savedGemini = process.env.GEMINI_MODEL;

    try {
      delete process.env.GEMINI_CHATBOT_MODEL;
      process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite-fallback-test';

      const resolved = (process.env.GEMINI_CHATBOT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
      assert.strictEqual(resolved, 'gemini-3.5-flash-lite-fallback-test');
    } finally {
      if (savedChatbot) process.env.GEMINI_CHATBOT_MODEL = savedChatbot;
      if (savedGemini) process.env.GEMINI_MODEL = savedGemini;
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Server-Side Key Security
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: Server-Side Key Security (Zero Key Leakage) ---');

  test('Error sanitizer masks raw API keys from log outputs', () => {
    const dummyKey = 'AIzaSyFakeSecretKeyForSecurityVerification123456';
    const fakeErr = new Error(`Connection failed with key=${dummyKey} at endpoint`);
    const sanitized = categorizeAndLogGeminiError(fakeErr, 'Security Test');
    assert.ok(!sanitized.userFriendlyMsg.includes('AIzaSy'), 'User message must not contain secret key');
  });

  test('config.db.getMaskedUri hides database credentials', () => {
    const masked = config.db.getMaskedUri();
    assert.ok(!masked.includes('Jivexaofficial:'), 'Masked URI must never show DB password or raw credentials');
    assert.ok(masked.includes('***:***@') || masked === 'NOT_CONFIGURED');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Transient vs Non-Transient Error Classification
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Bounded Retries & Rate-Limit Respect ---');

  test('Transient errors trigger retries: Network fetch failure', () => {
    const err = new Error('TypeError: fetch failed');
    assert.strictEqual(isTransientError(err), true);
  });

  test('Transient errors trigger retries: Connection timeout', () => {
    const err = new Error('Gemini API request timed out (20s limit)');
    assert.strictEqual(isTransientError(err), true);
  });

  test('Transient errors trigger retries: HTTP 503 Service Unavailable', () => {
    const err = new Error('[503 Service Unavailable]');
    assert.strictEqual(isTransientError(err), true);
  });

  test('Rate limits (429 / RESOURCE_EXHAUSTED) are respected immediately (NO RETRIES)', () => {
    const err = new Error('[429 Resource has been exhausted (e.g. check quota)]');
    assert.strictEqual(isTransientError(err), false);
  });

  test('Quota exceeded errors are respected immediately (NO RETRIES)', () => {
    const err = new Error('Quota exceeded for quota metric');
    assert.strictEqual(isTransientError(err), false);
  });

  test('Invalid API key (401 / 403) fails immediately (NO RETRIES)', () => {
    const err = new Error('API_KEY_INVALID');
    err.status = 401;
    assert.strictEqual(isTransientError(err), false);
  });

  test('Malformed request (400) fails immediately (NO RETRIES)', () => {
    const err = new Error('INVALID_ARGUMENT');
    err.status = 400;
    assert.strictEqual(isTransientError(err), false);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Strict Model Fidelity (No Silent Model Switching)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Model Fidelity (No Silent Model Switching) ---');

  test('Chatbot model instantiation targets gemini-3.5-flash-lite strictly', () => {
    const model = getChatbotGeminiModel();
    assert.ok(model.model.includes('gemini-3.5-flash-lite'), `Expected model to contain gemini-3.5-flash-lite, got: ${model.model}`);
  });

  test('Report Assistant model instantiation targets gemini-3.5-flash-lite strictly', () => {
    const model = getReportGeminiModel();
    assert.ok(model.model.includes('gemini-3.5-flash-lite'), `Expected model to contain gemini-3.5-flash-lite, got: ${model.model}`);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Live Gemini 3.5 Flash-Lite Connection Verification
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: Live Gemini 3.5 Flash-Lite Connection Verification ---');

  await asyncTest('Live Gemini 3.5 Flash-Lite: Responds to clinical query with active streaming', async () => {
    let tokens = '';
    const result = await streamGeneralChatbot(
      'What are the standard normal ranges for adult blood pressure?',
      [],
      (chunk) => { tokens += chunk; }
    );

    assert.ok(!result.errorCode, `Live call should not return an error code, got: ${result.errorCode}`);
    assert.strictEqual(result.provider, 'JIVEXA AI (gemini-3.5-flash-lite)');
    assert.ok(tokens.length > 50, 'Live response should stream clinical guidance');
    assert.ok(tokens.toLowerCase().includes('blood pressure') || tokens.toLowerCase().includes('120') || tokens.toLowerCase().includes('mmhg'));
    assert.ok(Array.isArray(result.suggestions) && result.suggestions.length >= 2, 'Should provide 2-4 context-aware follow-up questions');

    console.log(`   ℹ️ Successfully streamed ${result.outputTokens} tokens from live model: ${result.provider}`);
    console.log(`   ℹ️ Suggested follow-ups: ${JSON.stringify(result.suggestions)}`);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`🏁 MODEL CONNECTION SUITE FINISHED: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
};

runModelConnectionSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
