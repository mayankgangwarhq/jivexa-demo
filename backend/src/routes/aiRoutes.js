const express = require('express');
const router = express.Router();
const { 
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
  clearAllConversations
} = require('../controllers/aiController');
const { protect, optionalProtect } = require('../middleware/authMiddleware');

// Streaming SSE Chat Endpoint (identifies user if authenticated, supports reportContext)
router.post('/chat', optionalProtect, handleChatRequest);
// Streaming SSE Medical Report Chat Endpoint (Chatbot B)
router.post('/report-chat', optionalProtect, handleReportChatRequest);

// Real-Time Clinical Report Analyzer & Biomarker Extraction Endpoint
router.post('/analyze-report', optionalProtect, handleAnalyzeReport);

// Token Usage & Subscription Status
router.get('/usage', optionalProtect, getUserUsageStats);

// Upgrade to Pro Subscription
router.post('/upgrade', optionalProtect, upgradeUserPro);

// Admin Metrics & Monitoring
router.get('/metrics', getAdminAiMetrics);

// Persistent Conversation History Endpoints (Protected by Auth)
router.get('/conversations', protect, getConversations);
router.get('/conversations/:id', protect, getConversationById);
router.post('/conversations', protect, saveConversation);
router.delete('/conversations/:id', protect, deleteConversation);
router.delete('/conversations', protect, clearAllConversations);

// Persistent Medical Reports with Patient/Doctor Access Controls (Protected by Auth)
router.get('/reports', protect, getMedicalReports);
router.get('/reports/:id', protect, getMedicalReportById);
router.post('/reports', protect, saveMedicalReport);
router.post('/reports/:id/share', protect, shareMedicalReport);

module.exports = router;
