import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Sparkles,
  GitCommit,
  CheckCircle2,
  FileCode,
  Network,
  Bot,
  Loader2,
  Box,
  Send,
  User,
  RefreshCw,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest } from '@/api/client';

interface ChatEvidence {
  commits: string[];
  files: number;
  dependencies: { added: number; removed: number };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  evidence?: ChatEvidence | null;
  isError?: boolean;
}

interface ChatResponse {
  data: {
    answer: string;
    evidence: ChatEvidence | null;
    model: { name: string; host: string; external: boolean };
    usage: { inputTokens: number; outputTokens: number } | null;
  };
}

interface ProjectOption { id: string; name: string }

const CHAT_TIMEOUT_MS = 120_000;
const mono = { fontFamily: '"JetBrains Mono", monospace' };

const WELCOME = 'Hello! I\'m ArchTime AI, your evidence-grounded architecture assistant. Pick a project, then ask about its architectural changes, coupling patterns, or why specific decisions were made. I only answer from the snapshots and change evidence stored for that project, and I label each claim FACT, INFERENCE or UNKNOWN.';

const SUGGESTED_QUESTIONS = [
  'What were the most important architectural changes?',
  'Which commits changed the most files?',
  'How did the dependencies change over time?',
  'Which modules look the most coupled?'
];

const LABEL_STYLES: Record<string, string> = {
  FACT: 'bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/30',
  INFERENCE: 'bg-[#ffb03a]/15 text-[#ffb03a] border-[#ffb03a]/30',
  UNKNOWN: 'bg-[#94a3b8]/15 text-[#94a3b8] border-[#94a3b8]/30'
};

/** Shows the model's [FACT] / [INFERENCE] / [UNKNOWN] labels as badges and `code` spans as code; everything else stays plain text. */
function renderAnswer(text: string) {
  return text.split(/(\[(?:FACT|INFERENCE|UNKNOWN)\]|`[^`\n]+`)/g).map((part, i) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 bg-[#242527]/60 text-[#3b82f6] text-[12px]" style={mono}>{part.slice(1, -1)}</code>;
    }
    const label = /^\[(FACT|INFERENCE|UNKNOWN)\]$/.exec(part)?.[1];
    if (!label) return <React.Fragment key={i}>{part}</React.Fragment>;
    return (
      <span key={i} className={`inline-block px-1.5 mr-1 border text-[10px] font-semibold tracking-wider align-middle ${LABEL_STYLES[label]}`} style={mono}>
        {label}
      </span>
    );
  });
}

const Insights: React.FC = () => {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME, timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [modelNote, setModelNote] = useState<{ name: string; host: string; external: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const counter = useRef(0);

  const nextId = (prefix: string) => `${prefix}-${++counter.current}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiRequest<{ data?: { projects?: ProjectOption[] } }>('/projects', { signal: controller.signal });
        const list = res.data?.projects ?? [];
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch {
        if (!controller.signal.aborted) setProjects([]);
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    })();
    return () => { controller.abort(); };
  }, []);

  useEffect(() => () => { activeRequest.current?.abort(); }, []);

  const resetConversation = (text: string) => {
    activeRequest.current?.abort();
    setIsTyping(false);
    setModelNote(null);
    setMessages([{ id: 'welcome', role: 'assistant', content: text, timestamp: new Date() }]);
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    resetConversation('Switched project. Ask me anything about its architecture.');
  };

  const handleSend = async (query: string) => {
    const text = query.trim();
    if (!text || isTyping || !selectedProjectId) return;

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
        body: JSON.stringify({ messages: history }),
        signal: controller.signal
      }, CHAT_TIMEOUT_MS);
      if (controller.signal.aborted) return;
      setModelNote(res.data.model);
      setMessages(prev => [...prev, {
        id: nextId('assistant'), role: 'assistant', content: res.data.answer, timestamp: new Date(), evidence: res.data.evidence
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
                <Sparkles size={12} className="text-[#3b82f6]" />
                <span className="text-[10px] font-mono text-[#3b82f6] tracking-wider font-semibold uppercase" style={mono}>Evidence-Grounded AI</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">AI Architectural Insights</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Chat with ArchTime AI to understand architectural changes through evidence-grounded explanations.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="insights-project" className="text-[10px] uppercase tracking-wider text-[#94a3b8]" style={mono}>Project</label>
                <select
                  id="insights-project"
                  value={selectedProjectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  disabled={projectsLoading || noProjects}
                  className="h-9 min-w-[200px] bg-[#080b0e] border border-[#242527] focus:border-[#3b82f6]/50 px-3 text-sm text-[#f4f4f6] focus:outline-none disabled:opacity-50"
                >
                  {projectsLoading && <option value="">Loading projects...</option>}
                  {noProjects && <option value="">No projects</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button
                onClick={() => resetConversation('Chat cleared. How can I help you understand your architecture?')}
                className="flex items-center gap-2 h-9 px-3 text-xs text-[#94a3b8] hover:text-[#f4f4f6] border border-[#242527] hover:border-[#3b82f6]/30 transition-colors"
              >
                <RefreshCw size={14} />
                Clear Chat
              </button>
            </div>
          </div>
        </div>

        {/* CHAT CONTAINER */}
        <div className="flex-1 flex flex-col bg-[#080b0e] border border-[#242527] overflow-hidden min-h-0">

          {/* Chat Header */}
          <div className="shrink-0 p-4 border-b border-[#242527] bg-[#11161b] flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3b82f6]/20 flex items-center justify-center rounded-full">
              <Bot size={16} className="text-[#3b82f6]" />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#f4f4f6]">ArchTime AI</span>
              <span className="text-xs text-[#94a3b8] ml-2">Evidence-Grounded Architecture Assistant</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${canChat ? 'bg-[#22c55e] animate-pulse' : 'bg-[#5f636b]'}`} />
              <span className="text-xs text-[#94a3b8]">{canChat ? 'Ready' : 'No project selected'}</span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0" aria-live="polite">
            {noProjects && (
              <div className="p-4 border border-[#ffb03a]/30 bg-[#ffb03a]/10 text-sm text-[#ffb03a]">
                You have no projects yet. <Link to="/projects" className="underline">Add a project</Link> and let it finish mining before asking questions.
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
                        : <Sparkles size={14} className="text-[#3b82f6]" />}
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
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${message.isError ? 'text-red-300' : 'text-[#f4f4f6]'}`}>
                        {message.role === 'assistant' && !message.isError ? renderAnswer(message.content) : message.content}
                      </p>

                      {message.evidence && (
                        <div className="mt-4 pt-4 border-t border-[#242527]">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 size={12} className="text-[#22c55e]" />
                            <span className="text-[10px] font-mono font-semibold text-[#22c55e] uppercase tracking-wider" style={mono}>Evidence cited</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {message.evidence.commits.map(commit => (
                              <span key={commit} className="px-2 py-1 bg-[#242527]/50 border border-[#242527] text-[10px] font-mono text-[#3b82f6] flex items-center gap-1" style={mono}>
                                <GitCommit size={10} /> {commit}
                              </span>
                            ))}
                            {message.evidence.files > 0 && (
                              <span className="px-2 py-1 bg-[#242527]/50 border border-[#242527] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1" style={mono}>
                                <FileCode size={10} /> {message.evidence.files} files
                              </span>
                            )}
                            {(message.evidence.dependencies.added > 0 || message.evidence.dependencies.removed > 0) && (
                              <span className="px-2 py-1 bg-[#242527]/50 border border-[#242527] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1" style={mono}>
                                <Network size={10} /> +{message.evidence.dependencies.added}/-{message.evidence.dependencies.removed} deps
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[#5f636b] mt-1 font-mono" style={mono}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
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
                  <Sparkles size={14} className="text-[#3b82f6]" />
                </div>
                <div className="p-4 bg-[#11161b] border border-[#242527]">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="text-[#3b82f6] animate-spin" />
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
                    disabled={isTyping}
                    className="px-3 py-2 bg-[#11161b] border border-[#242527] hover:border-[#3b82f6]/50 text-xs text-[#94a3b8] hover:text-[#3b82f6] transition-colors disabled:opacity-50"
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
                  aria-label="Ask about this project's architecture"
                  placeholder={canChat ? 'Ask about architectural changes, patterns, or decisions...' : 'Select a project to start'}
                  className="w-full h-12 bg-[#080b0e] border border-[#242527] focus:border-[#3b82f6]/50 px-4 pr-12 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none transition-colors font-mono"
                  style={mono}
                  disabled={isTyping || !canChat}
                />
              </div>
              <button
                onClick={() => void handleSend(inputValue)}
                disabled={!inputValue.trim() || isTyping || !canChat}
                className="h-12 px-6 bg-[#3b82f6] hover:bg-[#3b82f6]/80 disabled:bg-[#242527] disabled:cursor-not-allowed text-[#080b0e] disabled:text-[#5f636b] font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Send
              </button>
            </div>
            <p className="text-[10px] text-[#5f636b] mt-2 font-mono" style={mono}>
              <Box size={10} className="inline mr-1" />
              Answers use this project&apos;s stored snapshots and change evidence.
              {modelNote
                ? ` Model: ${modelNote.name}${modelNote.external ? ` — project data is sent to ${modelNote.host}.` : ` (hosted on ${modelNote.host}).`}`
                : ' Project data is sent to the configured AI provider.'}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Insights;
