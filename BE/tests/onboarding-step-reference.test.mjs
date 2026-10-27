import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT, fakeDeps, fakeWorkspace, goodPath, memoryStores } from "./onboarding-fakes.mjs";
import { referenceFacts, referenceFingerprint } from "../src/domain/onboarding/stepReference.ts";
import { assessStepRevision } from "../src/domain/onboarding/stepRevision.ts";
import { OnboardingPathUseCases } from "../src/application/use-cases/onboarding/OnboardingPathUseCases.ts";
import { OnboardingLearningUseCases } from "../src/application/use-cases/onboarding/OnboardingLearningUseCases.ts";

// A step is flagged "may be outdated" only when what it is about changed: its own component (name, kind, description,
// dependencies in and out) or its own design decision. Other edits to the workspace leave it alone.

const component = { kind: "component", componentId: "billing" };
const decision = { kind: "adr", adrId: "adr-1" };
const ws = () => structuredClone(fakeWorkspace().refs);
const fp = (step, refs) => referenceFingerprint(step, refs);

// ── The fingerprint ───────────────────────────────────────────────────────────────────────────────────────────────

test("a fingerprint is the same for the same component or decision, whatever order the workspace stores things in", () => {
  const a = ws();
  const b = ws();
  b.dependencies.push({ id: "d2", source: "billing", target: "orders", label: "refunds" });
  a.dependencies.unshift({ id: "dX", source: "billing", target: "orders", label: "refunds" });
  assert.equal(fp(component, a), fp(component, b));
  const c = ws();
  c.decisions[0].componentIds = ["orders", "billing"];
  const d = ws();
  d.decisions[0].componentIds = ["billing", "orders"];
  assert.equal(fp(decision, c), fp(decision, d));
  assert.match(fp(component, ws()), /^[0-9a-f]{32}$/);
});

test("questions, commits and things that are gone have no fingerprint", () => {
  assert.equal(fp({ kind: "question" }, ws()), null);
  assert.equal(fp({ kind: "commit" }, ws()), null);
  assert.equal(fp({ kind: "component", componentId: "ghost" }, ws()), null);
  assert.equal(fp({ kind: "adr", adrId: "adr-404" }, ws()), null);
});

test("edits that are not about the component leave its fingerprint alone", () => {
  const before = fp(component, ws());
  const edits = [
    refs => { refs.components.push({ id: "shipping", name: "Shipping", kind: "Service", description: "" }); },
    refs => { refs.components.push({ id: "shipping", name: "Shipping", kind: "Service", description: "" }); refs.dependencies.push({ id: "d9", source: "orders", target: "shipping", label: "ships" }); },
    refs => { refs.components[1].description = "Takes and tracks orders."; },
    refs => { refs.decisions[0].decision = "Queue everything."; },
    refs => { refs.decisions.push({ id: "adr-2", title: "Use Postgres", status: "Proposed", context: "", decision: "", alternatives: "", consequences: "", componentIds: ["billing"] }); },
    refs => { refs.confirmedAt = new Date("2026-11-01T00:00:00Z"); },
    refs => { refs.dependencies[0].id = "renamed-id"; },
  ];
  for (const edit of edits) {
    const refs = ws();
    edit(refs);
    assert.equal(fp(component, refs), before, String(edit));
  }
});

test("an edit to the component itself or to its dependencies changes its fingerprint", () => {
  const before = fp(component, ws());
  const edits = [
    refs => { refs.components[0].name = "Invoicing"; },
    refs => { refs.components[0].kind = "Library"; },
    refs => { refs.components[0].description = "Owns invoices and refunds."; },
    refs => { refs.dependencies[0].label = "bills"; },
    refs => { refs.dependencies = []; },
    refs => { refs.dependencies.push({ id: "d2", source: "billing", target: "orders", label: "refunds" }); },
    // The step reads "Orders calls Billing": renaming the neighbour changes what it says.
    refs => { refs.components[1].name = "Checkout"; },
  ];
  for (const edit of edits) {
    const refs = ws();
    edit(refs);
    assert.notEqual(fp(component, refs), before, String(edit));
  }
});

test("a decision's fingerprint follows its own text, status and components only", () => {
  const before = fp(decision, ws());
  for (const field of ["title", "context", "decision", "alternatives", "consequences"]) {
    const refs = ws();
    refs.decisions[0][field] += " (edited)";
    assert.notEqual(fp(decision, refs), before, field);
  }
  const status = ws();
  status.decisions[0].status = "Deprecated";
  assert.notEqual(fp(decision, status), before);
  const linked = ws();
  linked.decisions[0].componentIds.push("orders");
  assert.notEqual(fp(decision, linked), before);

  const unrelated = ws();
  unrelated.decisions[0].updatedAt = new Date("2027-01-01T00:00:00Z");
  unrelated.components[0].description = "Changed.";
  unrelated.decisions.push({ id: "adr-2", title: "Other", status: "Accepted", context: "", decision: "", alternatives: "", consequences: "", componentIds: [] });
  assert.equal(fp(decision, unrelated), before, "the decision's own text is what counts, not when it was saved or what else changed");
});

// ── Judging a step ───────────────────────────────────────────────────────────────────────────────────────────────

const pinnedAt = new Date("2026-10-20T00:00:00Z");
const pinned = (step, refs, extra = {}) => ({ commit: "a".repeat(40), snapshotId: "s1", workspaceRevision: 3, pinnedAt, fingerprint: fp(step, refs), ...extra });
const fine = { snapshotExists: true, commitGone: false, currentWorkspaceRevision: 40 };
const judge = (step, revision, refs, facts = fine) => assessStepRevision(revision, { ...facts, reference: referenceFacts(step, refs) });

test("a step whose own reference did not change is current, however often the workspace was saved", () => {
  const refs = ws();
  const revision = pinned(component, refs);
  refs.decisions[0].title = "Something else";
  refs.components[1].description = "Edited";
  assert.deepEqual(judge(component, revision, refs), { status: "current", issues: [] });
  assert.deepEqual(judge(decision, pinned(decision, ws()), ws()), { status: "current", issues: [] });
});

test("a step whose component or decision changed may be outdated, and says what changed", () => {
  const refs = ws();
  const revision = pinned(component, refs);
  refs.components[0].description = "Now also refunds.";
  const result = judge(component, revision, refs);
  assert.equal(result.status, "outdated");
  assert.deepEqual(result.issues.map(i => i.code), ["MAP_CHANGED"]);
  assert.match(result.issues[0].message, /component changed/);

  const adr = ws();
  const adrRevision = pinned(decision, adr);
  adr.decisions[0].status = "Deprecated";
  const edited = judge(decision, adrRevision, adr);
  assert.equal(edited.status, "outdated");
  assert.match(edited.issues[0].message, /design decision was edited/);
});

test("a step whose component or decision is gone is missing", () => {
  const refs = ws();
  const componentRevision = pinned(component, refs);
  const decisionRevision = pinned(decision, refs);
  refs.components = refs.components.filter(c => c.id !== "billing");
  refs.decisions = [];
  const gone = judge(component, componentRevision, refs);
  assert.equal(gone.status, "missing");
  assert.deepEqual(gone.issues.map(i => i.code), ["REF_GONE"]);
  assert.match(gone.issues[0].message, /no longer in the component diagram/);
  assert.match(judge(decision, decisionRevision, refs).issues[0].message, /design decision this step is about is no longer in the workspace/);
});

test("question and commit steps are never flagged for workspace edits; a commit step still is when its commit is gone", () => {
  const refs = ws();
  refs.components = [];
  refs.decisions = [];
  for (const kind of ["question", "commit"]) {
    const revision = { commit: "a".repeat(40), snapshotId: "s1", workspaceRevision: 1, pinnedAt };
    assert.deepEqual(judge({ kind }, revision, refs), { status: "current", issues: [] }, kind);
  }
  const gone = judge({ kind: "commit" }, { commit: "c".repeat(40), snapshotId: "s3", workspaceRevision: 1, pinnedAt }, refs, { ...fine, commitGone: true, goneSince: new Date("2026-10-22T00:00:00Z") });
  assert.equal(gone.status, "missing");
  assert.deepEqual(gone.issues.map(i => i.code), ["COMMIT_GONE"]);
  const reMined = judge({ kind: "commit" }, { commit: "c".repeat(40), snapshotId: "s3", workspaceRevision: 1, pinnedAt }, refs, { ...fine, snapshotExists: false });
  assert.deepEqual(reMined.issues.map(i => i.code), ["SNAPSHOT_GONE"]);
});

test("a step pinned before fingerprints existed falls back to when its reference last changed", () => {
  const legacy = { commit: "a".repeat(40), snapshotId: "s1", workspaceRevision: 3, pinnedAt };
  const refs = ws();
  // The decision was last edited, and the diagram last confirmed, before the step was written.
  refs.decisions[0].updatedAt = new Date("2026-10-19T00:00:00Z");
  refs.confirmedAt = new Date("2026-10-19T00:00:00Z");
  assert.equal(judge(decision, legacy, refs).status, "current");
  assert.equal(judge(component, legacy, refs).status, "current");

  refs.decisions[0].updatedAt = new Date("2026-10-21T00:00:00Z");
  refs.confirmedAt = new Date("2026-10-21T00:00:00Z");
  assert.equal(judge(decision, legacy, refs).status, "outdated");
  const diagram = judge(component, legacy, refs);
  assert.equal(diagram.status, "outdated");
  assert.match(diagram.issues[0].message, /confirmed again/);

  // Nothing tells when it changed (a draft diagram, a decision without a date): the step is taken to be current.
  refs.confirmedAt = null;
  delete refs.decisions[0].updatedAt;
  assert.equal(judge(component, legacy, refs).status, "current");
  assert.equal(judge(decision, legacy, refs).status, "current");
  // A legacy step whose reference is gone is still missing.
  assert.equal(judge(component, legacy, { ...refs, components: [] }).status, "missing");
});

test("without a reference (the generic revision check) any change of the map still counts, as before", () => {
  const result = assessStepRevision({ commit: "a".repeat(40), snapshotId: "s1", workspaceRevision: 3, pinnedAt }, fine);
  assert.deepEqual(result.issues.map(i => i.code), ["MAP_CHANGED"]);
});

// ── Through the use cases, with a workspace that changes ──────────────────────────────────────────────────────────

/** A workspace that the test edits, and an `assess` that judges steps against it as the real one does. */
function live() {
  const workspace = fakeWorkspace();
  const stores = memoryStores();
  const deps = fakeDeps({
    workspace: async () => ({ ...workspace, componentIds: new Set(workspace.refs.components.map(c => c.id)), adrIds: new Set(workspace.refs.decisions.map(d => d.id)) }),
    pin: async (_p, commit) => ({
      revision: { commit: commit ? commit.padEnd(40, "0") : "f".repeat(40), snapshotId: "snap-1", workspaceRevision: workspace.revision, pinnedAt: new Date("2026-10-20T00:00:00Z") },
      ...(commit ? { title: "Split billing out of orders" } : {}),
    }),
    assess: async (_p, steps) => steps.map(step => assessStepRevision(step.revision, {
      snapshotExists: true, commitGone: false, currentWorkspaceRevision: workspace.revision, reference: referenceFacts(step, workspace.refs),
    })),
  });
  return {
    workspace, stores,
    mentors: new OnboardingPathUseCases(stores.pathStore, stores.assignmentStore, deps),
    learners: new OnboardingLearningUseCases(stores.pathStore, stores.assignmentStore, deps),
    /** Any save of the workspace raises its revision, whatever it changed. */
    save: edit => { edit(workspace.refs); workspace.revision += 1; },
  };
}
const statuses = path => path.steps.map(s => s.assessment.status);
const resend = path => path.steps.map(({ assessment, revision, commitTitle, ...s }) => s);

test("each component and decision step is stored with the fingerprint of what it is about; other steps with none", async () => {
  const { mentors, stores } = live();
  const created = await mentors.create(PROJECT, "m", goodPath());
  const stored = stores.paths.get(created.id).steps;
  assert.equal(stored[0].revision.fingerprint, fp(component, fakeWorkspace().refs));
  assert.equal(stored[2].revision.fingerprint, fp(decision, fakeWorkspace().refs));
  assert.equal(stored[1].revision.fingerprint, undefined, "commit step");
  assert.equal(stored[3].revision.fingerprint, undefined, "question step");
});

test("rule, other ADR and other component edits do not flag a step; an edit to its own component, dependency or ADR does", async () => {
  const { mentors, learners, save } = live();
  const created = await mentors.create(PROJECT, "m", goodPath());
  await mentors.assign(PROJECT, created.id, "m", ["alice"]);
  save(() => { /* a rule was added: rules are not part of any step */ });
  save(refs => { refs.decisions.push({ id: "adr-2", title: "Use Postgres", status: "Accepted", context: "", decision: "", alternatives: "", consequences: "", componentIds: [] }); });
  save(refs => { refs.components.push({ id: "shipping", name: "Shipping", kind: "Service", description: "" }); });
  save(refs => { refs.confirmedAt = new Date("2026-11-01T00:00:00Z"); });
  assert.deepEqual(statuses(await mentors.get(PROJECT, created.id)), ["current", "current", "current", "current"]);
  assert.deepEqual(statuses((await learners.view(PROJECT, created.id, "alice")).path), ["current", "current", "current", "current"]);

  save(refs => { refs.dependencies.push({ id: "d2", source: "billing", target: "shipping", label: "notifies" }); });
  assert.deepEqual(statuses(await mentors.get(PROJECT, created.id)), ["outdated", "current", "current", "current"]);
  save(refs => { refs.decisions[0].consequences = "Invoices can be late."; });
  assert.deepEqual(statuses(await mentors.get(PROJECT, created.id)), ["outdated", "current", "outdated", "current"]);
  const [row] = await mentors.list(PROJECT);
  assert.deepEqual([row.outdatedSteps, row.missingSteps], [2, 0]);
});

test("re-pinning a flagged step in the editor clears the flag; saving without it keeps the flag", async () => {
  const { mentors, save } = live();
  const created = await mentors.create(PROJECT, "m", goodPath());
  save(refs => { refs.components[0].description = "Owns invoices and refunds."; });
  const kept = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: resend(created), expectedRevision: 1 });
  assert.equal(kept.steps[0].assessment.status, "outdated", "saving the path for another reason does not hide the change");
  const repinned = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: resend(kept).map((s, i) => (i === 0 ? { ...s, repin: true } : s)), expectedRevision: 2 });
  assert.deepEqual(statuses(repinned), ["current", "current", "current", "current"]);
  assert.equal(repinned.steps[0].id, created.steps[0].id, "the step and its learners' progress stay");
});

test("a step whose component was removed is missing, and the list counts it so", async () => {
  const { mentors, save } = live();
  const created = await mentors.create(PROJECT, "m", goodPath());
  save(refs => { refs.components = refs.components.filter(c => c.id !== "billing"); refs.dependencies = []; });
  const shown = await mentors.get(PROJECT, created.id);
  assert.deepEqual(statuses(shown), ["missing", "current", "current", "current"]);
  assert.deepEqual(shown.steps[0].assessment.issues.map(i => i.code), ["REF_GONE"]);
  const [row] = await mentors.list(PROJECT);
  assert.deepEqual([row.outdatedSteps, row.missingSteps], [0, 1]);
});

test("a step stored before fingerprints is judged by the time its reference changed, until it is re-pinned", async () => {
  const { mentors, stores, save } = live();
  const created = await mentors.create(PROJECT, "m", goodPath());
  for (const step of stores.paths.get(created.id).steps) delete step.revision.fingerprint;
  assert.deepEqual(statuses(await mentors.get(PROJECT, created.id)), ["current", "current", "current", "current"], "nothing changed after the steps were pinned");
  save(refs => { refs.decisions[0].updatedAt = new Date("2026-10-25T00:00:00Z"); });
  save(refs => { refs.confirmedAt = new Date("2026-10-25T00:00:00Z"); });
  assert.deepEqual(statuses(await mentors.get(PROJECT, created.id)), ["outdated", "current", "outdated", "current"]);
  const repinned = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: resend(created).map(s => ({ ...s, repin: true })), expectedRevision: 1 });
  assert.deepEqual(statuses(repinned), ["current", "current", "current", "current"]);
  assert.ok(stores.paths.get(created.id).steps[0].revision.fingerprint, "re-pinning gives the step a fingerprint");
});
