export interface IEmailService {
  sendOtp(to: string, otp: string): Promise<void>;
  sendPasswordResetOtp(to: string, otp: string): Promise<void>;
}
