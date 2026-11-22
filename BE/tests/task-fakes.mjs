// In-memory stand-ins for the task repository and the mined commits, with the same semantics as the Mongo versions:
// tasks and sprints are unique per (project, key / sprintId), links per (project, key, hash).
let nextId = 1;

export class InMemoryTaskRepository {
  constructor() {
    this.tasks = [];
    this.sprints = [];
    this.links = [];
  }

  async listTasks(projectId) {
    return this.tasks.filter(t => t.projectId === projectId).map(t => ({ ...t })).sort((a, b) => a.key.localeCompare(b.key));
  }

  async listSprints(projectId) {
    return this.sprints.filter(s => s.projectId === projectId).map(s => ({ ...s }));
  }

  async applyImport(projectId, plan, at) {
    for (const s of plan.sprints.upsert) {
      const found = this.sprints.find(x => x.projectId === projectId && x.sprintId === s.sprintId);
      if (found) Object.assign(found, s, { removed: false, removedAt: null, updatedAt: at });
      else this.sprints.push({ id: `s${nextId++}`, projectId, ...s, removed: false, removedAt: null, createdAt: at, updatedAt: at });
    }
    for (const sprintId of plan.sprints.remove) {
      const found = this.sprints.find(x => x.projectId === projectId && x.sprintId === sprintId && !x.removed);
      if (found) Object.assign(found, { removed: true, removedAt: at });
    }
    for (const t of [...plan.create, ...plan.update]) {
      const found = this.tasks.find(x => x.projectId === projectId && x.key === t.key);
      if (found) Object.assign(found, t, { removed: false, removedAt: null, lastImportedAt: at, updatedAt: at });
      else this.tasks.push({ id: `t${nextId++}`, projectId, ...t, removed: false, removedAt: null, lastImportedAt: at, createdAt: at, updatedAt: at });
    }
    for (const key of plan.unchanged) {
      const found = this.tasks.find(x => x.projectId === projectId && x.key === key);
      if (found) found.lastImportedAt = at;
    }
    for (const key of plan.remove) {
      const found = this.tasks.find(x => x.projectId === projectId && x.key === key && !x.removed);
      if (found) Object.assign(found, { removed: true, removedAt: at });
    }
  }

  async addLinks(links) {
    let added = 0;
    for (const l of links) {
      if (this.links.some(x => x.projectId === l.projectId && x.taskKey === l.taskKey && x.hash === l.hash)) continue;
      this.links.push({ ...l });
      added++;
    }
    return added;
  }

  async listLinks(projectId) {
    return this.links.filter(l => l.projectId === projectId).sort((a, b) => b.date - a.date || a.hash.localeCompare(b.hash));
  }

  async clearProject(projectId) {
    const count = list => list.filter(x => x.projectId === projectId).length;
    const counts = { tasks: count(this.tasks), sprints: count(this.sprints), links: count(this.links) };
    this.tasks = this.tasks.filter(x => x.projectId !== projectId);
    this.sprints = this.sprints.filter(x => x.projectId !== projectId);
    this.links = this.links.filter(x => x.projectId !== projectId);
    return counts;
  }
}

export const minedCommits = (commits = []) => ({ commitsOf: async () => commits.map(c => ({ ...c })) });
