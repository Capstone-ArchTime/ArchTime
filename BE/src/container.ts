import { env } from "./config/env.js";

// ── Infrastructure ──
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoOtpRepository } from "./infrastructure/repositories/MongoOtpRepository.js";
import { BcryptHasher } from "./infrastructure/services/BcryptHasher.js";
import { JwtTokenService } from "./infrastructure/services/JwtTokenService.js";
import { NodemailerEmailService } from "./infrastructure/services/NodemailerEmailService.js";

// ── Application ──
import { RegisterUseCase } from "./application/use-cases/RegisterUseCase.js";
import { VerifyEmailUseCase } from "./application/use-cases/VerifyEmailUseCase.js";
import { ResendOtpUseCase } from "./application/use-cases/ResendOtpUseCase.js";
import { LoginUseCase } from "./application/use-cases/LoginUseCase.js";
import { RefreshTokenUseCase } from "./application/use-cases/RefreshTokenUseCase.js";
import { GetCurrentUserUseCase } from "./application/use-cases/GetCurrentUserUseCase.js";

// ── Presentation ──
import { AuthController } from "./presentation/controllers/AuthController.js";

// ─────────────────────────────────────────
// Infrastructure instances
// ─────────────────────────────────────────
const userRepository = new MongoUserRepository();
const otpRepository = new MongoOtpRepository();
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
);

export { jwtTokenService };
