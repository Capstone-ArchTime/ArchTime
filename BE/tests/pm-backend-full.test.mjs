import test from "node:test";
import assert from "node:assert/strict";
import {
  GetProjectRulesUseCase,
  CreateProjectRuleUseCase,
  UpdateProjectRuleUseCase,
  DeleteProjectRuleUseCase,
  ToggleProjectRuleUseCase,
  EvaluateProjectRulesUseCase,
} from "../src/application/use-cases/pm/ProjectRulesUseCases.ts";
import {
  GetProjectDecisionsUseCase,
  CreateProjectDecisionUseCase,
  GetProjectDecisionDetailUseCase,
  UpdateProjectDecisionUseCase,
  DeleteProjectDecisionUseCase,
} from "../src/application/use-cases/pm/ProjectDecisionUseCases.js";
import {
  GetProjectDiagramUseCase,
} from "../src/application/use-cases/pm/GetProjectDiagramUseCase.js";
import {
  SaveProjectDiagramUseCase,
  ConfirmProjectDiagramUseCase,
} from "../src/application/use-cases/pm/SaveProjectDiagramUseCase.js";
import {
  GetProjectApprovalsUseCase,
  CreateApprovalRequestUseCase,
  GetApprovalDetailUseCase,
  ApproveRequestUseCase,
  RejectRequestUseCase,
} from "../src/application/use-cases/pm/ApprovalQueueUseCases.js";
import {
  InviteProjectMemberTokenUseCase,
  AcceptProjectInvitationUseCase,
  DeclineProjectInvitationUseCase,
} from "../src/application/use-cases/pm/ProjectInvitationUseCases.js";
import {
  GetProjectReportsUseCase,
  GenerateProjectReportUseCase,
  GetProjectReportDetailUseCase,
} from "../src/application/use-cases/pm/ProjectReportUseCases.js";
import { GetProjectDashboardUseCase } from "../src/application/use-cases/pm/GetProjectDashboardUseCase.js";
import { ApprovalRequestModel } from "../src/infrastructure/database/models/ApprovalRequestModel.js";
import { ProjectInvitationModel } from "../src/infrastructure/database/models/ProjectInvitationModel.js";
import { ProjectReportModel } from "../src/infrastructure/database/models/ProjectReportModel.js";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.js";
import { ApprovalStatus, ApprovalType } from "../src/domain/entities/ApprovalRequest.js";
import { ProjectMemberRole, MemberStatus } from "../src/domain/entities/ProjectMember.js";
import { AppError } from "../src/shared/errors/AppError.js";

// ────────────────────────────────────────────────────────────
// In-Memory Repositories for PM Testing
// ────────────────────────────────────────────────────────────
function createMockProjectRepo(projects = []) {
  const map = new Map(projects.map((p) => [p.id, p]));
  return {
    async findById(id) {
      return map.get(id) || null;
    },
  };
}

function createMockWorkspaceRepo(initial = []) {
  const map = new Map(initial.map((w) => [w.projectId, JSON.parse(JSON.stringify(w))]));
  return {
    async findByProjectId(projectId) {
      const found = map.get(projectId);
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    async create(ws) {
      const entity = { id: `ws-${Date.now()}`, ...ws, revision: ws.revision ?? 1 };
      map.set(ws.projectId, JSON.parse(JSON.stringify(entity)));
      return entity;
    },
    async save(ws, expectedRevision) {
      const current = map.get(ws.projectId);
      const nextRev = (expectedRevision ?? current?.revision ?? 1) + 1;
      const entity = {
        ...ws,
        id: current?.id || `ws-${Date.now()}`,
        revision: nextRev,
      };
      map.set(ws.projectId, JSON.parse(JSON.stringify(entity)));
      return entity;
    },
  };
}

function createMockMemberRepo(members = []) {
  const list = [...members];
  return {
    async findByProjectId(projectId) {
      return list.filter((m) => m.projectId === projectId);
    },
    async findByProjectAndUserId(projectId, userId) {
      return list.find((m) => m.projectId === projectId && m.userId === userId) || null;
    },
    async findByProjectAndEmail(projectId, email) {
      return list.find((m) => m.projectId === projectId && m.email === email) || null;
    },
    async addMember(m) {
      const entity = { id: `mem-${Date.now()}`, ...m, createdAt: new Date(), updatedAt: new Date() };
      list.push(entity);
      return entity;
    },
  };
}

function createMockUserRepo(users = []) {
  const map = new Map(users.map((u) => [u.id, u]));
  return {
    async findById(id) {
      return map.get(id) || null;
    },
    async findByEmail(email) {
      return [...map.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    },
  };
}

// ────────────────────────────────────────────────────────────
// PM-03: Architecture Rules & Evaluation
// ────────────────────────────────────────────────────────────

test("ProjectRules: creates, toggles, updates and evaluates architecture rules", async () => {
  const projectRepo = createMockProjectRepo([{ id: "p1", name: "ArchTime Core" }]);
  const workspaceRepo = createMockWorkspaceRepo([
    {
      projectId: "p1",
      revision: 1,
      diagram: {
        components: [
          { id: "web", name: "Web UI", kind: "UI" },
          { id: "api", name: "API Gateway", kind: "Service" },
          { id: "db", name: "Database", kind: "Database" },
        ],
        dependencies: [
          { id: "d1", source: "web", target: "api", label: "HTTP" },
          { id: "d2", source: "web", target: "db", label: "Direct SQL" }, // VIOLATION
        ],
      },
      rules: [],
      decisions: [],
    },
  ]);

  const createRule = new CreateProjectRuleUseCase(workspaceRepo, projectRepo);
  const getRules = new GetProjectRulesUseCase(workspaceRepo, projectRepo);
  const toggleRule = new ToggleProjectRuleUseCase(workspaceRepo, projectRepo);
  const evaluateRules = new EvaluateProjectRulesUseCase(workspaceRepo, projectRepo);

  // 1. Create a forbidden rule: Web cannot call DB directly
  const rule1 = await createRule.execute({
    projectId: "p1",
    name: "Web cannot call DB directly",
    source: "web",
    target: "db",
    constraint: "forbidden",
    severity: "error",
  });
  assert.equal(rule1.name, "Web cannot call DB directly");
  assert.equal(rule1.constraint, "forbidden");

  // 2. Create a required rule: Web must call API Gateway
  const rule2 = await createRule.execute({
    projectId: "p1",
    name: "Web must call API Gateway",
    source: "web",
    target: "api",
    constraint: "required",
    severity: "error",
  });
  assert.equal(rule2.constraint, "required");

  // 3. List rules
  const list = await getRules.execute({ projectId: "p1" });
  assert.equal(list.total, 2);

  // 4. Evaluate rules
  const evalResult = await evaluateRules.execute("p1");
  assert.equal(evalResult.totalRules, 2);
  assert.equal(evalResult.evaluatedRules, 2);
  assert.equal(evalResult.satisfiedCount, 1); // rule2 is satisfied
  assert.equal(evalResult.violationCount, 1); // rule1 is violated (web calls db directly)
  assert.equal(evalResult.compliancePercent, 50);

  // 5. Toggle rule1 off and re-evaluate
  await toggleRule.execute("p1", rule1.id);
  const evalResult2 = await evaluateRules.execute("p1");
  assert.equal(evalResult2.evaluatedRules, 1);
  assert.equal(evalResult2.satisfiedCount, 1);
  assert.equal(evalResult2.violationCount, 0);
  assert.equal(evalResult2.compliancePercent, 100);
});

// ────────────────────────────────────────────────────────────
// PM-04: Design Decisions (ADR)
// ────────────────────────────────────────────────────────────

test("ProjectDecisions: creates, auto-increments number, updates, and deletes ADR", async () => {
  const projectRepo = createMockProjectRepo([{ id: "p1", name: "ArchTime Core" }]);
  const workspaceRepo = createMockWorkspaceRepo([
    {
      projectId: "p1",
      revision: 1,
      diagram: { components: [], dependencies: [] },
      rules: [],
      decisions: [],
    },
  ]);

  const createDecision = new CreateProjectDecisionUseCase(workspaceRepo, projectRepo);
  const getDecisions = new GetProjectDecisionsUseCase(workspaceRepo, projectRepo);
  const updateDecision = new UpdateProjectDecisionUseCase(workspaceRepo, projectRepo);
  const deleteDecision = new DeleteProjectDecisionUseCase(workspaceRepo, projectRepo);

  // Create ADR 1
  const d1 = await createDecision.execute({
    projectId: "p1",
    title: "Use PostgreSQL for Datastore",
    context: "Need transactional guarantees",
    decision: "Adopt PostgreSQL 16",
    status: "Proposed",
  });
  assert.equal(d1.number, 1);

  // Create ADR 2 (should auto-increment to 2)
  const d2 = await createDecision.execute({
    projectId: "p1",
    title: "Adopt Docker for Containerization",
    context: "Consistent development runtime",
    decision: "Package services in Docker",
    status: "Accepted",
  });
  assert.equal(d2.number, 2);

  // Update ADR 1 status to Accepted
  const updated1 = await updateDecision.execute({
    projectId: "p1",
    decisionId: d1.id,
    status: "Accepted",
  });
  assert.equal(updated1.status, "Accepted");

  // List decisions
  const list = await getDecisions.execute({ projectId: "p1", status: "Accepted" });
  assert.equal(list.meta.total, 2);

  // Delete ADR 2
  await deleteDecision.execute("p1", d2.id);
  const afterDelete = await getDecisions.execute({ projectId: "p1" });
  assert.equal(afterDelete.meta.total, 1);
});

// ────────────────────────────────────────────────────────────
// PM-02: Diagram Management
// ────────────────────────────────────────────────────────────

test("ProjectDiagram: saves diagram and confirms baseline", async () => {
  const projectRepo = createMockProjectRepo([{ id: "p1", name: "ArchTime Core" }]);
  const workspaceRepo = createMockWorkspaceRepo([
    {
      projectId: "p1",
      revision: 1,
      diagram: { components: [], dependencies: [], revision: 1 },
      rules: [],
      decisions: [],
    },
  ]);

  const saveDiagram = new SaveProjectDiagramUseCase(workspaceRepo, projectRepo);
  const confirmDiagram = new ConfirmProjectDiagramUseCase(workspaceRepo, projectRepo);

  // Save new diagram
  const saveRes = await saveDiagram.execute({
    projectId: "p1",
    expectedRevision: 1,
    diagram: {
      components: [{ id: "c1", name: "Order Service", kind: "Service" }],
      dependencies: [],
      revision: 1,
    },
    userId: "u1",
  });
  assert.equal(saveRes.diagram.components.length, 1);

  // Confirm diagram
  const confirmRes = await confirmDiagram.execute("p1", "maintainer-1");
  assert.equal(confirmRes.diagram.confirmedBy, "maintainer-1");
  assert.ok(confirmRes.diagram.confirmedAt);
});

// ────────────────────────────────────────────────────────────
// PM-05: Approval Queue
// ────────────────────────────────────────────────────────────

test("ApprovalQueue: creates request, approves idempotently, rejects with reason", async () => {
  const projectRepo = createMockProjectRepo([{ id: "p1", name: "ArchTime Core" }]);

  const origCreate = ApprovalRequestModel.create;
  const origFindOne = ApprovalRequestModel.findOne;
  const origFind = ApprovalRequestModel.find;
  const origCount = ApprovalRequestModel.countDocuments;

  try {
    let mockApproval = {
      _id: "appr-1",
      projectId: "p1",
      title: "Split User Service",
      status: ApprovalStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      async save() {
        return this;
      },
      toJSON() {
        return {
          id: this._id,
          projectId: this.projectId,
          title: this.title,
          status: this.status,
          reviewedBy: this.reviewedBy,
          reviewedAt: this.reviewedAt,
          reviewNote: this.reviewNote,
        };
      },
    };

    ApprovalRequestModel.create = async (doc) => ({
      ...mockApproval,
      ...doc,
      toJSON: mockApproval.toJSON,
    });
    ApprovalRequestModel.findOne = async () => mockApproval;

    const createAppr = new CreateApprovalRequestUseCase(projectRepo);
    const approve = new ApproveRequestUseCase();
    const reject = new RejectRequestUseCase();

    // 1. Create request
    const created = await createAppr.execute({
      projectId: "p1",
      title: "Split User Service",
      requestedBy: "dev-1",
    });
    assert.equal(created.status, ApprovalStatus.PENDING);

    // 2. Approve request
    const approved = await approve.execute({
      projectId: "p1",
      approvalId: "appr-1",
      reviewerId: "maintainer-1",
      reviewNote: "Looks solid",
    });
    assert.equal(approved.status, ApprovalStatus.APPROVED);
    assert.equal(approved.reviewedBy, "maintainer-1");

    // 3. Approving again throws 400
    await assert.rejects(
      async () => {
        await approve.execute({
          projectId: "p1",
          approvalId: "appr-1",
          reviewerId: "maintainer-1",
        });
      },
      (err) => err instanceof AppError && err.statusCode === 400,
    );

    // 4. Reject requires review note
    mockApproval.status = ApprovalStatus.PENDING;
    await assert.rejects(
      async () => {
        await reject.execute({
          projectId: "p1",
          approvalId: "appr-1",
          reviewerId: "maintainer-1",
          reviewNote: "",
        });
      },
      (err) => err instanceof AppError && err.statusCode === 400,
    );
  } finally {
    ApprovalRequestModel.create = origCreate;
    ApprovalRequestModel.findOne = origFindOne;
    ApprovalRequestModel.find = origFind;
    ApprovalRequestModel.countDocuments = origCount;
  }
});

// ────────────────────────────────────────────────────────────
// PM-06: Team Invitations
// ────────────────────────────────────────────────────────────

test("ProjectInvitations: generates token, prevents duplicate member, accepts invitation", async () => {
  const projectRepo = createMockProjectRepo([{ id: "p1", name: "ArchTime Core" }]);
  const memberRepo = createMockMemberRepo([
    {
      id: "m1",
      projectId: "p1",
      userId: "u-existing",
      email: "existing@archtime.io",
      name: "Existing Member",
      role: ProjectMemberRole.MEMBER,
      status: MemberStatus.ACTIVE,
    },
  ]);
  const userRepo = createMockUserRepo([
    { id: "u-existing", email: "existing@archtime.io", name: "Existing Member" },
    { id: "u-new", email: "newguy@archtime.io", name: "New Guy" },
  ]);

  const origCreate = ProjectInvitationModel.create;
  const origDeleteMany = ProjectInvitationModel.deleteMany;
  const origFindOne = ProjectInvitationModel.findOne;

  try {
    let mockInvitation = {
      _id: "inv-1",
      projectId: "p1",
      email: "newguy@archtime.io",
      role: ProjectMemberRole.MEMBER,
      token: "secret-token-123",
      status: "pending",
      expiresAt: new Date(Date.now() + 86400000),
      async save() {
        return this;
      },
      toJSON() {
        return {
          id: this._id,
          projectId: this.projectId,
          email: this.email,
          role: this.role,
          token: this.token,
          status: this.status,
          expiresAt: this.expiresAt,
        };
      },
    };

    ProjectInvitationModel.deleteMany = async () => ({ deletedCount: 0 });
    ProjectInvitationModel.create = async (doc) => ({
      ...mockInvitation,
      ...doc,
      toJSON: mockInvitation.toJSON,
    });
    ProjectInvitationModel.findOne = async () => mockInvitation;

    const inviteUC = new InviteProjectMemberTokenUseCase(projectRepo, memberRepo, userRepo);
    const acceptUC = new AcceptProjectInvitationUseCase(memberRepo, userRepo);

    // 1. Inviting existing member throws Conflict (409)
    await assert.rejects(
      async () => {
        await inviteUC.execute({
          projectId: "p1",
          email: "existing@archtime.io",
          invitedBy: "u-maintainer",
        });
      },
      (err) => err instanceof AppError && err.statusCode === 409,
    );

    // 2. Inviting new user generates token
    const inv = await inviteUC.execute({
      projectId: "p1",
      email: "newguy@archtime.io",
      invitedBy: "u-maintainer",
    });
    assert.ok(inv.token);

    // 3. Accepting invitation adds member
    const acceptRes = await acceptUC.execute("secret-token-123", "u-new");
    assert.equal(acceptRes.success, true);
    assert.equal(acceptRes.projectId, "p1");

    const isMember = await memberRepo.findByProjectAndUserId("p1", "u-new");
    assert.ok(isMember);
    assert.equal(isMember.email, "newguy@archtime.io");
  } finally {
    ProjectInvitationModel.create = origCreate;
    ProjectInvitationModel.deleteMany = origDeleteMany;
    ProjectInvitationModel.findOne = origFindOne;
  }
});

// ────────────────────────────────────────────────────────────
// PM-07: Reports
// ────────────────────────────────────────────────────────────

test("ProjectReports: generates report summarizing architecture, rules and ADR", async () => {
  const projectRepo = createMockProjectRepo([
    { id: "p1", name: "ArchTime Core", repoUrl: "https://github.com/org/repo", visibility: "public", status: "active" },
  ]);
  const workspaceRepo = createMockWorkspaceRepo([
    {
      projectId: "p1",
      revision: 2,
      diagram: {
        components: [
          { id: "c1", name: "Web UI" },
          { id: "c2", name: "API Gateway" },
        ],
        dependencies: [{ id: "d1", source: "c1", target: "c2" }],
      },
      rules: [{ id: "r1", name: "Rule 1", enabled: true, constraint: "required" }],
      decisions: [{ id: "d1", title: "ADR 1", status: "Accepted" }],
    },
  ]);

  const origSnapCount = SnapshotModel.countDocuments;
  const origReportCreate = ProjectReportModel.create;

  try {
    SnapshotModel.countDocuments = async () => 5;

    let savedReport = null;
    ProjectReportModel.create = async (doc) => {
      savedReport = {
        ...doc,
        _id: "rep-1",
        toJSON() {
          return { id: "rep-1", ...doc };
        },
      };
      return savedReport;
    };

    const generateUC = new GenerateProjectReportUseCase(projectRepo, workspaceRepo);
    const report = await generateUC.execute({
      projectId: "p1",
      userId: "u-maintainer",
    });

    assert.ok(report.id);
    assert.equal(report.data.architecture.componentCount, 2);
    assert.equal(report.data.rules.total, 1);
    assert.equal(report.data.decisions.accepted, 1);
    assert.equal(report.data.snapshots.total, 5);
  } finally {
    SnapshotModel.countDocuments = origSnapCount;
    ProjectReportModel.create = origReportCreate;
  }
});

// ────────────────────────────────────────────────────────────
// PM-01: Project Dashboard
// ────────────────────────────────────────────────────────────

test("ProjectDashboard: aggregates health score, rules compliance, and team metrics", async () => {
  const projectRepo = createMockProjectRepo([
    {
      id: "p1",
      name: "ArchTime Core",
      repoUrl: "https://github.com/org/repo",
      visibility: "public",
      status: "active",
      createdAt: new Date(),
    },
  ]);

  const workspaceRepo = createMockWorkspaceRepo([
    {
      projectId: "p1",
      revision: 3,
      diagram: {
        components: [{ id: "c1", name: "Frontend" }, { id: "c2", name: "Backend" }],
        dependencies: [{ id: "d1", source: "c1", target: "c2" }],
        confirmedAt: new Date(),
      },
      rules: [{ id: "r1", name: "R1", source: "c1", target: "c2", constraint: "required", severity: "error", enabled: true }],
      decisions: [{ id: "adr-1", status: "Accepted" }],
    },
  ]);

  const memberRepo = createMockMemberRepo([
    { id: "m1", projectId: "p1", role: ProjectMemberRole.MAINTAINER, status: MemberStatus.ACTIVE },
    { id: "m2", projectId: "p1", role: ProjectMemberRole.MEMBER, status: MemberStatus.ACTIVE },
  ]);

  const evaluateRules = new EvaluateProjectRulesUseCase(workspaceRepo, projectRepo);
  const dashboardUC = new GetProjectDashboardUseCase(projectRepo, workspaceRepo, memberRepo, evaluateRules);

  const origSnapCount = SnapshotModel.countDocuments;
  const origSnapFindOne = SnapshotModel.findOne;
  const origApprCount = ApprovalRequestModel.countDocuments;

  try {
    SnapshotModel.countDocuments = async () => 10;
    SnapshotModel.findOne = () => ({
      sort: () => ({
        select: async () => ({ date: new Date("2026-10-01") }),
      }),
    });
    ApprovalRequestModel.countDocuments = async (filter) => (filter?.status === "pending" ? 2 : 5);

    const dashboard = await dashboardUC.execute("p1");

    assert.equal(dashboard.project.name, "ArchTime Core");
    assert.equal(dashboard.healthScore, 100); // 100% compliance + snapshots + team
    assert.equal(dashboard.architecture.componentsCount, 2);
    assert.equal(dashboard.architecture.isConfirmed, true);
    assert.equal(dashboard.rules.compliancePercent, 100);
    assert.equal(dashboard.decisions.accepted, 1);
    assert.equal(dashboard.approvals.pendingCount, 2);
    assert.equal(dashboard.approvals.totalCount, 5);
    assert.equal(dashboard.snapshots.total, 10);
    assert.equal(dashboard.team.totalMembers, 2);
    assert.equal(dashboard.team.maintainersCount, 1);
    assert.equal(dashboard.team.membersCount, 1);
  } finally {
    SnapshotModel.countDocuments = origSnapCount;
    SnapshotModel.findOne = origSnapFindOne;
    ApprovalRequestModel.countDocuments = origApprCount;
  }
});
