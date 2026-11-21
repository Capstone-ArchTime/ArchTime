import mongoose, { Schema } from "mongoose";

// The Jira Cloud connection of a workspace (F-13): one per project. The API token is stored encrypted (AES-256-GCM,
// infrastructure/llm/secrets.ts) and never selected unless a sync needs it.

const JiraConnectionSchema = new Schema(
  {
    projectId: { type: String, required: true, unique: true },
    site: { type: String, required: true },
    email: { type: String, required: true },
    jql: { type: String, required: true },
    tokenSecret: {
      type: new Schema({ ciphertext: String, iv: String, tag: String }, { _id: false }),
      required: true,
      select: false,
    },
    tokenLast4: { type: String, default: "" },
    lastSyncAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "project_jira_connections" },
);

export const JiraConnectionModel = mongoose.models.JiraConnection || mongoose.model("JiraConnection", JiraConnectionSchema);
