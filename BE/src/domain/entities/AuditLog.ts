export enum AuditAction {
  USER_LOGIN = "USER_LOGIN",
  USER_INVITE = "USER_INVITE",
  USER_ROLE_CHANGE = "USER_ROLE_CHANGE",
  USER_SUSPEND = "USER_SUSPEND",
  USER_REACTIVATE = "USER_REACTIVATE",
  PROJECT_CREATE = "PROJECT_CREATE",
  PROJECT_DELETE = "PROJECT_DELETE",
  JOB_CANCEL = "JOB_CANCEL",
  SETTINGS_UPDATE = "SETTINGS_UPDATE",
  API_KEY_CREATE = "API_KEY_CREATE",
  API_KEY_REVOKE = "API_KEY_REVOKE",
  LLM_MODEL_CREATE = "LLM_MODEL_CREATE",
  LLM_MODEL_UPDATE = "LLM_MODEL_UPDATE",
  LLM_MODEL_DELETE = "LLM_MODEL_DELETE",
  LLM_MODEL_TEST = "LLM_MODEL_TEST",
  LLM_BENCHMARK_START = "LLM_BENCHMARK_START",
}

export interface IAuditLog {
  id: string;
  action: AuditAction | string;
  userId?: string;
  userEmail?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
