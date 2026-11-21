import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { App, Select } from 'antd';
import {
  Sparkles,
  Loader2,
  Send,
  Plus,
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
  describeWhen, fromStored, labelCheckNote, lastModel, readLabelCheck,
  type ChatMessage, type ChatModelNote, type ConversationSummary,
} from '@/features/chat-history';
import { openingWorkspace, readMentorParams } from '@/features/onboarding-context';
import { getWorkspace } from '@/features/workspace-summary';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

interface ChatResponse {
  data: {
    answer: string;
    evidence: ChatEvidence | null;
    model: ChatModelNote;
    usage: { inputTokens: number; outputTokens: number } | null;
    /** What the server's FACT / citation check changed; older servers leave it out. */
    labelCheck?: unknown;
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

const MSG = defineMessages({
  welcome: 'Hello! I\'m ArchTime AI, your evidence-grounded architecture assistant. Pick a workspace, then ask about its architectural changes, coupling patterns, or why specific decisions were made. I only answer from the snapshots and change evidence stored for that workspace, and I label each claim FACT, INFERENCE or UNKNOWN.',
  q1: 'What were the most important architectural changes?', q2: 'Which commits changed the most files?', q3: 'How did the dependencies change over time?', q4: 'Which modules look the most coupled?',
  switched: 'Switched workspace. Ask me anything about its architecture.', openFailed: 'Could not open this chat.', deleteTitle: 'Delete the saved chat "{title}"?', cannotUndo: 'This cannot be undone.',
  deleteChat: 'Delete chat', deleted: 'Chat deleted. How can I help you understand your architecture?', deleteFailed: 'Could not delete this chat.', wentWrong: 'Something went wrong. Please try again.',
  title: 'AI Insights', intro: "Ask about a workspace's architecture; every answer cites its evidence.", workspace: 'Workspace', noWorkspaces: 'No workspaces', choose: 'Choose a workspace',
  history: 'History', newStarted: 'New chat started. How can I help you understand your architecture?', newChat: 'New chat', saved: 'Saved chats', closeSaved: 'Close saved chats',
  loadingSaved: 'Loading saved chats…', savedFailed: 'Saved chats could not be loaded.', tryAgain: 'Try again', noSaved: 'No saved chats yet. Ask a question and it appears here.',
  messages: '{count} messages', messages_one: '1 message', deleteSaved: 'Delete saved chat: {title}', onlyYou: 'Only you can see your saved chats.',
  noProjects: 'You have no workspaces yet. {link} and let it finish mining before asking questions.', addWorkspace: 'Add a workspace', loadingWorkspaces: 'Loading workspaces',
  whatKnow: 'What do you want to know about {name}?', thisWorkspace: 'this workspace', answersFrom: 'Answers come only from its mined snapshots and evidence; each claim is labelled FACT, INFERENCE or UNKNOWN.',
  unsaved: 'This answer could not be saved to your history.', reading: 'Reading the evidence…', askLabel: "Ask about this workspace's architecture", askPlaceholder: 'Ask about changes, coupling or decisions…',
  chooseStart: 'Choose a workspace to start', send: 'Send', uses: "Uses this workspace's snapshots and evidence.", modelExternal: ' Model: {name} — workspace data is sent to {host}.', modelHosted: ' Model: {name} (hosted on {host}).',
  providerNote: ' Workspace data is sent to the configured AI provider.',
}, {
  welcome: 'Xin chào! Tôi là ArchTime AI, trợ lý kiến trúc dựa trên bằng chứng. Hãy chọn một không gian làm việc, rồi hỏi về các thay đổi kiến trúc, kiểu gắn kết, hoặc lý do của các quyết định. Tôi chỉ trả lời từ các ảnh chụp và bằng chứng thay đổi đã lưu cho không gian làm việc đó, và gắn nhãn mỗi khẳng định là FACT, INFERENCE hoặc UNKNOWN.',
  q1: 'Những thay đổi kiến trúc quan trọng nhất là gì?', q2: 'Commit nào thay đổi nhiều tệp nhất?', q3: 'Các phụ thuộc đã thay đổi thế nào theo thời gian?', q4: 'Module nào có vẻ gắn kết chặt nhất?',
  switched: 'Đã đổi không gian làm việc. Hãy hỏi tôi bất cứ điều gì về kiến trúc của nó.', openFailed: 'Không mở được cuộc trò chuyện này.', deleteTitle: 'Xoá cuộc trò chuyện đã lưu "{title}"?', cannotUndo: 'Không thể hoàn tác.',
  deleteChat: 'Xoá cuộc trò chuyện', deleted: 'Đã xoá cuộc trò chuyện. Tôi có thể giúp bạn hiểu kiến trúc thế nào?', deleteFailed: 'Không xoá được cuộc trò chuyện này.', wentWrong: 'Đã có lỗi. Vui lòng thử lại.',
  title: 'Phân tích AI', intro: 'Hỏi về kiến trúc của một không gian làm việc; mọi câu trả lời đều dẫn bằng chứng.', workspace: 'Không gian làm việc', noWorkspaces: 'Chưa có không gian làm việc', choose: 'Chọn không gian làm việc',
  history: 'Lịch sử', newStarted: 'Đã bắt đầu cuộc trò chuyện mới. Tôi có thể giúp bạn hiểu kiến trúc thế nào?', newChat: 'Trò chuyện mới', saved: 'Cuộc trò chuyện đã lưu', closeSaved: 'Đóng danh sách đã lưu',
  loadingSaved: 'Đang tải các cuộc trò chuyện đã lưu…', savedFailed: 'Không tải được các cuộc trò chuyện đã lưu.', tryAgain: 'Thử lại', noSaved: 'Chưa có cuộc trò chuyện nào được lưu. Hãy đặt câu hỏi và nó sẽ xuất hiện ở đây.',
  messages: '{count} tin nhắn', deleteSaved: 'Xoá cuộc trò chuyện đã lưu: {title}', onlyYou: 'Chỉ bạn mới thấy các cuộc trò chuyện đã lưu của mình.',
  noProjects: 'Bạn chưa có không gian làm việc nào. {link} và đợi mining xong rồi hãy đặt câu hỏi.', addWorkspace: 'Thêm không gian làm việc', loadingWorkspaces: 'Đang tải không gian làm việc',
  whatKnow: 'Bạn muốn biết gì về {name}?', thisWorkspace: 'không gian làm việc này', answersFrom: 'Câu trả lời chỉ lấy từ các ảnh chụp và bằng chứng đã mining; mỗi khẳng định được gắn nhãn FACT, INFERENCE hoặc UNKNOWN.',
  unsaved: 'Không lưu được câu trả lời này vào lịch sử.', reading: 'Đang đọc bằng chứng…', askLabel: 'Hỏi về kiến trúc của không gian làm việc này', askPlaceholder: 'Hỏi về thay đổi, gắn kết hoặc quyết định…',
  chooseStart: 'Chọn một không gian làm việc để bắt đầu', send: 'Gửi', uses: 'Dùng các ảnh chụp và bằng chứng của không gian làm việc này.', modelExternal: ' Mô hình: {name} — dữ liệu không gian làm việc được gửi tới {host}.', modelHosted: ' Mô hình: {name} (chạy trên {host}).',
  providerNote: ' Dữ liệu không gian làm việc được gửi tới nhà cung cấp AI đã cấu hình.',
});
const SUGGESTED_QUESTIONS = ['q1', 'q2', 'q3', 'q4'] as const;

const Insights: React.FC = () => {
  const { modal } = App.useApp();
  const m = useMessages(MSG);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: translate(MSG, 'welcome'), timestamp: new Date() }
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
    resetConversation(m('switched'));
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
      if (!controller.signal.aborted) setHistoryNotice(error instanceof Error ? error.message : m('openFailed'));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setOpening(false);
      }
    }
  };

  // The same confirmation dialog as the rest of the app (the browser's own confirm box looked and behaved differently).
  const removeConversation = (summary: ConversationSummary) => {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    modal.confirm({
      title: m('deleteTitle', { title: summary.title }),
      content: m('cannotUndo'),
      okText: m('deleteChat'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setHistoryNotice('');
        try {
          await apiRequest(`/projects/${projectId}/chat/conversations/${summary.id}`, { method: 'DELETE' });
          setConversations(prev => prev.filter(c => c.id !== summary.id));
          if (summary.id === conversationId) resetConversation(m('deleted'));
        } catch (error) {
          setHistoryNotice(error instanceof Error ? error.message : m('deleteFailed'));
        }
      },
    });
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
        id: nextId('assistant'), role: 'assistant', content: res.data.answer, timestamp: new Date(), evidence: res.data.evidence, unsaved: !saved,
        labelCheck: readLabelCheck(res.data.labelCheck)
      }]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages(prev => [...prev, {
        id: nextId('error'), role: 'assistant', isError: true, timestamp: new Date(),
        content: error instanceof Error ? error.message : m('wentWrong')
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
  const workspaceName = projects.find(p => p.id === selectedProjectId)?.name;
  // A chat holding only the greeting shows a start screen (what to ask) instead of a long greeting bubble.
  const fresh = messages.length === 1 && messages[0].id === 'welcome' && !isTyping;
  const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const pill = 'flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition-colors disabled:cursor-not-allowed';

  return (
    <DashboardLayout>
      <div className="max-w-[1200px] mx-auto flex h-full min-h-[560px] flex-col gap-5">

        <header className="shrink-0 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)]">{m('title')}</h2>
            <p className="mt-2 text-sm text-[var(--at-muted)]">{m('intro')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label={m('workspace')} className="min-w-56" showSearch optionFilterProp="label"
              value={selectedProjectId || undefined} onChange={handleProjectChange} loading={projectsLoading}
              disabled={projectsLoading || noProjects} placeholder={noProjects ? m('noWorkspaces') : m('choose')}
              options={projects.map(p => ({ value: p.id, label: p.name }))} />
            <button type="button" onClick={() => setHistoryOpen(open => !open)} aria-expanded={historyOpen} aria-controls="chat-history" disabled={!canChat}
              className={`${pill} ${historyOpen ? 'border-[var(--at-link)]/50 bg-[var(--at-panel-2)] text-[var(--at-text)]' : 'border-[var(--at-line)] text-[var(--at-muted)] hover:text-[var(--at-text)] hover:bg-[var(--at-panel-2)]'}`}>
              <History size={15} aria-hidden="true" />{m('history')}{conversations.length > 0 ? ` (${conversations.length})` : ''}
            </button>
            <button type="button" onClick={() => resetConversation(m('newStarted'))} disabled={!canChat}
              className={`${pill} border-[var(--at-line)] text-[var(--at-text)] hover:bg-[var(--at-panel-2)]`}>
              <Plus size={15} aria-hidden="true" />{m('newChat')}
            </button>
          </div>
        </header>
        {openNote && <p role="status" className="-mt-2 text-xs text-[var(--at-warn)]">{openNote}</p>}

        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--at-line)] bg-[var(--at-solid)]">

          {/* Saved chats */}
          {historyOpen && (
            <aside id="chat-history" aria-label={m('saved')}
              className="absolute inset-y-0 left-0 z-20 flex w-72 max-w-full shrink-0 flex-col min-h-0 border-r border-[var(--at-line)] bg-[var(--at-solid)] md:static md:z-auto">
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--at-line)]">
                <h3 className="text-sm font-semibold text-[var(--at-text)]">{m('saved')}</h3>
                <button type="button" onClick={() => setHistoryOpen(false)} aria-label={m('closeSaved')}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--at-muted)] hover:bg-[var(--at-panel-2)] hover:text-[var(--at-text)]">
                  <X size={14} />
                </button>
              </div>

              {historyNotice && <p role="alert" className="shrink-0 px-4 py-2 text-xs text-[var(--at-danger-text)] bg-[var(--at-danger)]/10 border-b border-[var(--at-danger)]/30">{historyNotice}</p>}

              <div className="flex-1 overflow-y-auto min-h-0 py-1">
                {historyStatus === 'loading' && (
                  <p className="px-4 py-4 text-xs text-[var(--at-muted)] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {m('loadingSaved')}</p>
                )}
                {historyStatus === 'error' && (
                  <div className="px-4 py-4 text-xs text-[var(--at-muted)] space-y-2">
                    <p>{m('savedFailed')}</p>
                    <button type="button" onClick={() => { setHistoryStatus('loading'); loadHistory(selectedProjectId); }}
                      className="rounded-full border border-[var(--at-line)] px-3 py-1.5 text-[var(--at-link)] hover:bg-[var(--at-panel-2)]">{m('tryAgain')}</button>
                  </div>
                )}
                {historyStatus === 'ready' && conversations.length === 0 && (
                  <p className="px-4 py-4 text-xs text-[var(--at-muted)] leading-relaxed">{m('noSaved')}</p>
                )}
                {historyStatus === 'ready' && conversations.length > 0 && (
                  <ul>
                    {conversations.map(conversation => {
                      const current = conversation.id === conversationId;
                      return (
                        <li key={conversation.id} className={`group mx-2 flex items-stretch rounded-lg ${current ? 'bg-[var(--at-panel-2)]' : 'hover:bg-[var(--at-panel)]'}`}>
                          <button type="button" onClick={() => void openConversation(conversation)} disabled={isTyping || opening} aria-current={current ? 'true' : undefined}
                            className="flex-1 min-w-0 text-left px-3 py-2.5 disabled:opacity-60">
                            <span className="block text-sm text-[var(--at-text)] truncate">{conversation.title}</span>
                            <span className="block mt-0.5 text-[11px] text-[var(--at-muted)]">{describeWhen(conversation.updatedAt)} · {m('messages', { count: conversation.messageCount })}</span>
                          </button>
                          <button type="button" onClick={() => removeConversation(conversation)} aria-label={m('deleteSaved', { title: conversation.title })}
                            className="shrink-0 w-9 flex items-center justify-center rounded-lg text-[var(--at-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--at-danger)]">
                            <Trash2 size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <p className="shrink-0 px-4 py-3 border-t border-[var(--at-line)] text-[11px] text-[var(--at-muted)]">{m('onlyYou')}</p>
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 min-h-0" aria-live="polite">
              {noProjects && (
                <div className="mx-auto max-w-xl rounded-xl border border-[var(--at-warn)]/30 bg-[var(--at-warn)]/10 p-4 text-sm text-[var(--at-warn)]">
                  {m.rich('noProjects', { link: <Link key="l" to="/projects" className="underline">{m('addWorkspace')}</Link> })}
                </div>
              )}
              {fresh && !canChat && !noProjects && <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--at-link)]" aria-label={m('loadingWorkspaces')} /></div>}

              {fresh && canChat ? (
                <div className="flex min-h-full flex-col items-center justify-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--at-panel-2)] text-[var(--at-link)]"><Sparkles size={20} aria-hidden="true" /></span>
                  <h3 className="mt-4 text-xl font-semibold text-[var(--at-text)]">{m('whatKnow', { name: workspaceName ?? m('thisWorkspace') })}</h3>
                  <p className="mt-2 max-w-md text-sm text-[var(--at-muted)]">{m('answersFrom')}</p>
                  <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                    {SUGGESTED_QUESTIONS.map(question => (
                      <button key={question} type="button" onClick={() => void handleSend(m(question))} disabled={isTyping || opening}
                        className="rounded-xl border border-[var(--at-line)] px-4 py-3 text-left text-sm text-[var(--at-text)] transition-colors hover:border-[var(--at-link)]/40 hover:bg-[var(--at-panel-2)]">
                        {m(question)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : !fresh && (
                <div className="mx-auto max-w-3xl space-y-6">
                  <AnimatePresence>
                    {messages.map(message => {
                      const user = message.role === 'user';
                      return (
                        <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className={`flex gap-3 ${user ? 'justify-end' : ''}`}>
                          {!user && (
                            <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${message.isError ? 'bg-[var(--at-danger)]/20' : 'bg-[var(--at-panel-2)]'}`}>
                              {message.isError ? <AlertTriangle size={13} className="text-[var(--at-danger)]" /> : <Sparkles size={13} className="text-[var(--at-link)]" />}
                            </span>
                          )}
                          <div className={`flex max-w-[85%] flex-col ${user ? 'items-end' : 'min-w-0'}`}>
                            <div className={`rounded-2xl px-4 py-3 ${user
                              ? 'rounded-br-md border border-[var(--at-line)] bg-[var(--at-panel-2)]'
                              : message.isError ? 'border border-[var(--at-danger)]/30 bg-[var(--at-danger)]/10' : 'rounded-tl-md border border-[var(--at-line)] bg-[var(--at-panel)]'}`}>
                              {!user && !message.isError
                                ? <AssistantMessage content={message.content} evidence={message.evidence} projectId={selectedProjectId} />
                                : <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${message.isError ? 'text-[var(--at-danger-text)]' : 'text-[var(--at-text)]'}`}>{message.content}</p>}
                            </div>
                            <p className="mt-1 px-1 text-[11px] text-[var(--at-muted)]">
                              {time(message.timestamp)}{labelCheckNote(message.labelCheck) ? ` · ${labelCheckNote(message.labelCheck)}` : ''}
                            </p>
                            {message.unsaved && <p role="status" className="px-1 text-[11px] text-[var(--at-warn)]">{m('unsaved')}</p>}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {isTyping && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--at-panel-2)]"><Sparkles size={13} className="text-[var(--at-link)]" /></span>
                      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-[var(--at-line)] bg-[var(--at-panel)] px-4 py-3 text-sm text-[var(--at-muted)]">
                        <Loader2 size={14} className="animate-spin text-[var(--at-link)]" /> {m('reading')}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-[var(--at-line)] px-4 py-4 sm:px-6">
              <div className="mx-auto max-w-3xl">
                <div className="flex items-center gap-2 rounded-full border border-[var(--at-line)] bg-[var(--at-panel)] pl-5 pr-1.5 focus-within:border-[var(--at-link)]">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={4000}
                    aria-label={m('askLabel')}
                    placeholder={canChat ? m('askPlaceholder') : m('chooseStart')}
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-[var(--at-text)] outline-none focus-visible:outline-none placeholder:text-[var(--at-muted)]"
                    disabled={isTyping || opening || !canChat}
                  />
                  <button type="button" onClick={() => void handleSend(inputValue)} aria-label={m('send')}
                    disabled={!inputValue.trim() || isTyping || opening || !canChat}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--at-fill)] text-[var(--at-on-fill)] transition-colors hover:bg-[var(--at-fill-hover)]">
                    <Send size={15} aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-[var(--at-muted)]">
                  {m('uses')}
                  {modelNote
                    ? m(modelNote.external ? 'modelExternal' : 'modelHosted', { name: modelNote.name, host: modelNote.host })
                    : m('providerNote')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Insights;
