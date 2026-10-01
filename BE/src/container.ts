import { env } from "./config/env.js";

// ── Infrastructure ──
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoOtpRepository } from "./infrastructure/repositories/MongoOtpRepository.js";
import { MongoProjectRepository } from "./infrastructure/repositories/MongoProjectRepository.js";
import { BcryptHasher } from "./infrastructure/services/BcryptHasher.js";
import { JwtTokenService } from "./infrastructure/services/JwtTokenService.js";
import { NodemailerEmailService } from "./infrastructure/services/NodemailerEmailService.js";

// ── Application (Auth) ──
import { RegisterUseCase } from "./application/use-cases/RegisterUseCase.js";
import { VerifyEmailUseCase } from "./application/use-cases/VerifyEmailUseCase.js";
import { ResendOtpUseCase } from "./application/use-cases/ResendOtpUseCase.js";
import { LoginUseCase } from "./application/use-cases/LoginUseCase.js";
import { RefreshTokenUseCase } from "./application/use-cases/RefreshTokenUseCase.js";
import { GetCurrentUserUseCase } from "./application/use-cases/GetCurrentUserUseCase.js";
import { ForgotPasswordUseCase } from "./application/use-cases/ForgotPasswordUseCase.js";
import { ResetPasswordUseCase } from "./application/use-cases/ResetPasswordUseCase.js";
import { ChangePasswordUseCase } from "./application/use-cases/ChangePasswordUseCase.js";
import { GitHubLoginUseCase } from "./application/use-cases/GitHubLoginUseCase.js";
import { LinkGithubUseCase } from "./application/use-cases/LinkGithubUseCase.js";

// ── Application (Projects) ──
import { RegisterProjectUseCase } from "./application/use-cases/projects/RegisterProjectUseCase.js";
import { CompareSnapshotsUseCase } from "./application/use-cases/projects/CompareSnapshotsUseCase.js";
import { GetAllProjectsUseCase } from "./application/use-cases/projects/GetAllProjectsUseCase.js";
import { DeleteProjectUseCase } from "./application/use-cases/projects/DeleteProjectUseCase.js";
import { MineProjectUseCase } from "./application/use-cases/projects/MineProjectUseCase.js";
import { GetSnapshotsUseCase } from "./application/use-cases/projects/GetSnapshotsUseCase.js";
import { GetMiningJobsUseCase } from "./application/use-cases/projects/GetMiningJobsUseCase.js";
import { GetEvidencesUseCase } from "./application/use-cases/projects/GetEvidencesUseCase.js";

// ── Presentation ──
import { AuthController } from "./presentation/controllers/AuthController.js";
import { ProjectController } from "./presentation/controllers/ProjectController.js";

// ─────────────────────────────────────────
// Infrastructure instances
// ─────────────────────────────────────────
const userRepository = new MongoUserRepository();
const otpRepository = new MongoOtpRepository();
const projectRepository = new MongoProjectRepository();
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
// Use Cases (Auth)
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
const forgotPasswordUseCase = new ForgotPasswordUseCase(
  userRepository,
  otpRepository,
  emailService,
);
const resetPasswordUseCase = new ResetPasswordUseCase(
  userRepository,
  otpRepository,
  bcryptHasher,
);
const changePasswordUseCase = new ChangePasswordUseCase(
  userRepository,
  bcryptHasher,
);
const githubLoginUseCase = new GitHubLoginUseCase(
  userRepository,
  jwtTokenService,
);
const linkGithubUseCase = new LinkGithubUseCase(userRepository);

// ─────────────────────────────────────────
// Use Cases (Projects)
// ─────────────────────────────────────────
const registerProjectUseCase = new RegisterProjectUseCase(projectRepository);
const getAllProjectsUseCase = new GetAllProjectsUseCase(projectRepository);
const deleteProjectUseCase = new DeleteProjectUseCase(projectRepository);
const mineProjectUseCase = new MineProjectUseCase();
const getSnapshotsUseCase = new GetSnapshotsUseCase();
const getMiningJobsUseCase = new GetMiningJobsUseCase();
const compareSnapshotsUseCase = new CompareSnapshotsUseCase();
const getEvidencesUseCase = new GetEvidencesUseCase();

// ─────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────
export const authController = new AuthController(
  registerUseCase,
  verifyEmailUseCase,
  resendOtpUseCase,
  loginUseCase,
  refreshTokenUseCase,
  getCurrentUserUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
  changePasswordUseCase,
  githubLoginUseCase,
  linkGithubUseCase,
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
);

export { jwtTokenService };
