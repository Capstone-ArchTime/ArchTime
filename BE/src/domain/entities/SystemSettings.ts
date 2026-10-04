export interface IApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
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
  updatedAt: Date;
  updatedBy?: string;
}
