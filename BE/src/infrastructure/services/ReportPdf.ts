import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import type { IProjectReport } from "../../domain/entities/ProjectReport.js";

// pdfkit's built-in fonts cover Western European letters only; DejaVu Sans also has Vietnamese ones.
const require = createRequire(import.meta.url);
const FONT = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const INK = "#111827";
const MUTED = "#4b5563";
const RULE = "#d1d5db";
const ACCENT = "#1d4ed8";

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
export function renderReportPdf(report: IProjectReport, generatedByName?: string): Promise<Buffer> {
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
    .text(`Generated ${day(data.generatedAt ?? report.createdAt)}${generatedByName ? ` by ${generatedByName}` : ""} · ArchTime architecture report`);

  heading("Workspace");
  line("Name", str(project.name));
  line("Repository", str(project.repoUrl));
  line("Visibility", str(project.visibility));
  line("Mining status", str(project.status));

  heading("Summary");
  doc.font("body").fontSize(10).fillColor(INK).text(report.summary || "-", left, doc.y, { width });

  heading("Key figures");
  line("Components", str(architecture.componentCount, "0"));
  line("Dependencies", str(architecture.dependencyCount, "0"));
  line("Architecture rules", `${str(rules.total, "0")} (${str(rules.active, "0")} active, ${str(rules.forbiddenCount, "0")} forbidden, ${str(rules.requiredCount, "0")} required)`);
  line("Design decisions", `${str(decisions.total, "0")} (${str(decisions.accepted, "0")} accepted, ${str(decisions.proposed, "0")} proposed)`);
  line("Mined commits", str(snapshots.total, "0"));
  line("Map revision", str(architecture.revision, "-"));

  const first = obj(snapshots.first);
  const latest = obj(snapshots.latest);
  if (str(first.hash) || str(latest.hash)) {
    heading("History covered");
    if (str(first.hash)) line("Oldest mined commit", `${str(first.hash)} · ${day(first.date)} · ${str(first.title)}`);
    if (str(latest.hash)) line("Newest mined commit", `${str(latest.hash)} · ${day(latest.date)} · ${str(latest.title)}`);
  }

  heading("Components");
  const components = rows(architecture.components);
  if (!components.length) none("No components on the map.");
  for (const c of components) bullet(`${str(c.name, str(c.id))}${str(c.kind) ? ` (${str(c.kind)})` : ""}`, str(c.description) || undefined);

  heading("Dependencies");
  const dependencies = rows(architecture.dependencies);
  if (!dependencies.length) none(architecture.dependencies === undefined ? "Not stored in this report (it was generated before dependencies were listed)." : "No dependencies on the map.");
  for (const d of dependencies) bullet(`${str(d.source)} → ${str(d.target)}${str(d.label) ? `  (${str(d.label)})` : ""}`);

  heading("Architecture rules");
  const ruleItems = rows(rules.items);
  if (!ruleItems.length) none(rules.items === undefined ? "Not stored in this report (it was generated before rules were listed)." : "No architecture rules.");
  for (const r of ruleItems) {
    bullet(`${str(r.name)}${r.enabled === false ? " (off)" : ""}`, `${str(r.source)} ${r.constraint === "required" ? "must depend on" : "must not depend on"} ${str(r.target)} · ${str(r.severity)}`);
  }

  heading("Design decisions");
  const decisionItems = rows(decisions.items);
  if (!decisionItems.length) none(decisions.items === undefined ? "Not stored in this report (it was generated before decisions were listed)." : "No design decisions.");
  for (const d of decisionItems) bullet(`ADR-${str(d.number, "?")}: ${str(d.title)}`, str(d.status));

  // Page numbers last, once every page exists.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(8).fillColor(MUTED).text(`${str(project.name)} · page ${i + 1} of ${range.count}`, left, doc.page.height - 30, { width, align: "center", lineBreak: false });
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
