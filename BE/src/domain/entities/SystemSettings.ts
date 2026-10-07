export interface IApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface ILlmScoringSettings {
  preset: "balanced" | "quality" | "budget" | "custom";
  weights?: { quality: number; stability: number; latency: number; cost: number; tokens: number };
  windowDays: number;
}

export interface ISystemSettings {
  id: string;
  maxConcurrentJobs: number;
  maxRepoSizeMb: number;
  miningTimeoutMinutes: number;
  defaultLlmProvider: "gemini" | "claude" | "openai" | "none";
  maintenanceMode: boolean;
  allowPublicRegistration: boolean;
  apiKeys: IApiKey[];
  /** Registry id of the model used when a user does not pick one. */
  defaultModelId?: string | null;
  /** Whether users may pick a model themselves; otherwise the default is always used. */
  allowUserModelChoice: boolean;
  /** How models are ranked (see domain/architecture/llm/metrics.ts). */
  scoring: ILlmScoringSettings;
  updatedAt: Date;
  updatedBy?: string;
}
