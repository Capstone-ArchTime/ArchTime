import { roles } from '@/auth/permissions';
import type { Role } from '@/auth/permissions';
import { useDemoStore } from './useDemoStore';
export type DemoUser = { id: string; name: string; email: string; role: Role; status: 'active' | 'suspended' | 'invited'; lastActive: string };
export type AuditEvent = { id: string; type: 'invitation' | 'role_change' | 'security' | 'configuration'; actor: string; description: string; at: string };
export type AdminData = { users: DemoUser[]; events: AuditEvent[]; settings: { maxConcurrentJobs: number; maxRepoSizeGb: number } };
const seed: AdminData = {
  users: [
    { id: 'demo-analyst', name: 'Jamie Tran', email: 'jamie@example.com', role: 'developer-analyst', status: 'active', lastActive: 'Sample account' },
    { id: 'demo-maintainer', name: 'Alex Le', email: 'alex@example.com', role: 'project-maintainer', status: 'active', lastActive: 'Sample account' },
    { id: 'demo-suspended', name: 'Kim Pham', email: 'kim@example.com', role: 'developer-analyst', status: 'suspended', lastActive: 'Sample account' },
  ], events: [], settings: { maxConcurrentJobs: 4, maxRepoSizeGb: 10 },
};
function valid(value: unknown): value is AdminData {
  const d = value as AdminData;
  return !!d && Array.isArray(d.users) && d.users.every(u => u && ['id', 'name', 'email', 'lastActive'].every(k => typeof u[k as keyof DemoUser] === 'string') && roles.includes(u.role) && ['active', 'invited', 'suspended'].includes(u.status)) &&
    new Set(d.users.map(u => u.email.toLowerCase())).size === d.users.length &&
    Array.isArray(d.events) && d.events.every(e => e && ['id', 'actor', 'description', 'at'].every(k => typeof e[k as keyof AuditEvent] === 'string') && ['invitation', 'role_change', 'security', 'configuration'].includes(e.type)) &&
    !!d.settings && Number.isInteger(d.settings.maxConcurrentJobs) && d.settings.maxConcurrentJobs >= 1 && d.settings.maxConcurrentJobs <= 16 && Number.isInteger(d.settings.maxRepoSizeGb) && d.settings.maxRepoSizeGb >= 1 && d.settings.maxRepoSizeGb <= 50;
}
export function useAdminDemo() { return useDemoStore('admin', seed, valid, 'system-administrator'); }
export function withAudit(data: AdminData, actor: string, type: AuditEvent['type'], description: string): AdminData {
  return { ...data, events: [{ id: crypto.randomUUID(), type, actor, description, at: new Date().toISOString() }, ...data.events] };
}
