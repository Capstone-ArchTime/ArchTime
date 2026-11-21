import { USER_LANGUAGES, type IUser, type UserLanguage } from "../../domain/entities/User.js";
import type { IUserRepository } from "../../domain/interfaces/IUserRepository.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/AppError.js";

export interface UpdateProfileInput {
  userId: string;
  name?: unknown;
  /** A string sets it, null or "" clears it, undefined leaves it unchanged. */
  username?: unknown;
  /** "en" or "vi": the language of the interface, e-mails and reports. */
  language?: unknown;
}

const NAME_MAX = 100;
// 3–32 characters: lowercase letters, digits, dot, underscore, hyphen; starts and ends with a letter or digit.
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

/**
 * Changes the signed-in user's own display name, and sets their username once (it cannot be changed or cleared
 * afterwards). Email is not editable here: changing it needs a new verification. Role and status are changed by an
 * administrator.
 */
export class UpdateProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: UpdateProfileInput): Promise<Omit<IUser, "passwordHash">> {
    const patch: { name?: string; username?: string | null; language?: UserLanguage } = {};

    if (input.language !== undefined) {
      if (typeof input.language !== "string" || !(USER_LANGUAGES as readonly string[]).includes(input.language)) {
        throw new BadRequestError(`Language must be one of: ${USER_LANGUAGES.join(", ")}.`, "VALIDATION_ERROR");
      }
      patch.language = input.language as UserLanguage;
    }

    if (input.name !== undefined) {
      if (typeof input.name !== "string" || !input.name.trim()) {
        throw new BadRequestError("Name must not be empty.", "VALIDATION_ERROR");
      }
      const name = input.name.trim();
      if (name.length > NAME_MAX) {
        throw new BadRequestError(`Name must be at most ${NAME_MAX} characters.`, "VALIDATION_ERROR");
      }
      patch.name = name;
    }

    if (input.username !== undefined) {
      if (input.username === null || input.username === "") {
        patch.username = null;
      } else if (typeof input.username !== "string") {
        throw new BadRequestError("Username must be a string.", "VALIDATION_ERROR");
      } else {
        const username = input.username.trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) {
          throw new BadRequestError(
            "Username must be 3–32 characters: lowercase letters, digits, '.', '_' or '-', starting and ending with a letter or digit.",
            "VALIDATION_ERROR",
          );
        }
        patch.username = username;
      }
    }

    if (patch.name === undefined && patch.username === undefined && patch.language === undefined) {
      throw new BadRequestError("Nothing to update: send name, username and/or language.", "VALIDATION_ERROR");
    }

    // A username is chosen once: after that it can be sent again unchanged, but not changed or cleared.
    if (patch.username !== undefined) {
      const current = await this.userRepo.findById(input.userId);
      if (!current) throw new NotFoundError("User not found.");
      if (current.username && patch.username !== current.username) {
        throw new ConflictError("Your username is set and cannot be changed.", "USERNAME_LOCKED");
      }
      if (current.username) delete patch.username; // the same value: nothing to change
    }

    if (patch.username && (await this.userRepo.existsByUsername(patch.username, input.userId))) {
      throw new ConflictError("This username is already taken.");
    }

    let updated: IUser | null;
    try {
      updated = await this.userRepo.updateProfile(input.userId, patch);
    } catch (err: any) {
      // Two requests can claim the same username at once; the unique index decides.
      if (err?.code === 11000) throw new ConflictError("This username is already taken.");
      throw err;
    }
    if (!updated) throw new NotFoundError("User not found.");

    const { passwordHash: _ph, ...safeUser } = updated;
    return safeUser;
  }
}
