import type { IJiraConnectionRepository, JiraConnectionInput } from "../../domain/interfaces/IJiraConnectionRepository.js";
import type { JiraConnectionView } from "../../domain/tasks/jiraConnection.js";
import { JiraConnectionModel } from "../database/models/JiraConnectionModel.js";
import { seal, unseal } from "../llm/secrets.js";

const toView = (d: any): JiraConnectionView => ({
  site: d.site, email: d.email, jql: d.jql, tokenLast4: d.tokenLast4 ?? "", lastSyncAt: d.lastSyncAt ?? null, updatedAt: d.updatedAt,
});

export class MongoJiraConnectionRepository implements IJiraConnectionRepository {
  async find(projectId: string): Promise<JiraConnectionView | null> {
    const doc = await JiraConnectionModel.findOne({ projectId }).lean();
    return doc ? toView(doc) : null;
  }

  async token(projectId: string): Promise<string | null> {
    const doc = await JiraConnectionModel.findOne({ projectId }).select("+tokenSecret").lean<{ tokenSecret?: { ciphertext: string; iv: string; tag: string } }>();
    return doc?.tokenSecret?.ciphertext ? unseal(doc.tokenSecret) : null;
  }

  async save(projectId: string, input: JiraConnectionInput): Promise<JiraConnectionView> {
    // The plain token is encrypted before it reaches the database; without a new token the stored one is kept.
    const set: Record<string, unknown> = { site: input.site, email: input.email, jql: input.jql };
    if (input.token) {
      const { last4, ...secret } = seal(input.token);
      set.tokenSecret = secret;
      set.tokenLast4 = last4;
    }
    const doc = await JiraConnectionModel.findOneAndUpdate({ projectId }, { $set: set }, { upsert: true, new: true, runValidators: true }).lean();
    return toView(doc);
  }

  async remove(projectId: string): Promise<boolean> {
    return (await JiraConnectionModel.deleteOne({ projectId })).deletedCount > 0;
  }

  async markSynced(projectId: string, at: Date): Promise<void> {
    await JiraConnectionModel.updateOne({ projectId }, { $set: { lastSyncAt: at } });
  }
}
