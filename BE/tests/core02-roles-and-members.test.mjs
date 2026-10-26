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
  const req = { user: { userId: 'u1', role: UserRole.USER } };
  middleware(req, {}, (err) => { error = err; });

  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'FORBIDDEN');
});

test('authorize: allows requests when user role matches allowed roles', () => {
  const middleware = authorize(UserRole.USER, UserRole.SYSTEM_ADMINISTRATOR);
  let called = false;
  let error;
  const req = { user: { userId: 'u1', role: UserRole.USER } };
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
    user: { userId: 'user-owner', role: UserRole.USER },
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
    user: { userId: 'maintainer-user', role: UserRole.USER },
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
    user: { userId: 'dev-user', role: UserRole.USER },
  };
  let readErr;
  await checkRead(reqRead, {}, (err) => { readErr = err; });
  assert.equal(readErr, undefined);

  // Write: blocked 403
  const checkWrite = middlewareFactory('write');
  const reqWrite = {
    params: { id: 'p1' },
    user: { userId: 'dev-user', role: UserRole.USER },
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
    user: { userId: 'stranger', role: UserRole.USER },
  };
  let privErr;
  await checkRead(reqPriv, {}, (err) => { privErr = err; });
  assert.equal(privErr?.statusCode, 403);

  // Public project -> 200 ok
  const reqPub = {
    params: { id: 'p-pub' },
    user: { userId: 'stranger', role: UserRole.USER },
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
    findByProjectId: async () => [],
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
    findByIds: async (ids) => ids.map(id => ({ id, userId: 'someone-else' })),
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

// ─────────────────────────────────────────────────────────────────────────────
// Team page: one entry per workspace, the owner marked, actions scoped to the workspace
// ─────────────────────────────────────────────────────────────────────────────
const teamProjects = {
  a: { id: 'a', userId: 'u-owner' },
  b: { id: 'b', userId: 'u-owner' },
  org: { id: 'org', userId: 'u-other', organizationId: 'o1' },
};
const teamMembers = [
  { id: 'm-own-a', projectId: 'a', userId: 'u-owner', email: 'owner@test', name: 'Owner', role: 'project-maintainer', status: 'active' },
  { id: 'm-own-b', projectId: 'b', userId: 'u-owner', email: 'owner@test', name: 'Owner', role: 'project-maintainer', status: 'active' },
  { id: 'm-sam-a', projectId: 'a', userId: 'u-sam', email: 'sam@test', name: 'Sam', role: 'developer-analyst', status: 'active' },
  { id: 'm-sam-b', projectId: 'b', userId: 'u-sam', email: 'sam@test', name: 'Sam', role: 'project-maintainer', status: 'active' },
  { id: 'm-org', projectId: 'org', userId: 'u-other', email: 'other@test', name: 'Other', role: 'project-maintainer', status: 'active' },
  { id: 'm-x', projectId: 'x', userId: 'u-x', email: 'x@test', name: 'X', role: 'developer-analyst', status: 'active' },
];
function teamRepos() {
  const members = teamMembers.map(m => ({ ...m }));
  const memberRepo = {
    findAll: async ({ projectId } = {}) => members.filter(m => !projectId || m.projectId === projectId),
    findByProjectId: async (projectId) => members.filter(m => m.projectId === projectId),
    findByUserId: async (userId) => members.filter(m => m.userId === userId),
    updateRole: async (id, role) => { const m = members.find(x => x.id === id); if (m) m.role = role; return m ?? null; },
    deleteByProjectAndId: async (projectId, id) => {
      const i = members.findIndex(m => m.projectId === projectId && m.id === id);
      if (i < 0) return false;
      members.splice(i, 1);
      return true;
    },
  };
  const projectRepo = {
    findById: async (id) => teamProjects[id] ?? null,
    findByIds: async (ids) => ids.map(id => teamProjects[id]).filter(Boolean),
    findByUserId: async (userId) => Object.values(teamProjects).filter(p => p.userId === userId),
  };
  return { members, memberRepo, projectRepo };
}

test('GetTeamMembersUseCase: lists every membership per workspace and marks the owner', async () => {
  const { memberRepo, projectRepo } = teamRepos();
  const team = await new GetTeamMembersUseCase(memberRepo, projectRepo).execute({ userId: 'u-owner', userRole: UserRole.USER });

  assert.deepEqual(team.map(m => m.email).sort(), ['owner@test', 'sam@test']);
  const owner = team.find(m => m.email === 'owner@test');
  assert.deepEqual(owner.memberships.map(ms => [ms.projectId, ms.memberId, ms.role]), [['a', 'm-own-a', 'owner'], ['b', 'm-own-b', 'owner']]);
  assert.equal(owner.role, 'owner');
  const sam = team.find(m => m.email === 'sam@test');
  assert.deepEqual(sam.memberships.map(ms => [ms.projectId, ms.memberId, ms.role]), [['a', 'm-sam-a', 'developer-analyst'], ['b', 'm-sam-b', 'project-maintainer']]);
  assert.deepEqual(sam.projects, ['a', 'b']);
});

test('GetTeamMembersUseCase: with the access policy, an organization owner manages its workspaces without a membership', async () => {
  const { memberRepo, projectRepo } = teamRepos();
  const policy = {
    readableProjects: async () => [
      { project: teamProjects.org, access: { role: 'organization-owner', actions: new Set(['metadata', 'read', 'write', 'admin', 'owner']) } },
      { project: teamProjects.a, access: { role: 'developer-analyst', actions: new Set(['metadata', 'read']) } },
    ],
  };
  const getTeam = new GetTeamMembersUseCase(memberRepo, projectRepo, policy);
  const team = await getTeam.execute({ userId: 'u-org-owner', userRole: UserRole.USER });
  assert.deepEqual(team.map(m => m.memberships.map(ms => ms.memberId)), [['m-org']]);
  // the workspace's own owner is marked even though the caller reached it through the organization
  assert.equal(team[0].memberships[0].role, 'owner');

  // a workspace the caller only reads is not theirs to manage
  assert.deepEqual(await getTeam.execute({ userId: 'u-org-owner', userRole: UserRole.USER, projectId: 'a' }), []);
});

test('GetTeamMembersUseCase: without the policy, a pending maintainer membership grants nothing', async () => {
  const { memberRepo, projectRepo, members } = teamRepos();
  members.find(m => m.id === 'm-sam-b').status = 'invited';
  const team = await new GetTeamMembersUseCase(memberRepo, projectRepo).execute({ userId: 'u-sam', userRole: UserRole.USER });
  assert.deepEqual(team, []);
});

test('UpdateProjectMemberRoleUseCase: changes the member of the given workspace only, never the owner', async () => {
  const { memberRepo, projectRepo, members } = teamRepos();
  const update = new UpdateProjectMemberRoleUseCase(memberRepo, projectRepo);

  const updated = await update.execute('m-sam-b', ProjectMemberRole.MEMBER, 'b');
  assert.equal(updated.role, ProjectMemberRole.MEMBER);
  assert.equal(members.find(m => m.id === 'm-sam-a').role, ProjectMemberRole.MEMBER);

  // a maintainer of workspace a cannot reach a membership of another workspace through a's route
  await assert.rejects(update.execute('m-org', ProjectMemberRole.MEMBER, 'a'), (err) => err.statusCode === 404);
  await assert.rejects(update.execute('m-own-a', ProjectMemberRole.MEMBER, 'a'), (err) => err.statusCode === 403 && err.code === 'FORBIDDEN');
  assert.equal(members.find(m => m.id === 'm-own-a').role, ProjectMemberRole.MAINTAINER);
});

test('RemoveProjectMemberUseCase: refuses the owner\'s own membership record', async () => {
  const { memberRepo, projectRepo, members } = teamRepos();
  const remove = new RemoveProjectMemberUseCase(memberRepo, projectRepo);

  await assert.rejects(remove.execute('a', 'm-own-a'), (err) => err.statusCode === 403 && err.code === 'FORBIDDEN');
  assert.ok(members.some(m => m.id === 'm-own-a'));

  assert.equal(await remove.execute('b', 'm-sam-b'), true);
  assert.deepEqual(members.filter(m => m.userId === 'u-sam').map(m => m.id), ['m-sam-a']);
  await assert.rejects(remove.execute('a', 'm-sam-b'), (err) => err.statusCode === 404);
});
