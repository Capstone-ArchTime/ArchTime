import { ConflictError } from "../../shared/errors/AppError.js";

/**
 * The automatic check: every few minutes, each workspace whose component diagram is confirmed fetches its repository,
 * mines the commits newer than its newest mined one, and runs the conformance check (MiningService `watch` job). New
 * findings then reach the people who answer for the workspace by e-mail and in the app, without anyone pressing
 * "Check for new commits". WATCH_INTERVAL_MINUTES sets the period (30 by default); 0 turns it off.
 */

const DEFAULT_MINUTES = 30;
/** After a failed automatic check, the workspace waits this long before the next try (an expired token, a gone repo). */
export const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60 * 1000;

/** The period in minutes; 0 when the automatic check is off. */
export function watchIntervalMinutes(value: string | undefined = process.env.WATCH_INTERVAL_MINUTES): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MINUTES;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What the watcher knows of a workspace when it decides whether to check it. */
export interface WatchCandidate {
  projectId: string;
  /** Who the job is recorded for: the workspace owner. */
  ownerId: string;
  /** Its component diagram is confirmed (there is something to check against). */
  confirmed: boolean;
  /** At least one commit was mined (the check mines only what is newer). */
  mined: boolean;
  /** Its organization is suspended: nothing runs for it. */
  suspended: boolean;
  /** A job is queued or running for it. */
  busy: boolean;
  /** When its last automatic check failed, if the last one failed. */
  lastWatchFailedAt: Date | null;
}

export function shouldWatch(c: WatchCandidate, now: Date, retryAfterMs = RETRY_AFTER_FAILURE_MS): boolean {
  if (!c.confirmed || !c.mined || c.suspended || c.busy || !c.ownerId) return false;
  return !c.lastWatchFailedAt || now.getTime() - c.lastWatchFailedAt.getTime() >= retryAfterMs;
}

export class RepositoryWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly intervalMs: number,
    private readonly candidates: () => Promise<WatchCandidate[]>,
    private readonly startJob: (projectId: string, ownerId: string) => Promise<string>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Starts the periodic check; does nothing when the period is 0. The first check runs one period after start. */
  start(): boolean {
    if (this.intervalMs <= 0 || this.timer) return false;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    this.timer.unref?.(); // never keeps the process alive on its own
    return true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One round: queues a check for every workspace that needs one. Returns how many were queued. */
  async tick(): Promise<number> {
    if (this.ticking) return 0; // a slow round is still queuing: skip this one
    this.ticking = true;
    let queued = 0;
    try {
      const now = this.now();
      for (const c of (await this.candidates()).filter(c => shouldWatch(c, now))) {
        try {
          await this.startJob(c.projectId, c.ownerId);
          queued++;
        } catch (error) {
          // A job started in the meantime (someone pressed Mine): this workspace waits for the next round.
          if (!(error instanceof ConflictError)) console.error(`[watch] could not queue the automatic check of project ${c.projectId}:`, error);
        }
      }
    } catch (error) {
      console.error("[watch] the automatic check could not list the workspaces:", error);
    } finally {
      this.ticking = false;
    }
    return queued;
  }
}
