import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEXT, otpEmailHtml, projectInvitationHtml, roleName } from "../src/infrastructure/services/email-templates.ts";
import { NodemailerEmailService } from "../src/infrastructure/services/NodemailerEmailService.ts";
import { buildFindingsMail, FindingNotifier } from "../src/application/use-cases/conformance/FindingNotifier.ts";
import { renderReportPdf } from "../src/infrastructure/services/ReportPdf.ts";
import { normalizeLanguage } from "../src/domain/entities/User.ts";

// E-mails and the PDF report follow the account's language (Vietnamese or English); English stays as it was.

function capture() {
  const service = new NodemailerEmailService("ArchTime <no-reply@archtime.test>", "localhost", 587, "u", "p");
  const sent = [];
  service.transporter = { sendMail: async (mail) => { sent.push(mail); } };
  return { service, sent };
}

test("normalizeLanguage: only vi is Vietnamese; anything else is English", () => {
  assert.equal(normalizeLanguage("vi"), "vi");
  for (const other of ["en", "fr", "VI", undefined, null, 1]) assert.equal(normalizeLanguage(other), "en");
});

test("e-mails: English by default with the old wording, Vietnamese when asked", async () => {
  const { service, sent } = capture();
  await service.sendPasswordReset("a@x.io", "abc123");
  await service.sendPasswordReset("a@x.io", "abc123", "vi");
  assert.equal(sent[0].subject, "ArchTime - Reset your password");
  assert.match(sent[0].text, /Your password reset code is:\n\nabc123/);
  assert.equal(sent[1].subject, EMAIL_TEXT.vi.resetSubject);
  assert.match(sent[1].text, /Mã đặt lại mật khẩu của bạn là:\n\nabc123/);

  await service.sendOtp("a@x.io", "123456", "vi");
  assert.equal(sent[2].subject, "ArchTime — Xác minh email");
  assert.match(sent[2].html, /<html lang="vi">/);
  assert.match(sent[2].html, /Mã xác minh/);
  assert.match(sent[2].html, /123456/);

  await service.sendInvitation("b@x.io", "Temp#1234", "developer-analyst", "vi");
  assert.match(sent[3].text, /vai trò thành viên/);
  assert.match(sent[3].text, /Temp#1234/);
});

test("project invitation: the project name and link are escaped, the role reads as a word", () => {
  const html = projectInvitationHtml("<Shop>", "project-maintainer", "https://app.test/accept?token=a&b", "en");
  assert.match(html, /&lt;Shop&gt;/);
  assert.match(html, /as a <strong>maintainer<\/strong>/);
  assert.match(html, /href="https:\/\/app.test\/accept\?token=a&amp;b"/);
  assert.equal(roleName("viewer", "vi"), "người xem");
  assert.equal(roleName("custom-role", "vi"), "custom-role");
  assert.match(otpEmailHtml("<1>", "en"), /&lt;1&gt;/);
});

const finding = (over = {}) => ({
  id: "f1", key: "k1", type: "forbidden-dependency", severity: "error", sourceName: "UI", targetName: "DB", ruleName: "No DB from UI",
  files: ["a.ts"], snapshotHash: "abc1234", commitDate: new Date("2026-01-01").toISOString(), ...over,
});

test("findings e-mail: English keeps its wording; Vietnamese translates the frame around the data", () => {
  const en = buildFindingsMail("Shop", [finding()], "https://app.test/x");
  assert.equal(en.subject, "ArchTime — 1 new conformance finding in Shop");
  assert.match(en.text, /\[error\] Forbidden dependency: UI → DB is forbidden by "No DB from UI" — commit abc1234; files: a\.ts/);
  const vi = buildFindingsMail("Shop", [finding()], "https://app.test/x", "vi");
  assert.equal(vi.subject, "ArchTime — 1 phát hiện tuân thủ mới trong Shop");
  assert.match(vi.text, /\[lỗi\] Phụ thuộc bị cấm: UI → DB bị cấm bởi "No DB from UI"/);
  assert.match(vi.html, /Xem và quyết định trong ArchTime/);
});

test("findings notifier: each recipient gets the e-mail in their own language", async () => {
  const sent = [];
  const notifier = new FindingNotifier(
    { claimUnnotified: async () => [finding()], releaseClaim: async () => {} },
    { projectName: async () => "Shop", recipients: async () => [{ email: "en@x.io", name: "E" }, { email: "vi@x.io", name: "V", language: "vi" }] },
    async (to, mail) => { sent.push({ to, subject: mail.subject }); },
    "https://app.test",
  );
  const result = await notifier.notify("p1");
  assert.equal(result.sent, 2);
  assert.deepEqual(sent.map(s => s.to), ["en@x.io", "vi@x.io"]);
  assert.match(sent[0].subject, /new conformance finding/);
  assert.match(sent[1].subject, /phát hiện tuân thủ mới/);
});

test("PDF report: renders in Vietnamese and in English", async () => {
  const report = {
    id: "r1", title: "Báo cáo kiến trúc", summary: "Tóm tắt", createdAt: new Date("2026-02-01"),
    data: { project: { name: "Shop" }, architecture: { componentCount: 1, components: [{ name: "Đơn hàng", kind: "Service" }] }, rules: {}, decisions: {}, snapshots: {} },
  };
  for (const language of ["vi", "en"]) {
    const pdf = await renderReportPdf(report, undefined, language);
    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1000, language);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  }
});
