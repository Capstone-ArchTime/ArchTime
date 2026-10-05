export interface IEmailService {
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendOtp(to: string, otp: string): Promise<void>;
  sendInvitation(to: string, temporaryPassword: string, role: string): Promise<void>;
  sendProjectInvitation?(to: string, projectName: string, role: string, inviteUrl: string): Promise<void>;
}

