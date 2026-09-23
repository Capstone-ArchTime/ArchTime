import { BadRequestError } from "../errors/AppError.js";

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new BadRequestError("Password must be at least 8 characters long.");
  }
  if (/\s/.test(password)) {
    throw new BadRequestError("Password must not contain spaces.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestError("Password must contain at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestError("Password must contain at least one lowercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestError("Password must contain at least one number.");
  }
  if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]/'\\]/.test(password)) {
    throw new BadRequestError("Password must contain at least one special character.");
  }
}
