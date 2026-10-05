import type { IUser, UserRole, UserStatus } from "../../../domain/entities/User.js";
import type { IUserRepository, UserFilter } from "../../../domain/interfaces/IUserRepository.js";
import { buildPaginationMeta, type PaginationMeta } from "../../../shared/utils/apiResponse.js";

export type AdminSafeUser = Omit<IUser, "passwordHash">;

export interface GetAdminUsersInput {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface GetAdminUsersResult {
  users: AdminSafeUser[];
  meta: PaginationMeta;
}

export class GetAdminUsersUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: GetAdminUsersInput): Promise<GetAdminUsersResult> {
    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 10));

    const filter: UserFilter = {
      page,
      limit,
      search: input.search,
      role: input.role,
      status: input.status,
    };

    const { items, total } = await this.userRepo.findPaginated(filter);

    const users: AdminSafeUser[] = items.map((user) => {
      const { passwordHash: _ph, ...safeUser } = user;
      return safeUser;
    });

    const meta = buildPaginationMeta(total, page, limit);

    return { users, meta };
  }
}
