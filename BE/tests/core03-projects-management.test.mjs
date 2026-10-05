import test from 'node:test';
import assert from 'node:assert/strict';
import { GetAllProjectsUseCase } from '../src/application/use-cases/projects/GetAllProjectsUseCase.ts';
import { GetProjectByIdUseCase } from '../src/application/use-cases/projects/GetProjectByIdUseCase.ts';
import { RegisterProjectUseCase } from '../src/application/use-cases/projects/RegisterProjectUseCase.ts';
import { RepoVisibility, ProjectStatus } from '../src/domain/entities/Project.ts';
import { UserRole } from '../src/domain/entities/User.ts';
import { ProjectMemberRole, MemberStatus } from '../src/domain/entities/ProjectMember.ts';
import { AppError } from '../src/shared/errors/AppError.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. GetAllProjectsUseCase
// ─────────────────────────────────────────────────────────────────────────────
test('GetAllProjectsUseCase: enriches projects with userRole and honors scopes', async () => {
  const sampleProjects = [
    { id: 'p1', name: 'Project Alpha', userId: 'user-1', visibility: RepoVisibility.PRIVATE },
    { id: 'p2', name: 'Project Beta', userId: 'user-2', visibility: RepoVisibility.PRIVATE },
    { id: 'p3', name: 'Project Gamma', userId: 'user-3', visibility: RepoVisibility.PRIVATE },
  ];

  const memberships = [
    { projectId: 'p2', userId: 'user-1', role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
    { projectId: 'p3', userId: 'user-1', role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  ];

  let lastFilter;
  const projectRepo = {
    findAccessibleProjectsPaginated: async (filter) => {
      lastFilter = filter;
      let matched = sampleProjects;
      if (!filter.matchAll) {
        matched = sampleProjects.filter(p =>
          (filter.userId && p.userId === filter.userId) ||
          (filter.projectIds && filter.projectIds.includes(p.id))
        );
      }
      return { items: matched, total: matched.length };
    },
  };

  const memberRepo = {
    findByUserId: async (uid) => (uid === 'user-1' ? memberships : []),
  };

  const useCase = new GetAllProjectsUseCase(projectRepo, memberRepo);

  // Test 1: Scope ALL (default)
  const allRes = await useCase.execute({ userId: 'user-1', scope: 'all' });
  assert.equal(allRes.items.length, 3);

  const p1 = allRes.items.find(p => p.id === 'p1');
  assert.equal(p1?.userRole, 'owner');
  assert.equal(p1?.isOwner, true);
  assert.equal(p1?.isMaintainer, true);

  const p2 = allRes.items.find(p => p.id === 'p2');
  assert.equal(p2?.userRole, 'project-maintainer');
  assert.equal(p2?.isOwner, false);
  assert.equal(p2?.isMaintainer, true);

  const p3 = allRes.items.find(p => p.id === 'p3');
  assert.equal(p3?.userRole, 'developer-analyst');
  assert.equal(p3?.isOwner, false);
  assert.equal(p3?.isMaintainer, false);

  // Test 2: Scope MANAGED (only owned + maintained)
  await useCase.execute({ userId: 'user-1', scope: 'managed' });
  assert.equal(lastFilter.userId, 'user-1');
  assert.deepEqual(lastFilter.projectIds, ['p2']);

  // Test 3: Scope PARTICIPATING (only member, not owned)
  await useCase.execute({ userId: 'user-1', scope: 'participating' });
  assert.equal(lastFilter.userId, undefined);
  assert.deepEqual(lastFilter.projectIds, ['p3']);

  // Test 4: System Admin scope ALL -> matchAll: true
  await useCase.execute({ userId: 'admin-1', userRole: UserRole.SYSTEM_ADMINISTRATOR, scope: 'all' });
  assert.equal(lastFilter.matchAll, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GetProjectByIdUseCase
// ─────────────────────────────────────────────────────────────────────────────
test('GetProjectByIdUseCase: returns project detail with role and member count', async () => {
  const project = {
    id: 'p100',
    name: 'ArchTime Core',
    description: 'Architecture platform',
    repoUrl: 'https://github.com/org/arch',
    visibility: RepoVisibility.PRIVATE,
    status: ProjectStatus.COMPLETED,
    userId: 'owner-id',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const projectRepo = {
    findById: async (id) => (id === 'p100' ? project : null),
  };

  const memberRepo = {
    findByProjectAndUserId: async (_pid, uid) =>
      uid === 'member-id'
        ? { role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE }
        : null,
    findByProjectId: async () => [
      { userId: 'owner-id', role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
      { userId: 'member-id', role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
      { userId: 'other-id', role: ProjectMemberRole.MEMBER, status: MemberStatus.INVITED },
    ],
  };

  const getById = new GetProjectByIdUseCase(projectRepo, memberRepo);

  // Case 1: Owner gets detail with role 'owner'
  const ownerView = await getById.execute('p100', 'owner-id');
  assert.equal(ownerView.userRole, 'owner');
  assert.equal(ownerView.isOwner, true);
  assert.equal(ownerView.isMaintainer, true);
  assert.equal(ownerView.membersCount, 2); // owner + 1 active member

  // Case 2: Member gets detail with role 'developer-analyst'
  const memberView = await getById.execute('p100', 'member-id');
  assert.equal(memberView.userRole, 'developer-analyst');
  assert.equal(memberView.isOwner, false);
  assert.equal(memberView.isMaintainer, false);

  // Case 3: Stranger on private project gets 403 FORBIDDEN
  await assert.rejects(
    getById.execute('p100', 'stranger-id'),
    (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RegisterProjectUseCase
// ─────────────────────────────────────────────────────────────────────────────
test('RegisterProjectUseCase: automatically records creator as maintainer member', async () => {
  let createdProject;
  const projectRepo = {
    create: async (data) => {
      createdProject = { id: 'p-new', ...data, createdAt: new Date(), updatedAt: new Date() };
      return createdProject;
    },
  };

  let addedMember;
  const memberRepo = {
    addMember: async (data) => {
      addedMember = data;
      return { id: 'm-new', ...data };
    },
  };

  const userRepo = {
    findById: async (uid) => ({ id: uid, name: 'Alice Owner', email: 'alice@example.com' }),
  };

  const registerUseCase = new RegisterProjectUseCase(projectRepo, memberRepo, userRepo);
  const result = await registerUseCase.execute({
    name: 'New Service',
    repoUrl: 'https://github.com/org/new',
    visibility: RepoVisibility.PUBLIC,
    userId: 'u-alice',
  });

  assert.equal(result.id, 'p-new');
  assert.ok(addedMember);
  assert.equal(addedMember.projectId, 'p-new');
  assert.equal(addedMember.userId, 'u-alice');
  assert.equal(addedMember.role, ProjectMemberRole.MAINTAINER);
  assert.equal(addedMember.status, MemberStatus.ACTIVE);
});
