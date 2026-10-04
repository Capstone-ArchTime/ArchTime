import { samplePath } from './layout.ts';
import type { GraphLayout } from './layout.ts';
import type { ValidationIssue } from './types.ts';

/**
 * Geometric gates for a computed layout. Codes:
 *  L001 nodes overlap            L002 an edge passes through a node it does not connect
 *  L003 a port sits outside its node   L004 two ports on one side are too close
 *  L005 something lies outside the canvas
 */
export function validateLayout(layout: GraphLayout, minPortGap = 6): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, subject: string, message: string, evidence?: ValidationIssue['evidence']) =>
    issues.push({ code, severity: 'error', subject, message, ...(evidence ? { evidence } : {}) });

  for (let i = 0; i < layout.nodes.length; i++) {
    const a = layout.nodes[i];
    if (a.x < 0 || a.y < 0 || a.x + a.width > layout.width || a.y + a.height > layout.height) add('L005', a.id, `Node ${a.id} lies outside the canvas.`);
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const b = layout.nodes[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) add('L001', `${a.id},${b.id}`, `Nodes ${a.id} and ${b.id} overlap.`);
    }
  }

  const ports = new Map<string, number[]>();
  for (const e of layout.edges) {
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    for (const [node, p] of [[e.source, first], [e.target, last]] as const) {
      const n = layout.nodes.find(x => x.id === node)!;
      if (p.x < n.x || p.x > n.x + n.width) add('L003', e.id, `Edge ${e.id} attaches outside node ${node}.`);
      const side = Math.abs(p.y - n.y) < Math.abs(p.y - (n.y + n.height)) ? 'top' : 'bottom';
      const key = `${node}|${side}`;
      ports.set(key, [...(ports.get(key) ?? []), p.x]);
    }
    const sampled = samplePath(e);
    for (const n of layout.nodes) {
      const own = n.id === e.source || n.id === e.target;
      const inset = own ? 2 : 0; // endpoints may touch their own node but not run through it
      const hit = sampled.some(p => p.x > n.x + inset && p.x < n.x + n.width - inset && p.y > n.y + inset && p.y < n.y + n.height - inset);
      if (hit) add('L002', e.id, `Edge ${e.id} passes through node ${n.id}.`, { node: n.id });
    }
    for (const p of sampled) if (p.x < 0 || p.y < 0 || p.x > layout.width || p.y > layout.height) { add('L005', e.id, `Edge ${e.id} leaves the canvas.`); break; }
  }
  for (const [key, xs] of ports) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < minPortGap) { add('L004', key, `Ports on ${key} are only ${(xs[i] - xs[i - 1]).toFixed(1)}px apart.`); break; }
  }
  return issues;
}
