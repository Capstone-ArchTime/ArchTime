import type { IConformanceFinding } from "../../../domain/entities/ConformanceFinding.js";
import type { UserLanguage } from "../../../domain/entities/User.js";
import type { IConformanceRepository } from "../../../domain/interfaces/IConformanceRepository.js";
import { ConflictError } from "../../../shared/errors/AppError.js";
import type { CheckConformanceUseCase } from "./ConformanceUseCases.js";

// After every fetch or mine the conformance check runs on its own, and the people who answer for the architecture hear
// about what is new: one e-mail per project and run, to its maintainers and the owner of its organization (RF-29,
// BR-34). A finding is e-mailed once: notifiedAt is set when it is taken for an e-mail and never cleared after a send.

export interface Recipient { email: string; name: string; language?: UserLanguage }

export interface NotifierDirectory {
  projectName(projectId: string): Promise<string | null>;
  /** Active, verified people with write access who must hear about findings: owner, maintainers, organization owner. */
  recipients(projectId: string): Promise<Recipient[]>;
}

export interface NotificationMail { subject: string; html: string; text: string }
export type SendMail = (to: string, mail: NotificationMail) => Promise<void>;

const MAX_LISTED = 10;
const TYPE_LABEL: Record<UserLanguage, Record<IConformanceFinding["type"], string>> = {
  en: {
    "forbidden-dependency": "Forbidden dependency",
    "missing-required-dependency": "Missing required dependency",
    "undeclared-dependency": "Undeclared dependency",
    convention: "Commit convention",
  },
  vi: {
    "forbidden-dependency": "Phụ thuộc bị cấm",
    "missing-required-dependency": "Thiếu phụ thuộc bắt buộc",
    "undeclared-dependency": "Phụ thuộc chưa khai báo",
    convention: "Quy ước commit",
  },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The e-mail's sentences in each language. English keeps the wording the e-mail had before. */
const MAIL_TEXT = {
  en: {
    convention: "The commit does not follow the commit convention",
    forbidden: (pair: string, rule: string | null) => `${pair} is forbidden${rule ? ` by "${rule}"` : ""}`,
    missing: (pair: string, rule: string | null) => `${pair} is required${rule ? ` by "${rule}"` : ""} but missing`,
    undeclared: (pair: string) => `${pair} is not in the confirmed diagram`,
    subject: (n: number, project: string) => `ArchTime — ${plural(n, "new conformance finding")} in ${project}`,
    moreFiles: (n: number) => ` and ${n} more`,
    commit: (hash: string, earlier: number) => `commit ${hash}${earlier > 0 ? ` (and ${earlier} earlier)` : ""}`,
    files: "files",
    severity: (s: string) => s,
    more: (n: number) => `and ${n} more`,
    intro: (project: string, n: number, errors: number) => `The conformance check of ${project} found ${plural(n, "new problem")} (${plural(errors, "error")}) where the code departs from the confirmed component diagram.`,
    review: "Review and decide",
    reviewLink: "Review and decide in ArchTime",
    why: (project: string) => `You get this because you maintain ${project}. Each finding is e-mailed once.`,
    yourProject: "your project",
  },
  vi: {
    convention: "Commit không theo quy ước commit",
    forbidden: (pair: string, rule: string | null) => `${pair} bị cấm${rule ? ` bởi "${rule}"` : ""}`,
    missing: (pair: string, rule: string | null) => `${pair} là bắt buộc${rule ? ` theo "${rule}"` : ""} nhưng đang thiếu`,
    undeclared: (pair: string) => `${pair} không có trong sơ đồ đã xác nhận`,
    subject: (n: number, project: string) => `ArchTime — ${n} phát hiện tuân thủ mới trong ${project}`,
    moreFiles: (n: number) => ` và ${n} tệp nữa`,
    commit: (hash: string, earlier: number) => `commit ${hash}${earlier > 0 ? ` (và ${earlier} commit trước đó)` : ""}`,
    files: "tệp",
    severity: (s: string) => (s === "error" ? "lỗi" : s === "warning" ? "cảnh báo" : s),
    more: (n: number) => `và ${n} mục nữa`,
    intro: (project: string, n: number, errors: number) => `Kiểm tra tuân thủ của ${project} phát hiện ${n} vấn đề mới (${errors} lỗi) ở những chỗ mã nguồn lệch khỏi sơ đồ thành phần đã xác nhận.`,
    review: "Xem và quyết định",
    reviewLink: "Xem và quyết định trong ArchTime",
    why: (project: string) => `Bạn nhận email này vì bạn bảo trì ${project}. Mỗi phát hiện chỉ được gửi một lần.`,
    yourProject: "dự án của bạn",
  },
} as const;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One line per problem: the same finding in several commits is one problem, shown with its newest commit. */
export function summarize(findings: IConformanceFinding[]) {
  const byKey = new Map<string, { finding: IConformanceFinding; commits: number }>();
  for (const f of findings) {
    const seen = byKey.get(f.key);
    if (!seen) byKey.set(f.key, { finding: f, commits: 1 });
    else {
      seen.commits++;
      if (new Date(f.commitDate) > new Date(seen.finding.commitDate)) seen.finding = f;
    }
  }
  return [...byKey.values()].sort((a, b) =>
    (a.finding.severity === b.finding.severity ? 0 : a.finding.severity === "error" ? -1 : 1) || a.finding.key.localeCompare(b.finding.key));
}

function describe(f: IConformanceFinding, language: UserLanguage): string {
  const t = MAIL_TEXT[language];
  // A convention finding carries its whole sentence (commitConvention.ts).
  if (f.type === "convention") return f.ruleName ?? t.convention;
  const pair = `${f.sourceName} → ${f.targetName}`;
  if (f.type === "forbidden-dependency") return t.forbidden(pair, f.ruleName ?? null);
  if (f.type === "missing-required-dependency") return t.missing(pair, f.ruleName ?? null);
  return t.undeclared(pair);
}

export function buildFindingsMail(projectName: string, findings: IConformanceFinding[], link: string, language: UserLanguage = "en"): NotificationMail {
  const t = MAIL_TEXT[language];
  const labels = TYPE_LABEL[language];
  const problems = summarize(findings);
  const errors = problems.filter(p => p.finding.severity === "error").length;
  const subject = t.subject(problems.length, projectName);
  const line = (p: ReturnType<typeof summarize>[number]) => {
    const files = p.finding.files.slice(0, 3).join(", ") + (p.finding.files.length > 3 ? t.moreFiles(p.finding.files.length - 3) : "");
    const where = t.commit(p.finding.snapshotHash, p.commits - 1);
    return { text: `[${t.severity(p.finding.severity)}] ${labels[p.finding.type]}: ${describe(p.finding, language)} — ${where}${files ? `; ${t.files}: ${files}` : ""}`, files, where };
  };
  const listed = problems.slice(0, MAX_LISTED);
  const more = problems.length - listed.length;
  const intro = t.intro(projectName, problems.length, errors);
  const text = [intro, "", ...listed.map(p => `- ${line(p).text}`), ...(more > 0 ? [`- ${t.more(more)}`] : []), "", `${t.review}: ${link}`].join("\n");
  const html = `<p>${escape(intro)}</p>
<ul>${listed.map(p => {
    const l = line(p);
    return `<li><strong>${escape(t.severity(p.finding.severity))}</strong> · ${escape(labels[p.finding.type])}: ${escape(describe(p.finding, language))}<br><small>${escape(l.where)}${l.files ? ` · ${escape(l.files)}` : ""}</small></li>`;
  }).join("")}${more > 0 ? `<li>${t.more(more)}</li>` : ""}</ul>
<p><a href="${escape(link)}">${t.reviewLink}</a></p>
<p><small>${escape(t.why(projectName))}</small></p>`;
  return { subject, html, text };
}

export class FindingNotifier {
  constructor(
    private readonly store: Pick<IConformanceRepository, "claimUnnotified" | "releaseClaim">,
    private readonly directory: NotifierDirectory,
    private readonly send: SendMail,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * E-mails what is new. Returns how many findings were reported, to how many of how many people: `recipients` 0 means
   * nobody could be told, `sent` 0 with recipients means no e-mail went out; either way the findings are given back for
   * the next try.
   */
  async notify(projectId: string): Promise<{ findings: number; problems: number; sent: number; recipients: number }> {
    const at = this.now();
    const findings = await this.store.claimUnnotified(projectId, at);
    if (!findings.length) return { findings: 0, problems: 0, sent: 0, recipients: 0 };
    // What the e-mail lists: the same finding in several commits is one problem.
    const problems = summarize(findings).length;
    const [name, recipients] = await Promise.all([this.directory.projectName(projectId), this.directory.recipients(projectId)]);
    // Nobody to tell: give them back, so they go out once someone can receive them (a maintainer added, an account
    // verified); the app shows them as unread meanwhile (MSG26).
    if (!recipients.length) {
      await this.store.releaseClaim(projectId, at);
      return { findings: findings.length, problems, sent: 0, recipients: 0 };
    }
    const link = `${this.appUrl.replace(/\/+$/, "")}/project-maintainer/conformance?project=${encodeURIComponent(projectId)}`;
    // One e-mail per language, each person getting theirs.
    const mails = new Map<UserLanguage, NotificationMail>();
    const mailFor = (language: UserLanguage = "en") => {
      if (!mails.has(language)) mails.set(language, buildFindingsMail(name ?? MAIL_TEXT[language].yourProject, findings, link, language));
      return mails.get(language)!;
    };
    const results = await Promise.allSettled(recipients.map(r => this.send(r.email, mailFor(r.language))));
    const sent = results.filter(r => r.status === "fulfilled").length;
    if (!sent) {
      // Not one e-mail went out: give the findings back so the next run tries again.
      await this.store.releaseClaim(projectId, at);
      const reason = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
      console.warn(`[conformance] could not e-mail findings of project ${projectId}:`, reason instanceof Error ? reason.message : reason);
    }
    return { findings: findings.length, problems, sent, recipients: recipients.length };
  }
}

/**
 * What runs after a fetch or mine (RF-29): the check, then the e-mail. A project without a confirmed diagram, or whose
 * baseline left the history, has nothing to check: that is not an error of the mining job.
 */
export function conformanceAfterMining(check: Pick<CheckConformanceUseCase, "execute">, notifier: Pick<FindingNotifier, "notify">) {
  return async (projectId: string): Promise<void> => {
    try {
      await check.execute(projectId);
    } catch (error) {
      if (error instanceof ConflictError) return;
      throw error;
    }
    await notifier.notify(projectId);
  };
}
