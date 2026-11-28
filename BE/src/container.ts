import { ProjectModel } from "./infrastructure/database/models/ProjectModel.js";
import { BillingUseCases, type PaymentGateway } from "./application/use-cases/billing/BillingUseCases.js";
import type { Gateway } from "./domain/billing/billing.js";
import { MomoGateway, PayosGateway, SimulatorGateway, VnpayGateway } from "./infrastructure/billing/gateways.js";
import { MongoOrderStore, mongoAccountStore, mongoSettingsStore } from "./infrastructure/repositories/MongoBillingStores.js";
import { AiCreditService, invitationTtlMs } from "./infrastructure/services/AiCreditService.js";
import { BillingController } from "./presentation/controllers/BillingController.js";import { ViewerAccessUseCase } from "./application/use-cases/projects/ViewerAccessUseCase.js";
import { env } from "./config/env.js";

// ── Infrastructure ──
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoOtpRepository } from "./infrastructure/repositories/MongoOtpRepository.js";
import { MongoProjectRepository } from "./infrastructure/repositories/MongoProjectRepository.js";
import { MongoRateLimiter } from "./infrastructure/repositories/MongoRateLimiter.js";
import { OtpCodeService } from "./infrastructure/services/OtpCodeService.js";
import { BcryptHasher } from "./infrastructure/services/BcryptHasher.js";
import { JwtTokenService } from "./infrastructure/services/JwtTokenService.js";
import { NodemailerEmailService } from "./infrastructure/services/NodemailerEmailService.js";

// ── Application ──
import { PasswordResetUseCase } from "./application/use-cases/PasswordResetUseCase.js";
import { ChangePasswordUseCase } from "./application/use-cases/ChangePasswordUseCase.js";
import { UpdateProfileUseCase } from "./application/use-cases/UpdateProfileUseCase.js";
import { LogoutAllDevicesUseCase } from "./application/use-cases/LogoutAllDevicesUseCase.js";
import { SetPasswordUseCase } from "./application/use-cases/SetPasswordUseCase.js";
import { RegisterUseCase } from "./application/use-cases/RegisterUseCase.js";
import { VerifyEmailUseCase } from "./application/use-cases/VerifyEmailUseCase.js";
import { ResendOtpUseCase } from "./application/use-cases/ResendOtpUseCase.js";
import { LoginUseCase } from "./application/use-cases/LoginUseCase.js";
import { RefreshTokenUseCase } from "./application/use-cases/RefreshTokenUseCase.js";
import { GetCurrentUserUseCase } from "./application/use-cases/GetCurrentUserUseCase.js";
import { RegisterProjectUseCase } from "./application/use-cases/projects/RegisterProjectUseCase.js";
import { CompareSnapshotsUseCase } from "./application/use-cases/projects/CompareSnapshotsUseCase.js";
import { GetAllProjectsUseCase } from "./application/use-cases/projects/GetAllProjectsUseCase.js";
import { DeleteProjectUseCase } from "./application/use-cases/projects/DeleteProjectUseCase.js";
import { MineProjectUseCase } from "./application/use-cases/projects/MineProjectUseCase.js";
import { GetSnapshotsUseCase } from "./application/use-cases/projects/GetSnapshotsUseCase.js";
import { GetMiningJobsUseCase } from "./application/use-cases/projects/GetMiningJobsUseCase.js";
import { MiningWorkflowUseCase } from "./application/use-cases/projects/MiningWorkflowUseCase.js";
import { ArchitectureUseCase } from "./application/use-cases/projects/ArchitectureUseCase.js";
import { GetEvidencesUseCase } from "./application/use-cases/projects/GetEvidencesUseCase.js";

// ── Presentation ──
import { AuthController } from "./presentation/controllers/AuthController.js";
import { ProjectController } from "./presentation/controllers/ProjectController.js";

// ── Member / Team ──
import { MongoProjectMemberRepository } from "./infrastructure/repositories/MongoProjectMemberRepository.js";
import { InviteProjectMemberUseCase } from "./application/use-cases/members/InviteProjectMemberUseCase.js";
import { GetProjectMembersUseCase } from "./application/use-cases/members/GetProjectMembersUseCase.js";
import { UpdateProjectMemberRoleUseCase } from "./application/use-cases/members/UpdateProjectMemberRoleUseCase.js";
import { RemoveProjectMemberUseCase } from "./application/use-cases/members/RemoveProjectMemberUseCase.js";
import { GetTeamMembersUseCase } from "./application/use-cases/members/GetTeamMembersUseCase.js";
import { MemberController } from "./presentation/controllers/MemberController.js";
import { createProjectRoleMiddleware } from "./presentation/middlewares/projectRole.js";
import { ProjectAccessPolicy } from "./application/services/ProjectAccessPolicy.js";

// ── Organizations ──
import { MongoOrganizationRepository } from "./infrastructure/repositories/MongoOrganizationRepository.js";
import { MongoOrganizationCredentialRepository } from "./infrastructure/repositories/MongoOrganizationCredentialRepository.js";
import { OrganizationUseCases } from "./application/use-cases/organizations/OrganizationUseCases.js";
import { MongoPendingInvitationStore } from "./infrastructure/repositories/MongoPendingInvitationStore.js";
import { GetAdminOrganizationsUseCase, SuspendOrganizationUseCase } from "./application/use-cases/admin/GetAdminOrganizationsUseCase.js";
import { AdminOrganizationController } from "./presentation/controllers/AdminOrganizationController.js";
import { OrganizationCredentialUseCases } from "./application/use-cases/organizations/OrganizationCredentialUseCases.js";
import { OrganizationController } from "./presentation/controllers/OrganizationController.js";

// ── Onboarding paths ──
import { MongoPathStore, MongoAssignmentStore } from "./infrastructure/repositories/MongoOnboardingStores.js";
import { createOnboardingDeps } from "./infrastructure/services/OnboardingDeps.js";
import { OnboardingPathUseCases } from "./application/use-cases/onboarding/OnboardingPathUseCases.js";
import { OnboardingLearningUseCases } from "./application/use-cases/onboarding/OnboardingLearningUseCases.js";
import { OnboardingController } from "./presentation/controllers/OnboardingController.js";

// ─────────────────────────────────────────
// Infrastructure instances
// ─────────────────────────────────────────
export const userRepository = new MongoUserRepository();
export const otpRepository = new MongoOtpRepository();
/** Counts hits across every server instance (the sign-in and e-mail-code routes use it). */
export const rateLimiter = new MongoRateLimiter();
const otpCodes = new OtpCodeService(env.otpPepper);
export const projectRepository = new MongoProjectRepository();
export const memberRepository = new MongoProjectMemberRepository();
export const organizationRepository = new MongoOrganizationRepository();
const organizationCredentialRepository = new MongoOrganizationCredentialRepository();
/** One set of project permission rules (system overview §4) for every route that is not guarded by checkRole. */
export const projectAccessPolicy = new ProjectAccessPolicy(projectRepository, memberRepository, organizationRepository);
const bcryptHasher = new BcryptHasher();

// ── Organizations ──
const organizationUseCases = new OrganizationUseCases(organizationRepository, userRepository, projectRepository, memberRepository, new MongoPendingInvitationStore(),
  (organizationId, insert) => AiCreditService.reserveSeat(organizationId, insert), invitationTtlMs());
const organizationCredentialUseCases = new OrganizationCredentialUseCases(organizationUseCases, organizationCredentialRepository, projectRepository);
export const organizationController = new OrganizationController(organizationUseCases, organizationCredentialUseCases, async organizationId => {
  const projects = await ProjectModel.find({ organizationId }).select("name").sort({ name: 1 }).lean<{ _id: unknown; name: string }[]>();
  return onboardingPathUseCases.organizationProgress(projects.map(p => ({ id: String(p._id), name: p.name })));
});

// ── Onboarding paths ──
const onboardingPaths = new MongoPathStore();
const onboardingAssignments = new MongoAssignmentStore();
const onboardingDeps = createOnboardingDeps(memberRepository, organizationRepository);
const onboardingPathUseCases = new OnboardingPathUseCases(onboardingPaths, onboardingAssignments, onboardingDeps);
export const onboardingController = new OnboardingController(
  onboardingPathUseCases,
  new OnboardingLearningUseCases(onboardingPaths, onboardingAssignments, onboardingDeps),
);
const jwtTokenService = new JwtTokenService(
  env.jwtSecret,
  env.jwtExpiresIn,
  env.jwtRefreshExpiresIn,
);
const emailService = new NodemailerEmailService(
  env.smtpFrom,
  env.smtpHost,
  env.smtpPort,
  env.smtpUser,
  env.smtpPass,
);

// ── Plans, AI credit & payments (FE-17) ──
const billingGateways: Partial<Record<Gateway, PaymentGateway>> = {};
const momoKeys = env.momo.partnerCode && env.momo.accessKey && env.momo.secretKey ? { partnerCode: env.momo.partnerCode, accessKey: env.momo.accessKey, secretKey: env.momo.secretKey } : undefined;
const vnpayKeys = env.vnpay.tmnCode && env.vnpay.hashSecret ? { tmnCode: env.vnpay.tmnCode, hashSecret: env.vnpay.hashSecret } : undefined;
const payosKeys = env.payos.clientId && env.payos.apiKey && env.payos.checksumKey ? { clientId: env.payos.clientId, apiKey: env.payos.apiKey, checksumKey: env.payos.checksumKey } : undefined;
// The gateways need absolute addresses: MoMo posts its IPN to the API, and both send the buyer back to the web client.
const webUrl = env.corsOrigin.split(",")[0].trim().replace(/\/+$/, "");
if (momoKeys) billingGateways.momo = new MomoGateway(momoKeys, env.momo.endpoint, `${env.publicApiUrl.replace(/\/+$/, "")}/billing/momo/ipn`);
if (vnpayKeys) billingGateways.vnpay = new VnpayGateway(vnpayKeys, env.vnpay.payUrl, env.vnpay.apiUrl);
if (payosKeys) billingGateways.payos = new PayosGateway(payosKeys, env.payos.endpoint);
if (env.billingSimulator) billingGateways.simulator = new SimulatorGateway(webUrl);
export const billingUseCases = new BillingUseCases({
  orders: new MongoOrderStore(), accounts: mongoAccountStore, settings: mongoSettingsStore, gateways: billingGateways,
  usedThisMonth: (space, now) => AiCreditService.usedThisMonth(space, now),
  usage: space => AiCreditService.usage(space),
  billingContacts: async space => {
    const ids = space.kind === "personal" ? [space.userId]
      : (await organizationRepository.listMembers(space.organizationId)).filter(m => m.role === "owner" && m.status !== "invited").map(m => m.userId);
    const users = await Promise.all(ids.map(id => userRepository.findById(id)));
    return users.filter((u): u is NonNullable<typeof u> => !!u).map(u => ({ email: u.email, name: u.name }));
  },
  requireOrganizationOwner: async (organizationId, userId) => { await organizationUseCases.requireOwner(organizationId, userId); },
  isOrganizationMember: async (organizationId, userId) => !!(await organizationRepository.findMember(organizationId, userId)),
  organizationName: async organizationId => (await organizationRepository.findById(organizationId))?.name ?? null,
  userContact: async userId => { const u = await userRepository.findById(userId); return u ? { email: u.email, name: u.name } : null; },
  sendMail: (to, mail) => emailService.sendNotification(to, mail),
  returnUrl: `${webUrl}/billing/result`,
  billingUrl: `${webUrl}/billing`,
  now: () => new Date(),
});
/** Which payment methods are on, sandbox or live, and settings that would stop real payments from completing. */
export function billingGatewayReport(): string[] {
  const local = (url: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  const lines: string[] = [];
  if (momoKeys) lines.push(`[billing] MoMo on, ${/test-payment\.momo\.vn/.test(env.momo.endpoint) ? "SANDBOX" : "LIVE"} (${env.momo.endpoint}); IPN ${env.publicApiUrl}/billing/momo/ipn`);
  if (vnpayKeys) lines.push(`[billing] VNPay on, ${/sandbox\.vnpay(ment|test)\.vn/.test(env.vnpay.payUrl) ? "SANDBOX" : "LIVE"} (${env.vnpay.payUrl}); set the IPN URL ${env.publicApiUrl}/billing/vnpay/ipn in the VNPay merchant portal`);
  if (payosKeys) lines.push(`[billing] payOS on, LIVE: real bank transfers (${env.payos.endpoint}); set the webhook URL ${env.publicApiUrl}/billing/payos/webhook in the payOS payment channel`);
  if (env.billingSimulator) lines.push("[billing] Test gateway on (BILLING_SIMULATOR=true): nothing is charged");
  if (!lines.length) lines.push("[billing] No payment method configured: set MOMO_*, VNPAY_* or PAYOS_* in .env");
  if ((momoKeys || vnpayKeys || payosKeys) && local(env.publicApiUrl)) {
    lines.push("[billing] PUBLIC_API_URL is a local address: gateways cannot send IPNs here; payments are settled from the return page and by reconciliation instead");
  }
  if ((momoKeys || vnpayKeys || payosKeys) && local(webUrl) && process.env.NODE_ENV === "production") {
    lines.push("[billing] WARNING: CORS_ORIGIN (the return address) is local in production");
  }
  return lines;
}

export const billingController = new BillingController(billingUseCases, { momo: momoKeys, vnpay: vnpayKeys, payos: payosKeys, simulator: env.billingSimulator });

// ─────────────────────────────────────────
// Use Cases
// ─────────────────────────────────────────
const registerUseCase = new RegisterUseCase(
  userRepository,
  otpRepository,
  bcryptHasher,
  emailService,
  otpCodes,
);
const verifyEmailUseCase = new VerifyEmailUseCase(
  userRepository,
  otpRepository,
  jwtTokenService,
  otpCodes,
);
const resendOtpUseCase = new ResendOtpUseCase(
  userRepository,
  otpRepository,
  emailService,
  otpCodes,
);
const loginUseCase = new LoginUseCase(
  userRepository,
  bcryptHasher,
  jwtTokenService,
);
const refreshTokenUseCase = new RefreshTokenUseCase(
  userRepository,
  jwtTokenService,
);
const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepository);
import { GetProjectByIdUseCase } from "./application/use-cases/projects/GetProjectByIdUseCase.js";

const registerProjectUseCase = new RegisterProjectUseCase(
  projectRepository,
  memberRepository,
  userRepository,
  {
    requireOwner: (organizationId, userId) => organizationUseCases.requireOwner(organizationId, userId),
    requireCredential: (organizationId, credentialId) => organizationCredentialUseCases.requireCredential(organizationId, credentialId),
  },
  userId => AiCreditService.assertCanAddWorkspace(userId),
);
const getAllProjectsUseCase = new GetAllProjectsUseCase(
  projectRepository,
  memberRepository,
  projectAccessPolicy,
);
const getProjectByIdUseCase = new GetProjectByIdUseCase(
  projectRepository,
  memberRepository,
);
const deleteProjectUseCase = new DeleteProjectUseCase(projectRepository);
const mineProjectUseCase = new MineProjectUseCase();
const getSnapshotsUseCase = new GetSnapshotsUseCase();
const getMiningJobsUseCase = new GetMiningJobsUseCase(projectAccessPolicy);
const compareSnapshotsUseCase = new CompareSnapshotsUseCase();
const getEvidencesUseCase = new GetEvidencesUseCase();

const inviteProjectMemberUseCase = new InviteProjectMemberUseCase(
  memberRepository,
  projectRepository,
  userRepository,
  organizationRepository,
);
const getProjectMembersUseCase = new GetProjectMembersUseCase(
  memberRepository,
  projectRepository,
  userRepository,
);
const updateProjectMemberRoleUseCase = new UpdateProjectMemberRoleUseCase(
  memberRepository,
  projectRepository,
);
const removeProjectMemberUseCase = new RemoveProjectMemberUseCase(
  memberRepository,
  projectRepository,
);
const getTeamMembersUseCase = new GetTeamMembersUseCase(
  memberRepository,
  projectRepository,
  projectAccessPolicy,
);

// ─────────────────────────────────────────
// Controllers & Middlewares
// ─────────────────────────────────────────
export const authController = new AuthController(
  registerUseCase,
  verifyEmailUseCase,
  resendOtpUseCase,
  loginUseCase,
  refreshTokenUseCase,
  getCurrentUserUseCase,
  new PasswordResetUseCase(userRepository, emailService, bcryptHasher),
  new ChangePasswordUseCase(userRepository, bcryptHasher),
  new UpdateProfileUseCase(userRepository),
  new LogoutAllDevicesUseCase(userRepository),
  new SetPasswordUseCase(userRepository, bcryptHasher),
);

export const projectController = new ProjectController(
  registerProjectUseCase,
  getAllProjectsUseCase,
  deleteProjectUseCase,
  mineProjectUseCase,
  getSnapshotsUseCase,
  getMiningJobsUseCase,
  compareSnapshotsUseCase,
  getEvidencesUseCase,
  getProjectByIdUseCase,
  new MiningWorkflowUseCase(projectAccessPolicy),
  new ArchitectureUseCase(),
  new ViewerAccessUseCase(projectRepository),
);

// ── Workspace ──
import { MongoWorkspaceRepository } from "./infrastructure/repositories/MongoWorkspaceRepository.js";
import { GetProjectWorkspaceUseCase } from "./application/use-cases/workspace/GetProjectWorkspaceUseCase.js";
import { SaveProjectWorkspaceUseCase } from "./application/use-cases/workspace/SaveProjectWorkspaceUseCase.js";
import { SetComponentPathsUseCase } from "./application/use-cases/workspace/SetComponentPathsUseCase.js";
import { latestMinedCommit } from "./infrastructure/services/latestCommit.js";
import { WorkspaceController } from "./presentation/controllers/WorkspaceController.js";

export const workspaceRepository = new MongoWorkspaceRepository();
const getProjectWorkspaceUseCase = new GetProjectWorkspaceUseCase(
  workspaceRepository,
  projectRepository,
  userRepository,
);
const saveProjectWorkspaceUseCase = new SaveProjectWorkspaceUseCase(
  workspaceRepository,
  projectRepository,
  userRepository,
  latestMinedCommit,
);

export const workspaceController = new WorkspaceController(
  getProjectWorkspaceUseCase,
  saveProjectWorkspaceUseCase,
  new SetComponentPathsUseCase(workspaceRepository, projectRepository),
);

export const memberController = new MemberController(
  inviteProjectMemberUseCase,
  getProjectMembersUseCase,
  updateProjectMemberRoleUseCase,
  removeProjectMemberUseCase,
  getTeamMembersUseCase,
);

export const projectRoleMiddleware = createProjectRoleMiddleware(
  projectRepository,
  memberRepository,
  organizationRepository,
);

// ── Admin ──
import { GetAdminUsersUseCase } from "./application/use-cases/admin/GetAdminUsersUseCase.js";
import { UpdateUserRoleUseCase } from "./application/use-cases/admin/UpdateUserRoleUseCase.js";
import { SuspendUserUseCase } from "./application/use-cases/admin/SuspendUserUseCase.js";
import { ReactivateUserUseCase } from "./application/use-cases/admin/ReactivateUserUseCase.js";
import { InviteUserUseCase } from "./application/use-cases/admin/InviteUserUseCase.js";
import { AdminUserController } from "./presentation/controllers/AdminUserController.js";

import { GetAdminJobsUseCase } from "./application/use-cases/admin/GetAdminJobsUseCase.js";
import { CancelAdminJobUseCase } from "./application/use-cases/admin/CancelAdminJobUseCase.js";
import { AdminJobController } from "./presentation/controllers/AdminJobController.js";

import { GetAdminAuditLogsUseCase } from "./application/use-cases/admin/GetAdminAuditLogsUseCase.js";
import { AdminAuditController } from "./presentation/controllers/AdminAuditController.js";

import { GetAdminSettingsUseCase } from "./application/use-cases/admin/GetAdminSettingsUseCase.js";
import { UpdateAdminSettingsUseCase } from "./application/use-cases/admin/UpdateAdminSettingsUseCase.js";
import { CreateAdminApiKeyUseCase } from "./application/use-cases/admin/CreateAdminApiKeyUseCase.js";
import { RevokeAdminApiKeyUseCase } from "./application/use-cases/admin/RevokeAdminApiKeyUseCase.js";
import { AdminSettingsController } from "./presentation/controllers/AdminSettingsController.js";

import { GetAdminMetricsUseCase } from "./application/use-cases/admin/GetAdminMetricsUseCase.js";
import { GetAdminServicesStatusUseCase } from "./application/use-cases/admin/GetAdminServicesStatusUseCase.js";
import { GetAdminLogsUseCase } from "./application/use-cases/admin/GetAdminLogsUseCase.js";
import { AdminMetricsController } from "./presentation/controllers/AdminMetricsController.js";
import type { AdminControllersConfig } from "./presentation/routes/admin.routes.js";

const getAdminUsersUseCase = new GetAdminUsersUseCase(userRepository);
const updateUserRoleUseCase = new UpdateUserRoleUseCase(userRepository);
const suspendUserUseCase = new SuspendUserUseCase(userRepository);
const reactivateUserUseCase = new ReactivateUserUseCase(userRepository);
const inviteUserUseCase = new InviteUserUseCase(
  userRepository,
  bcryptHasher,
  emailService,
);

export const adminUserController = new AdminUserController(
  getAdminUsersUseCase,
  updateUserRoleUseCase,
  suspendUserUseCase,
  reactivateUserUseCase,
  inviteUserUseCase,
);

export const adminJobController = new AdminJobController(
  new GetAdminJobsUseCase(),
  new CancelAdminJobUseCase(),
);

export const adminAuditController = new AdminAuditController(
  new GetAdminAuditLogsUseCase(),
);

export const adminSettingsController = new AdminSettingsController(
  new GetAdminSettingsUseCase(),
  new UpdateAdminSettingsUseCase(),
  new CreateAdminApiKeyUseCase(),
  new RevokeAdminApiKeyUseCase(),
);

export const adminMetricsController = new AdminMetricsController(
  new GetAdminMetricsUseCase(),
  new GetAdminServicesStatusUseCase(),
  new GetAdminLogsUseCase(),
);

// ── AI models (registry, usage, metrics) ──
import { AdminLlmUseCases, UserLlmUseCases } from "./application/use-cases/llm/LlmUseCases.js";
import { AdminLlmController, LlmController } from "./presentation/controllers/LlmController.js";

export const llmController = new LlmController(new UserLlmUseCases(projectAccessPolicy));
import { ProjectChatUseCase } from "./application/use-cases/llm/ProjectChatUseCase.js";
import { CheckConformanceUseCase, DecideFindingUseCase, ExplainFindingUseCase, ListConformanceUseCase, UnreadFindingsUseCase } from "./application/use-cases/conformance/ConformanceUseCases.js";
import { FindingNotifier, conformanceAfterMining, newFindingsOf } from "./application/use-cases/conformance/FindingNotifier.js";
import { NotificationUseCases, findingAlerts } from "./application/use-cases/notifications/NotificationUseCases.js";
import { MongoNotificationRepository } from "./infrastructure/repositories/MongoNotificationRepository.js";
import { NotificationHub } from "./infrastructure/services/NotificationHub.js";
import { NotificationController } from "./presentation/controllers/NotificationController.js";
import { RepositoryWatcher, watchIntervalMinutes } from "./infrastructure/services/RepositoryWatcher.js";
import { loadWatchCandidates } from "./infrastructure/services/watchCandidates.js";
import { mongoConformanceDirectory } from "./infrastructure/services/ConformanceDirectory.js";
import { MiningService } from "./infrastructure/services/MiningService.js";
import { JobKind, MiningJobModel } from "./infrastructure/database/models/MiningJobModel.js";
import { AgentContextUseCases, AgentTokenUseCases } from "./application/use-cases/agent/AgentUseCases.js";
import { MongoAgentTokenRepository } from "./infrastructure/repositories/MongoAgentTokenRepository.js";
import { AgentController } from "./presentation/controllers/AgentController.js";
import { AuditService } from "./infrastructure/services/AuditService.js";
import { TransferProjectUseCase } from "./application/use-cases/projects/TransferProjectUseCase.js";
import { MongoConformanceRepository, mongoConformanceSnapshots } from "./infrastructure/repositories/MongoConformanceRepository.js";
import { ConformanceController } from "./presentation/controllers/ConformanceController.js";
import { LlmModelRegistry } from "./infrastructure/llm/registry.js";
import { LlmRunService } from "./infrastructure/services/LlmRunService.js";
import type { LlmUsage } from "./domain/architecture/llm/types.js";
import { ChatHistoryUseCases } from "./application/use-cases/llm/ChatHistoryUseCases.js";
import { ProjectChatController } from "./presentation/controllers/ProjectChatController.js";
const chatHistory = new ChatHistoryUseCases();
export const projectChatController = new ProjectChatController(new ProjectChatUseCase(chatHistory), chatHistory);

// ── Conformance check (RF-08, UC-40, UC-41) ──
const conformanceRepository = new MongoConformanceRepository();
/** The configured model; each explanation is logged as an AI run of the project, as a mentor answer is. */
const explainModel = async (projectId: string, userId: string) => {
  await AiCreditService.assertAvailable(projectId);
  const resolved = await LlmModelRegistry.resolve();
  return {
    client: resolved.client,
    record: async (run: { usage: LlmUsage | null; status: "accepted" | "failed"; errorKind?: string; latencyMs: number; wallMs: number }) => {
      await LlmRunService.recordChat({ projectId, userId, model: resolved, ...run });
    },
  };
};
export const checkConformanceUseCase = new CheckConformanceUseCase(workspaceRepository, mongoConformanceSnapshots, conformanceRepository);
// After every fetch or mine: check, then e-mail what is new (RF-29, BR-34); maintainers can also send it at once from the
// findings page. The link opens the first allowed origin.
export const findingNotifier = new FindingNotifier(
  conformanceRepository,
  mongoConformanceDirectory,
  (to, mail) => emailService.sendNotification(to, mail),
  env.corsOrigin.split(",")[0].trim(),
);
/** The latest background check of a project, for the findings page to follow. */
const latestCheckJob = async (projectId: string) => {
  const job = await MiningJobModel.findOne({ projectId, kind: JobKind.CONFORMANCE }).sort({ createdAt: -1 })
    .select("status progress stage error finishedAt").lean<{ _id: unknown; status: string; progress?: number; stage?: string; error?: string; finishedAt?: Date }>();
  return job ? { id: String(job._id), status: job.status, progress: job.progress ?? 0, stage: job.stage ?? "", error: job.error ?? null, finishedAt: job.finishedAt ?? null } : null;
};
export const conformanceController = new ConformanceController(
  checkConformanceUseCase,
  new ListConformanceUseCase(workspaceRepository, conformanceRepository, latestCheckJob),
  new DecideFindingUseCase(conformanceRepository),
  new ExplainFindingUseCase(conformanceRepository, workspaceRepository, explainModel),
  new UnreadFindingsUseCase(projectAccessPolicy, conformanceRepository),
  findingNotifier,
  (projectId, userId, force) => MiningService.startConformanceJob(projectId, userId, force),
);
// ── In-app notifications: the bell in the header, pushed as they happen ──
export const notificationHub = new NotificationHub();
const notificationUseCases = new NotificationUseCases(new MongoNotificationRepository(), notificationHub);
export const notificationController = new NotificationController(notificationUseCases, notificationHub);
/** New findings ring the bell of everyone who answers for the workspace (the same people the e-mail goes to). */
const alertFindings = findingAlerts(mongoConformanceDirectory, notificationUseCases);

MiningService.onHistoryChanged = conformanceAfterMining(checkConformanceUseCase, findingNotifier, alertFindings);
// "Run check" runs as a background job: the page answers at once, progress shows on the page and in the header.
MiningService.conformanceRunner = async (projectId, options) => {
  const summary = await checkConformanceUseCase.execute(projectId, options);
  const findings = newFindingsOf(summary);
  await alertFindings(projectId, findings).catch(error => console.error(`[notifications] could not notify about findings of project ${projectId}:`, error));
  return { checked: summary.checked.length, skipped: summary.skipped, findings };
};

// ── Automatic check: fetch, mine what is new and check it, every WATCH_INTERVAL_MINUTES (RepositoryWatcher) ──
export const repositoryWatcher = new RepositoryWatcher(
  watchIntervalMinutes() * 60 * 1000,
  loadWatchCandidates,
  (projectId, ownerId) => MiningService.startWatchJob(projectId, ownerId),
);

// ── Agent access (RF-09, UC-42 – UC-44 as in Report 3) ──
// ── Moving a personal workspace into an organization (RF-11, UC-29) ──
export const transferProjectUseCase = new TransferProjectUseCase(projectRepository, organizationRepository, memberRepository,
  entry => AuditService.log({ ...entry, targetType: "project" }));

export const agentController = new AgentController(
  new AgentTokenUseCases(new MongoAgentTokenRepository(), projectRepository, entry => AuditService.log({ ...entry, targetType: "project" })),
  new AgentContextUseCases(workspaceRepository, projectRepository, env.publicApiUrl, organizationRepository,
    { tasks: new MongoTaskRepository(), commits: mongoCommitArchitecture }),
);
export const adminLlmController = new AdminLlmController(new AdminLlmUseCases());

// RF-14, UC-25: organizations for System Administrators (metadata only) and their temporary suspension.
const adminOrganizationsUseCase = new GetAdminOrganizationsUseCase(organizationRepository, projectRepository, userRepository);
const adminOrganizationController = new AdminOrganizationController(
  adminOrganizationsUseCase,
  new SuspendOrganizationUseCase(organizationRepository, adminOrganizationsUseCase, entry => AuditService.log({ ...entry, targetType: "organization" })),
);

export const adminControllersConfig: AdminControllersConfig = {
  userController: adminUserController,
  jobController: adminJobController,
  auditController: adminAuditController,
  settingsController: adminSettingsController,
  metricsController: adminMetricsController,
  llmController: adminLlmController,
  organizationController: adminOrganizationController,
};

// ── Project Maintainer (PM) ──
import { GetProjectDashboardUseCase } from "./application/use-cases/pm/GetProjectDashboardUseCase.js";
import { GetProjectDiagramUseCase } from "./application/use-cases/pm/GetProjectDiagramUseCase.js";
import {
  SaveProjectDiagramUseCase,
  ConfirmProjectDiagramUseCase,
  UnconfirmProjectDiagramUseCase,
} from "./application/use-cases/pm/SaveProjectDiagramUseCase.js";
import {
  GetProjectRulesUseCase,
  CreateProjectRuleUseCase,
  UpdateProjectRuleUseCase,
  DeleteProjectRuleUseCase,
  ToggleProjectRuleUseCase,
  EvaluateProjectRulesUseCase,
} from "./application/use-cases/pm/ProjectRulesUseCases.js";
import {
  GetProjectDecisionsUseCase,
  CreateProjectDecisionUseCase,
  GetProjectDecisionDetailUseCase,
  UpdateProjectDecisionUseCase,
  DeleteProjectDecisionUseCase,
} from "./application/use-cases/pm/ProjectDecisionUseCases.js";
import {
  GetProjectApprovalsUseCase,
  CreateApprovalRequestUseCase,
  GetApprovalDetailUseCase,
  ApproveRequestUseCase,
  RejectRequestUseCase,
} from "./application/use-cases/pm/ApprovalQueueUseCases.js";
import {
  InviteProjectMemberTokenUseCase,
  GetProjectInvitationsUseCase,
  CancelProjectInvitationUseCase,
  AcceptProjectInvitationUseCase,
  DeclineProjectInvitationUseCase,
} from "./application/use-cases/pm/ProjectInvitationUseCases.js";
import {
  GetProjectReportsUseCase,
  GenerateProjectReportUseCase,
  GetProjectReportDetailUseCase,
} from "./application/use-cases/pm/ProjectReportUseCases.js";
import { ProjectMaintainerController } from "./presentation/controllers/ProjectMaintainerController.js";
import { MongoDecisionSourceVerifier } from "./infrastructure/services/MongoDecisionSourceVerifier.js";

const evaluateRulesUseCase = new EvaluateProjectRulesUseCase(workspaceRepository, projectRepository);
const decisionSourceVerifier = new MongoDecisionSourceVerifier();

export const projectMaintainerController = new ProjectMaintainerController({
  dashboardUseCase: new GetProjectDashboardUseCase(
    projectRepository,
    workspaceRepository,
    memberRepository,
    evaluateRulesUseCase,
  ),
  getDiagramUseCase: new GetProjectDiagramUseCase(workspaceRepository, projectRepository),
  saveDiagramUseCase: new SaveProjectDiagramUseCase(workspaceRepository, projectRepository),
  confirmDiagramUseCase: new ConfirmProjectDiagramUseCase(workspaceRepository, projectRepository, latestMinedCommit),
  unconfirmDiagramUseCase: new UnconfirmProjectDiagramUseCase(workspaceRepository, projectRepository),
  getRulesUseCase: new GetProjectRulesUseCase(workspaceRepository, projectRepository),
  createRuleUseCase: new CreateProjectRuleUseCase(workspaceRepository, projectRepository),
  updateRuleUseCase: new UpdateProjectRuleUseCase(workspaceRepository, projectRepository),
  deleteRuleUseCase: new DeleteProjectRuleUseCase(workspaceRepository, projectRepository),
  toggleRuleUseCase: new ToggleProjectRuleUseCase(workspaceRepository, projectRepository),
  evaluateRulesUseCase,
  getDecisionsUseCase: new GetProjectDecisionsUseCase(workspaceRepository, projectRepository),
  createDecisionUseCase: new CreateProjectDecisionUseCase(workspaceRepository, projectRepository, decisionSourceVerifier),
  getDecisionDetailUseCase: new GetProjectDecisionDetailUseCase(workspaceRepository, projectRepository),
  updateDecisionUseCase: new UpdateProjectDecisionUseCase(workspaceRepository, projectRepository, decisionSourceVerifier),
  deleteDecisionUseCase: new DeleteProjectDecisionUseCase(workspaceRepository, projectRepository),
  getApprovalsUseCase: new GetProjectApprovalsUseCase(projectRepository),
  createApprovalUseCase: new CreateApprovalRequestUseCase(projectRepository),
  getApprovalDetailUseCase: new GetApprovalDetailUseCase(),
  approveRequestUseCase: new ApproveRequestUseCase(workspaceRepository, latestMinedCommit),
  rejectRequestUseCase: new RejectRequestUseCase(),
  inviteMemberTokenUseCase: new InviteProjectMemberTokenUseCase(
    projectRepository,
    memberRepository,
    userRepository,
    emailService,
    env.corsOrigin,
    organizationRepository,
  ),
  getInvitationsUseCase: new GetProjectInvitationsUseCase(),
  cancelInvitationUseCase: new CancelProjectInvitationUseCase(),
  acceptInvitationUseCase: new AcceptProjectInvitationUseCase(memberRepository, userRepository, projectRepository, organizationRepository),
  declineInvitationUseCase: new DeclineProjectInvitationUseCase(),
  getReportsUseCase: new GetProjectReportsUseCase(projectRepository),
  generateReportUseCase: new GenerateProjectReportUseCase(projectRepository, workspaceRepository),
  getReportDetailUseCase: new GetProjectReportDetailUseCase(),
});

export { jwtTokenService };

// ── Project tasks & sprints (F-13, RF-07, UC-36 – UC-39) ──
import { ClearTasksUseCase, ImportTasksUseCase, LinkCommitsToTasksUseCase, ListTasksUseCase, TaskImpactUseCase } from "./application/use-cases/tasks/TaskUseCases.js";
import { MongoTaskRepository, mongoCommitArchitecture, mongoMinedCommits } from "./infrastructure/repositories/MongoTaskRepository.js";
import type { TaskUseCases } from "./presentation/routes/task.routes.js";
import { JiraConnectionUseCases } from "./application/use-cases/tasks/JiraUseCases.js";
import { MongoJiraConnectionRepository } from "./infrastructure/repositories/MongoJiraConnectionRepository.js";
import { JiraCloudClient } from "./infrastructure/jira/JiraCloudClient.js";
const taskRepository = new MongoTaskRepository();
const linkCommitsToTasksUseCase = new LinkCommitsToTasksUseCase(taskRepository, mongoMinedCommits);
const importTasksUseCase = new ImportTasksUseCase(taskRepository, linkCommitsToTasksUseCase);
export const taskUseCases: TaskUseCases = {
  list: new ListTasksUseCase(taskRepository),
  importTasks: importTasksUseCase,
  jira: new JiraConnectionUseCases(new MongoJiraConnectionRepository(), new JiraCloudClient(), importTasksUseCase),
  link: linkCommitsToTasksUseCase,
  impact: new TaskImpactUseCase(taskRepository, mongoCommitArchitecture, workspaceRepository),
  clear: new ClearTasksUseCase(taskRepository),
};
// After every mined batch: link its commits to the tasks they name (ARCH-12, T22).
MiningService.onBatchSaved = (projectId, commits) => linkCommitsToTasksUseCase.execute(projectId, commits);
