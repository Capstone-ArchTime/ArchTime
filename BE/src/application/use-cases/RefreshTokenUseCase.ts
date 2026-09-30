import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import type { JwtTokenService } from "../../infrastructure/services/JwtTokenService.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly jwtService: JwtTokenService,
  ) {}

  async execute(input: {
    refreshToken: string;
  }): Promise<{ accessToken: string }> {
    const { userId } = this.jwtService.verifyRefreshToken(input.refreshToken);

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError("User associated with this token no longer exists.");
    }

    const accessToken = this.jwtService.generateAccessToken(user.id, user.role);
    return { accessToken };
  }
}
