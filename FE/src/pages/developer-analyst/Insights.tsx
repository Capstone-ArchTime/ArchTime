import SampleDataNotice from '@/components/SampleDataNotice';
import React, { useState, useRef, useEffect } from 'react';
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
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  evidence?: {
    commits?: string[];
    files?: number;
    dependencies?: { added: number; removed: number };
  };
}

const MOCK_RESPONSES: Record<string, { content: string; evidence?: ChatMessage['evidence'] }> = {
  'Why was this module extracted?': {
    content: 'Based on repository evidence, the module was extracted to reduce coupling between the payment processing and order management domains. The commit history shows 8 new external dependencies (payment gateway SDKs) were introduced exclusively within the new PaymentService, effectively isolating them from the core Order processing path.',
    evidence: {
      commits: ['d82f91a', '3e4877f'],
      files: 12,
      dependencies: { added: 8, removed: 3 }
    }
  },
  'What changed between these revisions?': {
    content: 'Between the selected revisions, the architecture underwent significant restructuring. The data access layer was decoupled from the presentation layer, with 15 files modified to introduce a new repository pattern. Additionally, messaging queues replaced direct REST calls for inter-service communication.',
    evidence: {
      commits: ['8af31c2', 'c4199be'],
      files: 15,
      dependencies: { added: 4, removed: 2 }
    }
  },
  'Which services became more coupled?': {
    content: 'Analysis of the dependency graph reveals that UserService and NotificationService have become increasingly coupled over the last 30 days. There are now 12 direct import statements between these services, compared to 3 at the beginning of the period. This pattern often indicates a need for an event-driven architecture.',
    evidence: {
      commits: ['a1b2c3d', 'e4f5g6h'],
      files: 8,
      dependencies: { added: 9, removed: 0 }
    }
  },
  'Which architectural changes affected the most files?': {
    content: 'The database migration from SQL to MongoDB (commits 7h8i9j0 through k1l2m3n) affected the most files, with 47 files modified across 6 services. This change introduced a new data access layer and required updates to all repository implementations.',
    evidence: {
      commits: ['7h8i9j0', 'k1l2m3n'],
      files: 47,
      dependencies: { added: 5, removed: 8 }
    }
  }
};

const SUGGESTED_QUESTIONS = [
  'Why was this module extracted?',
  'What changed between these revisions?',
  'Which services became more coupled?',
  'Which architectural changes affected the most files?'
];

const Insights: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m ArchTime AI, your evidence-grounded architecture assistant. I analyze your repository history to provide insights backed by concrete evidence. Ask me about architectural changes, coupling patterns, or why specific decisions were made.',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (query: string) => {
    if (!query.trim() || isTyping) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const mockResponse = MOCK_RESPONSES[query.trim()] || {
        content: `Based on repository evidence from the last 30 days, I analyzed your question: "${query.trim()}". The structural AST changes indicate patterns in the codebase that suggest architectural evolution. I found evidence across multiple commits showing how the system has evolved to address this concern.`,
        evidence: {
          commits: ['abc1234', 'def5678'],
          files: Math.floor(Math.random() * 20) + 5,
          dependencies: { added: Math.floor(Math.random() * 5) + 1, removed: Math.floor(Math.random() * 3) }
        }
      };

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: mockResponse.content,
        timestamp: new Date(),
        evidence: mockResponse.evidence
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500 + Math.random() * 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Chat cleared. How can I help you understand your architecture?',
        timestamp: new Date()
      }
    ]);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-120px)]">
        <SampleDataNotice />

        {/* HEADER */}
        <div className="shrink-0 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 mb-4">
                <Sparkles size={12} className="text-[#38bdf8]" />
                <span className="text-[10px] font-mono text-[#38bdf8] tracking-wider font-semibold uppercase"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence-Grounded AI</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">AI Architectural Insights</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Chat with ArchTime AI to understand architectural changes through evidence-grounded explanations.
              </p>
            </div>
            <button
              onClick={handleClearChat}
              className="flex items-center gap-2 px-3 py-2 text-xs text-[#94a3b8] hover:text-[#f4f4f6] border border-[#222c37] hover:border-[#38bdf8]/30 transition-colors"
            >
              <RefreshCw size={14} />
              Clear Chat
            </button>
          </div>
        </div>

        {/* CHAT CONTAINER */}
        <div className="flex-1 flex flex-col bg-[#080b0e] border border-[#222c37] overflow-hidden min-h-0">

          {/* Chat Header */}
          <div className="shrink-0 p-4 border-b border-[#222c37] bg-[#11161b] flex items-center gap-3">
            <div className="w-8 h-8 bg-[#38bdf8]/20 flex items-center justify-center rounded-full">
              <Bot size={16} className="text-[#38bdf8]" />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#f4f4f6]">ArchTime AI</span>
              <span className="text-xs text-[#94a3b8] ml-2">Evidence-Grounded Architecture Assistant</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="w-2 h-2 bg-[#22c55e] rounded-full animate-pulse" />
              <span className="text-xs text-[#94a3b8]">Online</span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
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
                    <div className="shrink-0 w-8 h-8 bg-[#38bdf8]/20 flex items-center justify-center rounded-full">
                      <Sparkles size={14} className="text-[#38bdf8]" />
                    </div>
                  )}

                  <div className={`max-w-[70%] ${message.role === 'user' ? 'order-first' : ''}`}>
                    <div
                      className={`p-4 ${
                        message.role === 'user'
                          ? 'bg-[#38bdf8]/10 border border-[#38bdf8]/30'
                          : 'bg-[#11161b] border border-[#222c37]'
                      }`}
                    >
                      <p className="text-sm text-[#f4f4f6] leading-relaxed">{message.content}</p>

                      {message.evidence && (
                        <div className="mt-4 pt-4 border-t border-[#222c37]">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 size={12} className="text-[#22c55e]" />
                            <span className="text-[10px] font-mono font-semibold text-[#22c55e] uppercase tracking-wider"
                              style={{ fontFamily: '"JetBrains Mono", monospace' }}>Evidence</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {message.evidence.commits?.map(commit => (
                              <span key={commit} className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#38bdf8] flex items-center gap-1"
                                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                                <GitCommit size={10} /> {commit}
                              </span>
                            ))}
                            {message.evidence.files && (
                              <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1"
                                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                                <FileCode size={10} /> {message.evidence.files} files
                              </span>
                            )}
                            {message.evidence.dependencies && (
                              <span className="px-2 py-1 bg-[#222c37]/50 border border-[#222c37] text-[10px] font-mono text-[#94a3b8] flex items-center gap-1"
                                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                                <Network size={10} /> +{message.evidence.dependencies.added}/-{message.evidence.dependencies.removed} deps
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[#5f636b] mt-1 font-mono"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>

                  {message.role === 'user' && (
                    <div className="shrink-0 w-8 h-8 bg-[#222c37] flex items-center justify-center rounded-full">
                      <User size={14} className="text-[#94a3b8]" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-4"
              >
                <div className="shrink-0 w-8 h-8 bg-[#38bdf8]/20 flex items-center justify-center rounded-full">
                  <Sparkles size={14} className="text-[#38bdf8]" />
                </div>
                <div className="p-4 bg-[#11161b] border border-[#222c37]">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="text-[#38bdf8] animate-spin" />
                    <span className="text-xs text-[#94a3b8] font-mono"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      Analyzing repository evidence...
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length === 1 && (
            <div className="shrink-0 px-6 pb-4">
              <p className="text-xs text-[#94a3b8] mb-3 flex items-center gap-2">
                <MessageSquare size={12} />
                Suggested questions
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSend(question)}
                    className="px-3 py-2 bg-[#11161b] border border-[#222c37] hover:border-[#38bdf8]/50 text-xs text-[#94a3b8] hover:text-[#38bdf8] transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="shrink-0 p-4 border-t border-[#222c37] bg-[#11161b]">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about architectural changes, patterns, or decisions..."
                  className="w-full h-12 bg-[#080b0e] border border-[#222c37] focus:border-[#38bdf8]/50 px-4 pr-12 text-sm text-[#f4f4f6] placeholder-[#5f636b] focus:outline-none transition-colors font-mono"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  disabled={isTyping}
                />
              </div>
              <button
                onClick={() => handleSend(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                className="h-12 px-6 bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:bg-[#222c37] disabled:cursor-not-allowed text-[#080b0e] disabled:text-[#5f636b] font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Send
              </button>
            </div>
            <p className="text-[10px] text-[#5f636b] mt-2 font-mono"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              <Box size={10} className="inline mr-1" />
              Responses are grounded in repository evidence from commit history, AST analysis, and dependency graphs.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Insights;
