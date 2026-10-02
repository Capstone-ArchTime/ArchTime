type DiagramInput = { components: { id: string }[]; dependencies: { source: string; target: string }[] };
type RuleInput = { enabled: boolean; source: string; target: string; constraint: 'required' | 'forbidden' };
export function evaluateRule(diagram: DiagramInput, rule: RuleInput) {
  if (!rule.enabled) return { label: 'Disabled', color: 'default' };
  if (![rule.source, rule.target].every(id => diagram.components.some(c => c.id === id))) return { label: 'Needs review', color: 'gold' };
  const exists = diagram.dependencies.some(e => e.source === rule.source && e.target === rule.target);
  return (rule.constraint === 'required' ? exists : !exists) ? { label: 'Satisfied', color: 'green' } : { label: 'Violation', color: 'red' };
}
