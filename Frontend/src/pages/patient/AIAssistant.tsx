import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MarkdownText } from '../../components/common/MarkdownText';
import { 
  streamAIHealthAssistant, 
  fetchBackendConversations,
  saveBackendConversation,
  deleteBackendConversation,
  clearAllBackendConversations
} from '../../services/ai';
import { 
  MessageSquare, Plus, Search, Trash2, Send, 
  AlertTriangle, ShieldCheck, Check, Info, Loader2, Sparkles, User,
  FileText, Activity, Pill, Stethoscope, Menu, X, ChevronRight, HeartPulse,
  Copy, Apple, ArrowUp, RefreshCw
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  isEmergency?: boolean;
  provider?: string;
  isStreaming?: boolean;
  suggestions?: string[];
  errorCode?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: Date;
}

export const AIAssistantChat: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    const loadConversations = async () => {
      if (user?.id) {
        try {
          const backendList = await fetchBackendConversations();
          if (isMounted && Array.isArray(backendList) && backendList.length > 0) {
            const formatted = backendList.map((c: any) => ({
              id: c.id || c._id,
              title: c.title || 'New Conversation',
              lastUpdated: new Date(c.lastUpdated || Date.now()),
              messages: (c.messages || [])
                .filter((m: any) => typeof m.text === 'string' && m.text.trim().length > 0)
                .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
            }));
            setConversations(formatted);
            setActiveConvId(formatted[0].id);
            localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(formatted));
            return;
          }
        } catch (err) {
          console.warn('[AI Assistant] Failed to load conversations from backend:', err);
        }
      }

      const saved = localStorage.getItem(`jivexa_chats_${user?.id}`);
      if (saved && isMounted) {
        try {
          const parsed = JSON.parse(saved);
          const formatted = parsed.map((c: any) => ({
            ...c,
            lastUpdated: new Date(c.lastUpdated),
            messages: (c.messages || [])
              .filter((m: any) => typeof m.text === 'string' && m.text.trim().length > 0)
              .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
          }));
          setConversations(formatted);
          if (formatted.length > 0) {
            setActiveConvId(formatted[0].id);
          }
        } catch (e) {
          localStorage.removeItem(`jivexa_chats_${user?.id}`);
        }
      }
    };

    loadConversations();
    return () => { isMounted = false; };
  }, [user?.id]);

  const syncConversations = (list: Conversation[], convToSync?: Conversation) => {
    setConversations(list);
    const sanitized = list.map(c => ({
      ...c,
      messages: c.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0)
    }));
    localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(sanitized));

    if (convToSync && user?.id) {
      saveBackendConversation({
        id: convToSync.id,
        title: convToSync.title,
        messages: convToSync.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0)
      }).catch(err => console.warn('[AI Assistant] Sync error:', err));
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId, isLoading]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const startNewConversation = (initialTitle = 'New Conversation') => {
    const newConv: Conversation = {
      id: `chat_${Date.now()}`,
      title: initialTitle,
      messages: [],
      lastUpdated: new Date()
    };
    const updated = [newConv, ...conversations];
    syncConversations(updated, newConv);
    setActiveConvId(newConv.id);
    setIsMobileSidebarOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };


  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    let currentConvId = activeConvId;
    let currentConvs = [...conversations];

    if (!currentConvId) {
      const newId = `chat_${Date.now()}`;
      const newTitle = textToSend.slice(0, 32) + (textToSend.length > 32 ? '...' : '');
      const newConv: Conversation = {
        id: newId,
        title: newTitle,
        messages: [],
        lastUpdated: new Date()
      };
      currentConvs = [newConv, ...currentConvs];
      currentConvId = newId;
      setActiveConvId(newId);
    }

    const targetConvIndex = currentConvs.findIndex((c) => c.id === currentConvId);
    if (targetConvIndex === -1) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    const targetConv = { ...currentConvs[targetConvIndex] };
    targetConv.messages = [...targetConv.messages, userMsg];
    targetConv.lastUpdated = new Date();
    
    if (targetConv.title === 'New Conversation' || targetConv.title.startsWith('chat_')) {
      targetConv.title = textToSend.slice(0, 32) + (textToSend.length > 32 ? '...' : '');
    }

    currentConvs[targetConvIndex] = targetConv;
    const sorted = [
      targetConv,
      ...currentConvs.filter((c) => c.id !== currentConvId)
    ];

    syncConversations(sorted, targetConv);
    setInputMessage('');
    setIsLoading(true);

    const aiMsgId = `msg_ai_${Date.now()}`;
    let streamingText = '';
    let currentProvider = 'JIVEXA AI (Google Gemini)';
    let isEmergencyFlag = false;

    // Insert initial "Thinking..." placeholder
    setConversations((prev) => 
      prev.map((c) => {
        if (c.id === currentConvId) {
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: aiMsgId,
                sender: 'ai',
                text: '',
                timestamp: new Date(),
                isStreaming: true
              }
            ]
          };
        }
        return c;
      })
    );

    let lastUpdate = 0;

    try {
      // Construct clean prior conversation history (excluding empty text and the new user message)
      const cleanHistory = targetConv.messages
        .filter(m => m.id !== userMsg.id && typeof m.text === 'string' && m.text.trim().length > 0)
        .map(m => ({ sender: m.sender, text: m.text.trim() }));

      const responseResult = await streamAIHealthAssistant(
        textToSend,
        cleanHistory,
        (chunk, provider, isEmerg) => {
          streamingText += chunk;
          if (provider) currentProvider = provider;
          if (isEmerg) isEmergencyFlag = true;

          const now = Date.now();
          if (now - lastUpdate > 20 || chunk.includes('\n')) {
            lastUpdate = now;
            setConversations((prev) => 
              prev.map((c) => {
                if (c.id === currentConvId) {
                  const existingAiIndex = c.messages.findIndex(m => m.id === aiMsgId);
                  const aiMsgObj: ChatMessage = {
                    id: aiMsgId,
                    sender: 'ai',
                    text: streamingText,
                    timestamp: new Date(),
                    provider: currentProvider,
                    isEmergency: isEmergencyFlag,
                    isStreaming: true
                  };
                  if (existingAiIndex === -1) {
                    return { ...c, messages: [...c.messages, aiMsgObj] };
                  } else {
                    const updatedMsgs = [...c.messages];
                    updatedMsgs[existingAiIndex] = aiMsgObj;
                    return { ...c, messages: updatedMsgs };
                  }
                }
                return c;
              })
            );
          }
        },
        user?.id,
        currentConvId
      );

      // Finalize streaming message state and sync to storage
      const finalAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: streamingText || responseResult?.text || 'JIVEXA Assistant provided no response.',
        timestamp: new Date(),
        provider: currentProvider,
        isEmergency: isEmergencyFlag,
        isStreaming: false,
        suggestions: responseResult?.errorCode ? [] : (responseResult?.suggestions || []),
        errorCode: responseResult?.errorCode
      };

      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === currentConvId) {
            const msgsWithoutStreaming = c.messages.filter(m => m.id !== aiMsgId);
            return {
              ...c,
              lastUpdated: new Date(),
              messages: [...msgsWithoutStreaming, finalAiMsg]
            };
          }
          return c;
        });
        const activeOne = updated.find(c => c.id === currentConvId);
        syncConversations(updated, activeOne);
        return updated;
      });

    } catch (err) {
      console.error('[AI Chat Error]', err);
      // Ensure we never leave an empty message on error, and persist the state
      const errorAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: streamingText || 'JIVEXA Assistant is temporarily unable to connect to the backend server. Please verify the backend is running and try again.',
        timestamp: new Date(),
        provider: currentProvider,
        isStreaming: false,
        suggestions: [],
        errorCode: 'NETWORK_ERROR'
      };

      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === currentConvId) {
            const msgsWithoutStreaming = c.messages.filter(m => m.id !== aiMsgId);
            return {
              ...c,
              lastUpdated: new Date(),
              messages: [...msgsWithoutStreaming, errorAiMsg]
            };
          }
          return c;
        });
        const activeOne = updated.find(c => c.id === currentConvId);
        syncConversations(updated, activeOne);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = conversations.filter((c) => c.id !== id);
    syncConversations(filtered);
    if (activeConvId === id) {
      setActiveConvId(filtered.length > 0 ? filtered[0].id : null);
    }
    if (user?.id) {
      deleteBackendConversation(id).catch(err => console.warn('[AI Assistant] Delete backend error:', err));
    }
  };

  const clearAllConversations = () => {
    syncConversations([]);
    setActiveConvId(null);
    if (user?.id) {
      clearAllBackendConversations().catch(err => console.warn('[AI Assistant] Clear backend error:', err));
    }
  };

  const filteredConvs = conversations.filter((c) => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.messages.some((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 4 Apple-Inspired Healthcare Suggestion Cards
  const emptyStateSuggestions = [
    {
      title: 'Analyze Health Report',
      category: 'Diagnostics',
      subtext: 'Explain lab vitals, blood panels & clinical indicators',
      prompt: 'Can you help me understand a blood or lab test report? What are the key parameters, reference ranges, and abnormal indicators to look out for?',
      icon: <FileText size={20} className="text-teal-600" />
    },
    {
      title: 'Assess Symptoms',
      category: 'Clinical Triage',
      subtext: 'Evaluate symptom patterns, severity & when to see a doctor',
      prompt: 'Can you explain common causes and red-flag warning signs when experiencing symptoms like persistent headache, fatigue, or fever?',
      icon: <Activity size={20} className="text-emerald-600" />
    },
    {
      title: 'Medication Safety & Usage',
      category: 'Pharmacology',
      subtext: 'Review dosage guidelines, precautions & drug interactions',
      prompt: 'What are the essential safety rules, common side effects, and precautions to verify when starting a newly prescribed medicine?',
      icon: <Pill size={20} className="text-teal-600" />
    },
    {
      title: 'Doctor Consultation Prep',
      category: 'Care Navigation',
      subtext: 'Generate structured questions to ask your specialist',
      prompt: 'How can I prepare effectively for an upcoming physician consultation? What key questions and symptom timelines should I present?',
      icon: <Stethoscope size={20} className="text-emerald-600" />
    }
  ];

  // Quick Starter Chips
  const starterChips = [
    { label: '🩺 Symptom Triage', prompt: 'I have had a dry cough and mild body aches for 2 days. What could this indicate and what self-care steps help?' },
    { label: '🔬 Lipid Profile Reading', prompt: 'Explain the difference between LDL, HDL, and Triglycerides in a lipid panel test report.' },
    { label: '💊 Antibiotic Precautions', prompt: 'What are the most crucial rules when taking prescribed oral antibiotics?' },
    { label: '🥗 Blood Sugar & Diet', prompt: 'What are evidence-based dietary recommendations for maintaining healthy fasting blood sugar levels?' },
    { label: '📋 Questions for Cardiologist', prompt: 'What questions should I ask my cardiologist during a routine heart checkup?' }
  ];

  return (
    <div className="jivexa-ai-wrapper">
      
      {/* APPLE-INSPIRED TRANSLUCENT TOP HEADER */}
      <header className="jivexa-ai-topbar">
        <div className="topbar-branding">
          <div className="avatar-orb">
            <Sparkles size={22} className="avatar-icon" />
            <span className="live-status-dot" />
          </div>
          <div className="topbar-titles">
            <div className="topbar-title-row">
              <h1 className="topbar-title">JIVEXA Health AI</h1>
              <span className="clinical-pill">
                <span className="pulse-beacon" />
                Clinical Intelligence 3.3
              </span>
            </div>
            <p className="topbar-subtitle">
              Your 24/7 intelligent companion for lab interpretation, symptom insights & wellness guidance.
            </p>
          </div>
        </div>

        {/* TOPBAR CONTROLS */}
        <div className="topbar-actions">
          {/* Mobile History Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="mobile-sidebar-toggle"
            aria-label="Toggle conversation history"
          >
            {isMobileSidebarOpen ? <X size={18} /> : <MessageSquare size={18} />}
            <span>Chats</span>
          </button>
        </div>
      </header>

      {/* MAIN TWO-COLUMN SPLIT CONTAINER */}
      <div className="jivexa-chat-split">
      
        {/* LEFT SIDEBAR: CONVERSATION ARCHIVE */}
        <aside className={`jivexa-sidebar ${isMobileSidebarOpen ? 'sidebar-mobile-open' : ''}`}>
          
          {/* New Consultation Button */}
          <button 
            type="button"
            onClick={() => startNewConversation()} 
            className="new-chat-btn"
          >
            <Plus size={18} />
            <span>New Consultation</span>
          </button>

          {/* Search Bar */}
          <div className="sidebar-search-box">
            <Search size={15} className="search-icon" />
            <input 
              type="text"
              placeholder="Search previous chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sidebar-search-input"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="search-clear-btn"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Conversations Scrollable List */}
          <div className="sidebar-chat-list">
            {filteredConvs.length === 0 ? (
              <div className="empty-history-state">
                <div className="empty-history-icon">
                  <MessageSquare size={22} />
                </div>
                <h4 className="empty-history-title">No consultations yet</h4>
                <p className="empty-history-desc">
                  Start a private conversation with JIVEXA Health AI.
                </p>
                <button
                  type="button"
                  onClick={() => startNewConversation()}
                  className="start-first-chat-btn"
                >
                  <Plus size={14} /> Start Consultation
                </button>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const isActive = conv.id === activeConvId;
                const messageCount = conv.messages.length;
                return (
                  <div 
                    key={conv.id}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`sidebar-conv-card ${isActive ? 'active' : ''}`}
                  >
                    <div className="conv-indicator">
                      <MessageSquare size={16} />
                    </div>
                    <div className="conv-metadata">
                      <div className="conv-title" title={conv.title}>
                        {conv.title}
                      </div>
                      <div className="conv-subinfo">
                        <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
                      </div>
                    </div>
                    <button 
                      type="button"
                      title="Delete conversation"
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="conv-delete-btn"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Clear Option */}
          {conversations.length > 0 && (
            <div className="sidebar-footer">
              <button 
                type="button"
                onClick={clearAllConversations}
                className="clear-all-btn"
              >
                <Trash2 size={13} />
                <span>Clear All Chat History</span>
              </button>
            </div>
          )}
        </aside>

        {/* RIGHT WORKSPACE: ACTIVE CHAT SCREEN */}
        <main className="jivexa-chat-main">
          
          {/* SUB-HEADER INSIDE ACTIVE CHAT */}
          <div className="chat-viewport-header">
            <div className="viewport-status">
              <div className="viewport-avatar">
                <HeartPulse size={18} />
              </div>
              <div className="viewport-labels">
                <div className="viewport-title-row">
                  <span className="viewport-name">JIVEXA Clinical Assistant</span>
                  <span className="live-pill">Live</span>
                </div>
                <span className="viewport-model-label">
                  Google Gemini · Medical Intelligence Tier
                </span>
              </div>
            </div>

            <div className="viewport-controls">
              {activeConv && activeConv.messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => startNewConversation()}
                  className="viewport-action-btn"
                  title="New conversation"
                >
                  <Plus size={15} />
                  <span className="btn-label-desktop">New Chat</span>
                </button>
              )}
            </div>
          </div>

          {/* SCROLLABLE MESSAGES STREAM */}
          <div className="chat-messages-container">
            
            {/* COMPACT APPLE-STYLE CLINICAL DISCLAIMER */}
            <div className="clinical-advisory-banner">
              <ShieldCheck size={18} className="advisory-icon" />
              <div className="advisory-content">
                <span className="advisory-title">Clinical Guidance Note:</span>
                <span className="advisory-text">
                  JIVEXA Health AI offers educational healthcare information and symptom context. It does not provide medical diagnoses or replace professional consultations. In emergencies, immediately contact emergency services (112 / 108).
                </span>
              </div>
            </div>

            {/* EMPTY STATE: WHEN NO MESSAGES IN ACTIVE CONVERSATION */}
            {(!activeConv || activeConv.messages.length === 0) ? (
              <div className="chat-empty-hero">
                
                {/* Apple Health Glowing Hero Emblem */}
                <div className="hero-emblem-wrapper">
                  <div className="hero-emblem-glow" />
                  <div className="hero-emblem">
                    <HeartPulse size={34} />
                  </div>
                </div>

                <div className="hero-headings">
                  <span className="hero-eyebrow">Medical & Diagnostic AI</span>
                  <h2 className="hero-title">How can JIVEXA assist your health today?</h2>
                  <p className="hero-desc">
                    Ask questions about lab reports, analyze symptom patterns, review medications, or prepare structured questions for your next doctor appointment.
                  </p>
                </div>

                {/* 4 Apple-Style Suggestion Cards */}
                <div className="hero-suggestions-grid">
                  {emptyStateSuggestions.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="suggestion-apple-card"
                    >
                      <div className="card-top-row">
                        <div className="card-icon-bubble">
                          {item.icon}
                        </div>
                        <span className="card-category-badge">{item.category}</span>
                      </div>
                      <div className="card-content">
                        <h3 className="card-title">{item.title}</h3>
                        <p className="card-subtext">{item.subtext}</p>
                      </div>
                      <div className="card-arrow-row">
                        <span className="card-cta-label">Ask assistant</span>
                        <ChevronRight size={15} className="card-arrow" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Horizontal Quick Starter Pills */}
                <div className="quick-starter-section">
                  <span className="quick-starter-label">Trending Health Topics</span>
                  <div className="quick-starter-chips">
                    {starterChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(chip.prompt)}
                        className="quick-starter-chip"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              /* ACTIVE MESSAGES STREAM */
              <div className="messages-stream">
                {activeConv.messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  const isCopied = copiedMsgId === msg.id;
                  
                  return (
                    <div 
                      key={msg.id}
                      className={`message-row ${isUser ? 'user-row' : 'ai-row'}`}
                    >
                      <div className={`message-bubble-container ${isUser ? 'user-container' : 'ai-container'}`}>
                        
                        {/* Avatar */}
                        <div className={`message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
                          {isUser ? (
                            <User size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </div>

                        {/* Speech Bubble */}
                        <div className={`speech-bubble ${isUser ? 'user-bubble' : 'ai-bubble'} ${msg.isEmergency ? 'emergency-bubble' : ''}`}>
                          
                          {/* AI Assistant Bubble Header */}
                          {!isUser && (
                            <div className="ai-bubble-meta-header">
                              <div className="ai-meta-identity">
                                <span className="ai-meta-name">JIVEXA Health AI</span>
                                {msg.provider && (
                                  <span className="ai-meta-model">{msg.provider}</span>
                                )}
                              </div>
                              
                              {!msg.isStreaming && msg.text && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                                  className="copy-bubble-btn"
                                  title="Copy response"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check size={12} className="text-emerald-600" />
                                      <span className="text-emerald-700">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Emergency Alert Header (When Triggered) */}
                          {msg.isEmergency && (
                            <div className="emergency-alert-card">
                              <AlertTriangle size={18} className="emergency-alert-icon" />
                              <div className="emergency-alert-body">
                                <strong>Urgent Medical Attention Recommended</strong>
                                <p>
                                  Your query contains indicators that may require prompt medical evaluation. Please call <strong>112</strong> or <strong>108</strong> (Ambulance) or visit the nearest emergency healthcare facility immediately.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Bubble Content / Markdown */}
                          {!isUser && (!msg.text || !msg.text.trim()) ? (
                            <div className="ai-typing-indicator">
                              <span className="typing-dot dot-1" />
                              <span className="typing-dot dot-2" />
                              <span className="typing-dot dot-3" />
                              <span className="typing-text">Analyzing clinical data...</span>
                            </div>
                          ) : (
                            <div className="bubble-text-content">
                              <MarkdownText content={msg.text} isUser={isUser} />
                            </div>
                          )}

                          {/* Message Timestamp */}
                          <div className={`message-timestamp ${isUser ? 'user-time' : 'ai-time'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>

                          {!isUser && msg.errorCode && !isLoading && (
                            <div className="chat-error-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  const convMsgs = activeConv.messages;
                                  const currentIdx = convMsgs.findIndex(m => m.id === msg.id);
                                  const lastUser = currentIdx > 0 ? convMsgs[currentIdx - 1] : null;
                                  if (lastUser && lastUser.sender === 'user') {
                                    handleSendMessage(lastUser.text);
                                  }
                                }}
                                className="chat-retry-pill-btn"
                              >
                                <RefreshCw size={13} className="retry-btn-icon" />
                                <span>Retry Question</span>
                              </button>
                            </div>
                          )}

                        </div>

                      </div>
                    </div>
                  );
                })}

                <div ref={chatEndRef} />
              </div>
            )}

          </div>

          {/* FOLLOW-UP QUICK PROMPTS (ONLY WHEN AI FINISHED RESPONDING TO CLINICAL TOPICS) */}
          {activeConv && activeConv.messages.length >= 2 && !isLoading && (() => {
            const lastAiMsg = activeConv.messages[activeConv.messages.length - 1];
            const lastUserMsg = [...activeConv.messages].reverse().find(m => m.sender === 'user');
            if (lastAiMsg.sender !== 'ai' || !lastUserMsg) return null;
            
            // If the latest message had an error, DO NOT SHOW SUGGESTIONS!
            if (lastAiMsg.errorCode) return null;

            const userText = lastUserMsg.text.toLowerCase().trim();
            const casualKeywords = [
              'hi', 'hello', 'hey', 'namaste', 'naam', 'name', 'who', 'kaun',
              'kaise', 'how are you', 'thank', 'dhanyawad', 'shukriya', 'bye', 'ok', 'okay', 'yes', 'no'
            ];
            const isCasual = casualKeywords.some(k => userText.includes(k));
            if (isCasual) return null;

            // Use the context-aware suggestions predicted for this response
            const displaySuggestions = (Array.isArray(lastAiMsg.suggestions) && lastAiMsg.suggestions.length > 0)
              ? lastAiMsg.suggestions
              : [];

            if (displaySuggestions.length === 0) return null;

            return (
              <div className="followup-prompts-bar" role="region" aria-label="Suggested follow-up questions">
                <span className="followup-prompts-label">
                  <Sparkles size={12} style={{ color: '#059669' }} />
                  Suggested follow-up questions:
                </span>
                <div className="followup-chips-container">
                  {displaySuggestions.map((q, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      data-prompt={q}
                      aria-label={q}
                      title={q}
                      disabled={isLoading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isLoading) {
                          handleSendMessage(q);
                        }
                      }}
                      className="followup-prompt-chip"
                    >
                      <Sparkles size={12} className="chip-sparkle" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* INPUT FORM: APPLE-STYLE FLOATING PILL COMPOSER */}
          <div className="chat-composer-wrapper">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputMessage); }}
              className="chat-composer-form"
            >
              <div className="composer-input-pill">
                <input 
                  ref={inputRef}
                  placeholder={isLoading ? "JIVEXA Health AI is analyzing your medical query..." : "Ask JIVEXA Health AI anything (symptoms, lab reports, medications)..."}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isLoading}
                  className="composer-input-field"
                />
                
                <button 
                  type="submit" 
                  disabled={isLoading || !inputMessage.trim()} 
                  className={`composer-send-btn ${inputMessage.trim() ? 'active' : ''}`}
                  aria-label="Send query"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ArrowUp size={18} strokeWidth={2.5} />
                  )}
                </button>
              </div>

              <div className="composer-security-footer">
                <span>🔒 Confidential healthcare channel · Not a substitute for primary emergency services</span>
              </div>
            </form>
          </div>

        </main>

      </div>


      {/* APPLE-INSPIRED STYLESHEET */}
      <style>{`
        /* Root container */
        .jivexa-ai-wrapper {
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: calc(100vh - var(--header-height, 70px) - 32px);
          min-height: 620px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        /* Top Bar */
        .jivexa-ai-topbar {
          background: linear-gradient(135deg, #064e3b 0%, #0f766e 50%, #047857 100%);
          border-radius: 20px;
          padding: 16px 24px;
          color: white;
          box-shadow: 0 10px 30px -8px rgba(15, 118, 110, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(20px);
        }

        .topbar-branding {
          display: flex;
          align-items: center;
          gap: 16px;
          z-index: 1;
        }

        .avatar-orb {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.16);
          border: 1px solid rgba(255, 255, 255, 0.28);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        .avatar-icon {
          color: #ffffff;
        }

        .live-status-dot {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background-color: #34d399;
          border: 2px solid #064e3b;
          box-shadow: 0 0 8px #34d399;
        }

        .topbar-titles {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .topbar-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .topbar-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .clinical-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.24);
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .pulse-beacon {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #34d399;
          animation: pulseBeacon 2s infinite ease-in-out;
        }

        @keyframes pulseBeacon {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }

        .topbar-subtitle {
          color: rgba(255, 255, 255, 0.88);
          font-size: 0.82rem;
          margin: 0;
          font-weight: 450;
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 1;
        }

        .token-capsule {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 14px;
          padding: 6px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          backdrop-filter: blur(10px);
          transition: all 0.2s ease;
        }

        .token-capsule:hover {
          background: rgba(255, 255, 255, 0.22);
        }

        .token-capsule-icon {
          color: #a7f3d0;
          display: flex;
          align-items: center;
        }

        .token-capsule-text {
          display: flex;
          flex-direction: column;
        }

        .token-label {
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.75);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .token-numbers {
          font-size: 0.78rem;
          font-weight: 800;
          color: #ffffff;
        }

        .token-gauge-track {
          width: 48px;
          height: 5px;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 3px;
          overflow: hidden;
        }

        .token-gauge-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .pro-upgrade-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: #fef3c7;
          color: #92400e;
          font-size: 0.68rem;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 8px;
          margin-left: 2px;
        }

        .security-capsule {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 6px 12px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #ecfdf5;
        }

        .mobile-sidebar-toggle {
          display: none;
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.18);
          color: white;
          font-weight: 700;
          font-size: 0.82rem;
          cursor: pointer;
          align-items: center;
          gap: 6px;
        }

        /* Main Split */
        .jivexa-chat-split {
          display: grid;
          grid-template-columns: 290px 1fr;
          gap: 16px;
          flex: 1;
          min-height: 0;
          position: relative;
        }

        /* Left Sidebar */
        .jivexa-sidebar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
        }

        .new-chat-btn {
          height: 44px;
          background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 0.88rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 14px -2px rgba(15, 118, 110, 0.35);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .new-chat-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px -2px rgba(15, 118, 110, 0.45);
        }

        .sidebar-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: #94a3b8;
          pointer-events: none;
        }

        .sidebar-search-input {
          width: 100%;
          height: 38px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0 32px 0 34px;
          font-size: 0.82rem;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s, background-color 0.2s;
        }

        .sidebar-search-input:focus {
          border-color: #0f766e;
          background: #ffffff;
        }

        .search-clear-btn {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .sidebar-chat-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
        }

        .empty-history-state {
          padding: 36px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
        }

        .empty-history-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #ecfdf5;
          color: #0f766e;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-history-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }

        .empty-history-desc {
          font-size: 0.76rem;
          color: #64748b;
          line-height: 1.4;
          margin: 0;
        }

        .start-first-chat-btn {
          margin-top: 8px;
          padding: 6px 14px;
          border-radius: 10px;
          border: 1px solid #0f766e;
          background: #ecfdf5;
          color: #0f766e;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .start-first-chat-btn:hover {
          background: #0f766e;
          color: white;
        }

        .sidebar-conv-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          gap: 8px;
        }

        .sidebar-conv-card:hover {
          background: #f8fafc;
          border-color: #f1f5f9;
        }

        .sidebar-conv-card.active {
          background: #ecfdf5;
          border-color: #a7f3d0;
          box-shadow: 0 2px 8px rgba(15, 118, 110, 0.08);
        }

        .conv-indicator {
          color: #94a3b8;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .sidebar-conv-card.active .conv-indicator {
          color: #0f766e;
        }

        .conv-metadata {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .conv-title {
          font-size: 0.82rem;
          font-weight: 600;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-conv-card.active .conv-title {
          font-weight: 800;
          color: #0f766e;
        }

        .conv-subinfo {
          font-size: 0.68rem;
          color: #94a3b8;
        }

        .conv-delete-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          opacity: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.15s ease, color 0.15s ease;
        }

        .sidebar-conv-card:hover .conv-delete-btn,
        .sidebar-conv-card.active .conv-delete-btn {
          opacity: 0.7;
        }

        .conv-delete-btn:hover {
          opacity: 1 !important;
          color: #ef4444 !important;
          background: #fee2e2;
        }

        .sidebar-footer {
          border-top: 1px solid #f1f5f9;
          padding-top: 8px;
          display: flex;
          justify-content: center;
        }

        .clear-all-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 8px;
          transition: color 0.15s ease;
        }

        .clear-all-btn:hover {
          color: #ef4444;
        }

        /* Right Chat Workspace */
        .jivexa-chat-main {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
        }

        /* Active Chat Sub-Header */
        .chat-viewport-header {
          padding: 12px 20px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .viewport-status {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .viewport-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #ecfdf5;
          color: #0f766e;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #a7f3d0;
        }

        .viewport-labels {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .viewport-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewport-name {
          font-size: 0.92rem;
          font-weight: 800;
          color: #0f172a;
        }

        .live-pill {
          font-size: 0.65rem;
          font-weight: 800;
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
          border-radius: 12px;
          padding: 1px 7px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .viewport-model-label {
          font-size: 0.72rem;
          color: #64748b;
        }

        .viewport-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewport-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 6px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #0f766e;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .viewport-action-btn:hover {
          background: #ecfdf5;
          border-color: #a7f3d0;
        }

        /* Scrollable Message List */
        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          background: #fcfdfd;
        }

        /* Compact Medical Disclaimer Banner */
        .clinical-advisory-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 14px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          flex-shrink: 0;
        }

        .advisory-icon {
          color: #0f766e;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .advisory-content {
          font-size: 0.75rem;
          color: #64748b;
          line-height: 1.45;
        }

        .advisory-title {
          font-weight: 700;
          color: #1e293b;
          margin-right: 4px;
        }

        /* Empty Hero Welcome Screen */
        .chat-empty-hero {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px 12px;
          gap: 22px;
          max-width: 760px;
          margin: 0 auto;
          width: 100%;
        }

        .hero-emblem-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hero-emblem-glow {
          position: absolute;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.28) 0%, transparent 70%);
          filter: blur(10px);
        }

        .hero-emblem {
          width: 60px;
          height: 60px;
          border-radius: 18px;
          background: linear-gradient(135deg, #0f766e 0%, #10b981 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px -4px rgba(15, 118, 110, 0.4);
          position: relative;
          z-index: 1;
        }

        .hero-headings {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: center;
        }

        .hero-eyebrow {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #0f766e;
        }

        .hero-title {
          font-size: 1.45rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .hero-desc {
          font-size: 0.86rem;
          color: #64748b;
          margin: 0;
          max-width: 540px;
          line-height: 1.5;
        }

        /* 4 Suggestion Cards */
        .hero-suggestions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          width: 100%;
        }

        .suggestion-apple-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }

        .suggestion-apple-card:hover {
          border-color: #0f766e;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px -4px rgba(15, 118, 110, 0.15);
          background: #fcfffd;
        }

        .card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .card-icon-bubble {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: #ecfdf5;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-category-badge {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #0f766e;
          background: #f0fdf4;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid #dcfce7;
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .card-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }

        .card-subtext {
          font-size: 0.74rem;
          color: #64748b;
          margin: 0;
          line-height: 1.35;
        }

        .card-arrow-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 4px;
          border-top: 1px solid #f1f5f9;
        }

        .card-cta-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #0f766e;
        }

        .card-arrow {
          color: #94a3b8;
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .suggestion-apple-card:hover .card-arrow {
          color: #0f766e;
          transform: translateX(3px);
        }

        /* Trending Starter Chips */
        .quick-starter-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
        }

        .quick-starter-label {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94a3b8;
        }

        .quick-starter-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }

        .quick-starter-chip {
          padding: 6px 14px;
          border-radius: 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 0.76rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quick-starter-chip:hover {
          background: #ecfdf5;
          border-color: #a7f3d0;
          color: #0f766e;
          transform: translateY(-1px);
        }

        /* Active Messages */
        .messages-stream {
          display: flex;
          flex-direction: column;
          gap: 18px;
          width: 100%;
        }

        .message-row {
          display: flex;
          width: 100%;
          animation: appleBubbleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes appleBubbleIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .user-row {
          justify-content: flex-end;
        }

        .ai-row {
          justify-content: flex-start;
        }

        .message-bubble-container {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          max-width: 82%;
        }

        .user-container {
          flex-direction: row-reverse;
          max-width: 76%;
        }

        .message-avatar {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .user-avatar {
          background: #f1f5f9;
          color: #0f766e;
          border: 1px solid #e2e8f0;
        }

        .ai-avatar {
          background: linear-gradient(135deg, #0f766e 0%, #10b981 100%);
          color: white;
          box-shadow: 0 4px 12px -2px rgba(15, 118, 110, 0.3);
        }

        .speech-bubble {
          padding: 14px 18px;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .user-bubble {
          background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
          color: #ffffff;
          border-radius: 18px 18px 4px 18px;
          box-shadow: 0 4px 14px -2px rgba(15, 118, 110, 0.25);
        }

        .ai-bubble {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 18px 18px 18px 4px;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.03);
        }

        .emergency-bubble {
          border-color: #fca5a5 !important;
          background: #fff5f5 !important;
        }

        .ai-bubble-meta-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 6px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 4px;
        }

        .ai-meta-identity {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ai-meta-name {
          font-size: 0.74rem;
          font-weight: 800;
          color: #0f766e;
        }

        .ai-meta-model {
          font-size: 0.65rem;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 6px;
          font-weight: 600;
        }

        .copy-bubble-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 6px;
          transition: all 0.15s ease;
        }

        .copy-bubble-btn:hover {
          color: #0f766e;
          background: #f1f5f9;
        }

        /* Emergency warning block */
        .emergency-alert-card {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 12px;
          padding: 10px 14px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .emergency-alert-icon {
          color: #dc2626;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .emergency-alert-body {
          font-size: 0.76rem;
          color: #991b1b;
          line-height: 1.4;
        }

        .emergency-alert-body strong {
          display: block;
          font-size: 0.82rem;
          margin-bottom: 2px;
          color: #b91c1c;
        }

        .bubble-text-content {
          font-size: 0.92rem;
          line-height: 1.6;
        }

        .message-timestamp {
          font-size: 0.66rem;
          font-weight: 500;
          margin-top: 2px;
        }

        .user-time {
          color: rgba(255, 255, 255, 0.7);
          text-align: right;
        }

        .ai-time {
          color: #94a3b8;
        }

        /* AI Typing Indicator */
        .ai-typing-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 4px;
        }

        .typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #0f766e;
          animation: dotPulse 1.2s infinite ease-in-out;
        }

        .dot-1 { animation-delay: 0s; }
        .dot-2 { animation-delay: 0.2s; }
        .dot-3 { animation-delay: 0.4s; }

        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
          40% { transform: scale(1.15); opacity: 1; }
        }

        .typing-text {
          font-size: 0.76rem;
          font-weight: 600;
          color: #0f766e;
          margin-left: 4px;
        }

        /* Followup Prompts Bar */
        .followup-prompts-bar {
          padding: 8px 24px 10px 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
        }

        .followup-prompts-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .followup-chips-container {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .followup-prompt-chip {
          padding: 6px 14px;
          border-radius: 9999px;
          border: 1px solid #a7f3d0;
          background: #ffffff;
          font-size: 0.78rem;
          font-weight: 600;
          color: #047857;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: all 0.2s ease;
        }

        .followup-prompt-chip:hover {
          background: #ecfdf5;
          border-color: #6ee7b7;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.12);
        }

        .followup-prompt-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .chat-error-actions {
          margin-top: 8px;
          display: flex;
          align-items: center;
        }

        .chat-retry-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #dc2626;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chat-retry-pill-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
          transform: translateY(-1px);
        }

        .retry-btn-icon {
          color: #dc2626;
        }

        .chip-sparkle {
          color: #059669;
          flex-shrink: 0;
        }

        /* Apple-Inspired Pill Composer */
        .chat-composer-wrapper {
          padding: 14px 20px;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .chat-composer-form {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }

        .composer-input-pill {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          padding: 4px 6px 4px 18px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .composer-input-pill:focus-within {
          border-color: #0f766e;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
        }

        .composer-input-field {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.92rem;
          color: #0f172a;
          padding: 8px 6px;
          font-family: inherit;
        }

        .composer-input-field::placeholder {
          color: #94a3b8;
        }

        .composer-send-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: none;
          background: #e2e8f0;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: not-allowed;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }

        .composer-send-btn.active {
          background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(15, 118, 110, 0.35);
        }

        .composer-send-btn.active:hover {
          transform: scale(1.06);
        }

        .composer-security-footer {
          font-size: 0.68rem;
          color: #94a3b8;
          text-align: center;
          font-weight: 500;
        }

        /* Pro Modal */
        .pro-modal-body {
          display: flex;
          flex-direction: column;
          gap: 18px;
          text-align: center;
          align-items: center;
          padding: 8px 0;
        }

        .pro-modal-crown {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #fef3c7;
          color: #d97706;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pro-modal-headings {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pro-modal-title {
          font-size: 1.25rem;
          font-weight: 900;
          color: #0f172a;
          margin: 0;
        }

        .pro-modal-subtitle {
          font-size: 0.85rem;
          color: #64748b;
          margin: 0;
          max-width: 420px;
          line-height: 1.5;
        }

        .pro-plans-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          width: 100%;
        }

        .pro-plan-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          background: #f8fafc;
          cursor: pointer;
          text-align: left;
          position: relative;
          transition: all 0.2s ease;
        }

        .pro-plan-card.selected {
          border: 2px solid #0f766e;
          background: #ecfdf5;
        }

        .plan-badge-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .plan-badge {
          font-size: 0.74rem;
          font-weight: 800;
          color: #0f766e;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .save-pill {
          background: #dcfce7;
          color: #059669;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .plan-price-row {
          margin-top: 4px;
        }

        .price-num {
          font-size: 1.35rem;
          font-weight: 900;
          color: #0f172a;
        }

        .price-cadence {
          font-size: 0.78rem;
          color: #64748b;
          font-weight: 500;
          margin-left: 2px;
        }

        .plan-note {
          font-size: 0.72rem;
          color: #64748b;
          margin: 4px 0 0 0;
        }

        .plan-selected-check {
          position: absolute;
          top: 12px;
          right: 12px;
          color: #0f766e;
        }

        .pro-perks-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 16px;
          width: 100%;
          background: #f8fafc;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .perk-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: #334155;
        }

        .perk-check {
          color: #059669;
          flex-shrink: 0;
        }

        .pro-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        /* Responsive Mobile Breakpoint */
        @media (max-width: 860px) {
          .jivexa-ai-wrapper {
            height: auto;
            min-height: calc(100vh - 120px);
          }

          .jivexa-chat-split {
            grid-template-columns: 1fr;
          }

          .mobile-sidebar-toggle {
            display: inline-flex;
          }

          .security-capsule {
            display: none;
          }

          .hero-suggestions-grid {
            grid-template-columns: 1fr;
          }

          .pro-plans-grid {
            grid-template-columns: 1fr;
          }

          .btn-label-desktop {
            display: none;
          }

          .message-bubble-container {
            max-width: 92%;
          }

          .user-container {
            max-width: 90%;
          }

          .jivexa-sidebar {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 85%;
            max-width: 340px;
            height: 100vh;
            z-index: 999;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            border-radius: 0 20px 20px 0;
          }

          .jivexa-sidebar.sidebar-mobile-open {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
};
