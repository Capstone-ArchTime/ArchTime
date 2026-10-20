import type { ChatEvidence } from './chat-answer';

export interface ChatModelNote { name: string; host: string; external: boolean }

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  evidence?: ChatEvidence | null;
  isError?: boolean;
  /** The answer arrived but could not be written to the saved history. */
  unsaved?: boolean;
}

/** One row of the saved-chats list. */
export interface ConversationSummary { id: string; title: string; messageCount: number; createdAt: string; updatedAt: string }

/** A message as the server stores it. */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  evidence?: ChatEvidence | null;
  model?: ChatModelNote | null;
  createdAt: string;
}

const isStored = (value: unknown): value is StoredMessage => {
  const message = value as Partial<StoredMessage> | null;
  return (message?.role === 'user' || message?.role === 'assistant') && typeof message.content === 'string';
};

const when = (iso: string): Date => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

/** Turns a saved conversation back into messages the chat can show; anything malformed is skipped, not shown broken. */
export function fromStored(messages: readonly unknown[], nextId: (prefix: string) => string): ChatMessage[] {
  return messages.filter(isStored).map(message => ({
    id: nextId(message.role),
    role: message.role,
    content: message.content,
    timestamp: when(message.createdAt),
    evidence: message.role === 'assistant' ? message.evidence ?? null : null,
  }));
}

/** The model that gave the last answer of a saved conversation, for the footer note. */
export function lastModel(messages: readonly unknown[]): ChatModelNote | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as Partial<StoredMessage> | null;
    if (message?.role === 'assistant' && message.model) return message.model;
  }
  return null;
}

/** "Today 14:05" for chats from today, the date and time for older ones. */
export function describeWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === now.toDateString() ? `Today ${time}` : `${date.toLocaleDateString()} ${time}`;
}
