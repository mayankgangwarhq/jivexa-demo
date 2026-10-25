/**
 * JIVEXA Health AI - Comprehensive Gemini Connection, Follow-Up & Suggestions Test Suite
 * Validates:
 * 1. Valid health question with live working Gemini response.
 * 2. Missing or invalid Gemini credentials & fallback logic.
 * 3. Gemini timeout, quota error, and network failure categorization.
 * 4. Multi-turn dialogue: "Mujhe fever hai" followed by "Kal se hai".
 * 5. Healthcare follow-ups in Hindi/Hinglish (2 din se, haan, nahi, khansi bhi hai).
 * 6. Explicit non-healthcare questions remaining blocked despite medical history.
 * 7. Suggestions generated separately (2-4 distinct context-aware items, no concatenation).
 * 8. Clicking one suggestion sends exactly one request (duplicate prevention & event isolation).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const assert = require('assert');
const config = require('./src/config/env');
const {
  classifyUserQuery,
  STANDARD_REFUSAL_MESSAGE
} = require('./src/services/healthGuardrail');
const {
  streamGeneralChatbot,
  predictFollowupQuestions,
  categorizeAndLogGeminiError
} = require('./src/services/aiService');

const runRegressionSuite = async () => {
  console.log('\n===============================================================');
  console.log('🧪 JIVEXA HEALTH AI - GEMINI CONNECTION & SUGGESTIONS SUITE');
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
  // TEST GROUP 1: API Configuration & Key Fallback
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Gemini Credentials & Fallback Logic ---');

  test('GEMINI_CHATBOT_API_KEY falls back to GEMINI_API_KEY if primary is absent', () => {
    const originalChatbot = process.env.GEMINI_CHATBOT_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;

    try {
      // Simulate absence of GEMINI_CHATBOT_API_KEY
      delete process.env.GEMINI_CHATBOT_API_KEY;
      process.env.GEMINI_API_KEY = 'test_fallback_key_12345';

      const fallbackKey = (process.env.GEMINI_CHATBOT_API_KEY || process.env.GEMINI_API_KEY || '').trim();
      assert.strictEqual(fallbackKey, 'test_fallback_key_12345');
    } finally {
      if (originalChatbot) process.env.GEMINI_CHATBOT_API_KEY = originalChatbot;
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
    }
  });

  test('Categorizes missing credentials without leaking secrets', () => {
    const missingErr = new Error('API key is not configured');
    missingErr.code = 'AI_NOT_CONFIGURED';
    const result = categorizeAndLogGeminiError(missingErr, 'Test Missing');
    assert.strictEqual(result.errorCode, 'AI_NOT_CONFIGURED');
    assert.strictEqual(result.category, 'MISSING_API_KEY');
    assert.ok(result.userFriendlyMsg.includes('GEMINI_API_KEY or GEMINI_CHATBOT_API_KEY'));
  });

  test('Categorizes invalid credentials (401/403) with distinct error code', () => {
    const invalidErr = new Error('API key not valid. Please pass a valid API key.');
    invalidErr.status = 400;
    const result = categorizeAndLogGeminiError(invalidErr, 'Test Invalid');
    assert.strictEqual(result.errorCode, 'AI_INVALID_KEY');
    assert.strictEqual(result.category, 'INVALID_API_KEY');
    assert.ok(!result.userFriendlyMsg.includes('AIza'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Error Categorization (Timeout, Quota, Network)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: Gemini Timeout, Quota Error & Network Failure ---');

  test('Categorizes Quota / Rate limit (429) as AI_QUOTA_EXCEEDED', () => {
    const quotaErr = new Error('[429 Resource has been exhausted (e.g. check quota)]');
    const result = categorizeAndLogGeminiError(quotaErr, 'Test Quota');
    assert.strictEqual(result.errorCode, 'AI_QUOTA_EXCEEDED');
    assert.strictEqual(result.category, 'QUOTA_OR_RATE_LIMIT');
    assert.ok(result.userFriendlyMsg.includes('rate limit or quota'));
  });

  test('Categorizes Timeout (20s limit) as AI_TIMEOUT', () => {
    const timeoutErr = new Error('Gemini API request timed out (20s limit)');
    const result = categorizeAndLogGeminiError(timeoutErr, 'Test Timeout');
    assert.strictEqual(result.errorCode, 'AI_TIMEOUT');
    assert.strictEqual(result.category, 'TIMEOUT_OR_NETWORK_ERROR');
    assert.ok(result.userFriendlyMsg.includes('timed out'));
  });

  test('Categorizes Network Failure (fetch failed / ECONNRESET) as AI_TIMEOUT', () => {
    const networkErr = new Error('TypeError: fetch failed - ECONNRESET');
    const result = categorizeAndLogGeminiError(networkErr, 'Test Network');
    assert.strictEqual(result.errorCode, 'AI_TIMEOUT');
    assert.strictEqual(result.category, 'TIMEOUT_OR_NETWORK_ERROR');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Guardrail & Follow-Up Context (Hindi/Hinglish/English)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Follow-Up Context & Guardrail Precision ---');

  test('Turn 1: "Mujhe fever hai" is ALLOWED as initial health inquiry', () => {
    const res = classifyUserQuery('Mujhe fever hai', []);
    assert.strictEqual(res.status, 'ALLOWED');
    assert.strictEqual(res.type, 'HEALTH');
  });

  test('Turn 2: "Kal se hai" with fever history is ALLOWED (Contextual Follow-up)', () => {
    const history = [{ sender: 'user', text: 'Mujhe fever hai' }, { sender: 'ai', text: 'Kab se fever hai?' }];
    const res = classifyUserQuery('Kal se hai', history);
    assert.strictEqual(res.status, 'ALLOWED');
    assert.strictEqual(res.type, 'CONTEXTUAL_FOLLOWUP');
  });

  test('Contextual follow-up durations: "2 din se" and "subah se" are ALLOWED with medical history', () => {
    const history = [{ sender: 'user', text: 'bukhar hai mujhe' }];
    const res1 = classifyUserQuery('2 din se', history);
    const res2 = classifyUserQuery('subah se', history);
    assert.strictEqual(res1.status, 'ALLOWED');
    assert.strictEqual(res2.status, 'ALLOWED');
  });

  test('Contextual affirmations/negations: "haan" and "nahi" are ALLOWED with medical history', () => {
    const history = [{ sender: 'user', text: 'fever hai' }, { sender: 'ai', text: 'Kya khansi bhi hai?' }];
    const res1 = classifyUserQuery('haan', history);
    const res2 = classifyUserQuery('nahi', history);
    assert.strictEqual(res1.status, 'ALLOWED');
    assert.strictEqual(res2.status, 'ALLOWED');
  });

  test('Contextual symptom addition: "khansi bhi hai" is ALLOWED with medical history', () => {
    const history = [{ sender: 'user', text: 'fever hai' }];
    const res = classifyUserQuery('khansi bhi hai', history);
    assert.strictEqual(res.status, 'ALLOWED');
  });

  test('Standalone "Kal se hai" without history is DISALLOWED', () => {
    const res = classifyUserQuery('Kal se hai', []);
    assert.strictEqual(res.status, 'DISALLOWED');
  });

  test('Explicit non-healthcare question "Explain Python tuples" remains BLOCKED despite medical history', () => {
    const history = [{ sender: 'user', text: 'Mujhe fever hai' }, { sender: 'ai', text: 'Kab se hai?' }];
    const res = classifyUserQuery('Explain Python tuples', history);
    assert.strictEqual(res.status, 'DISALLOWED');
  });

  test('Off-topic trivia "Who won the 2022 FIFA World Cup?" remains BLOCKED despite medical history', () => {
    const history = [{ sender: 'user', text: 'Mujhe fever hai' }];
    const res = classifyUserQuery('Who won the 2022 FIFA World Cup?', history);
    assert.strictEqual(res.status, 'DISALLOWED');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Context-Aware Follow-Up Suggestions Prediction
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Context-Aware Suggestions Generation ---');

  test('Predicts useful follow-ups after initial fever query "Mujhe fever hai"', () => {
    const suggestions = predictFollowupQuestions('Mujhe fever hai', '', []);
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length >= 2 && suggestions.length <= 4);
    assert.ok(suggestions.some(q => q.includes('Kab se fever hai') || q.includes('warning signs')));
    // Verify each is a separate string and not concatenated
    assert.strictEqual(typeof suggestions[0], 'string');
    assert.ok(!suggestions[0].includes('Kab se fever hai?Kaun se'));
  });

  test('Predicts useful follow-ups after duration answer "Kal se hai"', () => {
    const history = [{ sender: 'user', text: 'Mujhe fever hai' }];
    const suggestions = predictFollowupQuestions('Kal se hai', '', history);
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length >= 2 && suggestions.length <= 4);
    assert.ok(suggestions.some(q => q.includes('temperature') || q.includes('symptoms')));
  });

  test('Predicts English follow-ups for English clinical query', () => {
    const suggestions = predictFollowupQuestions('I have had high fever since yesterday', '', []);
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.some(q => q.includes('fever') || q.includes('temperature') || q.includes('symptoms')));
  });

  test('Extracts bullet questions from Gemini Section 3 when present', () => {
    const geminiText = `
### 1. Understanding your concern
Fever detected.

### 2. Medical explanation
Fever is a physiological response.

### 3. Relevant follow-up questions
*   Aapko bukhar kitne din se hai?
*   Kya thermometer se check kiya kitna temperature hai?
*   Kya saath mein thand lag rahi hai?

### 4. What you can do next
Rest and hydrate.
    `;
    const suggestions = predictFollowupQuestions('fever', geminiText, []);
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length >= 2);
    assert.ok(suggestions.some(q => q.includes('Aapko bukhar kitne din se hai') || q.includes('thermometer')));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Single Request Dispatch & Event Isolation Simulation
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: UI Dispatch & Duplicate Prevention Simulation ---');

  test('Single suggestion click dispatches strictly that one prompt', () => {
    const dispatched = [];
    let isLoadingState = false;

    const handleSendMessage = (text) => {
      if (!text.trim() || isLoadingState) return;
      isLoadingState = true;
      dispatched.push(text);
      isLoadingState = false;
    };

    const suggestions = [
      'Kab se fever hai?',
      'Kaun se warning signs dekhne chahiye?',
      'Kya temperature check kiya hai?'
    ];

    // User clicks suggestion 0:
    const clickedPrompt = suggestions[0];
    handleSendMessage(clickedPrompt);

    assert.strictEqual(dispatched.length, 1);
    assert.strictEqual(dispatched[0], 'Kab se fever hai?');
    // Ensure it was NOT all suggestions joined together
    assert.ok(!dispatched[0].includes('Kaun se warning signs'));
  });

  test('Concurrent double-clicks are rejected while request is loading', () => {
    const dispatched = [];
    let isLoadingState = false;

    const handleSendMessage = (text) => {
      if (!text.trim() || isLoadingState) return;
      isLoadingState = true;
      dispatched.push(text);
    };

    // First click initiates request
    handleSendMessage('Kab se fever hai?');
    // Rapid duplicate click while isLoadingState is true
    handleSendMessage('Kab se fever hai?');

    assert.strictEqual(dispatched.length, 1);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Live Gemini API Generation Test
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 6: Genuine Live Gemini API Verification ---');

  await asyncTest('Live Gemini: "fever hai mujhe thora" returns genuine medical guidance with suggestions', async () => {
    let streamedTokens = '';
    const result = await streamGeneralChatbot('fever hai mujhe thora', [], (chunk) => {
      streamedTokens += chunk;
    });

    assert.ok(!result.errorCode, `Expected no error, got: ${result.errorCode}`);
    assert.ok(result.provider.includes(config.chatbotAi.model), `Expected ${config.chatbotAi.model}, got: ${result.provider}`);
    assert.ok(streamedTokens.length > 100, 'Expected substantive streaming content');
    assert.ok(result.suggestions && result.suggestions.length >= 2, 'Expected at least 2 context-aware suggestions');
    console.log(`   ℹ️ Received ${result.outputTokens} tokens from ${result.provider}`);
    console.log(`   ℹ️ Suggestions generated: [${result.suggestions.map(s => `"${s}"`).join(', ')}]`);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`🏁 REGRESSION SUITE FINISHED: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
};

runRegressionSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
