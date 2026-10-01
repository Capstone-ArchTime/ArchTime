import { simpleGit, SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { ProjectModel } from '../database/models/ProjectModel.js';
import { MiningJobModel, JobStatus } from '../database/models/MiningJobModel.js';
import { SnapshotModel } from '../database/models/SnapshotModel.js';
import { EvidenceModel } from '../database/models/EvidenceModel.js';

export class MiningService {
  public static async startMiningJob(projectId: string, userId: string): Promise<string> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new Error("Project not found");

    const job = await MiningJobModel.create({
      projectId,
      requestedBy: userId,
      status: JobStatus.QUEUED,
      stage: 'Queued',
      progress: 0
    });

    // Fire and forget
    this.processMiningJob(job.id, project).catch(console.error);

    return job.id;
  }

  private static async processMiningJob(jobId: string, project: any) {
    const job = await MiningJobModel.findById(jobId);
    if (!job) return;

    try {
      job.status = JobStatus.RUNNING;
      job.stage = 'Initializing workspace';
      job.progress = 5;
      await job.save();

      const workspace = path.join(process.cwd(), 'tmp-workspace', jobId);
      if (fs.existsSync(workspace)) {
        fs.rmSync(workspace, { recursive: true, force: true });
      }
      fs.mkdirSync(workspace, { recursive: true });

      job.stage = 'Cloning repository';
      job.progress = 10;
      await job.save();

      const git: SimpleGit = simpleGit(workspace);
      // Construct url with token if private
      let repoUrl = project.repoUrl;
      if (project.visibility === 'private' && project.token) {
        // e.g. https://ghp_xxx@github.com/user/repo
        const urlObj = new URL(project.repoUrl);
        urlObj.username = project.token;
        repoUrl = urlObj.toString();
      }

      await git.clone(repoUrl, '.');

      job.stage = 'Extracting Git history';
      job.progress = 30;
      await job.save();

      const branchSummary = await git.branch(['-r']);
      // Filter out HEAD and extract branch name
      const branches = branchSummary.all
        .filter(b => !b.includes('HEAD'))
        .map(b => b.replace('origin/', ''));

      // If no remote branches found (e.g. local only), default to main/master
      if (branches.length === 0) branches.push('main');

      // Delete existing snapshots and evidences for this project
      await SnapshotModel.deleteMany({ projectId: project._id });
      await EvidenceModel.deleteMany({ projectId: project._id });

      let progress = 30;
      const progressPerBranch = 60 / Math.max(branches.length, 1);

      for (const branch of branches) {
        try {
          await git.checkout(branch);
        } catch(e) {
          continue; // Skip if checkout fails
        }
        
        const log = await git.log(); 
        const commits = [...log.all].reverse(); // oldest to newest

        let prevNodes: any[] = [];
        let prevEdges: any[] = [];
        let versionIndex = 1;

        const progressPerCommit = progressPerBranch / Math.max(commits.length, 1);

        for (let i = 0; i < commits.length; i++) {
          const commit = commits[i];
          const shortHash = commit.hash.substring(0, 7);

          const existing = await SnapshotModel.findOne({ projectId: project._id, hash: shortHash });
          if (existing) {
             if (!existing.branches.includes(branch)) {
                existing.branches.push(branch);
                await existing.save();
             }
             prevNodes = existing.nodes;
             prevEdges = existing.edges;
             progress += progressPerCommit;
             continue;
          }

          job.stage = `Analyzing ${branch} - ${shortHash}`;
          job.progress = Math.round(progress);
          await job.save();

          await git.checkout(commit.hash);

          // Analyze AST
          const { nodes, edges } = this.analyzeAST(workspace);

          // Calculate differences
          const depAdded = edges.filter(e => !prevEdges.some(pe => pe.source === e.source && pe.target === e.target)).length;
          const depRemoved = prevEdges.filter(pe => !edges.some(e => pe.source === e.source && pe.target === e.target)).length;
          const archChanges = depAdded + depRemoved > 0 ? 1 : 0; // simplistic metric

          await SnapshotModel.create({
            projectId: project._id,
            hash: shortHash,
            version: `v${versionIndex}.0`,
            title: commit.message,
            author: commit.author_email,
            date: new Date(commit.date),
            branches: [branch],
            files: nodes.length,
            archChanges,
            depAdded,
            depRemoved,
            nodes,
            edges
          });

          if (archChanges > 0 && i > 0) {
            let patch = '';
            let fileStats = '';
            try {
              patch = await git.show([commit.hash, '--patch']);
              fileStats = await git.show([commit.hash, '--name-only', '--format=']);
            } catch (e) {}

            const actualFiles = fileStats.split('\n').map(f => f.trim()).filter(f => f.length > 0);

            let type = 'DEPENDENCY CHANGE';
            if (nodes.length > prevNodes.length) type = 'MODULE EXTRACTION';
            if (nodes.length < prevNodes.length) type = 'MODULE REMOVAL';

            await EvidenceModel.create({
              projectId: project._id,
              changeTitle: commit.message.split('\n')[0] || 'Architectural Change',
              type,
              repository: project.name || 'repository',
              commit: shortHash,
              files: actualFiles.length,
              date: new Date(commit.date),
              summary: `Detected structural change: ${depAdded} dependencies added, ${depRemoved} dependencies removed.`,
              depsAdded: depAdded,
              depsRemoved: depRemoved,
              sourceFiles: actualFiles,
              diffBefore: patch, // store full patch
              diffAfter: ''
            });
          }

          prevNodes = nodes;
          prevEdges = edges;
          progress += progressPerCommit;
          versionIndex++;
        }
      }

      job.stage = 'Persisted snapshot';
      job.progress = 100;
      job.status = JobStatus.COMPLETED;
      await job.save();

      // Clean up workspace
      fs.rmSync(workspace, { recursive: true, force: true });
      
      project.status = 'COMPLETED';
      await project.save();

    } catch (error: any) {
      console.error(error);
      job.status = JobStatus.FAILED;
      job.stage = 'Failed: ' + error.message;
      job.error = error.message;
      await job.save();
    }
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
    if (dirPath.includes('.git') || dirPath.includes('node_modules')) return arrayOfFiles;
    
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
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
