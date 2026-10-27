import type { UserRole, UserStatus } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { signInMethodsOf, type SignInMethods } from "./SignInMethods.js";

/** What GET /auth/me shows the person about their own account. Listed field by field, so nothing internal slips out. */
export interface CurrentUserDto {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  signInMethods: SignInMethods;
}

export class GetCurrentUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: { userId: string }): Promise<CurrentUserDto> {
    const [user, credentials] = await Promise.all([
      this.userRepo.findById(input.userId),
      this.userRepo.findCredentials(input.userId),
    ]);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username ?? null,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      signInMethods: signInMethodsOf(credentials ?? { passwordHash: null, githubId: null }),
    };
  }
}
