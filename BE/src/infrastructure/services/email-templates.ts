import type { UserLanguage } from "../../domain/entities/User.js";

/** HTML-escapes a value placed in an e-mail body (names and links come from users). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** How a role reads in an e-mail; unknown values are shown as they are. */
const ROLE_NAMES: Record<UserLanguage, Record<string, string>> = {
  en: {
    "developer-analyst": "member", "project-maintainer": "maintainer", owner: "owner", viewer: "viewer",
    "system-administrator": "system administrator", member: "member",
  },
  vi: {
    "developer-analyst": "thành viên", "project-maintainer": "người bảo trì", owner: "chủ sở hữu", viewer: "người xem",
    "system-administrator": "quản trị viên hệ thống", member: "thành viên",
  },
};
export const roleName = (role: string, language: UserLanguage): string => ROLE_NAMES[language][role] ?? role;

/** Each e-mail's texts, in English and Vietnamese. English keeps the wording the e-mails had before. */
export const EMAIL_TEXT = {
  en: {
    resetSubject: "ArchTime - Reset your password",
    resetBody: (token: string) => "Your password reset code is:\n\n" + token + "\n\nPaste it into the ArchTime password reset form. It expires in 10 minutes and can only be used once. If you did not request this, ignore this email.",
    otpSubject: "ArchTime — Email Verification",
    otpTitle: "Verify your email address",
    otpIntro: "Use the verification code below to activate your ArchTime account. This code expires in",
    otpMinutes: "10 minutes",
    otpLabel: "Verification Code",
    otpIgnore: "If you did not create an ArchTime account, you can safely ignore this email.",
    tagline: "ArchTime · Evidence-Based Architecture Evolution",
    inviteSubject: "Welcome to ArchTime — Account Invitation",
    inviteBody: (role: string, password: string) => `You have been invited to ArchTime as a ${role}.\n\nYour temporary password is:\n${password}\n\nPlease sign in and update your password immediately.`,
    projectSubject: (project: string) => `ArchTime — Invitation to join ${project}`,
    projectInvited: (project: string, role: string) => `You have been invited to join <strong>${project}</strong> as a <strong>${role}</strong>.`,
    projectAccept: "Click here to accept the invitation",
    projectExpires: "This invitation will expire in 7 days.",
  },
  vi: {
    resetSubject: "ArchTime - Đặt lại mật khẩu",
    resetBody: (token: string) => "Mã đặt lại mật khẩu của bạn là:\n\n" + token + "\n\nHãy dán mã vào biểu mẫu đặt lại mật khẩu của ArchTime. Mã hết hạn sau 10 phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.",
    otpSubject: "ArchTime — Xác minh email",
    otpTitle: "Xác minh địa chỉ email",
    otpIntro: "Dùng mã xác minh bên dưới để kích hoạt tài khoản ArchTime. Mã hết hạn sau",
    otpMinutes: "10 phút",
    otpLabel: "Mã xác minh",
    otpIgnore: "Nếu bạn không tạo tài khoản ArchTime, bạn có thể bỏ qua email này.",
    tagline: "ArchTime · Theo dõi tiến hoá kiến trúc dựa trên bằng chứng",
    inviteSubject: "Chào mừng tới ArchTime — Lời mời tạo tài khoản",
    inviteBody: (role: string, password: string) => `Bạn được mời tham gia ArchTime với vai trò ${role}.\n\nMật khẩu tạm thời của bạn là:\n${password}\n\nHãy đăng nhập và đổi mật khẩu ngay.`,
    projectSubject: (project: string) => `ArchTime — Lời mời tham gia ${project}`,
    projectInvited: (project: string, role: string) => `Bạn được mời tham gia <strong>${project}</strong> với vai trò <strong>${role}</strong>.`,
    projectAccept: "Bấm vào đây để chấp nhận lời mời",
    projectExpires: "Lời mời hết hạn sau 7 ngày.",
  },
} as const;

/** The verification e-mail, laid out like the app. */
export function otpEmailHtml(otp: string, language: UserLanguage): string {
  const t = EMAIL_TEXT[language];
  return `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${t.otpSubject}</title>
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
              <p style="margin:0;font-family:'JetBrains Mono',monospace;font-size:13px;
                        color:#3b82f6;letter-spacing:1px;text-transform:uppercase;">
                ArchTime
              </p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;
                         color:#f4f4f6;letter-spacing:-0.5px;">
                ${t.otpTitle}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;font-size:15px;color:#c9c9cc;line-height:1.6;">
                ${t.otpIntro} <strong style="color:#f4f4f6;">${t.otpMinutes}</strong>.
              </p>

              <!-- OTP Box -->
              <div style="background:#161718;border:1px solid #242527;border-radius:8px;
                          padding:28px;text-align:center;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:12px;font-family:'JetBrains Mono',monospace;
                           color:#8a8f98;letter-spacing:1.2px;text-transform:uppercase;">
                  ${t.otpLabel}
                </p>
                <p style="margin:0;font-size:40px;font-weight:700;
                           font-family:'JetBrains Mono',monospace;
                           color:#3b82f6;letter-spacing:8px;">
                  ${escapeHtml(otp)}
                </p>
              </div>

              <p style="margin:0;font-size:13px;color:#5f636b;line-height:1.5;">
                ${t.otpIgnore}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #242527;">
              <p style="margin:0;font-size:12px;color:#5f636b;font-family:'JetBrains Mono',monospace;">
                ${t.tagline}
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

/** The project invitation e-mail body. */
export function projectInvitationHtml(projectName: string, role: string, inviteUrl: string, language: UserLanguage): string {
  const t = EMAIL_TEXT[language];
  return `<p>${t.projectInvited(escapeHtml(projectName), escapeHtml(roleName(role, language)))}</p>
             <p><a href="${escapeHtml(inviteUrl)}">${t.projectAccept}</a></p>
             <p>${t.projectExpires}</p>`;
}
