import { EvidenceModel } from "../../../infrastructure/database/models/EvidenceModel.js";

export class GetEvidencesUseCase {
  public async execute(projectId: string): Promise<any[]> {
    const evidences = await EvidenceModel.find({ projectId }).sort({ date: -1 }).lean();
    return evidences.map(e => ({
      ...e,
      id: e._id.toString(),
      _id: undefined
    }));
  }
}
