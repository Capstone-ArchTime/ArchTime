import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
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
  parseCommitLog,
  redactSecret,
  selectPending,
  type CommitRef,
  type MineRequest,
  type MinedIndex,
} from '../../domain/mining/miningPlan.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';

type GraphNode = { id: string; name: string; type: string };
type GraphEdge = { source: string; target: string; type: string };
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const CACHE_ROOT = path.join(process.cwd(), 'mining-cache');
const PROGRESS_WRITE_INTERVAL_MS = 750;
const batchSize = () => Math.max(1, Math.floor(Number(process.env.MINING_BATCH_SIZE)) || DEFAULT_BATCH_SIZE);
const edgeKey = (e: GraphEdge) => `${e.source}\u0000${e.target}`;

class CancelledError extends Error {}

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

  // ---------- public API ----------

  public static async startScanJob(projectId: string, userId: string): Promise<string> {
    return this.enqueue(projectId, userId, { kind: JobKind.SCAN, stage: 'Queued for scan' });
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
    });
  }

  public static async cancelJob(jobId: string, userId: string) {
    const job = await MiningJobModel.findById(jobId);
    if (!job) throw new NotFoundError('Job not found');
    const project = await ProjectModel.findOne({ _id: job.projectId, userId });
    if (!project) throw new NotFoundError('Job not found');
    if (job.status === JobStatus.QUEUED) {
      const at = this.queue.indexOf(jobId);
      if (at >= 0) this.queue.splice(at, 1);
      job.status = JobStatus.CANCELLED;
      job.stage = 'Cancelled before start';
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
    if (!project) throw new NotFoundError('Project not found');
    const busy = await MiningJobModel.exists({ projectId, status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } });
    if (busy) throw new ConflictError('A job is already queued or running for this project');

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
    const secret = project?.token || undefined;
    const set = (patch: Record<string, unknown>) => MiningJobModel.updateOne({ _id: jobId }, { $set: patch });
    const checkCancel = () => {
      if (this.cancelled.has(jobId)) throw new CancelledError();
    };

    try {
      if (!project) throw new Error('Project no longer exists');
      await set({ status: JobStatus.RUNNING, startedAt: new Date(), stage: 'Preparing repository', progress: 1 });
      if (job.kind === JobKind.MINE) {
        await ProjectModel.updateOne({ _id: project._id }, { $set: { status: ProjectStatus.ANALYZING } });
      }

      const git = await this.ensureRepo(project, async (stage, progress) => {
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

      if (job.kind === JobKind.SCAN) {
        await set({ status: JobStatus.COMPLETED, stage: `Scanned ${commits.length} commits`, progress: 100, total: 0, finishedAt: new Date() });
        return;
      }

      const request: MineRequest = { mode: job.mode ?? 'remaining', since: job.rangeSince ?? undefined, until: job.rangeUntil ?? undefined, force: !!job.force };
      const pending = selectPending(commits, await this.minedIndex(String(project._id)), request);
      const batches = chunk(pending, job.batchSize || batchSize());
      await set({ total: pending.length, batchCount: batches.length, stage: pending.length ? 'Starting analysis' : 'Nothing to mine', progress: 10 });

      if (request.force && pending.length) await this.discardSnapshots(String(project._id), pending);

      const processedHashes = new Set<string>();
      let processed = 0;
      let failed = 0;
      let lastWrite = 0;
      let prev: Graph | null = null;

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
            const { nodes, edges } = this.analyzeAST(this.repoDir(String(project._id)));

            // Baseline is the previous snapshot in time: the one mined in this run, else the latest earlier one.
            const before: Graph | null = prev ?? (await this.snapshotBefore(String(project._id), commit.date));
            const diff = this.diffGraphs(before, { nodes, edges });
            const archChanges = diff.depAdded + diff.depRemoved > 0 ? 1 : 0;

            snapshotDocs.push({
              projectId: project._id, hash: shortHash, fullHash: commit.hash, version: shortHash,
              title: commit.message || '(no message)', author: commit.author || 'unknown', date: commit.date,
              branches: commit.ref ? [commit.ref] : [], files: nodes.length, archChanges,
              depAdded: diff.depAdded, depRemoved: diff.depRemoved, nodes, edges,
            });

            if (archChanges > 0 && before) {
              let patch = '';
              let changedFiles: string[] = [];
              try {
                patch = await git.show([commit.hash, '--patch']);
                changedFiles = (await git.show([commit.hash, '--name-only', '--format='])).split('\n').map(f => f.trim()).filter(Boolean);
              } catch { /* evidence is best-effort */ }
              let type = 'DEPENDENCY CHANGE';
              if (nodes.length > before.nodes.length) type = 'MODULE EXTRACTION';
              if (nodes.length < before.nodes.length) type = 'MODULE REMOVAL';
              evidenceDocs.push({
                projectId: project._id, changeTitle: commit.message.split('\n')[0] || 'Architectural Change', type,
                repository: project.name || 'repository', commit: shortHash, files: changedFiles.length, date: commit.date,
                summary: `Detected structural change: ${diff.depAdded} dependencies added, ${diff.depRemoved} dependencies removed.`,
                depsAdded: diff.depAdded, depsRemoved: diff.depRemoved, sourceFiles: changedFiles, diffBefore: patch, diffAfter: '',
              });
            }
            prev = { nodes, edges };
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
        lastWrite = Date.now();
        await set({ stage: `Batch ${b + 1}/${batches.length} saved`, batchIndex: b + 1, processed, failedCommits: failed, progress: analysisProgress(processed, pending.length) });
      }

      if (processedHashes.size) await this.refreshSuccessors(String(project._id), processedHashes);
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

  private static async ensureRepo(project: any, report: (stage: string, progress: number) => Promise<void>): Promise<SimpleGit> {
    const id = String(project._id);
    const dir = this.repoDir(id);
    // The token travels as a per-process HTTP header, never in the remote URL or on disk.
    const config = project.visibility === 'private' && project.token
      ? [`http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${project.token}`).toString('base64')}`]
      : [];

    if (fs.existsSync(path.join(dir, '.git'))) {
      await report('Fetching new commits', 3);
      const git = simpleGit({ baseDir: dir, config });
      try {
        await git.fetch(['origin', '--prune', '+refs/heads/*:refs/remotes/origin/*']);
        return git;
      } catch {
        fs.rmSync(dir, { recursive: true, force: true }); // corrupt cache: fall through to a fresh clone
      }
    }
    await report('Cloning repository', 2);
    fs.mkdirSync(dir, { recursive: true });
    await simpleGit({ baseDir: dir, config }).clone(project.repoUrl, '.', ['--no-checkout']);
    return simpleGit(dir);
  }

  private static async listCommits(git: SimpleGit): Promise<CommitRef[]> {
    const raw = await git.raw(['log', '--all', '--source', '--date-order', '--reverse', `--format=${GIT_LOG_FORMAT}`]);
    return parseCommitLog(raw);
  }

  private static async minedIndex(projectId: string): Promise<MinedIndex> {
    const index: MinedIndex = { full: new Set(), short: new Set() };
    for await (const s of SnapshotModel.find({ projectId }).select('hash fullHash').lean().cursor()) {
      if ((s as any).fullHash) index.full.add((s as any).fullHash);
      else index.short.add((s as any).hash);
    }
    return index;
  }

  private static async snapshotBefore(projectId: string, date: Date): Promise<Graph | null> {
    const s = await SnapshotModel.findOne({ projectId, date: { $lt: date } }).sort({ date: -1 }).select('nodes edges').lean();
    return s ? { nodes: s.nodes as GraphNode[], edges: s.edges as GraphEdge[] } : null;
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

  /**
   * Diff counts are relative to the previous *mined* snapshot. When a run fills a gap, the snapshot right after
   * it (mined earlier, against an older baseline) gets its counts recomputed.
   */
  private static async refreshSuccessors(projectId: string, processed: Set<string>) {
    const timeline = await SnapshotModel.find({ projectId }).select('hash date').sort({ date: 1 }).lean();
    const successors: string[] = [];
    for (let i = 1; i < timeline.length; i++) {
      if (processed.has(timeline[i - 1].hash) && !processed.has(timeline[i].hash)) successors.push(String(timeline[i]._id));
    }
    for (const id of successors) {
      const next = await SnapshotModel.findOne({ _id: id });
      if (!next) continue;
      const before = await this.snapshotBefore(projectId, next.date);
      const diff = this.diffGraphs(before, { nodes: next.nodes, edges: next.edges });
      await SnapshotModel.updateOne({ _id: id }, { $set: { depAdded: diff.depAdded, depRemoved: diff.depRemoved, archChanges: diff.depAdded + diff.depRemoved > 0 ? 1 : 0 } });
    }
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

  private static analyzeAST(dirPath: string) {
    const nodes: { id: string; name: string; type: string }[] = [];
    const edges: { source: string; target: string; type: string }[] = [];
    const files = this.getAllFiles(dirPath, ['.ts', '.tsx', '.js', '.jsx']);

    const program = ts.createProgram(files, { allowJs: true });
    
    for (const sourceFile of program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('node_modules')) {
        const fileId = path.relative(dirPath, sourceFile.fileName).replace(/\\/g, '/');
        nodes.push({ id: fileId, name: path.basename(fileId), type: 'module' });
        
        ts.forEachChild(sourceFile, node => {
          if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
              let target = moduleSpecifier.text;
              if (target.startsWith('.')) {
                // Resolve relative path
                const resolved = path.join(path.dirname(fileId), target).replace(/\\/g, '/');
                edges.push({ source: fileId, target: resolved, type: 'imports' });
              } else {
                edges.push({ source: fileId, target, type: 'imports' });
              }
            }
          }
        });
      }
    }
    
    // Normalize edge targets to map to actual fileIds if they exist
    const nodeIds = new Set(nodes.map(n => n.id));
    edges.forEach(e => {
      // Very naive resolution, just check if target plus ext exists
      const possibleExts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
      for (const ext of possibleExts) {
        if (nodeIds.has(e.target + ext)) {
          e.target = e.target + ext;
          break;
        }
      }
    });

    return { nodes, edges };
  }

  private static getAllFiles(dirPath: string, exts: string[], arrayOfFiles: string[] = []) {
    const base = path.basename(dirPath);
    if (base === '.git' || base === 'node_modules') return arrayOfFiles;
    
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      let isDir = false;
      try { isDir = fs.statSync(fullPath).isDirectory(); } catch { return; } // broken symlink
      if (isDir) {
        arrayOfFiles = this.getAllFiles(fullPath, exts, arrayOfFiles);
      } else {
        if (exts.some(ext => fullPath.endsWith(ext))) {
          arrayOfFiles.push(fullPath);
        }
      }
    });
    
    return arrayOfFiles;
  }
}
