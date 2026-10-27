import "./setup-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT, fakeDeps, goodPath, memoryStores } from "./onboarding-fakes.mjs";
import { MAX_PATHS_PER_PROJECT, OnboardingPathUseCases } from "../src/application/use-cases/onboarding/OnboardingPathUseCases.ts";
import { OnboardingLearningUseCases } from "../src/application/use-cases/onboarding/OnboardingLearningUseCases.ts";
import { PATH_LIMITS, parsePathInput, parseUserIds } from "../src/application/use-cases/onboarding/pathInput.ts";
import { isCorrectAnswer, nextStep, stepForLearner, stepProgressList, summarizeProgress } from "../src/domain/onboarding/path.ts";
import { NotFoundError, ValidationError } from "../src/shared/errors/AppError.ts";

function setup(depsOverrides = {}) {
  const stores = memoryStores();
  const deps = fakeDeps(depsOverrides);
  return {
    ...stores,
    mentors: new OnboardingPathUseCases(stores.pathStore, stores.assignmentStore, deps),
    learners: new OnboardingLearningUseCases(stores.pathStore, stores.assignmentStore, deps),
  };
}

/** The `fields` of the validation error a call raises. */
const fieldsOf = async call => {
  try { await call(); } catch (error) { assert.ok(error instanceof ValidationError, `expected a ValidationError, got ${error}`); return error.fields; }
  assert.fail("expected a validation error");
};
const reject = async (call, status, pattern) => assert.rejects(call, error => error.statusCode === status && (!pattern || pattern.test(error.message)));

// ── What the editor may send ──────────────────────────────────────────────────────────────────────────────────────

test("a well-formed path is accepted, trimmed, with commits in lower case and steps kept in order", () => {
  const input = parsePathInput(goodPath({ title: "  Week 1  " }), { update: false });
  assert.equal(input.title, "Week 1");
  assert.equal(input.status, "published");
  assert.deepEqual(input.steps.map(s => s.kind), ["component", "commit", "adr", "question"]);
  assert.equal(input.steps[1].commit, "a1b2c3d");
  assert.equal(input.expectedRevision, undefined);
});

test("every problem is reported at once, by field", () => {
  const body = {
    title: "",
    steps: [
      { kind: "component", title: "No component chosen" },
      { kind: "commit", title: "Bad hash", commit: "xyz" },
      { kind: "poem", title: "Unknown kind" },
      { kind: "question", title: "Q", question: { prompt: "?", options: ["Only one"], correctIndex: 3 } },
      { kind: "question", title: "Q2", question: { prompt: "?", options: ["Same", "same"], correctIndex: 0 } },
    ],
  };
  assert.throws(() => parsePathInput(body, { update: false }), error => {
    assert.ok(error instanceof ValidationError);
    assert.deepEqual(Object.keys(error.fields).sort(), [
      "steps[0].componentId", "steps[1].commit", "steps[2].kind", "steps[3].question.correctIndex", "steps[3].question.options",
      "steps[4].question.options", "title",
    ].sort());
    return true;
  });
});

test("a question needs two to six distinct answers and one of them marked right", () => {
  const ask = question => () => parsePathInput({ title: "T", steps: [{ kind: "question", title: "Q", question }] }, { update: false });
  assert.doesNotThrow(ask({ prompt: "?", options: ["a", "b"], correctIndex: 0 }));
  assert.doesNotThrow(ask({ prompt: "?", options: ["a", "b", "c", "d", "e", "f"], correctIndex: 5 }));
  assert.throws(ask({ prompt: "?", options: ["a", "b", "c", "d", "e", "f", "g"], correctIndex: 0 }), ValidationError);
  assert.throws(ask({ prompt: "?", options: ["a", "b"], correctIndex: 2 }), ValidationError);
  assert.throws(ask({ prompt: "?", options: ["a", "b"], correctIndex: -1 }), ValidationError);
  assert.throws(ask({ prompt: "?", options: ["a", "b"], correctIndex: "0" }), ValidationError);
  assert.throws(ask({ prompt: "", options: ["a", "b"], correctIndex: 0 }), ValidationError);
  assert.throws(ask({ prompt: "?", options: ["a", " "], correctIndex: 0 }), ValidationError);
  assert.throws(ask(undefined), ValidationError);
});

test("text and list sizes are limited", () => {
  const base = { title: "T", steps: [] };
  assert.throws(() => parsePathInput({ ...base, title: "x".repeat(PATH_LIMITS.title + 1) }, { update: false }), ValidationError);
  assert.throws(() => parsePathInput({ ...base, description: "x".repeat(PATH_LIMITS.description + 1) }, { update: false }), ValidationError);
  const step = { kind: "adr", title: "A", adrId: "adr-1" };
  assert.doesNotThrow(() => parsePathInput({ ...base, steps: Array.from({ length: PATH_LIMITS.steps }, () => step) }, { update: false }));
  assert.throws(() => parsePathInput({ ...base, steps: Array.from({ length: PATH_LIMITS.steps + 1 }, () => step) }, { update: false }), ValidationError);
});

test("a published path needs a step; a draft may be empty", () => {
  assert.doesNotThrow(() => parsePathInput({ title: "T", steps: [] }, { update: false }));
  assert.throws(() => parsePathInput({ title: "T", status: "published", steps: [] }, { update: false }), error => !!error.fields.steps);
  assert.throws(() => parsePathInput({ title: "T", status: "archived", steps: [] }, { update: false }), error => !!error.fields.status);
});

test("saving an existing path needs the revision that was loaded", () => {
  assert.throws(() => parsePathInput({ title: "T", steps: [] }, { update: true }), error => !!error.fields.expectedRevision);
  assert.throws(() => parsePathInput({ title: "T", steps: [], expectedRevision: 0 }, { update: true }), ValidationError);
  assert.equal(parsePathInput({ title: "T", steps: [], expectedRevision: 4 }, { update: true }).expectedRevision, 4);
});

test("a step's id must look like one and can be used only once", () => {
  const step = id => ({ kind: "adr", title: "A", adrId: "adr-1", id });
  assert.throws(() => parsePathInput({ title: "T", steps: [step("../x")] }, { update: false }), ValidationError);
  assert.throws(() => parsePathInput({ title: "T", steps: [step("step-1"), step("step-1")] }, { update: false }), error => !!error.fields["steps[1].id"]);
  assert.equal(parsePathInput({ title: "T", steps: [step("step-1")] }, { update: false }).steps[0].id, "step-1");
});

test("what does not belong to a step's kind is left out", () => {
  const input = parsePathInput({ title: "T", steps: [{ kind: "adr", title: "A", adrId: "adr-1", componentId: "billing", commit: "a1b2c3d", question: { prompt: "?" } }] }, { update: false });
  assert.deepEqual(Object.keys(input.steps[0]).sort(), ["adrId", "body", "id", "kind", "repin", "title"].sort());
});

test("people to give a path to: one to fifty distinct ids", () => {
  assert.deepEqual(parseUserIds(["a", "b", "a"]), ["a", "b"]);
  assert.throws(() => parseUserIds([]), ValidationError);
  assert.throws(() => parseUserIds("alice"), ValidationError);
  assert.throws(() => parseUserIds(Array.from({ length: 51 }, (_, i) => `u${i}`)), ValidationError);
  assert.throws(() => parseUserIds(["ok", ""]), ValidationError);
  assert.throws(() => parseUserIds([{ $ne: null }]), ValidationError);
});

// ── Progress and what a learner may see ───────────────────────────────────────────────────────────────────────────

const steps = [{ id: "s1", kind: "adr", title: "A" }, { id: "s2", kind: "question", title: "Q", question: { prompt: "?", options: ["x", "y"], correctIndex: 1, explanation: "because" } }];

test("progress counts only the steps the path has now", () => {
  const progress = { s1: { completedAt: new Date() }, gone: { completedAt: new Date() } };
  assert.deepEqual(summarizeProgress({ steps }, progress), { done: 1, total: 2, percent: 50 });
  assert.deepEqual(summarizeProgress({ steps }, undefined), { done: 0, total: 2, percent: 0 });
  assert.deepEqual(summarizeProgress({ steps: [] }, {}), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(stepProgressList({ steps }, { s2: { attempts: 3 } }).map(s => [s.stepId, s.completed, s.attempts]), [["s1", false, 0], ["s2", false, 3]]);
});

test("a question's answer key and explanation stay hidden until it has been answered right", () => {
  const hidden = stepForLearner(steps[1], { attempts: 2, lastChoice: 0 });
  assert.deepEqual(hidden.question, { prompt: "?", options: ["x", "y"] });
  assert.equal(hidden.progress.completed, false);
  const shown = stepForLearner(steps[1], { attempts: 1, completedAt: new Date() });
  assert.equal(shown.question.correctIndex, 1);
  assert.equal(shown.question.explanation, "because");
  assert.equal(stepForLearner(steps[0], undefined).question, undefined);
});

test("an answer is right only when it is the marked option", () => {
  assert.equal(isCorrectAnswer(steps[1].question, 1), true);
  assert.equal(isCorrectAnswer(steps[1].question, 0), false);
});

// ── Writing paths ─────────────────────────────────────────────────────────────────────────────────────────────────

test("a new path is stored with every step pinned to a revision, and the mentor sees the answer key", async () => {
  const { mentors, paths } = setup();
  const path = await mentors.create(PROJECT, "mentor", goodPath());
  assert.equal(path.revision, 1);
  assert.equal(path.status, "published");
  assert.equal(path.createdBy, "mentor");
  assert.equal(path.steps.length, 4);
  assert.ok(path.steps.every(s => /^step-[0-9a-f]{8}$/.test(s.id) && s.revision.workspaceRevision === 3 && s.assessment.status === "current"));
  assert.equal(path.steps[1].revision.commit, "a1b2c3d".padEnd(40, "0"));
  assert.equal(path.steps[1].commitTitle, "Split billing out of orders");
  assert.equal(path.steps[3].question.correctIndex, 1);
  assert.equal(paths.size, 1);
});

test("a path starts as a draft unless it is published right away", async () => {
  const { mentors } = setup();
  const { status } = await mentors.create(PROJECT, "mentor", { title: "Notes", steps: [] });
  assert.equal(status, "draft");
});

test("steps may only point at components and decisions this workspace has", async () => {
  const { mentors, paths } = setup();
  const fields = await fieldsOf(() => mentors.create(PROJECT, "mentor", goodPath({
    steps: [
      { kind: "component", title: "Ghost", componentId: "nope" },
      { kind: "adr", title: "Ghost", adrId: "adr-404" },
      { kind: "component", title: "Real", componentId: "orders" },
    ],
  })));
  assert.deepEqual(Object.keys(fields).sort(), ["steps[0].componentId", "steps[1].adrId"]);
  assert.equal(paths.size, 0, "nothing is stored when a step is wrong");
});

test("a commit that cannot be pinned is reported on that step", async () => {
  const { mentors, paths } = setup({ pin: async () => { throw new NotFoundError("That commit has not been mined in this workspace."); } });
  const fields = await fieldsOf(() => mentors.create(PROJECT, "mentor", goodPath({ steps: [{ kind: "commit", title: "C", commit: "abcdef1" }] })));
  assert.match(fields["steps[0].commit"], /not been mined/);
  assert.equal(paths.size, 0);
});

test("a failure that is not the system's own is not hidden behind a validation message", async () => {
  const { mentors } = setup({ pin: async () => { throw new Error("database is down"); } });
  await assert.rejects(() => mentors.create(PROJECT, "mentor", goodPath()), /database is down/);
});

test("a workspace can hold only so many paths", async () => {
  const { mentors, paths } = setup();
  for (let i = 0; i < MAX_PATHS_PER_PROJECT; i++) paths.set(`p${i}`, { id: `p${i}`, projectId: PROJECT, steps: [], revision: 1, updatedAt: new Date() });
  await reject(() => mentors.create(PROJECT, "mentor", { title: "One too many", steps: [] }), 400, /at most/);
  const other = await mentors.create("66f000000000000000000009", "mentor", { title: "Another workspace", steps: [] });
  assert.equal(other.revision, 1);
});

test("saving from an out-of-date revision is a conflict and writes nothing", async () => {
  const { mentors, paths } = setup();
  const created = await mentors.create(PROJECT, "mentor-a", goodPath());
  const edit = (title, expectedRevision, by) => mentors.update(PROJECT, by, created.id, { ...goodPath({ title }), steps: created.steps.map(({ assessment, ...s }) => s), expectedRevision });
  const first = await edit("First edit", 1, "mentor-a");
  assert.equal(first.revision, 2);
  await assert.rejects(() => edit("Second edit from the old revision", 1, "mentor-b"), error => error.statusCode === 409 && error.code === "CONFLICT" && /current revision is 2/.test(error.message));
  assert.equal(paths.get(created.id).title, "First edit");
  assert.equal(paths.get(created.id).updatedBy, "mentor-a");
  assert.equal((await edit("Second edit from the new revision", 2, "mentor-b")).revision, 3);
});

test("editing a path keeps the id and the pin of a step that did not change, and re-pins what did", async () => {
  let pins = 0;
  const { mentors } = setup({
    pin: async (_p, commit) => ({ revision: { commit: commit ? commit.padEnd(40, "0") : "f".repeat(40), snapshotId: "s", workspaceRevision: 3 + pins++, pinnedAt: new Date() }, ...(commit ? { title: "T" } : {}) }),
  });
  const created = await mentors.create(PROJECT, "m", goodPath());
  assert.equal(pins, 4);
  const sent = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  const same = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: sent, expectedRevision: 1 });
  assert.equal(pins, 4, "nothing changed, nothing was pinned again");
  assert.deepEqual(same.steps.map(s => s.id), created.steps.map(s => s.id));
  assert.deepEqual(same.steps.map(s => s.revision.workspaceRevision), created.steps.map(s => s.revision.workspaceRevision));

  const changed = sent.map((s, i) => (i === 0 ? { ...s, componentId: "orders" } : i === 2 ? { ...s, repin: true } : s));
  const next = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: changed, expectedRevision: 2 });
  assert.equal(pins, 6, "the step with a new component and the step asked to re-pin were pinned again");
  assert.deepEqual(next.steps.map(s => s.id), created.steps.map(s => s.id));
  assert.equal(next.steps[0].componentId, "orders");
  assert.notEqual(next.steps[0].revision.workspaceRevision, created.steps[0].revision.workspaceRevision);
  assert.equal(next.steps[1].revision.workspaceRevision, created.steps[1].revision.workspaceRevision);
});

test("a commit step that already exists may be sent back without its commit, a new one may not", async () => {
  let pinned = [];
  const { mentors } = setup({
    pin: async (_p, commit) => { pinned.push(commit); return { revision: { commit: commit ? commit.padEnd(40, "0") : "f".repeat(40), snapshotId: "s", workspaceRevision: 3, pinnedAt: new Date() }, ...(commit ? { title: "T" } : {}) }; },
  });
  const created = await mentors.create(PROJECT, "m", goodPath());
  pinned = [];
  const sent = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  assert.equal(sent[1].commit, undefined, "the stored step has no `commit` field of its own");
  const same = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: sent, expectedRevision: 1 });
  assert.deepEqual(pinned, [], "the commit it already had was kept, nothing was pinned again");
  assert.equal(same.steps[1].revision.commit, created.steps[1].revision.commit);

  const fields = await fieldsOf(() => mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: [...sent, { kind: "commit", title: "A new commit step" }], expectedRevision: 2 }));
  assert.deepEqual(Object.keys(fields), ["steps[4].commit"]);
  // Turning an existing step into a commit step does not borrow the snapshot it happened to be pinned to.
  const turned = await fieldsOf(() => mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: [{ ...sent[0], kind: "commit" }], expectedRevision: 2 }));
  assert.deepEqual(Object.keys(turned), ["steps[0].commit"]);
});

test("a step id that does not belong to the path is refused, and a new step gets its own id", async () => {
  const { mentors } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  const sent = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  const fields = await fieldsOf(() => mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: [{ ...sent[0], id: "step-ffffffff" }], expectedRevision: 1 }));
  assert.deepEqual(Object.keys(fields), ["steps[0].id"]);
  const grown = await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: [...sent, { kind: "adr", title: "New", adrId: "adr-1" }], expectedRevision: 1 });
  assert.equal(grown.steps.length, 5);
  assert.equal(new Set(grown.steps.map(s => s.id)).size, 5);
});

test("an update keeps the published state unless it says otherwise, and a published path cannot be emptied", async () => {
  const { mentors } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  const { status, ...rest } = goodPath();
  const sent = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  assert.equal((await mentors.update(PROJECT, "m", created.id, { ...rest, steps: sent, expectedRevision: 1 })).status, "published");
  assert.equal((await mentors.update(PROJECT, "m", created.id, { ...rest, status: "draft", steps: sent, expectedRevision: 2 })).status, "draft");
  await mentors.update(PROJECT, "m", created.id, { ...rest, status: "published", steps: sent, expectedRevision: 3 });
  const fields = await fieldsOf(() => mentors.update(PROJECT, "m", created.id, { ...rest, steps: [], expectedRevision: 4 }));
  assert.ok(fields.steps);
});

test("a path of another workspace is not found", async () => {
  const { mentors } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  await reject(() => mentors.get("66f000000000000000000009", created.id), 404);
  await reject(() => mentors.update("66f000000000000000000009", "m", created.id, { ...goodPath(), expectedRevision: 1 }), 404);
  await reject(() => mentors.remove("66f000000000000000000009", created.id), 404);
  await reject(() => mentors.get(PROJECT, "not-a-path"), 404);
});

test("deleting a path deletes what was given to people", async () => {
  const { mentors, learners, assignments } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  await mentors.assign(PROJECT, created.id, "m", ["alice", "bob"]);
  assert.equal(assignments.size, 2);
  await mentors.remove(PROJECT, created.id);
  assert.equal(assignments.size, 0);
  assert.deepEqual(await learners.myPaths("alice"), []);
  await reject(() => mentors.remove(PROJECT, created.id), 404);
});

test("the mentor's view says which steps no longer hold", async () => {
  const flagged = { status: "missing", issues: [{ code: "COMMIT_GONE", message: "gone" }] };
  const { mentors } = setup({ assess: async (_p, steps) => steps.map((_, i) => (i === 1 ? flagged : { status: "current", issues: [] })) });
  const created = await mentors.create(PROJECT, "m", goodPath());
  const shown = await mentors.get(PROJECT, created.id);
  assert.deepEqual(shown.steps.map(s => s.assessment.status), ["current", "missing", "current", "current"]);
  const [row] = await mentors.list(PROJECT);
  assert.equal(row.missingSteps, 1);
  assert.equal(row.outdatedSteps, 0);
});

test("the list counts people, finished learners and steps needing attention for each path separately", async () => {
  // A commit typed as abcdef1 is pinned against map revision 99, which the stand-in then reports as out of date.
  const { mentors, learners } = setup({
    pin: async (_p, commit) => ({
      revision: { commit: commit ? commit.padEnd(40, "0") : "f".repeat(40), snapshotId: "s", workspaceRevision: commit === "abcdef1" ? 99 : 3, pinnedAt: new Date() },
      ...(commit ? { title: "T" } : {}),
    }),
    assess: async (_p, steps) => steps.map(step => (step.revision.workspaceRevision === 99 ? { status: "outdated", issues: [] } : { status: "current", issues: [] })),
  });
  const first = await mentors.create(PROJECT, "m", { title: "First", status: "published", steps: [{ kind: "adr", title: "A", adrId: "adr-1" }] });
  const second = await mentors.create(PROJECT, "m", {
    title: "Second", status: "published",
    steps: [{ kind: "commit", title: "C", commit: "abcdef1" }, { kind: "adr", title: "A", adrId: "adr-1" }, { kind: "adr", title: "B", adrId: "adr-1" }],
  });
  await mentors.assign(PROJECT, first.id, "m", ["alice", "bob"]);
  await mentors.assign(PROJECT, second.id, "m", ["alice"]);
  await learners.complete(PROJECT, first.id, first.steps[0].id, "alice");
  const rows = Object.fromEntries((await mentors.list(PROJECT)).map(r => [r.title, r]));
  assert.deepEqual([rows.First.assigned, rows.First.finished, rows.First.stepCount, rows.First.outdatedSteps], [2, 1, 1, 0]);
  assert.deepEqual([rows.Second.assigned, rows.Second.finished, rows.Second.stepCount, rows.Second.outdatedSteps], [1, 0, 3, 1]);
});

// ── Giving a path to people ───────────────────────────────────────────────────────────────────────────────────────

test("only a published path can be given, and only to members of the workspace", async () => {
  const { mentors } = setup();
  const draft = await mentors.create(PROJECT, "m", goodPath({ status: "draft" }));
  await reject(() => mentors.assign(PROJECT, draft.id, "m", ["alice"]), 400, /Publish/);
  const published = await mentors.create(PROJECT, "m", goodPath());
  const fields = await fieldsOf(() => mentors.assign(PROJECT, published.id, "m", ["alice", "stranger"]));
  assert.match(fields.userIds, /stranger/);
  assert.deepEqual(await mentors.assign(PROJECT, published.id, "m", ["alice", "bob"]), { assigned: ["alice", "bob"] });
});

test("giving a path to someone who has it changes nothing, and taking it back removes their progress", async () => {
  const { mentors, learners, assignments } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  await mentors.assign(PROJECT, created.id, "m", ["alice"]);
  await learners.complete(PROJECT, created.id, created.steps[0].id, "alice");
  await mentors.assign(PROJECT, created.id, "m", ["alice"]);
  assert.equal(assignments.size, 1);
  assert.equal((await learners.view(PROJECT, created.id, "alice")).progress.done, 1, "assigning again did not reset the progress");
  await mentors.unassign(PROJECT, created.id, "alice");
  await reject(() => learners.view(PROJECT, created.id, "alice"), 404);
  await reject(() => mentors.unassign(PROJECT, created.id, "alice"), 404, /not given/);
});

test("the mentor sees each person's progress step by step", async () => {
  const { mentors, learners } = setup();
  const created = await mentors.create(PROJECT, "m", goodPath());
  await mentors.assign(PROJECT, created.id, "m", ["alice", "bob"]);
  await learners.complete(PROJECT, created.id, created.steps[0].id, "alice");
  await learners.answer(PROJECT, created.id, created.steps[3].id, "alice", 0);
  const { path, learners: rows } = await mentors.progress(PROJECT, created.id);
  assert.equal(path.steps.length, 4);
  const alice = rows.find(r => r.userId === "alice");
  const bob = rows.find(r => r.userId === "bob");
  assert.deepEqual([alice.name, alice.email, alice.done, alice.total, alice.percent], ["Alice Example", "alice@test.invalid", 1, 4, 25]);
  assert.equal(alice.steps[3].attempts, 1);
  assert.equal(alice.steps[3].completed, false);
  assert.deepEqual([bob.done, bob.percent], [0, 0]);
});

// ── Learning ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function given(stepsOverride) {
  const world = setup();
  const created = await world.mentors.create(PROJECT, "m", goodPath(stepsOverride ? { steps: stepsOverride } : {}));
  await world.mentors.assign(PROJECT, created.id, "m", ["alice", "bob"]);
  return { ...world, created, ids: created.steps.map(s => s.id) };
}

test("a learner's list holds their own published paths, with their own progress", async () => {
  const { mentors, learners, created, ids } = await given();
  const other = await mentors.create(PROJECT, "m", goodPath({ title: "Only for Bob" }));
  await mentors.assign(PROJECT, other.id, "m", ["bob"]);
  await learners.complete(PROJECT, created.id, ids[0], "alice");
  const alices = await learners.myPaths("alice");
  assert.deepEqual(alices.map(p => p.title), [created.title]);
  assert.deepEqual([alices[0].done, alices[0].total, alices[0].percent, alices[0].projectName], [1, 4, 25, "Shop Backend"]);
  assert.equal((await learners.myPaths("bob")).length, 2);
  assert.deepEqual(await learners.myPaths("carol"), []);
});

test("each path in a learner's list says which step to pick up at, and none once every step is done", async () => {
  const { learners, created, ids } = await given();
  const next = async who => (await learners.myPaths(who))[0].nextStep;
  assert.deepEqual(await next("alice"), { id: ids[0], title: "Meet the billing component", kind: "component", index: 0 });
  // Out of order: the first step not done is still the one to pick up at.
  await learners.complete(PROJECT, created.id, ids[1], "alice");
  assert.equal((await next("alice")).index, 0);
  await learners.complete(PROJECT, created.id, ids[0], "alice");
  await learners.complete(PROJECT, created.id, ids[2], "alice");
  assert.deepEqual(await next("alice"), { id: ids[3], title: "Check yourself", kind: "question", index: 3 });
  assert.ok(!JSON.stringify(await learners.myPaths("alice")).includes("Which component owns invoices"), "the question itself is not in the list");
  await learners.answer(PROJECT, created.id, ids[3], "alice", 1);
  assert.equal(await next("alice"), null);
  assert.equal((await next("bob")).index, 0, "Bob's next step is his own");
});

test("the next step of a path without steps is none", () => {
  assert.equal(nextStep({ steps: [] }, {}), null);
  assert.equal(nextStep({ steps }, undefined).id, "s1");
  assert.deepEqual(nextStep({ steps }, { s1: { completedAt: new Date() }, s2: { attempts: 4 } }), { id: "s2", title: "Q", kind: "question", index: 1 });
});

test("a draft, or a project the person has left, drops off their list", async () => {
  const { mentors, learners, created, pathStore, assignmentStore } = await given();
  const ids = created.steps.map(({ assessment, revision, commitTitle, ...s }) => s);
  await mentors.update(PROJECT, "m", created.id, { ...goodPath({ status: "draft" }), steps: ids, expectedRevision: 1 });
  assert.deepEqual(await learners.myPaths("alice"), []);
  // Taken back to a draft, it can no longer be opened, finished or answered by the people who had it.
  await reject(() => learners.view(PROJECT, created.id, "alice"), 404);
  await reject(() => learners.complete(PROJECT, created.id, created.steps[0].id, "alice"), 404);
  await reject(() => learners.answer(PROJECT, created.id, created.steps[3].id, "alice", 1), 404);
  await mentors.update(PROJECT, "m", created.id, { ...goodPath(), steps: ids, expectedRevision: 2 });
  assert.equal((await learners.myPaths("alice")).length, 1);

  const left = new OnboardingLearningUseCases(pathStore, assignmentStore, fakeDeps({ isMember: async () => false }));
  assert.deepEqual(await left.myPaths("alice"), []);
});

test("a path that was not given to you is not there, whatever else is true", async () => {
  const { learners, created, mentors } = await given();
  await reject(() => learners.view(PROJECT, created.id, "carol"), 404);
  await reject(() => learners.complete(PROJECT, created.id, created.steps[0].id, "carol"), 404);
  await reject(() => learners.answer(PROJECT, created.id, created.steps[3].id, "carol", 1), 404);
  await reject(() => learners.view("66f000000000000000000009", created.id, "alice"), 404, undefined);
  await reject(() => learners.view(PROJECT, "no-such-path", "alice"), 404);
  const draft = await mentors.create(PROJECT, "m", goodPath({ status: "draft" }));
  await reject(() => learners.view(PROJECT, draft.id, "alice"), 404);
});

test("the learner's page carries their own progress and no answer key", async () => {
  const { learners, created, ids } = await given();
  await learners.complete(PROJECT, created.id, ids[0], "alice");
  const view = await learners.view(PROJECT, created.id, "alice");
  assert.equal(view.path.title, created.title);
  assert.deepEqual(view.progress, { done: 1, total: 4, percent: 25 });
  assert.equal(view.path.steps[0].progress.completed, true);
  assert.equal(view.path.steps[1].progress.completed, false);
  assert.deepEqual(view.path.steps[3].question, { prompt: "Which component owns invoices?", options: ["Orders", "Billing"] });
  assert.ok(!JSON.stringify(view).includes("Billing owns invoices"), "the explanation is not in the page");
  assert.ok(!JSON.stringify(view).includes("correctIndex"));
  assert.equal(view.path.steps[0].assessment.status, "current");
});

test("a step that is read is marked done once", async () => {
  const { learners, created, ids } = await given();
  const first = await learners.complete(PROJECT, created.id, ids[0], "alice");
  assert.deepEqual(first.progress, { done: 1, total: 4, percent: 25 });
  const again = await learners.complete(PROJECT, created.id, ids[0], "alice");
  assert.deepEqual(again.progress, { done: 1, total: 4, percent: 25 });
  await reject(() => learners.complete(PROJECT, created.id, ids[3], "alice"), 400, /Answer the question/);
  await reject(() => learners.complete(PROJECT, created.id, "step-ffffffff", "alice"), 404);
});

test("a wrong answer counts as an attempt and reveals nothing; the right one finishes the step and explains", async () => {
  const { learners, created, ids } = await given();
  const wrong = await learners.answer(PROJECT, created.id, ids[3], "alice", 0);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.completed, false);
  assert.equal(wrong.attempts, 1);
  assert.equal(wrong.explanation, undefined);
  assert.equal(wrong.correctIndex, undefined);
  assert.equal(wrong.progress.done, 0);

  const right = await learners.answer(PROJECT, created.id, ids[3], "alice", 1);
  assert.equal(right.correct, true);
  assert.equal(right.completed, true);
  assert.equal(right.attempts, 2);
  assert.equal(right.explanation, "Billing owns invoices.");
  assert.equal(right.correctIndex, 1);
  assert.equal(right.progress.done, 1);

  const shown = (await learners.view(PROJECT, created.id, "alice")).path.steps[3].question;
  assert.equal(shown.explanation, "Billing owns invoices.", "after finishing, the page shows the explanation");
});

test("answering again after finishing does not undo it", async () => {
  const { learners, created, ids } = await given();
  await learners.answer(PROJECT, created.id, ids[3], "alice", 1);
  const later = await learners.answer(PROJECT, created.id, ids[3], "alice", 0);
  assert.equal(later.correct, false);
  assert.equal(later.completed, true, "a wrong answer after a right one leaves the step done");
  assert.equal(later.attempts, 2);
});

test("only a real option of a real question can be answered", async () => {
  const { learners, created, ids } = await given();
  for (const choice of [2, -1, 1.5, "1", null, undefined, {}]) {
    await reject(() => learners.answer(PROJECT, created.id, ids[3], "alice", choice), 400, /Choose one/);
  }
  await reject(() => learners.answer(PROJECT, created.id, ids[0], "alice", 0), 400, /no question/);
  await reject(() => learners.answer(PROJECT, created.id, "step-ffffffff", "alice", 0), 404);
});

test("colleagues on the same path never see each other's progress", async () => {
  const { learners, created, ids } = await given();
  await learners.complete(PROJECT, created.id, ids[0], "alice");
  await learners.answer(PROJECT, created.id, ids[3], "alice", 1);
  await learners.complete(PROJECT, created.id, ids[2], "bob");

  const alice = await learners.view(PROJECT, created.id, "alice");
  const bob = await learners.view(PROJECT, created.id, "bob");
  assert.deepEqual(alice.progress, { done: 2, total: 4, percent: 50 });
  assert.deepEqual(bob.progress, { done: 1, total: 4, percent: 25 });
  assert.equal(bob.path.steps[3].progress.completed, false, "Alice's answer is not Bob's");
  assert.equal(bob.path.steps[3].question.explanation, undefined, "and does not unlock the explanation for Bob");

  for (const view of [alice, bob]) {
    const text = JSON.stringify(view);
    for (const hidden of ["alice@test.invalid", "bob@test.invalid", "Alice Example", "Bob Example", "assignedBy", "userId"]) {
      assert.ok(!text.includes(hidden), `a learner's page does not mention "${hidden}"`);
    }
  }
  const mine = JSON.stringify(await learners.myPaths("bob"));
  assert.ok(!mine.includes("alice"), "nor does the list of paths");
});
