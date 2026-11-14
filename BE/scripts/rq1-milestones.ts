/**
 * RQ1: chooses the milestones of a workspace and builds their components, all the same way, so that the evaluation
 * compares like with like. Milestones are the mined snapshots of tagged commits (releases); without enough tags, snapshots
 * evenly spaced over the mined history. Writes rq1-results/milestones/<workspace>.json, read by npm run rq1 -- --milestones.
 *
 *   npm run rq1:milestones -- --project <id>                 tagged commits, at most 15, clustering only
 *   npm run rq1:milestones -- --project <id> --tags '^v\d+\.\d+\.0$' --count 12
 *   npm run rq1:milestones -- --project <id> --mode refine [--model <registry id>]   clustering refined by AI (costs tokens)
 *   npm run rq1:milestones -- --project <id> --dry-run       only print the choice
 *
 * The repository must be mined first, over the whole range (Manage mining > Mine remaining), so that the tagged commits
 * have snapshots. Components already built the same way for the same graph are kept; others are rebuilt.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { ArchitectureService } from "../src/infrastructure/services/ArchitectureService.js";
import { ArchitectureMappingModel } from "../src/infrastructure/database/models/ArchitectureMappingModel.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.js";
import { ALGORITHM_VERSION, graphHash } from "../src/domain/architecture/buildView.js";
import { spreadEvenly, workspaceSlug } from "../src/domain/evaluation/rq1.js";

interface Args { project: string; tags: RegExp | null; count: number; mode: "cluster" | "refine"; model: string | null; dryRun: boolean; out: string }

function args(argv: string[]): Args {
  const a: Args = { project: "", tags: null, count: 15, mode: "cluster", model: null, dryRun: false, out: "rq1-results" };
  for (let i = 0; i < argv.length; i++) {
    const next = () => { if (!argv[i + 1]) throw new Error(`${argv[i]} needs a value`); return argv[++i]; };
    switch (argv[i]) {
      case "--project": a.project = next(); break;
      case "--tags": a.tags = new RegExp(next()); break;
      case "--count": a.count = Number(next()); if (!Number.isInteger(a.count) || a.count < 2) throw new Error("--count needs a whole number of at least 2"); break;
      case "--mode": { const m = next(); if (m !== "cluster" && m !== "refine") throw new Error("--mode is cluster or refine"); a.mode = m; break; }
      case "--model": a.model = next(); break;
      case "--dry-run": a.dryRun = true; break;
      case "--out": a.out = next(); break;
      default: throw new Error(`Unknown argument: ${argv[i]}. See the header of scripts/rq1-milestones.ts.`);
    }
  }
  if (!a.project) throw new Error("--project <workspace id> is required");
  return a;
}

async function main() {
  const opt = args(process.argv.slice(2));
  await connectDb();
  const project = await ProjectModel.findById(opt.project, { name: 1 }).lean();
  if (!project) throw new Error(`Workspace ${opt.project} not found`);
  const snapshots = await SnapshotModel.find({ projectId: opt.project, missingSince: null }, { hash: 1, title: 1, date: 1, tags: 1, files: 1 }).sort({ date: 1 }).lean();
  if (snapshots.length < 2) throw new Error("Fewer than 2 mined snapshots: mine the repository first");

  const tagged = snapshots.filter(s => (s.tags ?? []).some(t => (opt.tags ? opt.tags.test(t) : true)));
  const byTags = tagged.length >= 2;
  const chosen = spreadEvenly(byTags ? tagged : snapshots, opt.count);
  const selection = byTags
    ? `${chosen.length} of ${tagged.length} snapshots with tags${opt.tags ? ` matching ${opt.tags}` : ""}`
    : `${chosen.length} snapshots evenly spaced over ${snapshots.length} (fewer than 2 tagged commits)`;
  console.log(`${project.name}: ${selection}`);
  for (const s of chosen) console.log(`  ${new Date(s.date).toISOString().slice(0, 10)} ${s.hash} ${(s.tags ?? []).join(", ")}`);
  if (opt.dryRun) return;

  const generator = opt.mode === "cluster" ? "cluster-only" : "cluster+llm";
  let built = 0, kept = 0, fellBack = 0;
  for (const s of chosen) {
    const id = String(s._id);
    const existing = await ArchitectureMappingModel.findOne({ projectId: opt.project, snapshotId: id }, { generator: 1, algorithmVersion: 1, graphHash: 1 }).lean();
    if (existing && existing.generator === generator && existing.algorithmVersion === ALGORITHM_VERSION) {
      const full = await SnapshotModel.findById(id, { nodes: 1, edges: 1 }).lean();
      if (full && existing.graphHash === graphHash({ nodes: (full.nodes ?? []) as never, edges: (full.edges ?? []) as never })) { kept++; continue; }
    }
    if (opt.mode === "cluster") {
      await ArchitectureService.generate(opt.project, id);
    } else {
      const result = await ArchitectureService.refine(opt.project, id, {}, {}, { modelId: opt.model, purpose: "user" });
      if (result.mapping?.generator !== "cluster+llm") fellBack++;
    }
    built++;
    console.log(`  built ${s.hash}`);
  }
  if (fellBack) console.warn(`${fellBack} milestone(s) kept the clustering result because the AI answer failed verification; the report shows the mix.`);

  const dir = path.join(opt.out, "milestones");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${workspaceSlug(project.name, opt.project)}.json`);
  fs.writeFileSync(file, JSON.stringify({
    projectId: opt.project, projectName: project.name, createdAt: new Date().toISOString(), selection, mode: opt.mode,
    snapshotIds: chosen.map(s => String(s._id)),
    milestones: chosen.map(s => ({ id: String(s._id), hash: s.hash, date: new Date(s.date).toISOString().slice(0, 10), tags: s.tags ?? [] })),
  }, null, 2) + "\n");
  console.log(`${built} built, ${kept} already built the same way -> ${file}`);
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
