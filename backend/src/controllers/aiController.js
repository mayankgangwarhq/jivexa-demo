/**
 * JIVEXA Enterprise High-Availability AI Controller
 * Handles SSE chat streaming, rate limiting, real-time deep report analysis,
 * and authenticated medical report persistence with doctor-patient access control.
 */

const { streamGeneralChatbot, streamReportChatbot, streamLiveAiResponse, analyzeReportWithAI, aiMetrics } = require('../services/aiService');
const { getUserUsage, checkTokenLimit, recordTokenUsage, upgradeSubscription, FREE_TIER_TOKEN_LIMIT } = require('../services/tokenUsageService');
const { MongoDb } = require('../services/mongoDbService');
const { isDatabaseConnected } = require('../config/db');
const User = require('../models/User');
const config = require('../config/env');

// Helper to extract user-declared names
const extractNameFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  const questionWords = /\b(kya|what|kaun|who|batao|bataiye|tell|know|pata|yaad|remember|check)\b/i;
  if (clean.includes('?') || questionWords.test(clean)) {
    return null;
  }

  const patterns = [
    /(?:mera|merar|mari|mere)\s+(?:naam|name)\s+(?:hai\s+)?([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)/i,
    /(?:my\s+name\s+is|i\s+am|im|call\s+me)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)/i,
    /(?:main|mai)\s+([A-Za-z]{2,20})\s+(?:hoon|hu)/i,
    /(?:naam|name)\s*[:=]\s*([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)/i
  ];

  const stopWords = new Set([
    'hai', 'hu', 'hoon', 'kya', 'batao', 'doctor', 'patient', 'jivexa', 'ai', 'fever', 'cough',
    'headache', 'pain', 'hello', 'namaste', 'test', 'report', 'here', 'please', 'sir', 'madam',
    'ok', 'okay', 'yes', 'no', 'not', 'the', 'is', 'a', 'an', 'this', 'that'
  ]);

  for (const regex of patterns) {
    const match = clean.match(regex);
    if (match && match[1]) {
      let candidate = match[1].trim();
      candidate = candidate.replace(/\s+(?:hai|hu|hoon)$/i, '').replace(/[.,!?;:]+$/, '').trim();
      const parts = candidate.split(/\s+/);
      const validParts = parts.filter(p => !stopWords.has(p.toLowerCase()) && /^[A-Za-z]{2,20}$/.test(p));
      if (validParts.length > 0) {
        return validParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }
  }

  return null;
};

// Per-user rate limiting memory map (max 10 requests / minute)
const rateLimitMap = new Map();
const MAX_REQUESTS_PER_MINUTE = 10;

const checkRateLimit = (userId) => {
  const now = Date.now();
  const id = userId || 'anonymous_user';
  if (!rateLimitMap.has(id)) {
    rateLimitMap.set(id, []);
  }

  const timestamps = rateLimitMap.get(id).filter(t => now - t < 60000);
  if (timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  timestamps.push(now);
  rateLimitMap.set(id, timestamps);
  return true;
};

/**
 * Streaming SSE AI Chat Controller (Doctor-Style & Health-Only)
 */
const handleChatRequest = async (req, res) => {
  let user = req.user || null;
  const passedUserId = req.body.userId;
  if (!user && passedUserId && passedUserId !== 'anonymous_user') {
    try {
      user = await User.findOne({ _id: String(passedUserId) });
    } catch (e) {}
  }

  const userId = user ? String(user._id || user.id) : (passedUserId || 'anonymous_user');
  const userProfile = user ? {
    id: String(user._id),
    name: user.name,
    age: user.age || null,
    role: user.role || 'PATIENT'
  } : null;

  const { message, history, conversationId, reportContext } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  // Input size safety validation (max 10,000 characters)
  if (message.length > 10000) {
    return res.status(400).json({
      error: 'Message length exceeds the maximum allowed limit of 10,000 characters.',
      oversized: true
    });
  }

  const safeHistory = Array.isArray(history)
    ? history.filter(h => h && typeof (h.text || h.content || h.message) === 'string').slice(-30)
    : [];

  // 1. Rate Limiting Check
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before sending another message.',
      rateLimited: true
    });
  }

  // 2. Token Limit Check
  const limitCheck = checkTokenLimit(userId);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: 'AI token limit reached for this billing period.',
      limitReached: true,
      tokensUsed: limitCheck.tokensUsed,
      maxTokens: limitCheck.maxTokens,
      subscriptionStatus: limitCheck.subscriptionStatus
    });
  }

  // 3. User Name Declaration Check
  const declaredName = extractNameFromText(message);
  if (declaredName && user) {
    try {
      await User.findByIdAndUpdate(user._id, { name: declaredName });
      user.name = declaredName;
      if (userProfile) userProfile.name = declaredName;
    } catch (nameErr) {
      console.warn('[AI Controller Name Update Notice]:', nameErr.message);
    }
  }

  // 4. Retrieve Cross-Conversation Memory
  let crossConversationContext = '';
  if (user && isDatabaseConnected()) {
    try {
      const pastConvs = await MongoDb.conversations.find({ userId: String(user._id) });
      if (Array.isArray(pastConvs) && pastConvs.length > 0) {
        const memoryFacts = [];
        for (const c of pastConvs.slice(0, 5)) {
          if (c._id === conversationId) continue;
          if (c.messages && c.messages.length > 0) {
            const firstUserMsg = c.messages.find(m => m.sender === 'user')?.text;
            if (firstUserMsg) {
              const nameMatch = extractNameFromText(firstUserMsg);
              if (nameMatch) {
                memoryFacts.push(`User previously stated their name is: ${nameMatch}`);
              }
            }
          }
        }
        if (memoryFacts.length > 0) {
          crossConversationContext = [...new Set(memoryFacts)].join('\n');
        }
      }
    } catch (memErr) {
      console.warn('[AI Controller] Cross-conversation memory retrieval notice:', memErr.message);
    }
  }

  // Setup Server-Sent Events (SSE) streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  let isResponseActive = true;
  res.on('close', () => {
    isResponseActive = false;
  });

  try {
    const aiResult = await streamLiveAiResponse(
      message,
      safeHistory,
      (chunk) => {
        if (isResponseActive && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      },
      userProfile,
      crossConversationContext,
      reportContext
    );

    // Record token usage
    const updatedUsage = recordTokenUsage(userId, aiResult.inputTokens, aiResult.outputTokens);

    // Auto-persist conversation turn in MongoDB if user is authenticated and conversationId is present
    if (user && conversationId && aiResult.text && isDatabaseConnected()) {
      try {
        const convId = String(conversationId);
        const existingConv = await MongoDb.conversations.findOne({ _id: convId, userId: String(user._id) });
        const userMsgObj = {
          id: `msg_user_${Date.now()}`,
          sender: 'user',
          text: message.trim(),
          timestamp: new Date()
        };
        const aiMsgObj = {
          id: `msg_ai_${Date.now()}`,
          sender: 'ai',
          text: aiResult.text,
          timestamp: new Date(),
          provider: aiResult.provider || 'JIVEXA AI (Google Gemini)',
          isEmergency: Boolean(aiResult.isEmergency)
        };
        const title = existingConv?.title && existingConv.title !== 'New Conversation'
          ? existingConv.title
          : (message.trim().slice(0, 32) + (message.trim().length > 32 ? '...' : ''));
        const updatedMessages = existingConv ? [...existingConv.messages, userMsgObj, aiMsgObj] : [userMsgObj, aiMsgObj];
        await MongoDb.conversations.upsert(convId, user._id, {
          title,
          messages: updatedMessages
        });
      } catch (saveErr) {
        console.warn('[AI Controller Auto-Persist Notice]:', saveErr.message);
      }
    }

    // Send final payload with token usage details and error status
    if (isResponseActive && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ 
        done: true, 
        provider: aiResult.provider,
        errorCode: aiResult.errorCode || null,
        tokensUsed: updatedUsage.tokensUsedThisPeriod,
        subscriptionStatus: updatedUsage.subscriptionStatus,
        isEmergency: aiResult.isEmergency || false,
        suggestions: aiResult.suggestions || []
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[JIVEXA AI Controller Error]', error.message);
    aiMetrics.errors++;
    if (isResponseActive && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ 
        error: 'AI_TEMPORARILY_UNAVAILABLE: JIVEXA Assistant is temporarily unavailable, please try again in a moment.',
        errorCode: 'AI_TEMPORARILY_UNAVAILABLE',
        suggestions: [],
        done: true 
      })}\n\n`);
      res.end();
    }
  }
};

/**
 * Real-Time Deep Clinical Document Analyzer Endpoint
 */
/**
 * Streaming Medical Report Chatbot Endpoint (Chatbot B)
 * Context-locked on active verified medical report.
 * Uses GEMINI_REPORT_API_KEY (config.reportAi).
 */
const handleReportChatRequest = async (req, res) => {
  const user = req.user;
  const userId = user ? String(user._id || user.id) : (req.body.userId || 'anonymous_user');
  const userProfile = user ? {
    name: user.name || 'Patient',
    age: user.age || null,
    role: user.role || 'PATIENT'
  } : null;

  const { message, history, conversationId, reportContext } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  if (message.length > 10000) {
    return res.status(400).json({
      error: 'Message length exceeds the maximum allowed limit of 10,000 characters.',
      oversized: true
    });
  }

  const safeHistory = Array.isArray(history)
    ? history.filter(h => h && typeof (h.text || h.content || h.message) === 'string').slice(-30)
    : [];

  // 1. Rate Limiting Check
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before sending another message.',
      rateLimited: true
    });
  }

  // 2. Token Limit Check
  const limitCheck = checkTokenLimit(userId);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: 'AI token limit reached for this billing period.',
      limitReached: true,
      tokensUsed: limitCheck.tokensUsed,
      maxTokens: limitCheck.maxTokens,
      subscriptionStatus: limitCheck.subscriptionStatus
    });
  }

  // Setup Server-Sent Events (SSE) streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  let isResponseActive = true;
  res.on('close', () => {
    isResponseActive = false;
  });

  try {
    const aiResult = await streamReportChatbot(
      message,
      safeHistory,
      reportContext,
      (chunk) => {
        if (isResponseActive && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      },
      userProfile
    );

    // Record token usage
    const updatedUsage = recordTokenUsage(userId, aiResult.inputTokens, aiResult.outputTokens);

    // Send final payload
    if (isResponseActive && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        done: true,
        provider: aiResult.provider,
        errorCode: aiResult.errorCode || null,
        tokensUsed: updatedUsage.tokensUsedThisPeriod,
        subscriptionStatus: updatedUsage.subscriptionStatus,
        isEmergency: aiResult.isEmergency || false,
        suggestions: aiResult.suggestions || []
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[JIVEXA Report Chat Controller Error]', error.message);
    aiMetrics.errors++;
    if (isResponseActive && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        error: 'AI_TEMPORARILY_UNAVAILABLE: JIVEXA Report Assistant is temporarily unavailable, please try again in a moment.',
        errorCode: 'AI_TEMPORARILY_UNAVAILABLE',
        suggestions: [],
        done: true
      })}\n\n`);
      res.end();
    }
  }
};

const handleAnalyzeReport = async (req, res) => {
  const documentText = req.body.documentText || req.body.reportText || req.body.text;
  const fileName = req.body.fileName || req.body.reportType || 'Medical_Report.pdf';
  const patientName = req.user?.name || req.body.patientName || 'Patient';
  const patientId = req.user ? String(req.user._id || req.user.id) : null;

  if (!documentText || typeof documentText !== 'string' || !documentText.trim()) {
    return res.status(400).json({ error: 'Document text content is required' });
  }

  if (documentText.length > 50000) {
    return res.status(400).json({ error: 'Document text exceeds maximum size limit of 50,000 characters' });
  }

  try {
    const analysisResult = await analyzeReportWithAI(documentText, fileName, patientName);

    // Auto-save to MongoDB Atlas if user is authenticated and DB is connected
    let savedReport = null;
    if (patientId && analysisResult.isValidReport && isDatabaseConnected()) {
      try {
        savedReport = await MongoDb.medicalReports.create({
          patientId,
          patientName,
          fileName,
          reportTitle: analysisResult.reportTitle,
          reportDate: analysisResult.reportDate || '',
          healthScore: analysisResult.healthScore,
          scoreStatus: analysisResult.scoreStatus,
          scoreFormula: analysisResult.scoreFormula,
          scoreMethodology: analysisResult.scoreMethodology,
          dataCompleteness: analysisResult.dataCompleteness,
          summaryCounts: analysisResult.summaryCounts,
          summary: analysisResult.summary,
          parameters: analysisResult.parameters || [],
          normalFindings: analysisResult.normalFindings || [],
          abnormalFindings: analysisResult.abnormalFindings || [],
          attentionParameters: analysisResult.attentionParameters || [],
          unverifiedParameters: analysisResult.needsReview || [],
          possibleFactors: analysisResult.possibleFactors,
          questionsForDoctor: analysisResult.questionsForDoctor,
          lifestyleRecommendations: analysisResult.lifestyleRecommendations,
          disclaimer: analysisResult.disclaimer,
          extractionStatus: analysisResult.extractionStatus,
          aiStatus: analysisResult.aiStatus
        });
      } catch (saveErr) {
        console.warn('[AI Report Auto-Persist Notice]:', saveErr.message);
      }
    }

    res.json({
      ...analysisResult,
      reportId: savedReport ? String(savedReport._id) : `rep_${Date.now()}`
    });
  } catch (err) {
    console.error('[AI Report Analyzer Controller Error]', err.message);
    res.status(500).json({
      error: 'Failed to analyze report using AI engine',
      details: err.message
    });
  }
};

/**
 * Save Analyzed Medical Report to MongoDB Atlas
 */
const saveMedicalReport = async (req, res) => {
  try {
    const patientId = String(req.user._id || req.user.id);
    const patientName = req.user.name || 'Patient';
    const {
      id,
      reportId,
      fileName,
      fileSize,
      reportTitle,
      reportDate,
      healthScore,
      scoreStatus,
      scoreFormula,
      scoreMethodology,
      dataCompleteness,
      summaryCounts,
      summary,
      parameters,
      normalFindings,
      abnormalFindings,
      attentionParameters,
      unverifiedParameters,
      possibleFactors,
      questionsForDoctor,
      lifestyleRecommendations,
      disclaimer
    } = req.body;

    const docData = {
      _id: String(reportId || id || `rep_${Date.now()}`),
      patientId,
      patientName,
      fileName: fileName || 'Medical_Report.pdf',
      fileSize: fileSize || '',
      reportTitle: reportTitle || fileName || 'Clinical Lab Report',
      reportDate: reportDate || '',
      healthScore: typeof healthScore === 'number' ? healthScore : null,
      scoreStatus: scoreStatus || 'Requires Attention',
      scoreFormula: scoreFormula || '',
      scoreMethodology: scoreMethodology || '',
      dataCompleteness: dataCompleteness || { analyzed: 0, expected: 8, percentage: 0, statusText: '' },
      summaryCounts: summaryCounts || { total: 0, inRange: 0, aboveRange: 0, belowRange: 0, needsReview: 0, verifiedCount: 0 },
      summary: summary || '',
      parameters: Array.isArray(parameters) ? parameters : [],
      normalFindings: Array.isArray(normalFindings) ? normalFindings : [],
      abnormalFindings: Array.isArray(abnormalFindings) ? abnormalFindings : [],
      attentionParameters: Array.isArray(attentionParameters) ? attentionParameters : [],
      unverifiedParameters: Array.isArray(unverifiedParameters) ? unverifiedParameters : [],
      possibleFactors: Array.isArray(possibleFactors) ? possibleFactors : [],
      questionsForDoctor: Array.isArray(questionsForDoctor) ? questionsForDoctor : [],
      lifestyleRecommendations: Array.isArray(lifestyleRecommendations) ? lifestyleRecommendations : [],
      disclaimer: disclaimer || 'Educational healthcare information only.',
      extractionStatus: 'REPORT_INTERPRETATION_COMPLETE',
      aiStatus: config.ai.isConfigured() ? 'AI_READY' : 'AI_NOT_CONFIGURED'
    };

    if (!isDatabaseConnected()) {
      return res.status(200).json({
        success: true,
        message: 'Report cached in session (Database disconnected)',
        report: docData
      });
    }

    const saved = await MongoDb.medicalReports.create(docData);
    return res.status(201).json({
      success: true,
      message: 'Medical report saved successfully',
      report: saved
    });
  } catch (error) {
    console.error('[AI Controller Save Report Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to save medical report' });
  }
};

/**
 * Get Medical Reports with Strict Patient / Doctor Role Authorization
 */
const getMedicalReports = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const role = req.user.role || 'PATIENT';

    if (!isDatabaseConnected()) {
      return res.json({ success: true, count: 0, reports: [] });
    }

    let filter = {};
    if (role === 'DOCTOR') {
      // Doctors can only view reports explicitly shared with them
      filter = { 'sharedWithDoctors.doctorId': userId };
    } else {
      // Patients can only view their own reports
      filter = { patientId: userId };
    }

    const reports = await MongoDb.medicalReports.find(filter);
    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('[AI Controller Get Reports Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch medical reports' });
  }
};

/**
 * Get Specific Medical Report by ID with Ownership & Doctor Authorization Check
 */
const getMedicalReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user._id || req.user.id);
    const role = req.user.role || 'PATIENT';

    if (!isDatabaseConnected()) {
      return res.status(503).json({ success: false, error: 'Database disconnected' });
    }

    const report = await MongoDb.medicalReports.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Medical report not found' });
    }

    // Authorization: Patient owns it OR Doctor was explicitly shared it
    const isOwner = report.patientId === userId;
    const isSharedDoctor = role === 'DOCTOR' && Array.isArray(report.sharedWithDoctors) &&
      report.sharedWithDoctors.some(d => String(d.doctorId) === userId);

    if (!isOwner && !isSharedDoctor) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not authorized to view this medical report.'
      });
    }

    return res.json({ success: true, report });
  } catch (error) {
    console.error('[AI Controller Get Report By ID Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch medical report' });
  }
};

/**
 * Share Medical Report with a Doctor
 */
const shareMedicalReport = async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = String(req.user._id || req.user.id);
    const { doctorId, doctorName } = req.body;

    if (!doctorId) {
      return res.status(400).json({ success: false, error: 'Doctor ID is required for sharing' });
    }

    if (!isDatabaseConnected()) {
      return res.status(200).json({
        success: true,
        message: `Report sharing request recorded for Dr. ${doctorName || doctorId}`
      });
    }

    const report = await MongoDb.medicalReports.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Medical report not found' });
    }

    if (report.patientId !== patientId) {
      return res.status(403).json({ success: false, error: 'You can only share your own medical reports' });
    }

    const updated = await MongoDb.medicalReports.shareWithDoctor(id, patientId, { doctorId, doctorName });
    return res.json({
      success: true,
      message: `Medical report shared successfully with Dr. ${doctorName || doctorId}`,
      report: updated
    });
  } catch (error) {
    console.error('[AI Controller Share Report Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to share medical report' });
  }
};

/**
 * Get User Token Usage & Subscription Status
 */
const getUserUsageStats = (req, res) => {
  const userId = req.user?.id || req.query.userId || 'anonymous_user';
  const usage = getUserUsage(userId);
  res.json({
    userId,
    tokensUsedThisPeriod: usage.tokensUsedThisPeriod,
    maxTokens: FREE_TIER_TOKEN_LIMIT,
    subscriptionStatus: usage.subscriptionStatus,
    periodResetDate: usage.periodResetDate
  });
};

/**
 * Upgrade to Pro Subscription
 */
const upgradeUserPro = (req, res) => {
  const userId = req.user?.id || req.body.userId || 'anonymous_user';
  const usage = upgradeSubscription(userId);
  res.json({
    success: true,
    message: 'Upgraded to JIVEXA Pro successfully! Unlimited AI Health Assistant access unlocked.',
    usage
  });
};

/**
 * Get Admin AI Metrics & System Logs
 */
const getAdminAiMetrics = (req, res) => {
  res.json({
    metrics: aiMetrics,
    serverTime: new Date().toISOString()
  });
};

/**
 * Persistent Conversation History Handlers
 */
const getConversations = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    if (!isDatabaseConnected()) {
      return res.json({ success: true, count: 0, conversations: [] });
    }
    const list = await MongoDb.conversations.find({ userId });
    return res.json({
      success: true,
      count: list.length,
      conversations: list
    });
  } catch (error) {
    console.error('[AI Controller Get Conversations Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
};

const getConversationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user._id || req.user.id);
    if (!isDatabaseConnected()) {
      return res.status(404).json({ success: false, error: 'Database disconnected' });
    }
    const conv = await MongoDb.conversations.findOne({ _id: String(id), userId });
    if (!conv) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    return res.json({ success: true, conversation: conv });
  } catch (error) {
    console.error('[AI Controller Get Conversation By ID Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
};

const saveConversation = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const { id, title, messages } = req.body;

    if (!id || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'Conversation ID and messages array are required' });
    }

    if (!isDatabaseConnected()) {
      return res.json({ success: true, message: 'Conversation cached locally (DB disconnected)' });
    }

    const conv = await MongoDb.conversations.upsert(id, userId, {
      title: title || 'New Conversation',
      messages
    });

    const fromTitle = extractNameFromText(title);
    if (fromTitle) {
      await User.findByIdAndUpdate(userId, { name: fromTitle }).catch(() => {});
    } else if (Array.isArray(messages)) {
      for (const m of messages) {
        if (m && m.sender === 'user' && m.text) {
          const fromMsg = extractNameFromText(m.text);
          if (fromMsg) {
            await User.findByIdAndUpdate(userId, { name: fromMsg }).catch(() => {});
            break;
          }
        }
      }
    }

    return res.json({
      success: true,
      conversation: conv.toJSON ? conv.toJSON() : conv
    });
  } catch (error) {
    console.error('[AI Controller Save Conversation Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to save conversation' });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user._id || req.user.id);
    if (!isDatabaseConnected()) {
      return res.json({ success: true, message: 'Deleted locally' });
    }
    const deleted = await MongoDb.conversations.deleteById(id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Conversation not found or not owned by user' });
    }
    return res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('[AI Controller Delete Conversation Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
};

const clearAllConversations = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    if (!isDatabaseConnected()) {
      return res.json({ success: true, message: 'Cleared locally' });
    }
    const result = await MongoDb.conversations.deleteMany({ userId });
    return res.json({
      success: true,
      message: 'All chat history cleared successfully',
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    console.error('[AI Controller Clear History Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to clear chat history' });
  }
};

module.exports = {
  handleChatRequest,
  handleReportChatRequest,
  handleAnalyzeReport,
  saveMedicalReport,
  getMedicalReports,
  getMedicalReportById,
  shareMedicalReport,
  getUserUsageStats,
  upgradeUserPro,
  getAdminAiMetrics,
  getConversations,
  getConversationById,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  extractNameFromText
};
