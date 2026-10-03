import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../src/presentation/middlewares/authorize.ts';
import { createProjectRoleMiddleware } from '../src/presentation/middlewares/projectRole.ts';
import { UserRole } from '../src/domain/entities/User.ts';
import { RepoVisibility, ProjectStatus } from '../src/domain/entities/Project.ts';
import {
  ProjectMemberRole,
  MemberStatus,
} from '../src/domain/entities/ProjectMember.ts';
import { InviteProjectMemberUseCase } from '../src/application/use-cases/members/InviteProjectMemberUseCase.ts';
import { GetProjectMembersUseCase } from '../src/application/use-cases/members/GetProjectMembersUseCase.ts';
import { UpdateProjectMemberRoleUseCase } from '../src/application/use-cases/members/UpdateProjectMemberRoleUseCase.ts';
import { RemoveProjectMemberUseCase } from '../src/application/use-cases/members/RemoveProjectMemberUseCase.ts';
import { GetTeamMembersUseCase } from '../src/application/use-cases/members/GetTeamMembersUseCase.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. authorize middleware (system-level role check)
// ─────────────────────────────────────────────────────────────────────────────
test('authorize: blocks unauthenticated requests with 401', () => {
  const middleware = authorize(UserRole.SYSTEM_ADMINISTRATOR);
  let error;
  middleware({}, {}, (err) => { error = err; });

  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, 'UNAUTHORIZED');
});

test('authorize: blocks insufficient role with 403 FORBIDDEN', () => {
  const middleware = authorize(UserRole.SYSTEM_ADMINISTRATOR);
  let error;
  const req = { user: { userId: 'u1', role: UserRole.DEVELOPER_ANALYST } };
  middleware(req, {}, (err) => { error = err; });

  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'FORBIDDEN');
});

test('authorize: allows requests when user role matches allowed roles', () => {
  const middleware = authorize(UserRole.PROJECT_MAINTAINER, UserRole.SYSTEM_ADMINISTRATOR);
  let called = false;
  let error;
  const req = { user: { userId: 'u1', role: UserRole.PROJECT_MAINTAINER } };
  middleware(req, {}, (err) => {
    called = true;
    error = err;
  });

  assert.equal(called, true);
  assert.equal(error, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. projectRole middleware (project-level permissions)
// ─────────────────────────────────────────────────────────────────────────────
test('projectRole: system admin has full access to any project', async () => {
  const projectRepo = {
    findById: async (id) => ({
      id,
      name: 'P1',
      repoUrl: 'https://github.com/org/p1',
      visibility: RepoVisibility.PRIVATE,
      status: ProjectStatus.COMPLETED,
      userId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const memberRepo = {
    findByProjectAndUserId: async () => null,
  };

  const middlewareFactory = createProjectRoleMiddleware(projectRepo, memberRepo);
  const checkAdmin = middlewareFactory('admin');

  const req = {
    params: { id: 'p1' },
    user: { userId: 'admin-1', role: UserRole.SYSTEM_ADMINISTRATOR },
  };

  let error;
  await checkAdmin(req, {}, (err) => { error = err; });

  assert.equal(error, undefined);
  assert.equal(req.project?.id, 'p1');
});

test('projectRole: project owner has write and admin access', async () => {
  const projectRepo = {
    findById: async (id) => ({
      id,
      name: 'P1',
      repoUrl: 'https://github.com/org/p1',
      visibility: RepoVisibility.PRIVATE,
      status: ProjectStatus.COMPLETED,
      userId: 'user-owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const memberRepo = {
    findByProjectAndUserId: async () => null,
  };

  const middlewareFactory = createProjectRoleMiddleware(projectRepo, memberRepo);
  const checkAdmin = middlewareFactory('admin');

  const req = {
    params: { id: 'p1' },
    user: { userId: 'user-owner', role: UserRole.PROJECT_MAINTAINER },
  };

  let error;
  await checkAdmin(req, {}, (err) => { error = err; });

  assert.equal(error, undefined);
  assert.equal(req.projectMemberRole, 'owner');
});

test('projectRole: project maintainer member has write/admin access', async () => {
  const projectRepo = {
    findById: async (id) => ({
      id,
      name: 'P1',
      repoUrl: 'https://github.com/org/p1',
      visibility: RepoVisibility.PRIVATE,
      status: ProjectStatus.COMPLETED,
      userId: 'original-owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const memberRepo = {
    findByProjectAndUserId: async () => ({
      id: 'm1',
      projectId: 'p1',
      userId: 'maintainer-user',
      email: 'm@example.com',
      name: 'Maintainer',
      role: ProjectMemberRole.MAINTAINER,
      status: MemberStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };

  const middlewareFactory = createProjectRoleMiddleware(projectRepo, memberRepo);
  const checkWrite = middlewareFactory('write');

  const req = {
    params: { id: 'p1' },
    user: { userId: 'maintainer-user', role: UserRole.DEVELOPER_ANALYST },
  };

  let error;
  await checkWrite(req, {}, (err) => { error = err; });

  assert.equal(error, undefined);
  assert.equal(req.projectMemberRole, ProjectMemberRole.MAINTAINER);
});

test('projectRole: developer-analyst member has read access but blocked on write', async () => {
  const projectRepo = {
    findById: async (id) => ({
      id,
      name: 'P1',
      repoUrl: 'https://github.com/org/p1',
      visibility: RepoVisibility.PRIVATE,
      status: ProjectStatus.COMPLETED,
      userId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const memberRepo = {
    findByProjectAndUserId: async () => ({
      id: 'm1',
      projectId: 'p1',
      userId: 'dev-user',
      email: 'dev@example.com',
      name: 'Dev Analyst',
      role: ProjectMemberRole.MEMBER,
      status: MemberStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };

  const middlewareFactory = createProjectRoleMiddleware(projectRepo, memberRepo);

  // Read: allowed
  const checkRead = middlewareFactory('read');
  const reqRead = {
    params: { id: 'p1' },
    user: { userId: 'dev-user', role: UserRole.DEVELOPER_ANALYST },
  };
  let readErr;
  await checkRead(reqRead, {}, (err) => { readErr = err; });
  assert.equal(readErr, undefined);

  // Write: blocked 403
  const checkWrite = middlewareFactory('write');
  const reqWrite = {
    params: { id: 'p1' },
    user: { userId: 'dev-user', role: UserRole.DEVELOPER_ANALYST },
  };
  let writeErr;
  await checkWrite(reqWrite, {}, (err) => { writeErr = err; });
  assert.ok(writeErr instanceof AppError);
  assert.equal(writeErr.statusCode, 403);
  assert.equal(writeErr.code, 'FORBIDDEN');
});

test('projectRole: non-member blocked on private project, allowed read on public project', async () => {
  const privateProject = {
    id: 'p-priv',
    name: 'Private',
    repoUrl: 'https://github.com/org/priv',
    visibility: RepoVisibility.PRIVATE,
    status: ProjectStatus.COMPLETED,
    userId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const publicProject = {
    id: 'p-pub',
    name: 'Public',
    repoUrl: 'https://github.com/org/pub',
    visibility: RepoVisibility.PUBLIC,
    status: ProjectStatus.COMPLETED,
    userId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const projectRepo = {
    findById: async (id) => (id === 'p-priv' ? privateProject : publicProject),
  };
  const memberRepo = {
    findByProjectAndUserId: async () => null,
  };

  const middlewareFactory = createProjectRoleMiddleware(projectRepo, memberRepo);
  const checkRead = middlewareFactory('read');

  // Private project -> 403
  const reqPriv = {
    params: { id: 'p-priv' },
    user: { userId: 'stranger', role: UserRole.DEVELOPER_ANALYST },
  };
  let privErr;
  await checkRead(reqPriv, {}, (err) => { privErr = err; });
  assert.equal(privErr?.statusCode, 403);

  // Public project -> 200 ok
  const reqPub = {
    params: { id: 'p-pub' },
    user: { userId: 'stranger', role: UserRole.DEVELOPER_ANALYST },
  };
  let pubErr;
  await checkRead(reqPub, {}, (err) => { pubErr = err; });
  assert.equal(pubErr, undefined);
  assert.equal(reqPub.project?.id, 'p-pub');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Member Use Cases
// ─────────────────────────────────────────────────────────────────────────────
test('InviteProjectMemberUseCase: adds member and handles existing vs new users', async () => {
  const members = [];
  const memberRepo = {
    findByProjectAndEmail: async (_p, email) => members.find(m => m.email === email) ?? null,
    addMember: async (data) => {
      const doc = { id: `m-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
      members.push(doc);
      return doc;
    },
  };
  const projectRepo = {
    findById: async () => ({ id: 'p1', userId: 'owner-1' }),
  };
  const userRepo = {
    findByEmail: async (email) => (email === 'registered@test.com' ? { id: 'u-reg', email } : null),
  };

  const inviteUseCase = new InviteProjectMemberUseCase(memberRepo, projectRepo, userRepo);

  // Case 1: Invite registered user -> active
  const m1 = await inviteUseCase.execute({
    projectId: 'p1',
    email: 'registered@test.com',
    name: 'Reg User',
    role: ProjectMemberRole.MEMBER,
  });
  assert.equal(m1.status, MemberStatus.ACTIVE);
  assert.equal(m1.userId, 'u-reg');

  // Case 2: Invite unregistered user -> invited
  const m2 = await inviteUseCase.execute({
    projectId: 'p1',
    email: 'unregistered@test.com',
    name: 'Unreg User',
  });
  assert.equal(m2.status, MemberStatus.INVITED);
  assert.equal(m2.userId, undefined);

  // Case 3: Duplicate invite -> ConflictError 409
  await assert.rejects(
    inviteUseCase.execute({ projectId: 'p1', email: 'registered@test.com', name: 'Reg User' }),
    (err) => err.statusCode === 409 && err.code === 'ALREADY_EXISTS',
  );
});

test('RemoveProjectMemberUseCase: prevents removing project owner', async () => {
  const memberRepo = {
    deleteByProjectAndId: async () => true,
  };
  const projectRepo = {
    findById: async () => ({ id: 'p1', userId: 'owner-123' }),
  };

  const removeUseCase = new RemoveProjectMemberUseCase(memberRepo, projectRepo);

  // Removing owner is forbidden
  await assert.rejects(
    removeUseCase.execute('p1', 'owner-123'),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );

  // Removing non-owner succeeds
  const removed = await removeUseCase.execute('p1', 'm-normal');
  assert.equal(removed, true);
});

test('GetTeamMembersUseCase: aggregates projects by member email', async () => {
  const members = [
    { id: 'm1', projectId: 'p1', email: 'alice@test.com', name: 'Alice', role: 'developer-analyst', status: 'active' },
    { id: 'm2', projectId: 'p2', email: 'alice@test.com', name: 'Alice', role: 'developer-analyst', status: 'active' },
    { id: 'm3', projectId: 'p1', email: 'bob@test.com', name: 'Bob', role: 'project-maintainer', status: 'invited' },
  ];

  const memberRepo = {
    findAll: async () => members,
    findByUserId: async () => [],
  };
  const projectRepo = {
    findByUserId: async () => [{ id: 'p1' }, { id: 'p2' }],
  };

  const getTeam = new GetTeamMembersUseCase(memberRepo, projectRepo);
  const result = await getTeam.execute({
    userId: 'admin-1',
    userRole: UserRole.SYSTEM_ADMINISTRATOR,
  });

  assert.equal(result.length, 2);
  const alice = result.find(m => m.email === 'alice@test.com');
  assert.ok(alice);
  assert.deepEqual(alice.projects, ['p1', 'p2']);
});
