import type { UserLanguage } from "../entities/User.js";

/** Every e-mail takes the recipient's language last; English is used when it is left out. */
export interface IEmailService {
  sendPasswordReset(to: string, token: string, language?: UserLanguage): Promise<void>;
  sendOtp(to: string, otp: string, language?: UserLanguage): Promise<void>;
  sendInvitation(to: string, temporaryPassword: string, role: string, language?: UserLanguage): Promise<void>;
  sendProjectInvitation?(to: string, projectName: string, role: string, inviteUrl: string, language?: UserLanguage): Promise<void>;
  /** A notification written by the caller (conformance findings, RF-29). */
  sendNotification?(to: string, mail: { subject: string; html: string; text: string }): Promise<void>;
}
