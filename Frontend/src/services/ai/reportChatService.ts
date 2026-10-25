import { AIReportAnalysisResult, ReportParameter } from '../../types';
import { getBackendUrl } from '../nodeAuthService';

export interface StructuredSection {
  directAnswer: string;
  explanation?: string;
  lifestyleAdvice?: string[];
  doctorAdvice?: string[];
  disclaimer?: string;
}

export interface ReportChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  sections?: StructuredSection;
  provider?: string;
}

export const AI_PROVIDER_MODE: 'LIVE_GEMINI' = 'LIVE_GEMINI';

/**
 * Report-Specific Conversational AI Engine (Chatbot B)
 * Calls backend Gemini API (/api/ai/report-chat) with active report biomarker context.
 * Strictly avoids local deterministic simulated advice when the AI service is unavailable.
 */
export const sendReportChatMessage = async (
  reportContext: AIReportAnalysisResult,
  userQuery: string,
  messageHistory: ReportChatMessage[] = []
): Promise<ReportChatMessage> => {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const allParams: ReportParameter[] = (reportContext.parameters && reportContext.parameters.length > 0)
    ? reportContext.parameters
    : (reportContext.normalFindings || [])
        .concat(reportContext.abnormalFindings || [], reportContext.attentionParameters || []);

  // 1. Context Safety Guardrail: Do not attempt clinical consultation without verified parameters
  if (!allParams || allParams.length === 0) {
    return {
      id: `msg_rep_nodata_${Date.now()}`,
      sender: 'ai',
      text: '⚠️ No Verified Parameters: This document has 0 verified laboratory test results. To consult with the JIVEXA Report Assistant, please upload an authentic, readable medical lab report (digital PDF or clear high-resolution photo).',
      timestamp,
      provider: 'JIVEXA Report Guardrail'
    };
  }

  // 2. Try Backend Report-Specific Gemini Chat Endpoint (Chatbot B)
  const backendUrl = getBackendUrl();
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jivexa_node_jwt_token') : null;

    const res = await fetch(`${backendUrl}/api/ai/report-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify({
        message: userQuery,
        reportContext: {
          reportTitle: reportContext.reportTitle,
          reportDate: reportContext.reportDate,
          healthScore: reportContext.healthScore,
          scoreStatus: reportContext.scoreStatus,
          parameters: allParams.map(p => ({
            name: p.name,
            value: p.value,
            referenceRange: p.referenceRange,
            status: p.status,
            flag: p.flag || 'NORMAL'
          })),
          longitudinalContext: (reportContext as any).longitudinalContext || ''
        },
        conversationId: `report_${reportContext.reportId || reportContext.id || Date.now()}`
      })
    });

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let done = false;
      let buffer = '';
      let provider = 'JIVEXA Report Assistant (Google Gemini)';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.replace('data: ', ''));
              if (data.chunk) fullText += data.chunk;
              if (data.provider) provider = data.provider;
              if (data.error && !fullText) fullText = data.error;
              if (data.done) done = true;
            } catch (e) {}
          }
        }
      }

      if (fullText.trim()) {
        return {
          id: `msg_rep_${Date.now()}`,
          sender: 'ai',
          text: fullText,
          timestamp,
          provider
        };
      }
    } else if (res.status === 503) {
      return {
        id: `msg_rep_err_${Date.now()}`,
        sender: 'ai',
        text: '⚠️ AI_NOT_CONFIGURED: JIVEXA Medical Report Assistant is not configured on the backend. Please ensure GEMINI_REPORT_API_KEY is configured in backend/.env to enable live clinical report consultations.',
        timestamp,
        provider: 'JIVEXA Configuration Notice'
      };
    }
  } catch (backendErr: any) {
    console.warn('[Report Chat] Backend Gemini call failed or offline:', backendErr);
    const isNetworkOffline = backendErr?.message?.includes('fetch') || backendErr?.name === 'TypeError';
    const errorText = isNetworkOffline
      ? `⚠️ Backend Service Offline: Unable to connect to the backend server at ${backendUrl} (${backendErr?.message || 'Network Error'}). Please verify that the backend server is running with 'npm run dev' on port 4000.`
      : `⚠️ Report Assistant Unavailable: ${backendErr?.message || 'An error occurred while connecting to the AI service'}.`;

    return {
      id: `msg_rep_err_${Date.now()}`,
      sender: 'ai',
      text: errorText,
      timestamp,
      provider: 'JIVEXA Connection Notice'
    };
  }

  // 2. Truthful Error Fallback - No Fake or Hardcoded Advice
  return {
    id: `msg_rep_err_${Date.now()}`,
    sender: 'ai',
    text: '⚠️ AI_NOT_CONFIGURED: The AI Report Assistant requires an active GEMINI_REPORT_API_KEY on the backend to provide clinical discussions. Please configure this key in backend/.env to enable live analysis.',
    timestamp,
    provider: 'JIVEXA Error Notice'
  };
};
