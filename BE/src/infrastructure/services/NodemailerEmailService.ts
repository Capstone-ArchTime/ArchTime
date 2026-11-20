import nodemailer, { type Transporter } from "nodemailer";
import type { UserLanguage } from "../../domain/entities/User.js";
import type { IEmailService } from "../../domain/interfaces/IEmailService.js";
import { EMAIL_TEXT, otpEmailHtml, projectInvitationHtml, roleName } from "./email-templates.js";

/** Sends ArchTime's e-mails through SMTP, each in the recipient's language (English when it is not known). */
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

  async sendPasswordReset(to: string, token: string, language: UserLanguage = "en"): Promise<void> {
    const t = EMAIL_TEXT[language];
    await this.transporter.sendMail({ from: this.from, to, subject: t.resetSubject, text: t.resetBody(token) });
  }

  async sendOtp(to: string, otp: string, language: UserLanguage = "en"): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject: EMAIL_TEXT[language].otpSubject, html: otpEmailHtml(otp, language) });
  }

  async sendInvitation(to: string, temporaryPassword: string, role: string, language: UserLanguage = "en"): Promise<void> {
    const t = EMAIL_TEXT[language];
    await this.transporter.sendMail({ from: this.from, to, subject: t.inviteSubject, text: t.inviteBody(roleName(role, language), temporaryPassword) });
  }

  async sendNotification(to: string, mail: { subject: string; html: string; text: string }): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject: mail.subject, html: mail.html, text: mail.text });
  }

  async sendProjectInvitation(to: string, projectName: string, role: string, inviteUrl: string, language: UserLanguage = "en"): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: EMAIL_TEXT[language].projectSubject(projectName),
      html: projectInvitationHtml(projectName, role, inviteUrl, language),
    });
  }
}
