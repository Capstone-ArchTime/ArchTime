import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { renderReportPdf, reportFileName } from "../src/infrastructure/services/ReportPdf.ts";

// The architecture report as a PDF a person can open: a real PDF, with a font that has Vietnamese letters, built only from
// what the report stored, and still made for reports generated before the lists were stored.
const report = (data, over = {}) => ({
  id: "r1", projectId: "p1", title: "Cửa hàng - Báo cáo kiến trúc", type: "architecture_summary", generatedBy: "u1", status: "ready",
  summary: "Architecture report for Cửa hàng: contains 2 components.", data, createdAt: new Date("2026-10-27T08:00:00Z"), updatedAt: new Date("2026-10-27T08:00:00Z"),
  ...over,
});

const full = {
  project: { name: "Cửa hàng Đà Nẵng", repoUrl: "https://github.com/example/shop.git", visibility: "private", status: "COMPLETED" },
  architecture: {
    revision: 4, componentCount: 2, dependencyCount: 1,
    components: [{ id: "billing", name: "Thanh toán", kind: "Service", description: "Lập hóa đơn và nhận tiền." }, { id: "orders", name: "Orders", kind: "Service", description: "" }],
    dependencies: [{ source: "Orders", target: "Thanh toán", label: "REST" }],
  },
  rules: { total: 1, active: 1, forbiddenCount: 1, requiredCount: 0, items: [{ name: "No UI to DB", source: "UI", target: "DB", constraint: "forbidden", severity: "error", enabled: true }] },
  decisions: { total: 1, accepted: 1, proposed: 0, items: [{ number: 1, title: "Dùng hàng đợi giữa orders và billing", status: "Accepted" }] },
  snapshots: { total: 12, first: { hash: "a1b2c3d", title: "Initial commit", date: "2026-01-01T00:00:00Z" }, latest: { hash: "f6e5d4c", title: "Add invoices", date: "2026-10-01T00:00:00Z" } },
  generatedAt: "2026-10-27T08:00:00Z",
};

test("a report becomes a real PDF with a font that has Vietnamese letters embedded", async () => {
  const pdf = await renderReportPdf(report(full));
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(pdf.subarray(-1024).toString("latin1"), /%%EOF\s*$/);
  const raw = pdf.toString("latin1");
  assert.match(raw, /DejaVuSans/, "the DejaVu font is embedded, not a built-in font without Vietnamese letters");
  assert.doesNotMatch(raw, /\/BaseFont \/Helvetica/, "no built-in font is used for the text");
  assert.ok(pdf.length > 5_000);
});

test("a long report runs over several pages instead of being cut off", async () => {
  const many = { ...full, architecture: { ...full.architecture, components: Array.from({ length: 150 }, (_, i) => ({ id: `c${i}`, name: `Component ${i}`, kind: "Module", description: "Một mô tả khá dài để chiếm chỗ trên trang giấy." })) } };
  const pages = (await renderReportPdf(report(many))).toString("latin1").match(/\/Type \/Page\b/g) ?? [];
  assert.ok(pages.length >= 3, `${pages.length} pages`);
});

test("reports generated before the lists were stored, or with odd data, still give a PDF", async () => {
  const old = { project: { name: "Old" }, architecture: { revision: 1, componentCount: 3, dependencyCount: 2, components: [{ id: "a", name: "A", kind: "x" }] }, rules: { total: 0 }, decisions: { total: 0 }, snapshots: { total: 0 } };
  for (const data of [old, {}, null, { architecture: { components: "not a list" }, snapshots: { first: 5 } }]) {
    const pdf = await renderReportPdf(report(data));
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  }
});

test("the file name is the workspace name in plain letters and the report date", () => {
  assert.equal(reportFileName(report(full)), "cua-hang-da-nang-architecture-report-2026-10-27.pdf");
  assert.equal(reportFileName(report({ project: { name: '"; rm -rf / <x>' } })), "rm-rf-x-architecture-report-2026-10-27.pdf");
  assert.equal(reportFileName(report({}, { createdAt: "garbage" })), "workspace-architecture-report-undated.pdf");
});
