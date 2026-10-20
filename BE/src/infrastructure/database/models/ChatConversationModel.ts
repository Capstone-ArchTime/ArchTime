import mongoose, { type Model, Schema } from "mongoose";
import type { ChatCitations } from "../../../application/use-cases/llm/ProjectChatContext.js";

/** One message of a saved Project Chat conversation. Assistant messages keep the citations so the page can show them again. */
export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  evidence?: ChatCitations | null;
  model?: { name: string; host: string; external: boolean };
  usage?: { inputTokens: number; outputTokens: number };
  createdAt: Date;
}

/** A conversation one user had with the assistant about one project; only that user can read it back. */
export interface IChatConversation {
  projectId: string;
  userId: string;
  title: string;
  messages: IChatMessage[];
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IChatMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    evidence: { type: Schema.Types.Mixed, default: null },
    model: { type: new Schema({ name: String, host: String, external: Boolean }, { _id: false }), default: undefined },
    usage: { type: new Schema({ inputTokens: Number, outputTokens: Number }, { _id: false }), default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ChatConversationSchema = new Schema<IChatConversation>(
  {
    projectId: { type: String, required: true, ref: "Project" },
    userId: { type: String, required: true, ref: "User" },
    title: { type: String, required: true, trim: true },
    messages: { type: [MessageSchema], default: [] },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// "My conversations about this project, newest first" is the only list the pages ask for.
ChatConversationSchema.index({ projectId: 1, userId: 1, updatedAt: -1 });

export const ChatConversationModel: Model<IChatConversation> = mongoose.model<IChatConversation>(
  "ChatConversation",
  ChatConversationSchema,
);
