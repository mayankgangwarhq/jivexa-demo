import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHealthData } from '../../context/HealthDataContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Toast } from '../../components/ui/Toast';
import { processAndAnalyzeReport, SAMPLE_LAB_REPORTS, recomputeReportScores } from '../../services/ai/reportAnalyzer';
import { sendReportChatMessage, ReportChatMessage } from '../../services/ai/reportChatService';
import { extractTextFromPDFOrImage } from '../../services/ai/pdfParser';
import { checkPdfAnalyzerRateLimit, incrementPdfAnalyzerRateLimit } from '../../services/ai';
import { AIReportAnalysisResult, MedicalReportRecord, ReportParameter } from '../../types';
import { 
  FileText, Upload, Sparkles, AlertTriangle, CheckCircle2, 
  HelpCircle, Lightbulb, Share2, History, ArrowRight, ShieldCheck, 
  RefreshCw, FileCheck, FileSpreadsheet, MessageSquare, Send, User as UserIcon,
  AlertCircle, FileCode, CheckCheck, Lock, Activity, Heart, Stethoscope, 
  Apple, Mic, Paperclip, Check, ThumbsUp, ThumbsDown, Crown, Zap,
  ArrowUpRight, ArrowDownRight, Edit3, Filter, Info, TrendingUp, BarChart2, Eye
} from 'lucide-react';

export const AIReportAnalyzer: React.FC = () => {
  const { user } = useAuth();
  const { doctors, medicalReports, saveAnalyzedReport, shareReportWithDoctor } = useHealthData();

  // Active View Tab: 'Analyzer' | 'History'
  const [activeTab, setActiveTab] = useState<'Analyzer' | 'History'>('Analyzer');

  // Upload & Drag-and-Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [secureFileUrl, setSecureFileUrl] = useState<string>('');

  const [currentAnalysis, setCurrentAnalysis] = useState<AIReportAnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string; type: string } | null>(null);

  // Parameter Filtering & User Review State
  const [parameterFilter, setParameterFilter] = useState<'ALL' | 'ABNORMAL' | 'NORMAL' | 'REVIEW'>('ALL');
  const [paramToEdit, setParamToEdit] = useState<ReportParameter | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editStatus, setEditStatus] = useState<ReportParameter['status']>('Within Reference Range');
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Scoring Methodology Modal State
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Sharing Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [isSharing, setIsSharing] = useState(false);

  // AI Health Chat State (Report Scoped)
  const [chatMessages, setChatMessages] = useState<ReportChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatTyping, setIsChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  // 5 Free Reports Paywall State
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [isProUser, setIsProUser] = useState(false);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatTyping]);

  // Initialize Report Chat Context when analysis is active
  useEffect(() => {
    if (currentAnalysis) {
      const verifiedCount = (currentAnalysis.parameters || []).filter(p => p.isVerified !== false).length;
      setChatMessages([
        {
          id: `msg_welcome_${Date.now()}`,
          sender: 'ai',
          text: `Hello ${user?.name?.split(' ')[0] || 'there'}! I am your JIVEXA AI Report Assistant. I have loaded the context for **${currentAnalysis.reportTitle}** ${typeof currentAnalysis.healthScore === 'number' ? `(Health Score: ${currentAnalysis.healthScore}/100)` : '(Score: Unavailable / Review Mode)'} with ${verifiedCount} verified laboratory parameters.\n\nAsk me anything about your parameters, reference ranges, diet, lifestyle, or questions to ask your doctor!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sections: {
            directAnswer: `Hello ${user?.name?.split(' ')[0] || 'there'}! I am your JIVEXA AI Report Assistant.`,
            explanation: `I have synchronized ${verifiedCount} verified clinical parameters from ${currentAnalysis.reportTitle}.`,
            lifestyleAdvice: [
              'Ask me about specific parameters (e.g. Hemoglobin, Cholesterol, Fasting Glucose)',
              'Ask for evidence-based dietary tips tailored to your results',
              'Generate a checklist of questions to ask your consulting doctor'
            ],
            disclaimer: 'AI-generated information is for educational purposes only. Always consult a qualified physician.'
          }
        }
      ]);
    }
  }, [currentAnalysis, user?.name]);

  // Execute PDF Extraction & AI Analysis
  const handleFileSelected = async (file: File) => {
    const rateLimit = checkPdfAnalyzerRateLimit(user?.id);
    if (!rateLimit.allowed) {
      setToastMsg(`⏳ Daily PDF Limit Reached (5/5 PDFs). Your PDF Analyzer quota will reset after ${rateLimit.remainingHours} hours.`);
      setUploadError(`Daily PDF Upload Limit Reached (5/5 PDFs). Your quota will reset after ${rateLimit.remainingHours} hours.`);
      return;
    }

    setUploadError('');
    setUploadedFile({
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      type: file.type || 'application/pdf'
    });

    setIsProcessing(true);
    setUploadProgress(10);
    setStatusMessage('Reading PDF stream and initializing OCR engine...');

    const extractRes = await extractTextFromPDFOrImage(file, (percent, msg) => {
      setUploadProgress(percent);
      setStatusMessage(msg);
    });

    if (!extractRes.success) {
      setIsProcessing(false);
      setUploadError(extractRes.error || 'Failed to parse medical report file.');
      return;
    }

    setSecureFileUrl(extractRes.secureFileUrl);

    setStatusMessage('Extracting laboratory parameters & evaluating reference ranges...');
    const result = await processAndAnalyzeReport(file.name, extractRes.rawText);

    setCurrentAnalysis(result);
    setIsProcessing(false);

    const reportRecord: MedicalReportRecord = {
      id: result.reportId,
      patientId: user?.id || 'patient_001',
      fileName: file.name,
      fileType: file.type || 'application/pdf',
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      fileUrl: extractRes.secureFileUrl,
      uploadedAt: result.analyzedAt,
      analysis: result
    };
    saveAnalyzedReport(reportRecord);
    incrementPdfAnalyzerRateLimit(user?.id);
    setToastMsg('Medical report extracted and analyzed successfully.');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSample = async (sample: typeof SAMPLE_LAB_REPORTS[0]) => {
    setUploadError('');
    setUploadedFile({
      name: sample.fileName,
      size: sample.fileSize,
      type: sample.fileType
    });

    setIsProcessing(true);
    setUploadProgress(20);
    setStatusMessage('Loading sample medical report stream...');

    await new Promise(r => setTimeout(r, 400));
    setUploadProgress(70);
    setStatusMessage('Extracting sample clinical parameters & reference intervals...');

    const result = await processAndAnalyzeReport(sample.fileName, sample.rawText);
    setUploadProgress(100);

    setCurrentAnalysis(result);
    setIsProcessing(false);

    const reportRecord: MedicalReportRecord = {
      id: result.reportId,
      patientId: user?.id || 'patient_001',
      fileName: sample.fileName,
      fileType: sample.fileType,
      fileSize: sample.fileSize,
      fileUrl: '/assets/sample_report_preview.pdf',
      uploadedAt: result.analyzedAt,
      analysis: result
    };
    saveAnalyzedReport(reportRecord);
    setToastMsg('Sample medical report analyzed.');
  };

  const handleShareReport = async () => {
    if (!currentAnalysis || !selectedDoctorId) return;
    setIsSharing(true);

    const doc = doctors.find((d) => d.id === selectedDoctorId);
    const res = await shareReportWithDoctor(currentAnalysis.reportId, selectedDoctorId);

    setIsSharing(false);
    setIsShareModalOpen(false);

    if (res.success) {
      setToastMsg(`Report shared with ${doc?.name || 'Doctor'} successfully.`);
    } else {
      setToastMsg('Failed to share report. Please try again.');
    }
  };

  // Open parameter adjustment/verification modal
  const openParamEditModal = (param: ReportParameter) => {
    setParamToEdit(param);
    setEditValue(param.value);
    setEditStatus(param.status);
    setIsEditModalOpen(true);
  };

  // Save adjusted/verified parameter and recalculate scores immediately
  const handleSaveParamEdit = () => {
    if (!currentAnalysis || !paramToEdit) return;

    const allParams = currentAnalysis.parameters && currentAnalysis.parameters.length > 0
      ? currentAnalysis.parameters
      : (currentAnalysis.normalFindings || []).concat(currentAnalysis.abnormalFindings || [], currentAnalysis.attentionParameters || []);

    const updatedParams: ReportParameter[] = allParams.map((p) => {
      if (p.name === paramToEdit.name) {
        const flag = editStatus === 'Above Range' ? 'HIGH' : editStatus === 'Below Range' ? 'LOW' : editStatus === 'Needs Review' ? 'NEEDS_REVIEW' : 'NORMAL';
        const isVerified = editStatus !== 'Needs Review';
        return {
          ...p,
          value: editValue,
          status: editStatus,
          flag,
          isVerified,
          simpleExplanation: editStatus === 'Within Reference Range'
            ? `${p.name} (${editValue}) is verified within laboratory reference limits.`
            : editStatus === 'Above Range'
            ? `${p.name} (${editValue}) is confirmed above reference range.`
            : editStatus === 'Below Range'
            ? `${p.name} (${editValue}) is confirmed below reference range.`
            : 'Uncertain reading flagged for clinical review.'
        };
      }
      return p;
    });

    const newScores = recomputeReportScores(updatedParams);
    const updatedAnalysis: AIReportAnalysisResult = {
      ...currentAnalysis,
      parameters: updatedParams,
      normalFindings: updatedParams.filter(p => p.status === 'Within Reference Range' || p.status === 'Normal'),
      abnormalFindings: updatedParams.filter(p => p.status === 'Above Range' || p.status === 'Below Range' || p.status === 'Abnormal'),
      attentionParameters: updatedParams.filter(p => p.status === 'Needs Review' || p.status === 'Attention'),
      withinRange: updatedParams.filter(p => p.status === 'Within Reference Range'),
      aboveRange: updatedParams.filter(p => p.status === 'Above Range'),
      belowRange: updatedParams.filter(p => p.status === 'Below Range'),
      needsReview: updatedParams.filter(p => p.status === 'Needs Review'),
      ...newScores
    };

    setCurrentAnalysis(updatedAnalysis);
    setIsEditModalOpen(false);
    setToastMsg(`Parameter ${paramToEdit.name} verified and report score recalculated.`);
  };

  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || isChatTyping) return;

    if (!currentAnalysis) {
      const userMsg: ReportChatMessage = {
        id: `msg_user_${Date.now()}`,
        sender: 'user',
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      const promptMsg: ReportChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: 'Please upload or select a medical report first so I can analyze its specific parameters and answer your questions.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'JIVEXA Report Assistant'
      };
      setChatMessages((prev) => [...prev, userMsg, promptMsg]);
      if (!presetText) setChatInput('');
      return;
    }

    const paramCount = currentAnalysis.parameters ? currentAnalysis.parameters.length : (currentAnalysis.summaryCounts?.total || 0);
    if (paramCount === 0) {
      const userMsg: ReportChatMessage = {
        id: `msg_user_${Date.now()}`,
        sender: 'user',
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      const promptMsg: ReportChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: '⚠️ No Verified Parameters: This document has 0 verified laboratory test results. To consult with the JIVEXA Report Assistant, please upload a clear digital PDF or high-resolution photo with readable lab parameters.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'JIVEXA Report Guardrail'
      };
      setChatMessages((prev) => [...prev, userMsg, promptMsg]);
      if (!presetText) setChatInput('');
      return;
    }

    const userMsg: ReportChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);
    if (!presetText) setChatInput('');
    setIsChatTyping(true);

    const aiMsg = await sendReportChatMessage(currentAnalysis, textToSend, updatedHistory);
    
    setIsChatTyping(false);
    setChatMessages((prev) => [...prev, aiMsg]);
  };

  const CHIP_QUESTIONS = [
    { label: '💊 Do I need medicine?', text: 'Do I need medicine?' },
    { label: '🥗 What foods should I eat?', text: 'What foods should I eat based on my report?' },
    { label: '🏃 Can I exercise?', text: 'Can I exercise safely with these parameters?' },
    { label: '🩺 Questions for my doctor?', text: 'What questions should I ask my doctor?' },
    { label: '❤️ Explain my abnormal tests', text: 'Explain my abnormal test findings in simple terms' },
    { label: '⚡ Explain Fasting Glucose', text: 'Explain my Fasting Blood Sugar result' }
  ];

  // Helper for Truthful AI / Extraction Status Badge
  const getTruthfulStatusInfo = (analysis: AIReportAnalysisResult | null) => {
    if (!analysis) {
      return { label: 'NO_REPORT_SELECTED', color: '#64748b', bg: '#f1f5f9', icon: '⚪' };
    }
    const paramCount = analysis.parameters ? analysis.parameters.length : (analysis.summaryCounts?.total || 0);

    if (paramCount === 0 || analysis.extractionStatus === 'EXTRACTION_FAILED' || analysis.extractionStatus === 'REPORT_EXTRACTION_FAILED') {
      return { label: 'EXTRACTION_FAILED', color: '#dc2626', bg: '#fee2e2', icon: '🔴' };
    }
    if (paramCount < 3 || analysis.extractionStatus === 'EXTRACTION_PARTIALLY_SUCCESSFUL') {
      return { label: 'EXTRACTION_PARTIALLY_SUCCESSFUL', color: '#d97706', bg: '#fef3c7', icon: '🟡' };
    }
    if (analysis.aiStatus === 'AI_SUCCESS') {
      return { label: 'AI_SUCCESS', color: '#059669', bg: '#d1fae5', icon: '🟢' };
    }
    if (analysis.aiStatus === 'AI_NOT_CONFIGURED') {
      return { label: 'AI_NOT_CONFIGURED', color: '#d97706', bg: '#fef3c7', icon: '🟡' };
    }
    if (analysis.aiStatus === 'AI_TEMPORARILY_UNAVAILABLE' || analysis.aiStatus === 'AI_ERROR') {
      return { label: 'AI_TEMPORARILY_UNAVAILABLE', color: '#dc2626', bg: '#fee2e2', icon: '🔴' };
    }
    return { label: 'EXTRACTION_SUCCESSFUL', color: '#0284c7', bg: '#e0f2fe', icon: '🔵' };
  };

  const getScoreColor = (score: number | null | undefined) => {
    if (typeof score !== 'number') return '#64748b';
    if (score >= 80) return '#10b981';
    if (score >= 70) return '#0d9488';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  // Accessible Status Badge Renderer
  const renderStatusBadge = (status: string, flag?: string) => {
    if (status === 'Within Reference Range' || flag === 'NORMAL' || status === 'Normal') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px', backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
          <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
          [NORMAL]
        </span>
      );
    }
    if (status === 'Above Range' || flag === 'HIGH') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
          <ArrowUpRight size={13} style={{ color: '#dc2626' }} />
          [HIGH]
        </span>
      );
    }
    if (status === 'Below Range' || flag === 'LOW') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
          <ArrowDownRight size={13} style={{ color: '#d97706' }} />
          [LOW]
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
        <HelpCircle size={13} style={{ color: '#64748b' }} />
        [NEEDS REVIEW]
      </span>
    );
  };

  // Get active parameters list
  const activeParameterList: ReportParameter[] = currentAnalysis
    ? (currentAnalysis.parameters && currentAnalysis.parameters.length > 0
        ? currentAnalysis.parameters
        : (currentAnalysis.normalFindings || []).concat(currentAnalysis.abnormalFindings || [], currentAnalysis.attentionParameters || []))
    : [];

  const filteredParameters = activeParameterList.filter((p) => {
    if (parameterFilter === 'ABNORMAL') return p.status === 'Above Range' || p.status === 'Below Range' || p.status === 'Abnormal';
    if (parameterFilter === 'NORMAL') return p.status === 'Within Reference Range' || p.status === 'Normal';
    if (parameterFilter === 'REVIEW') return p.status === 'Needs Review' || p.flag === 'NEEDS_REVIEW' || p.isVerified === false;
    return true;
  });

  // Calculate summary counts from active parameters
  const totalTests = activeParameterList.length;
  const verifiedTests = activeParameterList.filter(p => p.isVerified !== false && p.status !== 'Needs Review').length;
  const inRangeCount = activeParameterList.filter(p => p.status === 'Within Reference Range' || p.status === 'Normal').length;
  const aboveRangeCount = activeParameterList.filter(p => p.status === 'Above Range' || (p.status === 'Abnormal' && !p.status.toLowerCase().includes('below'))).length;
  const belowRangeCount = activeParameterList.filter(p => p.status === 'Below Range').length;
  const needsReviewCount = activeParameterList.filter(p => p.status === 'Needs Review' || p.flag === 'NEEDS_REVIEW' || p.isVerified === false).length;

  const inRangePercent = verifiedTests > 0 ? Math.round((inRangeCount / verifiedTests) * 100) : 0;
  const completenessPercent = currentAnalysis?.dataCompleteness?.percentage ?? Math.min(100, Math.round((verifiedTests / Math.max(8, totalTests)) * 100));

  // --- LONGITUDINAL SCORECARD COMPUTATION FOR REPORT VAULT (TAB 2) ---
  const vaultReportCount = medicalReports.length;
  const vaultAllParameters: { param: ReportParameter; reportDate: string; reportTitle: string; reportId: string }[] = [];

  medicalReports.forEach(rep => {
    const params: ReportParameter[] = rep.analysis?.parameters && rep.analysis.parameters.length > 0
      ? rep.analysis.parameters
      : (rep.analysis?.normalFindings || []).concat(rep.analysis?.abnormalFindings || [], rep.analysis?.attentionParameters || []);
    
    params.forEach(p => {
      vaultAllParameters.push({
        param: p,
        reportDate: rep.analysis?.reportDate || rep.uploadedAt || 'Historical',
        reportTitle: rep.fileName,
        reportId: rep.id
      });
    });
  });

  const vaultVerifiedCount = vaultAllParameters.filter(item => item.param.isVerified !== false && item.param.status !== 'Needs Review').length;
  const vaultInRangeCount = vaultAllParameters.filter(item => item.param.status === 'Within Reference Range' || item.param.status === 'Normal').length;
  const vaultAboveCount = vaultAllParameters.filter(item => item.param.status === 'Above Range' || item.param.status === 'Abnormal').length;
  const vaultBelowCount = vaultAllParameters.filter(item => item.param.status === 'Below Range').length;
  const vaultReviewCount = vaultAllParameters.filter(item => item.param.status === 'Needs Review' || item.param.flag === 'NEEDS_REVIEW').length;

  // Longitudinal biomarker trends: group by common test name & compatible unit
  const trackedBiomarkers = ['Hemoglobin', 'Fasting Blood Sugar', 'Total Cholesterol', 'HbA1c', 'Serum Creatinine', 'Platelet Count'];
  const biomarkerTrends: { [testName: string]: { date: string; value: string; num: number | null; unit: string; status: string; reportTitle: string }[] } = {};

  trackedBiomarkers.forEach(name => {
    biomarkerTrends[name] = [];
  });

  vaultAllParameters.forEach(item => {
    const matchedKey = trackedBiomarkers.find(k => item.param.name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(item.param.name.toLowerCase()));
    if (matchedKey) {
      const numMatch = parseFloat(item.param.value.replace(/,/g, ''));
      biomarkerTrends[matchedKey].push({
        date: item.reportDate,
        value: item.param.value,
        num: isNaN(numMatch) ? null : numMatch,
        unit: item.param.unit || '',
        status: item.param.status,
        reportTitle: item.reportTitle
      });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
      
      {/* Toast Notification */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}

      {/* Modern Glassmorphic Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 50%, #0d9488 100%)',
        color: 'white',
        borderRadius: '24px',
        padding: '36px',
        boxShadow: '0 20px 40px -15px rgba(15, 118, 110, 0.35)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Ambient glow shapes */}
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(94, 234, 212, 0.15)', filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '640px', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255, 255, 255, 0.18)', backdropFilter: 'blur(10px)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '14px' }}>
            <Sparkles size={14} style={{ color: '#5eead4' }} />
            JIVEXA HEALTH OS • CLINICAL LAB INTELLIGENCE
          </div>
          <h1 style={{ color: 'white', fontWeight: 900, fontSize: '2.1rem', marginBottom: '10px', letterSpacing: '-0.02em' }}>
            Accurate Medical Report Analyzer
          </h1>
          <p style={{ color: '#ccfbf1', fontSize: '0.96rem', lineHeight: '1.65' }}>
            Extract laboratory test parameters, evaluate against exact laboratory reference intervals, review unverified values, and track longitudinal health scorecards across all your reports.
          </p>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '12px', zIndex: 2 }}>
          <Button 
            onClick={() => setActiveTab('Analyzer')} 
            variant={activeTab === 'Analyzer' ? 'secondary' : 'outline'}
            style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', height: '44px', borderRadius: '14px', padding: '0 20px', fontWeight: 700 }}
          >
            <Sparkles size={16} />
            Report Analyzer
          </Button>
          <Button 
            onClick={() => setActiveTab('History')} 
            variant={activeTab === 'History' ? 'secondary' : 'outline'}
            style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', height: '44px', borderRadius: '14px', padding: '0 20px', fontWeight: 700 }}
          >
            <History size={16} />
            Report Vault & Scorecard ({vaultReportCount})
          </Button>
        </div>
      </div>

      {/* --- TAB 1: REPORT ANALYZER WORKSTATION --- */}
      {activeTab === 'Analyzer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* UPLOAD & PROCESSING CARD */}
          {!currentAnalysis && !isProcessing && (
            <Card style={{ borderRadius: '24px', padding: '32px' }} title={<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Upload size={22} style={{ color: 'var(--primary)' }} /><span style={{ fontWeight: 800, fontSize: '1.15rem' }}>Upload Medical Report (Digital PDF, Scans & Photos)</span></div>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Upload Error Banner */}
                {uploadError && (
                  <div style={{ backgroundColor: 'var(--error-light)', border: '1px solid var(--error)', borderRadius: '16px', padding: '16px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem', fontWeight: 600 }}>
                    <AlertCircle size={20} style={{ flexShrink: 0 }} />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Drag and Drop Zone */}
                <label 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: isDragging ? '2.5px dashed var(--primary)' : '2px dashed #cbd5e1',
                    backgroundColor: isDragging ? 'rgba(15, 118, 110, 0.06)' : '#f8fafc',
                    borderRadius: '20px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '14px',
                    transition: 'all 0.25s ease'
                  }}
                >
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #0f766e 0%, #10b981 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -5px rgba(15, 118, 110, 0.4)' }}>
                    <FileSpreadsheet size={32} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Drag & Drop PDF or Lab Photo Here</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Supports digital PDFs, scanned lab reports, CBC, Lipid panels, Metabolic panels (PDF, PNG, JPG up to 25MB)
                    </p>
                  </div>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept=".pdf,.png,.jpg,.jpeg" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }} 
                    style={{ display: 'none' }}
                  />
                  <Button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{ marginTop: '8px', borderRadius: '12px', padding: '10px 24px', fontWeight: 700 }}
                  >
                    Select PDF / Image File
                  </Button>
                </label>

                {/* Sample Reports Quick Loader */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                    ⚡ Test immediately with verified sample clinical reports:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2-mobile">
                    {SAMPLE_LAB_REPORTS.map((sample) => (
                      <div 
                        key={sample.id}
                        onClick={() => handleSelectSample(sample)}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '16px',
                          padding: '16px 20px',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s ease',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={20} />
                          </div>
                          <div>
                            <h4 style={{ fontSize: '0.92rem', fontWeight: 700 }}>{sample.title}</h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sample.fileName} • {sample.fileSize}</span>
                          </div>
                        </div>
                        <ArrowRight size={16} style={{ color: 'var(--primary)' }} />
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </Card>
          )}

          {/* STEPPER & UPLOAD PROGRESS ANIMATION */}
          {isProcessing && (
            <Card style={{ textAlign: 'center', padding: '54px 24px', borderRadius: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', maxWidth: '520px', margin: '0 auto' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid var(--primary-light)', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  <Sparkles size={28} style={{ position: 'absolute', top: '26px', left: '26px', color: 'var(--primary)' }} />
                </div>

                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Processing {uploadedFile?.name}...</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                    {statusMessage}
                  </p>
                </div>

                {/* Live Progress Bar */}
                <div style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #0f766e, #10b981)', height: '100%', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-light)' }}>{uploadProgress}% Complete</span>
              </div>
            </Card>
          )}

          {/* UNSELECTED REPORT CHAT PROMPT (Chatbot B) */}
          {!currentAnalysis && !isProcessing && (
            <Card style={{ borderRadius: '24px', padding: '28px' }} title={<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Activity size={22} style={{ color: 'var(--primary)' }} /><span style={{ fontWeight: 800, fontSize: '1.15rem' }}>AI Medical Report Assistant (Chatbot B)</span><span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#64748b' }}>⚪ WAITING_FOR_REPORT</span></div>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#f8fafc', padding: '24px', borderRadius: '18px', border: '1px dashed var(--border)' }}>
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  💡 <strong>No active report context selected:</strong> Upload a medical lab report (PDF/Image) above or select one from the quick samples or Report Vault to unlock dedicated report follow-up questions with JIVEXA Report Assistant.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {CHIP_QUESTIONS.slice(0, 4).map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendChatMessage(chip.text)}
                      style={{ border: '1px solid rgba(15, 118, 110, 0.2)', background: 'white', color: 'var(--text-muted)', borderRadius: '20px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* --- AI ANALYSIS RESULT PRESENTATION --- */}
          {currentAnalysis && !isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <Button variant="outline" onClick={() => setCurrentAnalysis(null)} style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <RefreshCw size={16} />
                  Analyze Another Report
                </Button>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {secureFileUrl && (
                    <a 
                      href={secureFileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 18px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'white',
                        color: 'var(--primary)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        textDecoration: 'none'
                      }}
                    >
                      <FileCode size={16} />
                      View Uploaded Document
                    </a>
                  )}

                  <Button 
                    variant="outline"
                    onClick={() => setIsMethodologyOpen(true)}
                    style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                  >
                    <Info size={16} />
                    Scoring Methodology
                  </Button>

                  <Button onClick={() => setIsShareModalOpen(true)} style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    <Share2 size={16} />
                    Share Report With Doctor
                  </Button>
                </div>
              </div>

              {/* Status Warning Banners */}
              {currentAnalysis.aiStatus === 'AI_NOT_CONFIGURED' && (
                <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '20px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '14px', color: '#92400e' }}>
                  <AlertTriangle size={24} style={{ flexShrink: 0, color: '#f59e0b' }} />
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '0.98rem' }}>AI Clinical Interpretation Not Configured</h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', lineHeight: '1.5' }}>
                      Verified parameters were successfully extracted from your medical document. Generating full clinical interpretations, lifestyle recommendations, and doctor consultation questions requires <code>GEMINI_REPORT_API_KEY</code> to be configured in <code>backend/.env</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SECTION 4: HIGH / LOW / IN-RANGE SUMMARY & HEALTH SCORECARDS */}
              {/* ========================================================================= */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }} className="grid-2-mobile">
                
                {/* 1. Within Reference Range */}
                <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>Within Range</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#dcfce7', color: '#166534' }}>[NORMAL]</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: '#166534' }}>{inRangeCount}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15803d' }}>of {verifiedTests} verified ({inRangePercent}%)</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#166534' }}>Tests meeting laboratory reference target</span>
                </div>

                {/* 2. Above Range (High) */}
                <div style={{ backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>Above Range</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#991b1b' }}>[HIGH]</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: '#991b1b' }}>{aboveRangeCount}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c' }}>of {verifiedTests} verified</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>Elevated beyond laboratory reference limit</span>
                </div>

                {/* 3. Below Range (Low) */}
                <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>Below Range</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#92400e' }}>[LOW]</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: '#92400e' }}>{belowRangeCount}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309' }}>of {verifiedTests} verified</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#92400e' }}>Lower than laboratory reference interval</span>
                </div>

                {/* 4. Needs Review / Uncertain */}
                <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Needs Review</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#475569' }}>[REVIEW]</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: '#475569' }}>{needsReviewCount}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b' }}>of {totalTests} detected</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ambiguous or low confidence OCR items</span>
                </div>

              </div>

              {/* Data Completeness & Transparent Health Score Banner */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }} className="grid-2-mobile">
                
                {/* Health Score Gauge Card */}
                <Card style={{ backgroundColor: 'white', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-light)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Biomarker Health Index
                  </span>
                  
                  {typeof currentAnalysis.healthScore === 'number' ? (
                    <div style={{ position: 'relative', margin: '20px 0', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="130" height="130" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                        <circle
                          cx="60" cy="60" r="50"
                          fill="none"
                          stroke={getScoreColor(currentAnalysis.healthScore)}
                          strokeWidth="10"
                          strokeDasharray="314"
                          strokeDashoffset={314 - (314 * currentAnalysis.healthScore) / 100}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                        />
                      </svg>
                      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>{currentAnalysis.healthScore}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>/ 100</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', margin: '20px 0', padding: '16px', borderRadius: '18px', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#94a3b8', display: 'block' }}>--</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Score Unavailable</span>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '4px 0 0 0' }}>More verified data needed (min 3 parameters)</p>
                    </div>
                  )}

                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    padding: '6px 16px',
                    borderRadius: '20px',
                    backgroundColor: typeof currentAnalysis.healthScore === 'number'
                      ? (currentAnalysis.healthScore >= 80 ? 'var(--secondary-light)' : 'var(--warning-light)')
                      : '#f1f5f9',
                    color: typeof currentAnalysis.healthScore === 'number'
                      ? (currentAnalysis.healthScore >= 80 ? 'var(--secondary)' : 'var(--warning)')
                      : '#64748b'
                  }}>
                    {currentAnalysis.scoreStatus}
                  </span>

                  <button
                    onClick={() => setIsMethodologyOpen(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', marginTop: '12px', textDecoration: 'underline' }}
                  >
                    Methodology & Clinical Disclaimer ℹ️
                  </button>
                </Card>

                {/* Data Completeness & Executive Summary Card */}
                <Card style={{ borderRadius: '24px', padding: '32px' }} title="Executive Summary & Data Completeness">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Completeness Bar */}
                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          📊 Data Completeness Index
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>
                          {completenessPercent}% ({verifiedTests} of {Math.max(8, totalTests)} panel biomarkers)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${completenessPercent}%`, height: '100%', background: 'linear-gradient(90deg, #0f766e, #10b981)', borderRadius: '6px' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                        * Data completeness measures panel coverage, not patient health. An incomplete report is not an unhealthy patient.
                      </span>
                    </div>

                    <p style={{ fontSize: '0.96rem', color: 'var(--text-main)', lineHeight: '1.75', whiteSpace: 'pre-line', margin: 0 }}>
                      {currentAnalysis.summary}
                    </p>
                  </div>
                </Card>

              </div>

              {/* ========================================================================= */}
              {/* SECTION 2: INDIVIDUAL TEST INTERPRETATION & INTERACTIVE REVIEW */}
              {/* ========================================================================= */}
              <Card style={{ borderRadius: '24px', padding: '28px' }} title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={22} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>Individual Test Interpretation</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                      {activeParameterList.length} Extracted
                    </span>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setParameterFilter('ALL')}
                      style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: parameterFilter === 'ALL' ? 'var(--primary)' : '#f1f5f9', color: parameterFilter === 'ALL' ? 'white' : 'var(--text-muted)' }}
                    >
                      All ({totalTests})
                    </button>
                    <button
                      onClick={() => setParameterFilter('ABNORMAL')}
                      style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: parameterFilter === 'ABNORMAL' ? '#dc2626' : '#fee2e2', color: parameterFilter === 'ABNORMAL' ? 'white' : '#991b1b' }}
                    >
                      Out-of-Range ({aboveRangeCount + belowRangeCount})
                    </button>
                    <button
                      onClick={() => setParameterFilter('NORMAL')}
                      style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: parameterFilter === 'NORMAL' ? '#16a34a' : '#dcfce7', color: parameterFilter === 'NORMAL' ? 'white' : '#166534' }}
                    >
                      Within Range ({inRangeCount})
                    </button>
                    {needsReviewCount > 0 && (
                      <button
                        onClick={() => setParameterFilter('REVIEW')}
                        style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: parameterFilter === 'REVIEW' ? '#64748b' : '#f1f5f9', color: parameterFilter === 'REVIEW' ? 'white' : '#475569' }}
                      >
                        Needs Review ({needsReviewCount})
                      </button>
                    )}
                  </div>
                </div>
              }>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {filteredParameters.map((param, idx) => (
                    <div 
                      key={idx}
                      style={{
                        border: '1px solid',
                        borderColor: param.status === 'Above Range' ? '#fecaca' : param.status === 'Below Range' ? '#fde68a' : param.status === 'Needs Review' ? '#cbd5e1' : '#bbf7d0',
                        borderRadius: '18px',
                        padding: '20px',
                        backgroundColor: param.status === 'Above Range' ? '#fef2f2' : param.status === 'Below Range' ? '#fffbeb' : param.status === 'Needs Review' ? '#f8fafc' : 'white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{param.name}</h4>
                            {param.category && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#f1f5f9', color: '#64748b' }}>
                                {param.category}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span>Measured: <strong style={{ color: 'var(--text-main)', fontSize: '0.98rem' }}>{param.value}</strong></span>
                            <span>•</span>
                            <span>Laboratory Reference Range: <strong>{param.referenceRange}</strong></span>
                            {param.reportDate && (
                              <>
                                <span>•</span>
                                <span>Date: {param.reportDate}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Source: Page {param.sourcePage || 1}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {renderStatusBadge(param.status, param.flag)}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => openParamEditModal(param)}
                            style={{ height: '32px', fontSize: '0.75rem', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit3 size={12} />
                            Verify / Adjust
                          </Button>
                        </div>
                      </div>

                      {/* Explanation */}
                      <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: '10px', marginTop: '12px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          💡 Clinical Meaning:
                        </span>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px', lineHeight: '1.6', margin: '4px 0 0 0' }}>
                          {param.simpleExplanation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Two Column Grid: Doctor Questions & Lifestyle Tips */}
              {((currentAnalysis.questionsForDoctor && currentAnalysis.questionsForDoctor.length > 0) || (currentAnalysis.lifestyleSuggestions && currentAnalysis.lifestyleSuggestions.length > 0)) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-2-mobile">
                  
                  {/* Doctor Questions Checklist */}
                  {currentAnalysis.questionsForDoctor && currentAnalysis.questionsForDoctor.length > 0 && (
                    <Card style={{ borderRadius: '24px' }} title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><HelpCircle size={20} /><span style={{ fontWeight: 800 }}>Questions to Ask Your Doctor</span></div>}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {currentAnalysis.questionsForDoctor.map((q, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '0.9rem', borderBottom: '1px solid var(--surface-raised)', paddingBottom: '10px' }}>
                            <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{idx + 1}.</span>
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* General Lifestyle Suggestions */}
                  {currentAnalysis.lifestyleSuggestions && currentAnalysis.lifestyleSuggestions.length > 0 && (
                    <Card style={{ borderRadius: '24px' }} title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Lightbulb size={20} /><span style={{ fontWeight: 800 }}>Evidence-Based Lifestyle Suggestions</span></div>}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {currentAnalysis.lifestyleSuggestions.map((tip, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '0.9rem', borderBottom: '1px solid var(--surface-raised)', paddingBottom: '10px' }}>
                            <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>✓</span>
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                </div>
              )}

              {/* ========================================================================= */}
              {/* --- REPORT CHAT ASSISTANT (CHATBOT B) --- */}
              {/* ========================================================================= */}
              <div style={{
                borderRadius: '24px',
                border: '1px solid rgba(203, 213, 225, 0.8)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(240,253,250,0.4) 100%)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 20px 40px -15px rgba(15, 118, 110, 0.15)',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
              }}>
                
                {/* 1. CHAT HEADER */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                  paddingBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0f766e 0%, #10b981 100%)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                      position: 'relative'
                    }}>
                      <Activity size={24} />
                      <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981', border: '2px solid white' }} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.01em', margin: 0 }}>AI Medical Report Assistant</h2>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 800, 
                          padding: '3px 10px', 
                          borderRadius: '12px', 
                          backgroundColor: getTruthfulStatusInfo(currentAnalysis).bg, 
                          color: getTruthfulStatusInfo(currentAnalysis).color 
                        }}>
                          {getTruthfulStatusInfo(currentAnalysis).icon} {getTruthfulStatusInfo(currentAnalysis).label}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Lock size={12} style={{ color: 'var(--primary)' }} />
                        Context Locked: <strong>{currentAnalysis.reportTitle}</strong> ({verifiedTests} verified parameters)
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setCurrentAnalysis(null)}
                    style={{ borderRadius: '12px', fontSize: '0.78rem', height: '36px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                  >
                    <RefreshCw size={14} />
                    Switch Report
                  </Button>
                </div>

                {/* 2. SUGGESTED QUESTIONS CHIPS */}
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '10px' }}>
                    💡 Suggested Follow-Up Questions:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {CHIP_QUESTIONS.map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChatMessage(chip.text)}
                        disabled={isChatTyping}
                        style={{
                          border: '1px solid rgba(15, 118, 110, 0.25)',
                          background: 'white',
                          color: 'var(--primary)',
                          borderRadius: '20px',
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. CHAT MESSAGES LOG */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  maxHeight: '440px',
                  overflowY: 'auto',
                  paddingRight: '6px'
                }}>
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '82%',
                          borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                          padding: '16px 20px',
                          backgroundColor: msg.sender === 'user' ? 'var(--primary)' : 'white',
                          color: msg.sender === 'user' ? 'white' : 'var(--text-main)',
                          border: msg.sender === 'user' ? 'none' : '1px solid var(--border)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                          fontSize: '0.92rem',
                          lineHeight: '1.65',
                          whiteSpace: 'pre-line'
                        }}
                      >
                        {msg.text}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', padding: '0 4px' }}>
                        {msg.timestamp}
                      </span>
                    </div>
                  ))}

                  {isChatTyping && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border)', width: 'fit-content' }}>
                      <Sparkles size={16} style={{ color: 'var(--primary)', animation: 'spin 1.5s linear infinite' }} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)' }}>Analyzing report context...</span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* 4. CHAT INPUT BOX */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChatMessage();
                  }}
                  style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Ask about ${currentAnalysis.reportTitle} or specific parameters...`}
                    disabled={isChatTyping}
                    style={{
                      flex: 1,
                      height: '48px',
                      borderRadius: '14px',
                      border: '1.5px solid var(--border)',
                      padding: '0 18px',
                      fontSize: '0.92rem',
                      outline: 'none',
                      backgroundColor: 'white'
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!chatInput.trim() || isChatTyping}
                    style={{ height: '48px', borderRadius: '14px', padding: '0 24px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Send size={16} />
                    Send
                  </Button>
                </form>

              </div>

            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* --- TAB 2: OVERALL HEALTH REPORT SCORECARD & REPORT VAULT --- */}
      {/* ========================================================================= */}
      {activeTab === 'History' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* OVERALL HEALTH REPORT SCORECARD */}
          <Card style={{ borderRadius: '24px', padding: '32px' }} title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart2 size={24} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 900, fontSize: '1.25rem' }}>Overall Health Report Scorecard</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                Longitudinal Patient Analytics
              </span>
            </div>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Aggregated Scorecard Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="grid-2-mobile">
                
                {/* Reports Analyzed */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Reports Analyzed</span>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>{vaultReportCount}</div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified lab documents stored</span>
                </div>

                {/* Total Parameters Tracked */}
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '18px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Tracked In-Range</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', backgroundColor: '#dcfce7', color: '#166534' }}>[NORMAL]</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#166534', marginTop: '4px' }}>{vaultInRangeCount}</div>
                  <span style={{ fontSize: '0.75rem', color: '#166534' }}>of {vaultVerifiedCount} verified tests</span>
                </div>

                {/* Total Parameters Elevated */}
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '18px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Tracked Above Range</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b' }}>[HIGH]</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#991b1b', marginTop: '4px' }}>{vaultAboveCount}</div>
                  <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>High across all records</span>
                </div>

                {/* Total Parameters Below Target */}
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '18px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>Tracked Below Range</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#92400e' }}>[LOW]</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#92400e', marginTop: '4px' }}>{vaultBelowCount}</div>
                  <span style={{ fontSize: '0.75rem', color: '#92400e' }}>Low across all records</span>
                </div>

              </div>

              {/* Longitudinal Biomarker Trend Comparison Table */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Chronological Biomarker Trends</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                  Comparing test results across multiple reports with matching names and compatible units. Distinguishes latest values from historical records.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 800 }}>Biomarker</th>
                        <th style={{ padding: '12px 16px', fontWeight: 800 }}>Latest Value (Date)</th>
                        <th style={{ padding: '12px 16px', fontWeight: 800 }}>Prior Historical Readings</th>
                        <th style={{ padding: '12px 16px', fontWeight: 800 }}>Trend Indicator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackedBiomarkers.map((biomarkerName) => {
                        const entries = biomarkerTrends[biomarkerName] || [];
                        if (entries.length === 0) {
                          return (
                            <tr key={biomarkerName} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 700 }}>{biomarkerName}</td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8' }}>Not recorded yet</td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8' }}>--</td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8' }}>No data</td>
                            </tr>
                          );
                        }

                        const latest = entries[0];
                        const historical = entries.slice(1);

                        return (
                          <tr key={biomarkerName} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>{biomarkerName}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <strong style={{ color: 'var(--primary)', fontSize: '0.96rem' }}>{latest.value}</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{latest.date} ({latest.reportTitle})</span>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {historical.length === 0 ? (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Baseline recorded</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {historical.map((h, hIdx) => (
                                    <span key={hIdx} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                      {h.value} on {h.date}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {renderStatusBadge(latest.status)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </Card>

          {/* REPORT ARCHIVE LIST */}
          <Card style={{ borderRadius: '24px' }} title={`Analyzed Medical Reports Archive (${vaultReportCount})`}>
            {medicalReports.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FileCheck size={40} style={{ color: 'var(--text-light)', marginBottom: '12px' }} />
                <p style={{ fontSize: '0.9rem' }}>No medical reports uploaded or analyzed yet.</p>
                <Button onClick={() => setActiveTab('Analyzer')} style={{ marginTop: '16px' }}>Upload Your First Report</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {medicalReports.map((rep) => {
                  const repScore = rep.analysis?.healthScore;
                  const repParams = rep.analysis?.parameters || [];
                  const inRange = repParams.filter(p => p.status === 'Within Reference Range' || p.status === 'Normal').length;
                  const abnormal = repParams.filter(p => p.status === 'Above Range' || p.status === 'Below Range' || p.status === 'Abnormal').length;

                  return (
                    <div 
                      key={rep.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '18px',
                        padding: '20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'white'
                      }}
                      className="flex-col-mobile gap-sm"
                    >
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={22} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0 }}>{rep.fileName}</h4>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Date: {rep.analysis?.reportDate || rep.uploadedAt} • Size: {rep.fileSize || 'Standard'}
                            {repParams.length > 0 && ` • ${repParams.length} tests (${inRange} in-range, ${abnormal} abnormal)`}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {typeof repScore === 'number' ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '4px 12px', borderRadius: '12px', backgroundColor: repScore >= 80 ? 'var(--secondary-light)' : 'var(--warning-light)', color: repScore >= 80 ? 'var(--secondary)' : 'var(--warning)' }}>
                            Score: {repScore}/100
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#64748b' }}>
                            Score: Unavailable
                          </span>
                        )}

                        <Button 
                          variant="outline" 
                          onClick={() => {
                            if (rep.analysis) {
                              setCurrentAnalysis(rep.analysis);
                              setActiveTab('Analyzer');
                            }
                          }}
                          style={{ height: '36px', fontSize: '0.82rem', borderRadius: '10px', fontWeight: 700 }}
                        >
                          View In Analyzer & Chat
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>
      )}

      {/* --- PARAMETER VERIFICATION & ADJUSTMENT MODAL --- */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Review & Verify: ${paramToEdit?.name || 'Parameter'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Inspect or adjust the extracted laboratory value before including it in health index calculations. If an OCR scan misread a character or decimal, you can correct it here.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>Measured Value & Unit:</label>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              style={{ height: '42px', borderRadius: '10px', border: '1px solid var(--border)', padding: '0 12px', fontSize: '0.92rem' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Laboratory Reference Target: <strong>{paramToEdit?.referenceRange}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>Clinical Classification:</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as any)}
              style={{ height: '42px', borderRadius: '10px', border: '1px solid var(--border)', padding: '0 12px', fontSize: '0.92rem', backgroundColor: 'white' }}
            >
              <option value="Within Reference Range">Within Reference Range [NORMAL]</option>
              <option value="Above Range">Above Range [HIGH]</option>
              <option value="Below Range">Below Range [LOW]</option>
              <option value="Needs Review">Needs Review / Uncertain</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveParamEdit}>
              Save & Recalculate Index
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- SCORING METHODOLOGY & LIMITATIONS MODAL --- */}
      <Modal isOpen={isMethodologyOpen} onClose={() => setIsMethodologyOpen(false)} title="Biomarker Health Index Methodology">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', lineHeight: '1.6', fontSize: '0.88rem' }}>
          
          <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '16px', padding: '16px' }}>
            <h4 style={{ margin: 0, fontWeight: 800, color: '#0f766e', fontSize: '0.95rem' }}>
              📊 Transparent, Deterministic Calculation
            </h4>
            <p style={{ margin: '6px 0 0 0', color: '#134e4a', fontSize: '0.85rem' }}>
              {currentAnalysis?.scoreFormula || 'Base 100 - (14 points per out-of-range deviation) - (4 points per uncertain parameter)'}
            </p>
          </div>

          <div>
            <h4 style={{ fontWeight: 800, margin: '0 0 4px 0' }}>1. Data Completeness vs Clinical Health</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Data completeness measures how many standard panel tests were analyzed in this upload. An incomplete report is <strong>not</strong> an unhealthy patient. If fewer than 3 verified parameters are available, Jivexa Health OS explicitly marks the score as <em>"Score Unavailable — More Verified Data Needed"</em>.
            </p>
          </div>

          <div>
            <h4 style={{ fontWeight: 800, margin: '0 0 4px 0' }}>2. Laboratory's Own Reference Ranges</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Values are evaluated against the laboratory's printed reference range from your specific document, not arbitrary standard ranges.
            </p>
          </div>

          <div>
            <h4 style={{ fontWeight: 800, margin: '0 0 4px 0' }}>3. What the Score Does and Does Not Mean</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              A score of 75/100 or 90/100 does <strong>not</strong> diagnose an illness or guarantee perfect health. It is an educational biomarker summary index. Always review laboratory results in direct consultation with a licensed medical professional.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button onClick={() => setIsMethodologyOpen(false)}>Understood</Button>
          </div>
        </div>
      </Modal>

      {/* --- DOCTOR SHARING MODAL --- */}
      <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="Share AI Report With Doctor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Select a verified doctor from your network. The doctor will receive a secure copy of your report PDF alongside this AI analysis summary.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>Choose Practitioner:</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto' }}>
              {doctors.map((doc) => (
                <div 
                  key={doc.id}
                  onClick={() => setSelectedDoctorId(doc.id)}
                  style={{
                    border: '1.5px solid var(--border)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    borderColor: (selectedDoctorId === doc.id ? 'var(--primary)' : 'var(--border)') as string,
                    backgroundColor: (selectedDoctorId === doc.id ? 'var(--primary-light)' : 'white') as string,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 800 }}>{doc.name}</h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{doc.specialty} • {doc.location}</span>
                  </div>
                  {selectedDoctorId === doc.id && <CheckCircle2 size={18} style={{ color: 'var(--primary)' }} />}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button variant="outline" onClick={() => setIsShareModalOpen(false)} disabled={isSharing}>Cancel</Button>
            <Button onClick={handleShareReport} isLoading={isSharing} disabled={!selectedDoctorId}>
              Confirm & Share Report
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
