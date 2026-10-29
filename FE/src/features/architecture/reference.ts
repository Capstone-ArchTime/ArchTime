import type { ReferenceComponent } from './api';

/**
 * The reference architecture editor's text format and its starting point. The editor pre-fills itself from the CURRENT
 * drawing (suggest), so a reference saved without edits only describes today's grouping: every later grouping would be
 * scored against it, not against the intended design. isTodaysGrouping is how the editor notices that.
 */

/** "Name: prefix, prefix" per line, the format of the reference editor. */
export function formatReference(components: ReferenceComponent[]) {
  return components.map(c => `${c.name}: ${c.prefixes.join(', ')}`).join('\n');
}

export function parseReference(text: string): { components: ReferenceComponent[]; errors: string[] } {
  const components: ReferenceComponent[] = [];
  const errors: string[] = [];
  text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).forEach((line, i) => {
    const at = line.indexOf(':');
    const name = at > 0 ? line.slice(0, at).trim() : '';
    const prefixes = at > 0 ? line.slice(at + 1).split(',').map(p => p.trim()).filter(Boolean) : [];
    if (!name || !prefixes.length) errors.push(`Line ${i + 1}: write "Name: path/prefix, other/prefix".`);
    else components.push({ name, prefixes });
  });
  return { components, errors };
}

/** A starting point: each current component with the folder its files share. */
export function suggest(view: { components: { name: string; memberIds: string[] }[] }): ReferenceComponent[] {
  const common = (paths: string[]) => {
    const parts = paths.map(p => p.split('/').slice(0, -1));
    const out: string[] = [];
    for (let i = 0; parts.length && parts.every(p => p[i] !== undefined && p[i] === parts[0][i]); i++) out.push(parts[0][i]);
    return out.length ? `${out.join('/')}/` : '';
  };
  return view.components.filter(c => c.memberIds.length).map(c => ({ name: c.name, prefixes: [common(c.memberIds) || c.memberIds[0]] }));
}

/**
 * True when `components` are exactly what suggest() makes from the current view: the same components, names and prefixes,
 * in the same order. Nothing is normalised; a single edited word makes it a reference the person wrote. An empty list (which
 * removes the reference) is never today's grouping.
 */
export function isTodaysGrouping(components: ReferenceComponent[], view: Parameters<typeof suggest>[0]): boolean {
  const today = suggest(view);
  return components.length > 0 && components.length === today.length && components.every((c, i) =>
    c.name === today[i].name && c.prefixes.length === today[i].prefixes.length && c.prefixes.every((p, j) => p === today[i].prefixes[j]));
}
