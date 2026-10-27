import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Sparkles,
  Bot,
  Loader2,
  Box,
  Send,
  User,
  Plus,
  MessageSquare,
  AlertTriangle,
  History,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest } from '@/api/client';
import AssistantMessage from '@/components/chat/AssistantMessage';
import type { ChatEvidence } from '@/features/chat-answer';
import {
  describeWhen, fromStored, lastModel,
  type ChatMessage, type ChatModelNote, type ConversationSummary,
} from '@/features/chat-history';
import { openingWorkspace, readMentorParams } from '@/features/onboarding-context';
import { getWorkspace } from '@/features/workspace-summary';

interface ChatResponse {
  data: {
    answer: string;
    evidence: ChatEvidence | null;
    model: ChatModelNote;
    usage: { inputTokens: number; outputTokens: number } | null;
    /** Where the exchange was saved; null when saving failed. */
    conversation: { id: string; title: string } | null;
  };
}

async function fetchConversations(projectId: string, signal: AbortSignal): Promise<ConversationSummary[]> {
  const res = await apiRequest<{ data?: { conversations?: ConversationSummary[] } }>(`/projects/${projectId}/chat/conversations`, { signal });
  return res.data?.conversations ?? [];
}

interface ProjectOption { id: string; name: string }

const CHAT_TIMEOUT_MS = 120_000;
const mono = { fontFamily: '"JetBrains Mono", monospace' };

const WELCOME = 'Hello! I\'m ArchTime AI, your evidence-grounded architecture assistant. Pick a workspace, then ask about its architectural changes, coupling patterns, or why specific decisions were made. I only answer from the snapshots and change evidence stored for that workspace, and I label each claim FACT, INFERENCE or UNKNOWN.';

const SUGGESTED_QUESTIONS = [
  'What were the most important architectural changes?',
  'Which commits changed the most files?',
  'How did the dependencies change over time?',
  'Which modules look the most coupled?'
];

const Insights: React.FC = () => {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME, timestamp: new Date() }
  ]);
  const location = useLocation();
  // A learning step can open this page with ?projectId=&q=: that workspace is chosen and the question filled in, not sent.
  const [opened] = useState(() => readMentorParams(location.search));
  const [inputValue, setInputValue] = useState(opened.question);
  const [openNote, setOpenNote] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [modelNote, setModelNote] = useState<ChatModelNote | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyNotice, setHistoryNotice] = useState('');
  const [opening, setOpening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const counter = useRef(0);

  const nextId = (prefix: string) => `${prefix}-${++counter.current}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // A question filled in from a learning step gets the cursor once the box can take it, so the learner can edit and send.
  const focusQuestion = useRef(!!opened.question);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        // The server's largest page, so a learning step's workspace is normally in it.
        const res = await apiRequest<{ data?: { projects?: ProjectOption[] } }>('/projects?limit=100', { signal: controller.signal });
        let list = res.data?.projects ?? [];
        // A step's workspace beyond that page is fetched by itself; one the learner cannot open stays out.
        if (opened.projectId && !list.some(p => p.id === opened.projectId)) {
          const one = await getWorkspace(opened.projectId, controller.signal).catch(() => null);
          if (one) list = [...list, { id: one.id, name: one.name }];
        }
        if (controller.signal.aborted) return;
        setProjects(list);
        const start = openingWorkspace(list, opened);
        setSelectedProjectId(start.projectId);
        setOpenNote(start.note);
        if (start.question !== opened.question) {
          setInputValue(start.question);
          focusQuestion.current = false;
        }
      } catch {
        if (!controller.signal.aborted) setProjects([]);
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    })();
    return () => { controller.abort(); };
  }, [opened]);

  useEffect(() => () => { activeRequest.current?.abort(); }, []);

  useEffect(() => {
    if (!selectedProjectId || !focusQuestion.current) return;
    focusQuestion.current = false;
    inputRef.current?.focus();
  }, [selectedProjectId]);

  const loadHistory = useCallback((projectId: string) => {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    fetchConversations(projectId, controller.signal)
      .then(list => {
        if (controller.signal.aborted) return;
        setConversations(list);
        setHistoryStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setHistoryStatus('error'); });
  }, []);

  useEffect(() => {
    if (selectedProjectId) loadHistory(selectedProjectId);
    return () => { historyRequest.current?.abort(); };
  }, [selectedProjectId, loadHistory]);

  const resetConversation = (text: string) => {
    activeRequest.current?.abort();
    setIsTyping(false);
    setOpening(false);
    setModelNote(null);
    setConversationId(null);
    setHistoryNotice('');
    setMessages([{ id: 'welcome', role: 'assistant', content: text, timestamp: new Date() }]);
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setOpenNote('');
    setConversations([]);
    setHistoryStatus('loading');
    resetConversation('Switched workspace. Ask me anything about its architecture.');
  };

  /** Puts a saved chat back on screen; asking again continues it. */
  const openConversation = async (summary: ConversationSummary) => {
    if (isTyping || opening || !selectedProjectId) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setOpening(true);
    setHistoryNotice('');
    try {
      const res = await apiRequest<{ data: { conversation: { messages: unknown[] } } }>(
        `/projects/${selectedProjectId}/chat/conversations/${summary.id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const stored = res.data.conversation.messages;
      setMessages(fromStored(stored, nextId));
      setModelNote(lastModel(stored));
      setConversationId(summary.id);
    } catch (error) {
      if (!controller.signal.aborted) setHistoryNotice(error instanceof Error ? error.message : 'Could not open this chat.');
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setOpening(false);
      }
    }
  };

  const removeConversation = async (summary: ConversationSummary) => {
    if (!selectedProjectId || !window.confirm(`Delete the saved chat "${summary.title}"? This cannot be undone.`)) return;
    setHistoryNotice('');
    try {
      await apiRequest(`/projects/${selectedProjectId}/chat/conversations/${summary.id}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== summary.id));
      if (summary.id === conversationId) resetConversation('Chat deleted. How can I help you understand your architecture?');
    } catch (error) {
      setHistoryNotice(error instanceof Error ? error.message : 'Could not delete this chat.');
    }
  };

  const handleSend = async (query: string) => {
    const text = query.trim();
    if (!text || isTyping || opening || !selectedProjectId) return;

    const userMessage: ChatMessage = { id: nextId('user'), role: 'user', content: text, timestamp: new Date() };
    const history = [...messages, userMessage]
      .filter(m => m.id !== 'welcome' && !m.isError)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    const controller = new AbortController();
    activeRequest.current = controller;

    try {
      const res = await apiRequest<ChatResponse>(`/projects/${selectedProjectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, ...(conversationId ? { conversationId } : {}) }),
        signal: controller.signal
      }, CHAT_TIMEOUT_MS);
      if (controller.signal.aborted) return;
      setModelNote(res.data.model);
      const saved = res.data.conversation;
      if (saved) {
        setConversationId(saved.id);
        const now = new Date().toISOString();
        setConversations(prev => {
          const existing = prev.find(c => c.id === saved.id);
          return [
            { id: saved.id, title: saved.title, messageCount: (existing?.messageCount ?? 0) + 2, createdAt: existing?.createdAt ?? now, updatedAt: now },
            ...prev.filter(c => c.id !== saved.id)
          ];
        });
      }
      setMessages(prev => [...prev, {
        id: nextId('assistant'), role: 'assistant', content: res.data.answer, timestamp: new Date(), evidence: res.data.evidence, unsaved: !saved
      }]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages(prev => [...prev, {
        id: nextId('error'), role: 'assistant', isError: true, timestamp: new Date(),
        content: error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      }]);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsTyping(false);
        inputRef.current?.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend(inputValue);
    }
  };

  const noProjects = !projectsLoading && projects.length === 0;
  const canChat = Boolean(selectedProjectId) && !noProjects;

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-120px)]">

        {/* HEADER */}
        <div className="shrink-0 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/30 mb-4">
                <Sparkles size={12} className="text-[#93c5fd]" />
                <span className="text-[10px] font-mono text-[#93c5fd] tracking-wider font-semibold uppercase" style={mono}>Evidence-Grounded AI</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">AI Architectural Insights</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Chat with ArchTime AI to understand architectural changes through evidence-grounded explanations.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="insights-project" className="text-[10px] uppercase tracking-wider text-[#94a3b8]" style={mono}>Workspace</label>
                <select
                  id="insights-project"
                  value={selectedProjectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  disabled={projectsLoading || noProjects}
                  className="h-9 min-w-[200px] bg-[#080b0e] border border-[#242527] focus:border-[#3b82f6]/50 px-3 text-sm text-[#f4f4f6] focus:outline-none disabled:opacity-50"
                >
                  {projectsLoading && <option value="">Loading workspaces...</option>}
                  {noProjects && <option value="">No workspaces</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(open => !open)}
                aria-expanded={historyOpen}
                aria-controls="chat-history"
                disabled={!canChat}
                className={`flex items-center gap-2 h-9 px-3 text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${historyOpen ? 'text-[#93c5fd] border-[#3b82f6]/50 bg-[#3b82f6]/10' : 'text-[#94a3b8] hover:text-[#f4f4f6] border-[#242527] hover:border-[#3b82f6]/30'}`}
              >
                <History size={14} />
                History{conversations.length > 0 ? ` (${conversations.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => resetConversation('New chat started. How can I help you understand your architecture?')}
                className="flex items-center gap-2 h-9 px-3 text-xs text-[#94a3b8] hover:text-[#f4f4f6] border border-[#242527] hover:border-[#3b82f6]/30 transition-colors"
              >
                <Plus size={14} />
                New chat
              </button>
            </div>
          </div>
          {openNote && <p role="status" className="mt-3 text-xs text-amber-300">{openNote}</p>}
        </div>

        {/* CHAT CONTAINER */}
        <div className="relative flex-1 flex bg-[#080b0e] border border-[#242527] overflow-hidden min-h-0">

          {/* Saved chats */}
          {historyOpen && (
            <aside
              id="chat-history"
              aria-label="Saved chats"
              className="absolute inset-y-0 left-0 z-20 w-72 max-w-full md:static md:z-auto shrink-0 flex flex-col min-h-0 bg-[#0b0f13] border-r border-[#242527]"
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#242527]">
                <h3 className="text-[10px] font-mono font-bold text-[#94a3b8] uppercase tracking-widest" style={mono}>Saved chats</h3>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close saved chats"
                  className="w-6 h-6 flex items-center justify-center text-[#94a3b8] hover:text-[#f4f4f6] hover:bg-[#242527] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
                >
                  <X size={14} />
                </button>
              </div>

              {historyNotice && <p role="alert" className="shrink-0 px-4 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/30">{historyNotice}</p>}

              <div className="flex-1 overflow-y-auto min-h-0">
                {historyStatus === 'loading' && (
                  <p className="px-4 py-4 text-xs text-[#94a3b8] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading saved chats...</p>
                )}
                {historyStatus === 'error' && (
                  <div className="px-4 py-4 text-xs text-[#94a3b8] space-y-2">
                    <p>Saved chats could not be loaded.</p>
                    <button
                      type="button"
                      onClick={() => { setHistoryStatus('loading'); loadHistory(selectedProjectId); }}
                      className="px-3 py-1.5 border border-[#242527] hover:border-[#3b82f6]/50 text-[#93c5fd]"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {historyStatus === 'ready' && conversations.length === 0 && (
                  <p className="px-4 py-4 text-xs text-[#94a3b8] leading-relaxed">No saved chats for this workspace yet. Ask a question and it will appear here.</p>
                )}
                {historyStatus === 'ready' && conversations.length > 0 && (
                  <ul className="divide-y divide-[#242527]">
                    {conversations.map(conversation => {
                      const current = conversation.id === conversationId;
                      return (
                        <li key={conversation.id} className={`flex items-stretch ${current ? 'bg-[#3b82f6]/10' : ''}`}>
                          <button
                            type="button"
                            onClick={() => void openConversation(conversation)}
                            disabled={isTyping || opening}
                            aria-current={current ? 'true' : undefined}
                            className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-[#242527]/40 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#3b82f6]"
                          >
                            <span className="block text-xs text-[#f4f4f6] line-clamp-2 break-words">{conversation.title}</span>
                            <span className="block mt-1 text-[10px] text-[#94a3b8] font-mono" style={mono}>
                              {describeWhen(conversation.updatedAt)} · {conversation.messageCount} messages
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeConversation(conversation)}
                            aria-label={`Delete saved chat: ${conversation.title}`}
                            className="shrink-0 w-10 flex items-center justify-center text-[#94a3b8] hover:text-red-400 hover:bg-[#242527]/40 focus:outline-none focus-visible:text-red-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <p className="shrink-0 px-4 py-3 border-t border-[#242527] text-[10px] text-[#94a3b8] leading-relaxed">
                Chats are saved to your account for this workspace. Only you can see them.
              </p>
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Chat Header */}
          <div className="shrink-0 p-4 border-b border-[#242527] bg-[#11161b] flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3b82f6]/20 flex items-center justify-center rounded-full">
              <Bot size={16} className="text-[#93c5fd]" />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#f4f4f6]">ArchTime AI</span>
              <span className="text-xs text-[#94a3b8] ml-2">Evidence-Grounded Architecture Assistant</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${canChat ? 'bg-[#22c55e] animate-pulse' : 'bg-[#5f636b]'}`} />
              <span className="text-xs text-[#94a3b8]">{canChat ? 'Ready' : 'No workspace selected'}</span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0" aria-live="polite">
            {noProjects && (
              <div className="p-4 border border-[#ffb03a]/30 bg-[#ffb03a]/10 text-sm text-[#ffb03a]">
                You have no workspaces yet. <Link to="/projects" className="underline">Add a workspace</Link> and let it finish mining before asking questions.
              </div>
            )}

            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role === 'assistant' && (
                    <div className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full ${message.isError ? 'bg-red-500/20' : 'bg-[#3b82f6]/20'}`}>
                      {message.isError
                        ? <AlertTriangle size={14} className="text-red-400" />
                        : <Sparkles size={14} className="text-[#93c5fd]" />}
                    </div>
                  )}

                  <div className={`max-w-[70%] ${message.role === 'user' ? 'order-first' : ''}`}>
                    <div
                      className={`p-4 ${
                        message.role === 'user'
                          ? 'bg-[#3b82f6]/10 border border-[#3b82f6]/30'
                          : message.isError
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-[#11161b] border border-[#242527]'
                      }`}
                    >
                      {message.role === 'assistant' && !message.isError ? (
                        <AssistantMessage content={message.content} evidence={message.evidence} projectId={selectedProjectId} />
                      ) : (
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${message.isError ? 'text-red-300' : 'text-[#f4f4f6]'}`}>
                          {message.content}
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] text-[#94a3b8] mt-1 font-mono" style={mono}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.unsaved && (
                      <p role="status" className="text-[10px] text-[#ffb03a] mt-1">This answer could not be saved to your history.</p>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="shrink-0 w-8 h-8 bg-[#242527] flex items-center justify-center rounded-full">
                      <User size={14} className="text-[#94a3b8]" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4">
                <div className="shrink-0 w-8 h-8 bg-[#3b82f6]/20 flex items-center justify-center rounded-full">
                  <Sparkles size={14} className="text-[#93c5fd]" />
                </div>
                <div className="p-4 bg-[#11161b] border border-[#242527]">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="text-[#93c5fd] animate-spin" />
                    <span className="text-xs text-[#94a3b8] font-mono" style={mono}>Analyzing repository evidence...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length === 1 && canChat && (
            <div className="shrink-0 px-6 pb-4">
              <p className="text-xs text-[#94a3b8] mb-3 flex items-center gap-2">
                <MessageSquare size={12} />
                Suggested questions
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => void handleSend(question)}
                    disabled={isTyping || opening}
                    className="px-3 py-2 bg-[#11161b] border border-[#242527] hover:border-[#3b82f6]/50 text-xs text-[#94a3b8] hover:text-[#93c5fd] transition-colors disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="shrink-0 p-4 border-t border-[#242527] bg-[#11161b]">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={4000}
                  aria-label="Ask about this workspace's architecture"
                  placeholder={canChat ? 'Ask about architectural changes, patterns, or decisions...' : 'Select a workspace to start'}
                  className="w-full h-12 bg-[#080b0e] border border-[#242527] focus:border-[#3b82f6]/50 px-4 pr-12 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none transition-colors font-mono"
                  style={mono}
                  disabled={isTyping || opening || !canChat}
                />
              </div>
              <button
                onClick={() => void handleSend(inputValue)}
                disabled={!inputValue.trim() || isTyping || opening || !canChat}
                className="h-12 px-6 bg-[#1d4ed8] hover:bg-[#1e40af] disabled:bg-[#242527] disabled:cursor-not-allowed text-white disabled:text-[#5f636b] font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Send
              </button>
            </div>
            <p className="text-[10px] text-[#94a3b8] mt-2 font-mono" style={mono}>
              <Box size={10} className="inline mr-1" />
              Answers use this workspace&apos;s stored snapshots and change evidence.
              {modelNote
                ? ` Model: ${modelNote.name}${modelNote.external ? ` — workspace data is sent to ${modelNote.host}.` : ` (hosted on ${modelNote.host}).`}`
                : ' Workspace data is sent to the configured AI provider.'}
            </p>
          </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Insights;
