import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { BcryptHasher } from "../../infrastructure/services/BcryptHasher.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { validatePassword } from "../../shared/utils/validators.js";
import { hasUsablePassword, signInMethodsOf, type SignInMethods } from "./SignInMethods.js";

export const ALREADY_HAS_PASSWORD = "This account already has a password; change it instead.";

/**
 * A first password for an account that has none (one made by signing in with GitHub), so it can also sign in with its
 * email. Unlike changing a password this keeps every session: no password existed that someone else could have used,
 * and the person is signed in already, so signing them out would protect nothing.
 */
export class SetPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly hasher: Pick<BcryptHasher, "hashPassword">,
  ) {}

  async execute(input: { userId: string; newPassword: unknown; confirmNewPassword: unknown }): Promise<{ message: string; signInMethods: SignInMethods }> {
    const credentials = await this.userRepo.findCredentials(input.userId);
    if (!credentials) {
      throw new UnauthorizedError("User not found.");
    }
    if (hasUsablePassword(credentials.passwordHash)) {
      throw new ConflictError(ALREADY_HAS_PASSWORD, "CONFLICT");
    }
    const { newPassword, confirmNewPassword } = input;
    if (typeof newPassword !== "string" || !newPassword || typeof confirmNewPassword !== "string") {
      throw new BadRequestError("Fields required: newPassword, confirmNewPassword.", "VALIDATION_ERROR");
    }
    if (newPassword !== confirmNewPassword) {
      throw new BadRequestError("New passwords do not match.", "VALIDATION_ERROR");
    }
    validatePassword(newPassword);

    const passwordHash = await this.hasher.hashPassword(newPassword);
    // The write checks again that there is no password, so a second request at the same moment is refused too.
    if (!(await this.userRepo.setPasswordIfNone(input.userId, passwordHash))) {
      throw new ConflictError(ALREADY_HAS_PASSWORD, "CONFLICT");
    }
    return {
      message: "Password set. You can now also sign in with your email and this password.",
      signInMethods: signInMethodsOf({ passwordHash, githubId: credentials.githubId }),
    };
  }
}
