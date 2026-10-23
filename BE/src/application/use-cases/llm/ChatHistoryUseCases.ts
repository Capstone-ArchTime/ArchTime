import { ChatConversationModel, type IChatMessage } from "../../../infrastructure/database/models/ChatConversationModel.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";
import type { ChatCitations } from "./ProjectChatContext.js";

/** One exchange is two messages; a conversation stops growing here so a single document stays small. */
export const MAX_STORED_MESSAGES = 100;
const TITLE_CHARS = 80;
const LIST_LIMIT = 50;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** The first question, on one line, is what the history list shows. */
export function conversationTitle(firstQuestion: string): string {
  const flat = firstQuestion.replace(/\s+/g, " ").trim();
  if (!flat) return "Untitled chat";
  return flat.length > TITLE_CHARS ? `${flat.slice(0, TITLE_CHARS - 1)}…` : flat;
}

/** The conversation a browser asked to continue, or null when it is starting a new one. */
export function parseConversationId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !OBJECT_ID.test(value)) throw new BadRequestError("conversationId is not valid.");
  return value;
}

export interface SavedAnswer {
  content: string;
  evidence: ChatCitations | null;
  model: { name: string; host: string; external: boolean };
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface ConversationSummary { id: string; title: string; messageCount: number; createdAt: Date; updatedAt: Date }
export interface ConversationDetail extends ConversationSummary {
  messages: { role: "user" | "assistant"; content: string; evidence: ChatCitations | null; model: IChatMessage["model"] | null; createdAt: Date }[];
}

type Row = { _id: unknown; title: string; messageCount?: number; createdAt: Date; updatedAt: Date; messages?: IChatMessage[] };
const summaryOf = (row: Row): ConversationSummary => ({
  id: String(row._id), title: row.title, messageCount: row.messageCount ?? row.messages?.length ?? 0, createdAt: row.createdAt, updatedAt: row.updatedAt,
});

/**
 * Saved Project Chat conversations. Every query is scoped to the project and to the user who had the conversation,
 * so nobody reads or deletes another person's chat, whatever id they send.
 */
export class ChatHistoryUseCases {
  /** Checked before the model is asked, so a wrong id or a full conversation costs nothing. */
  async assertCanAppend(conversationId: string, projectId: string, userId: string): Promise<void> {
    const row = await ChatConversationModel.findOne({ _id: conversationId, projectId, userId }).select("messageCount").lean<{ messageCount?: number } | null>();
    if (!row) throw new NotFoundError("Conversation not found.");
    if ((row.messageCount ?? 0) + 2 > MAX_STORED_MESSAGES) throw new BadRequestError("This conversation is full. Start a new chat to keep asking.");
  }

  /** Adds one question and its answer, creating the conversation when there is none yet. */
  async append(input: { conversationId: string | null; projectId: string; userId: string; question: string; askedAt: Date; answer: SavedAnswer }): Promise<{ id: string; title: string }> {
    const entries = [
      { role: "user", content: input.question, createdAt: input.askedAt },
      {
        role: "assistant", content: input.answer.content, evidence: input.answer.evidence, createdAt: new Date(),
        model: input.answer.model, ...(input.answer.usage ? { usage: input.answer.usage } : {}),
      },
    ] as IChatMessage[];

    if (input.conversationId) {
      const row = await ChatConversationModel.findOneAndUpdate(
        { _id: input.conversationId, projectId: input.projectId, userId: input.userId, messageCount: { $lte: MAX_STORED_MESSAGES - 2 } },
        { $push: { messages: { $each: entries } }, $inc: { messageCount: 2 } },
        { new: true },
      ).select("title").lean<{ _id: unknown; title: string } | null>();
      if (!row) throw new NotFoundError("Conversation not found.");
      return { id: String(row._id), title: row.title };
    }
    const created = await ChatConversationModel.create({
      projectId: input.projectId, userId: input.userId, title: conversationTitle(input.question), messages: entries, messageCount: entries.length,
    });
    return { id: String(created._id), title: created.title };
  }

  async list(projectId: string, userId: string): Promise<ConversationSummary[]> {
    const rows = await ChatConversationModel.find({ projectId, userId }).sort({ updatedAt: -1 }).limit(LIST_LIMIT)
      .select("title messageCount createdAt updatedAt").lean<Row[]>();
    return rows.map(summaryOf);
  }

  async get(projectId: string, userId: string, conversationId: string): Promise<ConversationDetail> {
    if (!OBJECT_ID.test(conversationId)) throw new NotFoundError("Conversation not found.");
    const row = await ChatConversationModel.findOne({ _id: conversationId, projectId, userId }).lean<Row | null>();
    if (!row) throw new NotFoundError("Conversation not found.");
    return {
      ...summaryOf(row),
      messages: (row.messages ?? []).map(m => ({ role: m.role, content: m.content, evidence: m.evidence ?? null, model: m.model ?? null, createdAt: m.createdAt })),
    };
  }

  async remove(projectId: string, userId: string, conversationId: string): Promise<void> {
    if (!OBJECT_ID.test(conversationId)) throw new NotFoundError("Conversation not found.");
    const result = await ChatConversationModel.deleteOne({ _id: conversationId, projectId, userId });
    if (result.deletedCount === 0) throw new NotFoundError("Conversation not found.");
  }
}
