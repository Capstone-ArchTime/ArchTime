import type { IConformanceFinding } from "../../../domain/entities/ConformanceFinding.js";
import type { IConformanceRepository } from "../../../domain/interfaces/IConformanceRepository.js";
import { ConflictError } from "../../../shared/errors/AppError.js";
import type { CheckConformanceUseCase } from "./ConformanceUseCases.js";

// After every fetch or mine the conformance check runs on its own, and the people who answer for the architecture hear
// about what is new: one e-mail per project and run, to its maintainers and the owner of its organization (RF-29,
// BR-34). A finding is e-mailed once: notifiedAt is set when it is taken for an e-mail and never cleared after a send.

export interface Recipient { email: string; name: string }

export interface NotifierDirectory {
  projectName(projectId: string): Promise<string | null>;
  /** Active, verified people with write access who must hear about findings: owner, maintainers, organization owner. */
  recipients(projectId: string): Promise<Recipient[]>;
}

export interface NotificationMail { subject: string; html: string; text: string }
export type SendMail = (to: string, mail: NotificationMail) => Promise<void>;

const MAX_LISTED = 10;
const TYPE_LABEL: Record<IConformanceFinding["type"], string> = {
  "forbidden-dependency": "Forbidden dependency",
  "missing-required-dependency": "Missing required dependency",
  "undeclared-dependency": "Undeclared dependency",
};
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

function describe(f: IConformanceFinding): string {
  const pair = `${f.sourceName} → ${f.targetName}`;
  if (f.type === "forbidden-dependency") return `${pair} is forbidden${f.ruleName ? ` by "${f.ruleName}"` : ""}`;
  if (f.type === "missing-required-dependency") return `${pair} is required${f.ruleName ? ` by "${f.ruleName}"` : ""} but missing`;
  return `${pair} is not in the confirmed diagram`;
}

export function buildFindingsMail(projectName: string, findings: IConformanceFinding[], link: string): NotificationMail {
  const problems = summarize(findings);
  const errors = problems.filter(p => p.finding.severity === "error").length;
  const subject = `ArchTime — ${problems.length} new conformance finding${problems.length === 1 ? "" : "s"} in ${projectName}`;
  const line = (p: ReturnType<typeof summarize>[number]) => {
    const files = p.finding.files.slice(0, 3).join(", ") + (p.finding.files.length > 3 ? ` and ${p.finding.files.length - 3} more` : "");
    const where = `commit ${p.finding.snapshotHash}${p.commits > 1 ? ` (and ${p.commits - 1} earlier)` : ""}`;
    return { text: `[${p.finding.severity}] ${TYPE_LABEL[p.finding.type]}: ${describe(p.finding)} — ${where}${files ? `; files: ${files}` : ""}`, files, where };
  };
  const listed = problems.slice(0, MAX_LISTED);
  const more = problems.length - listed.length;
  const intro = `The conformance check of ${projectName} found ${problems.length} new problem${problems.length === 1 ? "" : "s"} (${errors} error${errors === 1 ? "" : "s"}) where the code departs from the confirmed component diagram.`;
  const text = [intro, "", ...listed.map(p => `- ${line(p).text}`), ...(more > 0 ? [`- and ${more} more`] : []), "", `Review and decide: ${link}`].join("\n");
  const html = `<p>${escape(intro)}</p>
<ul>${listed.map(p => {
    const l = line(p);
    return `<li><strong>${escape(p.finding.severity)}</strong> · ${escape(TYPE_LABEL[p.finding.type])}: ${escape(describe(p.finding))}<br><small>${escape(l.where)}${l.files ? ` · ${escape(l.files)}` : ""}</small></li>`;
  }).join("")}${more > 0 ? `<li>and ${more} more</li>` : ""}</ul>
<p><a href="${escape(link)}">Review and decide in ArchTime</a></p>
<p><small>You get this because you maintain ${escape(projectName)}. Each finding is e-mailed once.</small></p>`;
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

  /** E-mails what is new; returns how many findings were reported and to how many people. */
  async notify(projectId: string): Promise<{ findings: number; sent: number }> {
    const at = this.now();
    const findings = await this.store.claimUnnotified(projectId, at);
    if (!findings.length) return { findings: 0, sent: 0 };
    const [name, recipients] = await Promise.all([this.directory.projectName(projectId), this.directory.recipients(projectId)]);
    // Nobody to tell: they stay claimed, the app still shows them as unread (MSG26).
    if (!recipients.length) return { findings: findings.length, sent: 0 };
    const link = `${this.appUrl.replace(/\/+$/, "")}/project-maintainer/conformance?project=${encodeURIComponent(projectId)}`;
    const mail = buildFindingsMail(name ?? "your project", findings, link);
    const results = await Promise.allSettled(recipients.map(r => this.send(r.email, mail)));
    const sent = results.filter(r => r.status === "fulfilled").length;
    if (!sent) {
      // Not one e-mail went out: give the findings back so the next run tries again.
      await this.store.releaseClaim(projectId, at);
      const reason = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
      console.warn(`[conformance] could not e-mail findings of project ${projectId}:`, reason instanceof Error ? reason.message : reason);
    }
    return { findings: findings.length, sent };
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
