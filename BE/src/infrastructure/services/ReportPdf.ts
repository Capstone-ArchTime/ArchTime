import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import type { IProjectReport } from "../../domain/entities/ProjectReport.js";
import type { UserLanguage } from "../../domain/entities/User.js";

// pdfkit's built-in fonts cover Western European letters only; DejaVu Sans also has Vietnamese ones.
const require = createRequire(import.meta.url);
const FONT = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const INK = "#111827";
const MUTED = "#4b5563";
const RULE = "#d1d5db";
const ACCENT = "#1d4ed8";

/** The PDF's labels. English keeps the wording the report had before. */
const PDF_TEXT = {
  en: {
    generated: (date: string, by: string) => `Generated ${date}${by ? ` by ${by}` : ""} · ArchTime architecture report`,
    workspace: "Workspace", name: "Name", repository: "Repository", visibility: "Visibility", miningStatus: "Mining status", summary: "Summary",
    keyFigures: "Key figures", components: "Components", dependencies: "Dependencies", rules: "Architecture rules",
    rulesValue: (total: string, active: string, forbidden: string, required: string) => `${total} (${active} active, ${forbidden} forbidden, ${required} required)`,
    decisions: "Design decisions", decisionsValue: (total: string, accepted: string, proposed: string) => `${total} (${accepted} accepted, ${proposed} proposed)`,
    minedCommits: "Mined commits", mapRevision: "Map revision", history: "History covered", oldest: "Oldest mined commit", newest: "Newest mined commit",
    noComponents: "No components on the map.", depsNotStored: "Not stored in this report (it was generated before dependencies were listed).", noDependencies: "No dependencies on the map.",
    rulesNotStored: "Not stored in this report (it was generated before rules were listed).", noRules: "No architecture rules.", off: " (off)", must: "must depend on", mustNot: "must not depend on",
    decisionsNotStored: "Not stored in this report (it was generated before decisions were listed).", noDecisions: "No design decisions.",
    page: (project: string, page: number, count: number) => `${project} · page ${page} of ${count}`,
  },
  vi: {
    generated: (date: string, by: string) => `Tạo ngày ${date}${by ? ` bởi ${by}` : ""} · Báo cáo kiến trúc ArchTime`,
    workspace: "Không gian làm việc", name: "Tên", repository: "Repository", visibility: "Hiển thị", miningStatus: "Trạng thái mining", summary: "Tóm tắt",
    keyFigures: "Số liệu chính", components: "Thành phần", dependencies: "Phụ thuộc", rules: "Quy tắc kiến trúc",
    rulesValue: (total: string, active: string, forbidden: string, required: string) => `${total} (${active} đang bật, ${forbidden} cấm, ${required} bắt buộc)`,
    decisions: "Quyết định thiết kế", decisionsValue: (total: string, accepted: string, proposed: string) => `${total} (${accepted} đã chấp nhận, ${proposed} đề xuất)`,
    minedCommits: "Commit đã mining", mapRevision: "Phiên bản bản đồ", history: "Lịch sử bao phủ", oldest: "Commit cũ nhất đã mining", newest: "Commit mới nhất đã mining",
    noComponents: "Bản đồ không có thành phần nào.", depsNotStored: "Báo cáo này không lưu mục này (được tạo trước khi phụ thuộc được liệt kê).", noDependencies: "Bản đồ không có phụ thuộc nào.",
    rulesNotStored: "Báo cáo này không lưu mục này (được tạo trước khi quy tắc được liệt kê).", noRules: "Không có quy tắc kiến trúc.", off: " (tắt)", must: "phải phụ thuộc vào", mustNot: "không được phụ thuộc vào",
    decisionsNotStored: "Báo cáo này không lưu mục này (được tạo trước khi quyết định được liệt kê).", noDecisions: "Không có quyết định thiết kế.",
    page: (project: string, page: number, count: number) => `${project} · trang ${page} / ${count}`,
  },
} as const;

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((v): v is Row => !!v && typeof v === "object") : []);
const obj = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
const str = (value: unknown, fallback = ""): string => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : fallback);
const day = (value: unknown): string => {
  const at = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? at.toISOString().slice(0, 10) : "";
};

/**
 * The report as a PDF: what the report stored when it was generated (reports made before the lists were stored show
 * the figures only). Everything is drawn from `report.data`; nothing is looked up again.
 */
export function renderReportPdf(report: IProjectReport, generatedByName?: string, language: UserLanguage = "en"): Promise<Buffer> {
  const t = PDF_TEXT[language];
  const data = obj(report.data);
  const project = obj(data.project);
  const architecture = obj(data.architecture);
  const rules = obj(data.rules);
  const decisions = obj(data.decisions);
  const snapshots = obj(data.snapshots);

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: report.title, Author: "ArchTime" }, bufferPages: true });
  doc.registerFont("body", FONT);
  doc.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const heading = (text: string) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.8).font("bold").fontSize(13).fillColor(ACCENT).text(text, left);
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(RULE).lineWidth(0.7).stroke();
    doc.moveDown(0.5).font("body").fontSize(10).fillColor(INK);
  };
  const line = (label: string, value: string) => {
    doc.font("bold").fontSize(10).fillColor(MUTED).text(`${label}: `, left, doc.y, { continued: true }).font("body").fillColor(INK).text(value || "-");
  };
  const bullet = (text: string, detail?: string) => {
    doc.font("body").fontSize(10).fillColor(INK).text(`•  ${text}`, left + 6, doc.y, { width: width - 6 });
    if (detail) doc.fontSize(9).fillColor(MUTED).text(detail, left + 18, doc.y, { width: width - 18 });
    doc.moveDown(0.2);
  };
  const none = (text: string) => doc.font("body").fontSize(10).fillColor(MUTED).text(text, left);

  // ── Title ──
  doc.font("bold").fontSize(20).fillColor(INK).text(report.title, left, doc.y, { width });
  doc.moveDown(0.3).font("body").fontSize(10).fillColor(MUTED)
    .text(t.generated(day(data.generatedAt ?? report.createdAt), generatedByName ?? ""));

  heading(t.workspace);
  line(t.name, str(project.name));
  line(t.repository, str(project.repoUrl));
  line(t.visibility, str(project.visibility));
  line(t.miningStatus, str(project.status));

  heading(t.summary);
  doc.font("body").fontSize(10).fillColor(INK).text(report.summary || "-", left, doc.y, { width });

  heading(t.keyFigures);
  line(t.components, str(architecture.componentCount, "0"));
  line(t.dependencies, str(architecture.dependencyCount, "0"));
  line(t.rules, t.rulesValue(str(rules.total, "0"), str(rules.active, "0"), str(rules.forbiddenCount, "0"), str(rules.requiredCount, "0")));
  line(t.decisions, t.decisionsValue(str(decisions.total, "0"), str(decisions.accepted, "0"), str(decisions.proposed, "0")));
  line(t.minedCommits, str(snapshots.total, "0"));
  line(t.mapRevision, str(architecture.revision, "-"));

  const first = obj(snapshots.first);
  const latest = obj(snapshots.latest);
  if (str(first.hash) || str(latest.hash)) {
    heading(t.history);
    if (str(first.hash)) line(t.oldest, `${str(first.hash)} · ${day(first.date)} · ${str(first.title)}`);
    if (str(latest.hash)) line(t.newest, `${str(latest.hash)} · ${day(latest.date)} · ${str(latest.title)}`);
  }

  heading(t.components);
  const components = rows(architecture.components);
  if (!components.length) none(t.noComponents);
  for (const c of components) bullet(`${str(c.name, str(c.id))}${str(c.kind) ? ` (${str(c.kind)})` : ""}`, str(c.description) || undefined);

  heading(t.dependencies);
  const dependencies = rows(architecture.dependencies);
  if (!dependencies.length) none(architecture.dependencies === undefined ? t.depsNotStored : t.noDependencies);
  for (const d of dependencies) bullet(`${str(d.source)} → ${str(d.target)}${str(d.label) ? `  (${str(d.label)})` : ""}`);

  heading(t.rules);
  const ruleItems = rows(rules.items);
  if (!ruleItems.length) none(rules.items === undefined ? t.rulesNotStored : t.noRules);
  for (const r of ruleItems) {
    bullet(`${str(r.name)}${r.enabled === false ? t.off : ""}`, `${str(r.source)} ${r.constraint === "required" ? t.must : t.mustNot} ${str(r.target)} · ${str(r.severity)}`);
  }

  heading(t.decisions);
  const decisionItems = rows(decisions.items);
  if (!decisionItems.length) none(decisions.items === undefined ? t.decisionsNotStored : t.noDecisions);
  for (const d of decisionItems) bullet(`ADR-${str(d.number, "?")}: ${str(d.title)}`, str(d.status));

  // Page numbers last, once every page exists.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(8).fillColor(MUTED).text(t.page(str(project.name), i + 1, range.count), left, doc.page.height - 30, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/** A file name safe in every browser: the project's name in plain letters, plus the report date. */
export function reportFileName(report: IProjectReport): string {
  const name = str(obj(obj(report.data).project).name, "workspace")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "workspace";
  return `${name}-architecture-report-${day(report.createdAt) || "undated"}.pdf`;
}
