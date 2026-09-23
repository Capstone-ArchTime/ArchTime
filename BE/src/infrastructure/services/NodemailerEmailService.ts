import nodemailer, { type Transporter } from "nodemailer";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";

export class NodemailerEmailService implements IEmailService {
  private transporter: Transporter;

  constructor(
    private readonly from: string,
    host: string,
    port: number,
    user: string,
    pass: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // STARTTLS on port 587
      auth: { user, pass },
    });
  }

  async sendOtp(to: string, otp: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: "ArchTime — Email Verification",
      html: this.buildOtpEmail(otp),
    });
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: "ArchTime — Password Reset",
      html: this.buildPasswordResetEmail(otp),
    });
  }

  private buildOtpEmail(otp: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ArchTime — Email Verification</title>
</head>
<body style="margin:0;padding:0;background:#08090a;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#08090a;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#111213;border:1px solid #242527;border-radius:12px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #242527;">
              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;line-height:1.3;
                        color:#3b82f6;letter-spacing:1.2px;text-transform:uppercase;">
                ArchTime
              </p>
              <h1 style="margin:8px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:20px;font-weight:600;line-height:1.3;
                         color:#f4f4f6;letter-spacing:-0.2px;">
                Verify your email address
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;font-family:'Inter',system-ui,sans-serif;font-size:15px;font-weight:400;color:#c9c9cc;line-height:1.55;">
                Use the verification code below to activate your ArchTime account.
                This code expires in <strong style="color:#f4f4f6;">10 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <div style="background:#161718;border:1px solid #242527;border-radius:8px;
                          padding:28px;text-align:center;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;line-height:1.3;
                           color:#8a8f98;letter-spacing:1.2px;text-transform:uppercase;">
                  Verification Code
                </p>
                <p style="margin:0;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:600;line-height:1.2;
                           color:#3b82f6;letter-spacing:8px;">
                  ${otp}
                </p>
              </div>

              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:400;color:#5f636b;line-height:1.5;">
                If you did not create an ArchTime account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #242527;">
              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;color:#5f636b;line-height:1.4;letter-spacing:0.3px;">
                ArchTime · Evidence-Based Architecture Evolution
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private buildPasswordResetEmail(otp: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ArchTime — Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#08090a;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#08090a;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#111213;border:1px solid #242527;border-radius:12px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #242527;">
              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;line-height:1.3;
                        color:#3b82f6;letter-spacing:1.2px;text-transform:uppercase;">
                ArchTime
              </p>
              <h1 style="margin:8px 0 0;font-family:'Inter',system-ui,sans-serif;font-size:20px;font-weight:600;line-height:1.3;
                         color:#f4f4f6;letter-spacing:-0.2px;">
                Reset your password
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;font-family:'Inter',system-ui,sans-serif;font-size:15px;font-weight:400;color:#c9c9cc;line-height:1.55;">
                We received a request to reset your password. Use the verification code below to set a new password.
                This code expires in <strong style="color:#f4f4f6;">10 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <div style="background:#161718;border:1px solid #242527;border-radius:8px;
                          padding:28px;text-align:center;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;line-height:1.3;
                           color:#8a8f98;letter-spacing:1.2px;text-transform:uppercase;">
                  Verification Code
                </p>
                <p style="margin:0;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:600;line-height:1.2;
                           color:#3b82f6;letter-spacing:8px;">
                  ${otp}
                </p>
              </div>

              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:400;color:#5f636b;line-height:1.5;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #242527;">
              <p style="margin:0;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;color:#5f636b;line-height:1.4;letter-spacing:0.3px;">
                ArchTime · Evidence-Based Architecture Evolution
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
