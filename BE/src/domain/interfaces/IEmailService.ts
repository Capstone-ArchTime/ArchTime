export interface IEmailService {
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendOtp(to: string, otp: string): Promise<void>;
}
