import test from 'node:test';
import assert from 'node:assert/strict';
import { GetProjectWorkspaceUseCase } from '../src/application/use-cases/workspace/GetProjectWorkspaceUseCase.ts';
import { SaveProjectWorkspaceUseCase } from '../src/application/use-cases/workspace/SaveProjectWorkspaceUseCase.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Workspace & Project Repositories for Testing
// ─────────────────────────────────────────────────────────────────────────────
function createMockRepos() {
  const projects = new Map([
    ['proj-1', { id: 'proj-1', name: 'Order Service', userId: 'user-1' }],
    ['proj-2', { id: 'proj-2', name: 'Payment Gateway', userId: 'user-2' }],
  ]);

  const workspaces = new Map();

  const projectRepo = {
    findById: async (id) => projects.get(id) || null,
  };

  const workspaceRepo = {
    findByProjectId: async (projectId) => {
      const found = workspaces.get(projectId);
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    create: async (ws) => {
      const entity = {
        id: `ws-${Date.now()}`,
        ...ws,
        revision: ws.revision ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      workspaces.set(ws.projectId, entity);
      return JSON.parse(JSON.stringify(entity));
    },
    save: async (ws, expectedRevision) => {
      const current = workspaces.get(ws.projectId);

      if (!current) {
        if (expectedRevision !== undefined && expectedRevision !== 1) {
          const err = new Error(
            `Revision conflict: expected ${expectedRevision} but workspace has not been initialized (initial revision is 1)`
          );
          err.currentRevision = 1;
          err.expectedRevision = expectedRevision;
          err.isConflict = true;
          throw err;
        }

        const nextRevision = (expectedRevision ?? 1) + 1;
        const created = {
          id: `ws-${Date.now()}`,
          ...ws,
          revision: nextRevision,
          diagram: {
            ...ws.diagram,
            revision: nextRevision,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        workspaces.set(ws.projectId, created);
        return JSON.parse(JSON.stringify(created));
      }

      if (expectedRevision !== undefined && current.revision !== expectedRevision) {
        const err = new Error(
          `Revision conflict: expected ${expectedRevision} but found ${current.revision}`
        );
        err.currentRevision = current.revision;
        err.expectedRevision = expectedRevision;
        err.isConflict = true;
        throw err;
      }

      const nextRevision = current.revision + 1;
      const updated = {
        ...current,
        revision: nextRevision,
        diagram: {
          ...ws.diagram,
          revision: nextRevision,
        },
        rules: ws.rules ?? [],
        decisions: ws.decisions ?? [],
        updatedBy: ws.updatedBy,
        updatedAt: new Date(),
      };
      workspaces.set(ws.projectId, updated);
      return JSON.parse(JSON.stringify(updated));
    },
  };

  return { projectRepo, workspaceRepo, workspaces };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GetProjectWorkspaceUseCase
// ─────────────────────────────────────────────────────────────────────────────
test('GetProjectWorkspaceUseCase: returns default initial template when not yet in database', async () => {
  const { projectRepo, workspaceRepo } = createMockRepos();
  const useCase = new GetProjectWorkspaceUseCase(workspaceRepo, projectRepo);

  const ws = await useCase.execute('proj-1');

  assert.equal(ws.projectId, 'proj-1');
  assert.equal(ws.revision, 1);
  assert.equal(ws.diagram.revision, 1);
  assert.equal(ws.diagram.components.length, 4);
  assert.equal(ws.diagram.dependencies.length, 3);
  assert.ok(ws.diagram.components.some((c) => c.name === 'Order Service Service'));
});

test('GetProjectWorkspaceUseCase: throws NotFoundError when project does not exist', async () => {
  const { projectRepo, workspaceRepo } = createMockRepos();
  const useCase = new GetProjectWorkspaceUseCase(workspaceRepo, projectRepo);

  await assert.rejects(
    () => useCase.execute('non-existent-proj'),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'NOT_FOUND');
      return true;
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SaveProjectWorkspaceUseCase & Optimistic Concurrency Control
// ─────────────────────────────────────────────────────────────────────────────
test('SaveProjectWorkspaceUseCase: saves initial workspace with revision incremented to 2', async () => {
  const { projectRepo, workspaceRepo } = createMockRepos();
  const getUseCase = new GetProjectWorkspaceUseCase(workspaceRepo, projectRepo);
  const saveUseCase = new SaveProjectWorkspaceUseCase(workspaceRepo, projectRepo);

  const initial = await getUseCase.execute('proj-1');
  assert.equal(initial.revision, 1);

  const saved = await saveUseCase.execute({
    projectId: 'proj-1',
    expectedRevision: 1,
    diagram: {
      ...initial.diagram,
      components: [
        ...initial.diagram.components,
        { id: 'c5', name: 'Notification Service', kind: 'Service', description: 'Async notifications' },
      ],
    },
    rules: [
      {
        id: 'r1',
        name: 'UI cannot bypass API',
        source: 'web',
        target: 'db',
        constraint: 'forbidden',
        severity: 'error',
        rationale: 'Security requirement',
        enabled: true,
      },
    ],
    decisions: [],
    userId: 'user-1',
  });

  assert.equal(saved.revision, 2);
  assert.equal(saved.diagram.revision, 2);
  assert.equal(saved.diagram.components.length, 5);
  assert.equal(saved.rules.length, 1);
});

test('SaveProjectWorkspaceUseCase: enforces Optimistic Concurrency Control (OCC) and throws 409 CONFLICT', async () => {
  const { projectRepo, workspaceRepo } = createMockRepos();
  const getUseCase = new GetProjectWorkspaceUseCase(workspaceRepo, projectRepo);
  const saveUseCase = new SaveProjectWorkspaceUseCase(workspaceRepo, projectRepo);

  // Both User A and User B fetch initial revision 1
  const userAView = await getUseCase.execute('proj-1');
  const userBView = await getUseCase.execute('proj-1');
  assert.equal(userAView.revision, 1);
  assert.equal(userBView.revision, 1);

  // User A saves first with expectedRevision: 1 -> Succeeded, revision becomes 2
  const savedA = await saveUseCase.execute({
    projectId: 'proj-1',
    expectedRevision: userAView.revision,
    diagram: userAView.diagram,
    rules: [],
    decisions: [],
    userId: 'user-A',
  });
  assert.equal(savedA.revision, 2);

  // User B tries to save with stale expectedRevision: 1 -> MUST throw ConflictError (HTTP 409, code CONFLICT)
  await assert.rejects(
    () =>
      saveUseCase.execute({
        projectId: 'proj-1',
        expectedRevision: userBView.revision, // still 1!
        diagram: userBView.diagram,
        rules: [],
        decisions: [],
        userId: 'user-B',
      }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CONFLICT');
      assert.match(err.message, /revision conflict/i);
      return true;
    }
  );

  // User B reloads workspace to fetch latest revision 2
  const userBReloaded = await getUseCase.execute('proj-1');
  assert.equal(userBReloaded.revision, 2);

  // User B saves with current expectedRevision: 2 -> Succeeded, revision becomes 3
  const savedB = await saveUseCase.execute({
    projectId: 'proj-1',
    expectedRevision: userBReloaded.revision,
    diagram: userBReloaded.diagram,
    rules: [],
    decisions: [],
    userId: 'user-B',
  });
  assert.equal(savedB.revision, 3);
  assert.equal(savedB.diagram.revision, 3);
});

test('SaveProjectWorkspaceUseCase: rejects invalid diagram payload with 400 VALIDATION_ERROR', async () => {
  const { projectRepo, workspaceRepo } = createMockRepos();
  const saveUseCase = new SaveProjectWorkspaceUseCase(workspaceRepo, projectRepo);

  await assert.rejects(
    () =>
      saveUseCase.execute({
        projectId: 'proj-1',
        diagram: null,
      }),
    (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'VALIDATION_ERROR');
      return true;
    }
  );
});
