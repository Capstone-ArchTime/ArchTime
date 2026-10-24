// Stand-ins for the learning-path stores and for the rest of the system, shared by the onboarding tests.
// Not a test file itself (its name does not end in .test.mjs).

export const PROJECT = "66f000000000000000000001";

export function memoryStores() {
  const paths = new Map();
  const assignments = new Map();
  let seq = 0;
  const key = (pathId, userId) => `${pathId}:${userId}`;
  const copy = row => structuredClone(row);
  const tick = () => new Date(Date.UTC(2026, 9, 24, 8, 0, ++seq));

  const pathStore = {
    count: async projectId => [...paths.values()].filter(p => p.projectId === projectId).length,
    create: async path => {
      const row = { ...copy(path), id: `path-${++seq}`, createdAt: tick(), updatedAt: tick() };
      paths.set(row.id, row);
      return copy(row);
    },
    list: async (projectId, limit) => [...paths.values()].filter(p => p.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(copy),
    find: async (projectId, pathId) => { const p = paths.get(pathId); return p && p.projectId === projectId ? copy(p) : null; },
    findMany: async ids => ids.map(id => paths.get(id)).filter(Boolean).map(copy),
    replace: async (projectId, pathId, expectedRevision, content) => {
      const p = paths.get(pathId);
      if (!p || p.projectId !== projectId || p.revision !== expectedRevision) return null;
      Object.assign(p, copy(content), { revision: p.revision + 1, updatedAt: tick() });
      return copy(p);
    },
    remove: async (projectId, pathId) => { const p = paths.get(pathId); if (!p || p.projectId !== projectId) return false; paths.delete(pathId); return true; },
  };

  const assignmentStore = {
    listByPaths: async (projectId, pathIds) => [...assignments.values()].filter(a => a.projectId === projectId && pathIds.includes(a.pathId)).map(copy),
    listByUser: async (userId, limit) => [...assignments.values()].filter(a => a.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(copy),
    find: async (pathId, userId) => { const a = assignments.get(key(pathId, userId)); return a ? copy(a) : null; },
    assign: async (projectId, pathId, userId, assignedBy) => {
      if (!assignments.has(key(pathId, userId))) assignments.set(key(pathId, userId), { id: `a-${++seq}`, projectId, pathId, userId, assignedBy, assignedAt: tick(), progress: {}, updatedAt: tick() });
    },
    unassign: async (pathId, userId) => assignments.delete(key(pathId, userId)),
    removeByPath: async pathId => { for (const [k, a] of assignments) if (a.pathId === pathId) assignments.delete(k); },
    complete: async (pathId, userId, stepId, at) => {
      const a = assignments.get(key(pathId, userId));
      if (!a) return null;
      const entry = (a.progress[stepId] ??= {});
      entry.completedAt ??= at;
      a.updatedAt = at;
      return copy(a);
    },
    recordAnswer: async (pathId, userId, stepId, choice, correct, at) => {
      const a = assignments.get(key(pathId, userId));
      if (!a) return null;
      const entry = (a.progress[stepId] ??= {});
      entry.attempts = (entry.attempts ?? 0) + 1;
      entry.lastChoice = choice;
      if (correct) entry.completedAt ??= at;
      a.updatedAt = at;
      return copy(a);
    },
  };
  return { paths, assignments, pathStore, assignmentStore };
}

/** The rest of the system as the use cases see it: a workspace with two components and one decision, and two members. */
export function fakeDeps(overrides = {}) {
  return {
    pin: async (_projectId, commit) => ({
      revision: { commit: commit ? commit.padEnd(40, "0") : "f".repeat(40), snapshotId: "snap-1", workspaceRevision: 3, pinnedAt: new Date("2026-10-20T00:00:00Z") },
      ...(commit ? { title: "Split billing out of orders" } : {}),
    }),
    assess: async (_projectId, revisions) => revisions.map(() => ({ status: "current", issues: [] })),
    workspace: async () => ({ revision: 3, componentIds: new Set(["billing", "orders"]), adrIds: new Set(["adr-1"]) }),
    isMember: async (_projectId, userId) => ["alice", "bob"].includes(userId),
    people: async ids => new Map(ids.map(id => [id, { name: `${id[0].toUpperCase()}${id.slice(1)} Example`, email: `${id}@test.invalid` }])),
    projectNames: async ids => new Map(ids.map(id => [id, "Shop Backend"])),
    now: () => new Date("2026-10-24T10:00:00Z"),
    ...overrides,
  };
}

/** A path as the editor would send it. */
export const goodPath = (overrides = {}) => ({
  title: "Week 1: the billing core",
  description: "Start here.",
  status: "published",
  steps: [
    { kind: "component", title: "Meet the billing component", body: "Read how it is split.", componentId: "billing" },
    { kind: "commit", title: "The split", body: "Why it was split.", commit: "A1B2C3D" },
    { kind: "adr", title: "Why a queue", body: "", adrId: "adr-1" },
    { kind: "question", title: "Check yourself", body: "", question: { prompt: "Which component owns invoices?", options: ["Orders", "Billing"], correctIndex: 1, explanation: "Billing owns invoices." } },
  ],
  ...overrides,
});
