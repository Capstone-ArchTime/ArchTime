import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { ProjectModel } from '../database/models/ProjectModel.js';
import { MiningJobModel, JobStatus, JobKind } from '../database/models/MiningJobModel.js';
import { SnapshotModel } from '../database/models/SnapshotModel.js';
import { EvidenceModel } from '../database/models/EvidenceModel.js';
import { ProjectStatus } from '../../domain/entities/Project.js';
import {
  DEFAULT_BATCH_SIZE,
  GIT_LOG_FORMAT,
  analysisProgress,
  chunk,
  monthlyHistogram,
  orderForMining,
  parseCommitLog,
  parseTagRefs,
  redactSecret,
  selectPending,
  snapshotLabel,
  TAG_REF_FORMAT,
  type CommitRef,
  type MineRequest,
  type MinedIndex,
  type TagIndex,
} from '../../domain/mining/miningPlan.js';
import { runArchitectureJob } from './ArchitectureJob.js';
import { firstParentBase, type ParentIndex } from '../../domain/mining/baseline.js';
import { MongoOrganizationCredentialRepository } from '../repositories/MongoOrganizationCredentialRepository.js';
import { MongoProjectRepository } from '../repositories/MongoProjectRepository.js';
import { allowLocalRepos, validateRepoUrl } from '../../domain/mining/repoUrl.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { edgeKey, extractDependencies, type Graph, type GraphEdge, type GraphNode } from './DependencyExtractor.js';

const CACHE_ROOT = path.join(process.cwd(), 'mining-cache');
const PROGRESS_WRITE_INTERVAL_MS = 750;
const batchSize = () => Math.max(1, Math.floor(Number(process.env.MINING_BATCH_SIZE)) || DEFAULT_BATCH_SIZE);
/** Graphs of recently mined commits kept in memory, so a parent mined a moment ago is not read back from the database. */
const RECENT_GRAPHS = 64;

class CancelledError extends Error {}

// simple-git guards every GIT_* variable and the ones that make git run another program (EDITOR, PAGER, askpass...):
// passed explicitly they reject the command unless allowed. The server's own (an IDE's GIT_ASKPASS, for instance) are
// left out; only the two set here are allowed.
const GIT_GUARDED_ENV = /^(git_.*|editor|visual|pager|prefix|ssh_askpass)$/i;
const GIT_ENV_ALLOWED = ['GIT_ALLOW_PROTOCOL', 'GIT_TERMINAL_PROMPT'];
const gitSafeEnv = () => Object.fromEntries(
  Object.entries(process.env).filter(([k, v]) => v !== undefined && !GIT_GUARDED_ENV.test(k)),
) as Record<string, string>;

/**
 * Batch mining. Jobs run in-process through a small queue:
 *  - a `scan` job clones/fetches the repo and records its commit history (no AST work);
 *  - a `mine` job analyzes a chosen date range, or every commit not yet mined, in batches.
 * The repository is cached per project so continuing a partial mine does not re-clone.
 */
export class MiningService {
  private static readonly maxConcurrent = Math.max(1, Number(process.env.MINING_MAX_CONCURRENT) || 2);
  private static readonly queue: string[] = [];
  private static readonly running = new Set<string>();
  private static readonly cancelled = new Set<string>();
  private static readonly credentials = new MongoOrganizationCredentialRepository();
  private static readonly projects = new MongoProjectRepository();

  // ---------- public API ----------

  public static async startScanJob(projectId: string, userId: string): Promise<string> {
    return this.enqueue(projectId, userId, { kind: JobKind.SCAN, stage: 'Queued for scan' });
  }

  /** Groups a snapshot into components and refines the result with the chosen (else the default) AI model. */
  public static async startAbstractJob(projectId: string, userId: string, snapshotId?: string, modelId?: string): Promise<string> {
    return this.enqueue(projectId, userId, { kind: JobKind.ABSTRACT, stage: 'Queued', ...(snapshotId ? { target: snapshotId } : {}), ...(modelId ? { modelId } : {}) });
  }

  /** Runs each model on the same snapshot, one after another, for comparison. The project's stored components are not changed. */
  public static async startBenchmarkJob(projectId: string, userId: string, snapshotId: string, modelIds: string[], benchmarkId: string): Promise<string> {
    return this.enqueue(projectId, userId, {
      kind: JobKind.ABSTRACT, stage: 'Queued for benchmark', target: snapshotId, purpose: 'benchmark', benchmarkId, benchmarkModels: modelIds,
    });
  }

  public static async startMiningJob(projectId: string, userId: string, request?: MineRequest): Promise<string> {
    const req: MineRequest = request ?? { mode: 'remaining', force: false };
    return this.enqueue(projectId, userId, {
      kind: JobKind.MINE,
      stage: 'Queued',
      mode: req.mode,
      rangeSince: req.since,
      rangeUntil: req.until,
      force: req.force,
      ...(req.mode === 'milestones' ? { milestonesOnly: !!req.milestonesOnly } : {}),
    });
  }

  /**
   * Cancels a queued job at once, or tells a running worker to stop after its current commit. Who may cancel is
   * checked by the caller (MiningWorkflowUseCase for project members, CancelAdminJobUseCase for administrators).
   */
  public static async cancelJob(jobId: string, options: { by?: string; stage?: string } = {}) {
    const job = await MiningJobModel.findById(jobId);
    if (!job) throw new NotFoundError('Job not found');
    if (job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING) {
      job.cancelledAt = new Date();
      if (options.by) job.cancelledBy = options.by;
    }
    // Queued, or "running" with no worker in this process (nothing would ever notice the flag): cancel at once.
    if (job.status === JobStatus.QUEUED || (job.status === JobStatus.RUNNING && !this.running.has(jobId))) {
      const at = this.queue.indexOf(jobId);
      if (at >= 0) this.queue.splice(at, 1);
      job.stage = options.stage ?? (job.status === JobStatus.QUEUED ? 'Cancelled before start' : 'Cancelled');
      job.status = JobStatus.CANCELLED;
      job.finishedAt = new Date();
      await job.save();
    } else if (job.status === JobStatus.RUNNING) {
      this.cancelled.add(jobId);
      job.stage = 'Stopping after the current commit';
      await job.save();
    }
    return job;
  }

  /** Exact commit counts for a prospective range, from the cached clone. */
  public static async estimate(project: any, request: MineRequest) {
    const dir = this.repoDir(project.id);
    if (!fs.existsSync(path.join(dir, '.git'))) throw new ConflictError('Scan the repository before estimating a range');
    const commits = await this.listCommits(simpleGit(dir));
    const mined = await this.minedIndex(project.id);
    const inRange = selectPending(commits, { full: new Set(), short: new Set() }, { ...request, force: true });
    const pending = selectPending(commits, mined, request);
    return {
      inRange: inRange.length,
      alreadyMined: inRange.length - (request.force ? 0 : pending.length),
      toMine: pending.length,
      batchSize: batchSize(),
      batchCount: Math.ceil(pending.length / batchSize()),
    };
  }

  public static async overview(project: any) {
    const projectId = String(project.id ?? project._id);
    const [count, bounds, monthly, activeJob, lastJob] = await Promise.all([
      SnapshotModel.countDocuments({ projectId }),
      SnapshotModel.aggregate([{ $match: { projectId } }, { $group: { _id: null, first: { $min: '$date' }, last: { $max: '$date' } } }]),
      SnapshotModel.aggregate([
        { $match: { projectId } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'UTC' } }, commits: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      MiningJobModel.findOne({ projectId, status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } }).sort({ createdAt: -1 }).lean(),
      MiningJobModel.findOne({ projectId }).sort({ createdAt: -1 }).lean(),
    ]);
    const history = project.history ?? null;
    return {
      project: { id: projectId, name: project.name, status: project.status },
      history,
      mined: {
        count,
        firstDate: bounds[0]?.first ?? null,
        lastDate: bounds[0]?.last ?? null,
        monthly: monthly.map((m: any) => ({ month: m._id, commits: m.commits })),
      },
      remaining: history ? Math.max(0, history.totalCommits - count) : null,
      activeJob,
      lastJob,
    };
  }

  /** Called on boot: jobs run in this process, so anything still active was interrupted. */
  public static async recoverInterruptedJobs(): Promise<void> {
    const stale = await MiningJobModel.find({ status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } });
    for (const job of stale) {
      job.status = JobStatus.FAILED;
      job.stage = 'Interrupted by server restart';
      job.error = 'The server restarted while this job was active. Start a new job to continue; mined commits are kept.';
      job.finishedAt = new Date();
      await job.save();
      await this.settleProjectStatus(job.projectId, false);
    }
  }

  /** Removes everything mining created for a deleted project. */
  public static async purgeProject(projectId: string): Promise<void> {
    const active = await MiningJobModel.find({ projectId, status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } }).select('_id').lean();
    for (const { _id } of active) {
      const id = String(_id);
      const at = this.queue.indexOf(id);
      if (at >= 0) this.queue.splice(at, 1);
      this.cancelled.add(id);
    }
    await Promise.all([
      SnapshotModel.deleteMany({ projectId }),
      EvidenceModel.deleteMany({ projectId }),
      MiningJobModel.deleteMany({ projectId, status: { $nin: [JobStatus.RUNNING] } }),
    ]);
    // A running worker stops at its next cancellation check; its directory is removed here regardless.
    fs.rmSync(this.repoDir(projectId), { recursive: true, force: true });
  }

  // ---------- queue ----------

  private static async enqueue(projectId: string, userId: string, fields: Record<string, unknown>): Promise<string> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new NotFoundError('Workspace not found');
    const busy = await MiningJobModel.exists({ projectId, status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } });
    if (busy) throw new ConflictError('A job is already queued or running for this workspace');

    const job = await MiningJobModel.create({
      projectId,
      requestedBy: userId,
      status: JobStatus.QUEUED,
      progress: 0,
      batchSize: batchSize(),
      ...fields,
    });
    this.queue.push(job.id);
    this.pump();
    return job.id;
  }

  private static pump() {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const jobId = this.queue.shift() as string;
      this.running.add(jobId);
      this.run(jobId)
        .catch(console.error)
        .finally(() => {
          this.running.delete(jobId);
          this.cancelled.delete(jobId);
          this.pump();
        });
    }
  }

  // ---------- worker ----------

  private static repoDir(projectId: string) {
    return path.join(CACHE_ROOT, String(projectId));
  }

  private static async run(jobId: string) {
    const job = await MiningJobModel.findById(jobId);
    if (!job || job.status !== JobStatus.QUEUED) return;
    const project = await ProjectModel.findById(job.projectId);
    let secret: string | undefined;
    const set = (patch: Record<string, unknown>) => MiningJobModel.updateOne({ _id: jobId }, { $set: patch });
    const checkCancel = () => {
      if (this.cancelled.has(jobId)) throw new CancelledError();
    };

    if (job.kind === JobKind.ABSTRACT) {
      // Not a repository job: no clone, no project status change.
      await runArchitectureJob({
        id: jobId, projectId: String(job.projectId), target: job.target, requestedBy: String(job.requestedBy), modelId: job.modelId,
        purpose: job.purpose, benchmarkId: job.benchmarkId, benchmarkModels: job.benchmarkModels,
      }, () => this.cancelled.has(jobId));
      return;
    }

    try {
      if (!project) throw new Error('Workspace no longer exists');
      secret = await this.repoToken(project);
      await set({ status: JobStatus.RUNNING, startedAt: new Date(), stage: 'Preparing repository', progress: 1 });
      if (job.kind === JobKind.MINE) {
        await ProjectModel.updateOne({ _id: project._id }, { $set: { status: ProjectStatus.ANALYZING } });
      }

      const git = await this.ensureRepo(project, secret, async (stage, progress) => {
        checkCancel();
        await set({ stage, progress });
      });
      checkCancel();

      await set({ stage: 'Reading commit history', progress: 8 });
      const commits = await this.listCommits(git);
      await ProjectModel.updateOne({ _id: project._id }, { $set: { history: {
        totalCommits: commits.length,
        firstCommitDate: commits[0]?.date,
        lastCommitDate: commits[commits.length - 1]?.date,
        monthly: monthlyHistogram(commits),
        scannedAt: new Date(),
      } } });
      await this.markVanishedCommits(String(project._id), git);
      const tags = await this.listTags(git);
      await this.labelMilestones(String(project._id), tags);

      if (job.kind === JobKind.SCAN) {
        await set({ stage: 'Checking dependency counts', progress: 90 });
        await this.rebaseline(project, git, commits);
        await set({ status: JobStatus.COMPLETED, stage: `Scanned ${commits.length} commits`, progress: 100, total: 0, finishedAt: new Date() });
        return;
      }

      const request: MineRequest = { mode: job.mode ?? 'remaining', since: job.rangeSince ?? undefined, until: job.rangeUntil ?? undefined, force: !!job.force, milestonesOnly: !!job.milestonesOnly };
      const index = await this.minedIndex(String(project._id));
      // Milestones mode mines the tagged commits first; already mined commits are never mined twice (selectPending).
      const pending = orderForMining(selectPending(commits, index, request), tags, request);
      const batches = chunk(pending, job.batchSize || batchSize());
      await set({ total: pending.length, batchCount: batches.length, stage: pending.length ? 'Starting analysis' : 'Nothing to mine', progress: 10 });

      if (request.force && pending.length) {
        await this.discardSnapshots(String(project._id), pending);
        for (const c of pending) { index.full.delete(c.hash); index.short.delete(c.hash.substring(0, 7)); }
      }
      const parents: ParentIndex = new Map(commits.map(c => [c.hash, c.parents]));
      const isMined = (hash: string) => index.full.has(hash) || index.short.has(hash.substring(0, 7));
      // Graphs of this batch (not saved yet) and of the last few commits mined, by full hash.
      const batchGraphs = new Map<string, Graph>();
      const recent = new Map<string, Graph>();
      const graphOf = async (hash: string) => batchGraphs.get(hash) ?? recent.get(hash) ?? (await this.loadGraph(String(project._id), hash));

      const processedHashes = new Set<string>();
      let processed = 0;
      let failed = 0;
      let lastWrite = 0;

      for (let b = 0; b < batches.length; b++) {
        checkCancel();
        const snapshotDocs: any[] = [];
        const evidenceDocs: any[] = [];

        for (const commit of batches[b]) {
          checkCancel();
          const shortHash = commit.hash.substring(0, 7);
          if (Date.now() - lastWrite > PROGRESS_WRITE_INTERVAL_MS) {
            lastWrite = Date.now();
            await set({ stage: `Batch ${b + 1}/${batches.length} - ${shortHash}`, batchIndex: b + 1, processed, failedCommits: failed, progress: analysisProgress(processed, pending.length) });
          }

          try {
            await git.raw(['checkout', '--force', '--quiet', commit.hash]);
            const { nodes, edges } = extractDependencies(this.repoDir(String(project._id)));

            // Baseline: the nearest mined commit on this commit's first-parent line (see domain/mining/baseline.ts).
            const baseHash = firstParentBase(commit.hash, parents, isMined) ?? '';
            const before: Graph | null = baseHash ? await graphOf(baseHash) : null;
            const diff = this.diffGraphs(before, { nodes, edges });
            const archChanges = diff.depAdded + diff.depRemoved > 0 ? 1 : 0;

            snapshotDocs.push({
              projectId: project._id, hash: shortHash, fullHash: commit.hash, version: snapshotLabel(commit.hash, tags),
              tags: tags.get(commit.hash.toLowerCase()) ?? [],
              title: commit.message || '(no message)', author: commit.author || 'unknown', date: commit.date,
              branches: commit.ref ? [commit.ref] : [], files: nodes.length, archChanges,
              depAdded: diff.depAdded, depRemoved: diff.depRemoved, baseHash, nodes, edges,
            });
            if (archChanges > 0 && before) evidenceDocs.push(await this.evidenceDoc(project, git, commit, before, nodes.length, diff));

            const graph = { nodes, edges };
            batchGraphs.set(commit.hash, graph);
            recent.set(commit.hash, graph);
            if (recent.size > RECENT_GRAPHS) recent.delete(recent.keys().next().value!);
            index.full.add(commit.hash);
            processedHashes.add(shortHash);
          } catch (error) {
            if (error instanceof CancelledError) throw error;
            failed++; // keep going: one unparsable commit must not abort a long run
          }
          processed++;
        }

        // Persist the batch so a cancel or crash keeps everything analyzed so far.
        if (snapshotDocs.length) await SnapshotModel.insertMany(snapshotDocs, { ordered: false });
        if (evidenceDocs.length) await EvidenceModel.insertMany(evidenceDocs, { ordered: false });
        batchGraphs.clear();
        lastWrite = Date.now();
        await set({ stage: `Batch ${b + 1}/${batches.length} saved`, batchIndex: b + 1, processed, failedCommits: failed, progress: analysisProgress(processed, pending.length) });
      }

      // Snapshots mined before (in a gap this run filled, or under the old rule) may now have a nearer base.
      if (processedHashes.size) await this.rebaseline(project, git, commits);
      await set({ status: JobStatus.COMPLETED, stage: failed ? `Completed with ${failed} unreadable commits` : 'Completed', progress: 100, processed, failedCommits: failed, finishedAt: new Date() });
      await this.settleProjectStatus(String(project._id), false);
    } catch (error: any) {
      if (error instanceof CancelledError) {
        await set({ status: JobStatus.CANCELLED, stage: 'Cancelled - mined commits were kept', finishedAt: new Date() });
        await this.settleProjectStatus(String(job.projectId), false);
        return;
      }
      console.error(error);
      const message = redactSecret(String(error?.message ?? error), secret);
      await set({ status: JobStatus.FAILED, stage: 'Failed: ' + message, error: message, finishedAt: new Date() });
      await this.settleProjectStatus(String(job.projectId), true);
    }
  }

  /** The organization credential when the project uses one, else the project's own token for a private repository. */
  private static async repoToken(project: any): Promise<string | undefined> {
    if (project.credentialId) {
      const token = await this.credentials.resolveSecret(String(project.credentialId));
      if (!token) throw new Error('The organization credential for this workspace was deleted. Ask an organization owner to attach another one.');
      return token;
    }
    return project.visibility === 'private' ? this.projects.resolveToken(String(project._id ?? project.id)) : undefined;
  }

  private static async ensureRepo(project: any, token: string | undefined, report: (stage: string, progress: number) => Promise<void>): Promise<SimpleGit> {
    const id = String(project._id);
    const dir = this.repoDir(id);
    // The token travels as a per-process HTTP header, never in the remote URL or on disk.
    const config = token
      ? [`http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`]
      : [];
    // Projects registered before URLs were checked are checked here too, and git itself is limited to the allowed
    // transports, so no URL (or redirect, or submodule) can make the server read local paths or run ext:: commands.
    const remoteUrl = validateRepoUrl(project.repoUrl);
    const remote = (baseDir: string) => simpleGit({ baseDir, config, allowEnvironment: GIT_ENV_ALLOWED })
      .env({ ...gitSafeEnv(), GIT_ALLOW_PROTOCOL: allowLocalRepos() ? 'https:http:file' : 'https', GIT_TERMINAL_PROMPT: '0' });

    if (fs.existsSync(path.join(dir, '.git'))) {
      await report('Fetching new commits', 3);
      const git = remote(dir);
      try {
        // --tags: a release tagged on an older commit is a milestone too, not only tags on newly fetched commits.
        await git.fetch(['origin', '--prune', '--tags', '+refs/heads/*:refs/remotes/origin/*']);
        return git;
      } catch {
        fs.rmSync(dir, { recursive: true, force: true }); // corrupt cache: fall through to a fresh clone
      }
    }
    await report('Cloning repository', 2);
    fs.mkdirSync(dir, { recursive: true });
    await remote(dir).clone(remoteUrl, '.', ['--no-checkout']);
    return simpleGit(dir);
  }

  /** Tags of the repository by commit; an unreadable tag list means no milestones, not a failed job. */
  private static async listTags(git: SimpleGit): Promise<TagIndex> {
    try {
      return parseTagRefs(await git.raw(['for-each-ref', 'refs/tags', `--format=${TAG_REF_FORMAT}`]));
    } catch (error) {
      console.warn('[mining] could not list tags; milestones are skipped', error);
      return new Map();
    }
  }

  /**
   * Names mined snapshots after the tags on their commits (a tag added after the commit was mined counts too), and
   * takes the name off snapshots whose tag is gone, so the history can be read release by release.
   */
  private static async labelMilestones(projectId: string, tags: TagIndex): Promise<void> {
    for (const [hash, names] of tags) {
      await SnapshotModel.updateMany({ projectId, fullHash: hash }, { $set: { tags: names, version: snapshotLabel(hash, tags) } });
    }
    await SnapshotModel.updateMany(
      { projectId, tags: { $exists: true, $ne: [] }, fullHash: { $nin: [...tags.keys()] } },
      [{ $set: { tags: [], version: '$hash' } }],
    );
  }

  private static async listCommits(git: SimpleGit): Promise<CommitRef[]> {
    const raw = await git.raw(['log', '--all', '--source', '--date-order', '--reverse', `--format=${GIT_LOG_FORMAT}`]);
    return parseCommitLog(raw);
  }

  /**
   * Flags snapshots whose commit is no longer reachable from the remote's branches or tags (force-push, deleted branch),
   * and clears the flag when the commit is back. Local refs are left out on purpose: the cache's own branch and detached
   * HEAD keep rewritten commits reachable. Steps pinned to such a commit then read as missing (domain/onboarding/stepRevision.ts).
   */
  private static async markVanishedCommits(projectId: string, git: SimpleGit): Promise<void> {
    let reachable: string[];
    try {
      reachable = (await git.raw(['rev-list', '--remotes', '--tags'])).split('\n').map(s => s.trim()).filter(Boolean);
    } catch (error) {
      console.warn(`[mining] project ${projectId}: could not list remote commits, vanished-commit check skipped`, error);
      return;
    }
    // An empty remote is far more likely a fetch problem than a wiped history; do not flag everything.
    if (reachable.length === 0) return;
    try {
      await SnapshotModel.updateMany(
        { projectId, fullHash: { $exists: true, $nin: reachable }, missingSince: null },
        { $set: { missingSince: new Date() } },
      );
      await SnapshotModel.updateMany(
        { projectId, fullHash: { $in: reachable }, missingSince: { $ne: null } },
        { $set: { missingSince: null } },
      );
    } catch (error) {
      // Best effort: a failed check must not fail the scan or mine it runs in.
      console.warn(`[mining] project ${projectId}: vanished-commit check failed`, error);
    }
  }

  private static async minedIndex(projectId: string): Promise<MinedIndex> {
    const index: MinedIndex = { full: new Set(), short: new Set() };
    for await (const s of SnapshotModel.find({ projectId }).select('hash fullHash').lean().cursor()) {
      if ((s as any).fullHash) index.full.add((s as any).fullHash);
      else index.short.add((s as any).hash);
    }
    return index;
  }

  /** The graph of a mined commit, by full hash; legacy snapshots stored only the 7-character hash. */
  private static async loadGraph(projectId: string, hash: string): Promise<Graph | null> {
    const s = (await SnapshotModel.findOne({ projectId, fullHash: hash }).select('nodes edges').lean())
      ?? (await SnapshotModel.findOne({ projectId, hash: hash.substring(0, 7) }).select('nodes edges').lean());
    return s ? { nodes: (s as any).nodes as GraphNode[], edges: (s as any).edges as GraphEdge[] } : null;
  }

  private static diffGraphs(before: Graph | null, after: Graph) {
    if (!before) return { depAdded: 0, depRemoved: 0 };
    const prevKeys = new Set(before.edges.map(edgeKey));
    const nextKeys = new Set(after.edges.map(edgeKey));
    return {
      depAdded: after.edges.filter(e => !prevKeys.has(edgeKey(e))).length,
      depRemoved: before.edges.filter(e => !nextKeys.has(edgeKey(e))).length,
    };
  }

  /** The evidence record for a commit whose dependencies changed against `before`, with its patch and changed files. */
  private static async evidenceDoc(project: any, git: SimpleGit, commit: CommitRef, before: Graph, files: number, diff: { depAdded: number; depRemoved: number }) {
    let patch = '';
    let changedFiles: string[] = [];
    try {
      patch = await git.show([commit.hash, '--patch']);
      changedFiles = (await git.show([commit.hash, '--name-only', '--format='])).split('\n').map(f => f.trim()).filter(Boolean);
    } catch { /* evidence is best-effort */ }
    let type = 'DEPENDENCY CHANGE';
    if (files > before.nodes.length) type = 'MODULE EXTRACTION';
    if (files < before.nodes.length) type = 'MODULE REMOVAL';
    return {
      projectId: project._id, changeTitle: commit.message.split('\n')[0] || 'Architectural Change', type,
      repository: project.name || 'repository', commit: commit.hash.substring(0, 7), files: changedFiles.length, date: commit.date,
      summary: `Detected structural change: ${diff.depAdded} dependencies added, ${diff.depRemoved} dependencies removed.`,
      depsAdded: diff.depAdded, depsRemoved: diff.depRemoved, sourceFiles: changedFiles, diffBefore: patch, diffAfter: '',
    };
  }

  /**
   * Recounts every snapshot whose base is not the one its first-parent line gives now: a gap a later run filled put a
   * nearer commit in between, or the snapshot was counted under the old rule (previous snapshot in time, whatever its
   * branch) and has no baseHash. Its evidence record is redone to match. Commits no longer in the history keep their counts.
   */
  private static async rebaseline(project: any, git: SimpleGit, commits: CommitRef[]): Promise<number> {
    const projectId = String(project._id);
    const parents: ParentIndex = new Map(commits.map(c => [c.hash, c.parents]));
    const byFull = new Map(commits.map(c => [c.hash, c]));
    const byShort = new Map(commits.map(c => [c.hash.substring(0, 7), c.hash]));
    const rows = await SnapshotModel.find({ projectId }).select('hash fullHash baseHash').lean() as any[];
    const fullOf = (r: any): string | undefined => r.fullHash ?? byShort.get(r.hash);
    const mined = new Set(rows.map(fullOf).filter((h): h is string => !!h));
    let recounted = 0;
    for (const row of rows) {
      const full = fullOf(row);
      if (!full || !parents.has(full)) continue;
      const baseHash = firstParentBase(full, parents, h => mined.has(h)) ?? '';
      if (row.baseHash === baseHash) continue;
      const after = await this.loadGraph(projectId, full);
      if (!after) continue;
      const before = baseHash ? await this.loadGraph(projectId, baseHash) : null;
      const diff = this.diffGraphs(before, after);
      const archChanges = diff.depAdded + diff.depRemoved > 0 ? 1 : 0;
      await SnapshotModel.updateOne({ _id: row._id }, { $set: { depAdded: diff.depAdded, depRemoved: diff.depRemoved, archChanges, baseHash, fullHash: full } });
      await EvidenceModel.deleteMany({ projectId, commit: row.hash });
      if (archChanges && before) await EvidenceModel.insertMany([await this.evidenceDoc(project, git, byFull.get(full)!, before, after.nodes.length, diff)]);
      recounted++;
    }
    return recounted;
  }

  private static async discardSnapshots(projectId: string, commits: CommitRef[]) {
    for (const part of chunk(commits, 1000)) {
      const short = part.map(c => c.hash.substring(0, 7));
      await SnapshotModel.deleteMany({ projectId, hash: { $in: short } });
      await EvidenceModel.deleteMany({ projectId, commit: { $in: short } });
    }
  }

  private static async settleProjectStatus(projectId: string, failed: boolean) {
    const project = await ProjectModel.findById(projectId);
    if (!project) return;
    const mined = await SnapshotModel.countDocuments({ projectId });
    const total = project.history?.totalCommits ?? 0;
    project.status = mined === 0
      ? (failed ? ProjectStatus.FAILED : ProjectStatus.PENDING)
      : total > 0 && mined >= total ? ProjectStatus.COMPLETED : ProjectStatus.PARTIAL;
    await project.save();
  }
}
