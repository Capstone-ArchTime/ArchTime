import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStatus } from '../src/domain/entities/Project.ts';
import { ReportStatus } from '../src/domain/entities/ProjectReport.ts';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { ProjectReportModel } from '../src/infrastructure/database/models/ProjectReportModel.ts';

// RF-23: only states the system can actually reach are kept, in the entities and in what the database accepts.

test('a workspace has no separate cloning status: cloning is a stage of the running job', () => {
  assert.deepEqual(Object.values(ProjectStatus), ['PENDING', 'ANALYZING', 'PARTIAL', 'COMPLETED', 'FAILED']);
  assert.deepEqual(ProjectModel.schema.path('status').enumValues, Object.values(ProjectStatus));
  assert.ok(new ProjectModel({ name: 'w', repoUrl: 'https://github.com/a/b.git', visibility: 'public', userId: 'u', status: 'CLONING' })
    .validateSync()?.errors.status, 'CLONING is refused');
});

test('a report is stored only once it is ready', () => {
  assert.deepEqual(Object.values(ReportStatus), ['ready']);
  assert.deepEqual(ProjectReportModel.schema.path('status').enumValues, ['ready']);
  assert.equal(ProjectReportModel.schema.path('status').defaultValue, 'ready');
});
