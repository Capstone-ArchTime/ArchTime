import { env } from "./config/env.js";

// ── Infrastructure ──
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoOtpRepository } from "./infrastructure/repositories/MongoOtpRepository.js";
import { MongoProjectRepository } from "./infrastructure/repositories/MongoProjectRepository.js";
import { BcryptHasher } from "./infrastructure/services/BcryptHasher.js";
import { JwtTokenService } from "./infrastructure/services/JwtTokenService.js";
import { NodemailerEmailService } from "./infrastructure/services/NodemailerEmailService.js";

// ── Application ──
import { PasswordResetUseCase } from "./application/use-cases/PasswordResetUseCase.js";
import { ChangePasswordUseCase } from "./application/use-cases/ChangePasswordUseCase.js";
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

// ─────────────────────────────────────────
// Infrastructure instances
// ─────────────────────────────────────────
export const userRepository = new MongoUserRepository();
export const otpRepository = new MongoOtpRepository();
export const projectRepository = new MongoProjectRepository();
export const memberRepository = new MongoProjectMemberRepository();
const bcryptHasher = new BcryptHasher();
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

// ─────────────────────────────────────────
// Use Cases
// ─────────────────────────────────────────
const registerUseCase = new RegisterUseCase(
  userRepository,
  otpRepository,
  bcryptHasher,
  emailService,
);
const verifyEmailUseCase = new VerifyEmailUseCase(
  userRepository,
  otpRepository,
  jwtTokenService,
);
const resendOtpUseCase = new ResendOtpUseCase(
  userRepository,
  otpRepository,
  emailService,
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
);
const getAllProjectsUseCase = new GetAllProjectsUseCase(
  projectRepository,
  memberRepository,
);
const getProjectByIdUseCase = new GetProjectByIdUseCase(
  projectRepository,
  memberRepository,
);
const deleteProjectUseCase = new DeleteProjectUseCase(projectRepository);
const mineProjectUseCase = new MineProjectUseCase();
const getSnapshotsUseCase = new GetSnapshotsUseCase();
const getMiningJobsUseCase = new GetMiningJobsUseCase();
const compareSnapshotsUseCase = new CompareSnapshotsUseCase();
const getEvidencesUseCase = new GetEvidencesUseCase();

const inviteProjectMemberUseCase = new InviteProjectMemberUseCase(
  memberRepository,
  projectRepository,
  userRepository,
);
const getProjectMembersUseCase = new GetProjectMembersUseCase(
  memberRepository,
  projectRepository,
  userRepository,
);
const updateProjectMemberRoleUseCase = new UpdateProjectMemberRoleUseCase(
  memberRepository,
);
const removeProjectMemberUseCase = new RemoveProjectMemberUseCase(
  memberRepository,
  projectRepository,
);
const getTeamMembersUseCase = new GetTeamMembersUseCase(
  memberRepository,
  projectRepository,
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
  new MiningWorkflowUseCase(),
  new ArchitectureUseCase(),
);

// ── Workspace ──
import { MongoWorkspaceRepository } from "./infrastructure/repositories/MongoWorkspaceRepository.js";
import { GetProjectWorkspaceUseCase } from "./application/use-cases/workspace/GetProjectWorkspaceUseCase.js";
import { SaveProjectWorkspaceUseCase } from "./application/use-cases/workspace/SaveProjectWorkspaceUseCase.js";
import { WorkspaceController } from "./presentation/controllers/WorkspaceController.js";

export const workspaceRepository = new MongoWorkspaceRepository();
const getProjectWorkspaceUseCase = new GetProjectWorkspaceUseCase(
  workspaceRepository,
  projectRepository,
);
const saveProjectWorkspaceUseCase = new SaveProjectWorkspaceUseCase(
  workspaceRepository,
  projectRepository,
);

export const workspaceController = new WorkspaceController(
  getProjectWorkspaceUseCase,
  saveProjectWorkspaceUseCase,
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

export const adminControllersConfig: AdminControllersConfig = {
  userController: adminUserController,
  jobController: adminJobController,
  auditController: adminAuditController,
  settingsController: adminSettingsController,
  metricsController: adminMetricsController,
};

export { jwtTokenService };





