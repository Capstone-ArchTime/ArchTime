import type { IUser } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

export class GetCurrentUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Omit<IUser, "passwordHash">> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    const { passwordHash: _ph, ...safeUser } = user;
    return safeUser;
  }
}
