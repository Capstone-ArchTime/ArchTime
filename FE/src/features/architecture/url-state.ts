import { COMPONENT_ROLES } from './types.ts';
import type { ComponentRole } from './types.ts';
import type { ReachDirection } from './queries.ts';

// Shareable viewer state kept in the URL hash: #view=shophub&focus=order&reach=upstream&route=web~payment&lens=service~controller&detail=order&edge=a->b
export interface ViewerState {
  view?: string;
  focus?: string;
  reach?: ReachDirection;
  route?: [string, string];
  lens?: ComponentRole[];
  detail?: string;
  edge?: string;
}
export interface KnownIds { views: ReadonlySet<string>; components: ReadonlySet<string>; edges: ReadonlySet<string> }

export function parseHash(hash: string, known?: Partial<KnownIds>): ViewerState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: ViewerState = {};
  const view = params.get('view');
  if (view && (!known?.views || known.views.has(view))) state.view = view;
  const comp = (v: string | null) => (v && (!known?.components || known.components.has(v)) ? v : undefined);
  const focus = comp(params.get('focus'));
  if (focus) {
    state.focus = focus;
    const reach = params.get('reach');
    if (reach === 'upstream' || reach === 'downstream') state.reach = reach;
  }
  const route = params.get('route')?.split('~');
  if (route?.length === 2 && comp(route[0]) && comp(route[1]) && route[0] !== route[1]) state.route = [route[0], route[1]];
  const lens = (params.get('lens')?.split('~') ?? []).filter((r): r is ComponentRole => COMPONENT_ROLES.includes(r as ComponentRole));
  if (lens.length) state.lens = [...new Set(lens)];
  const detail = comp(params.get('detail'));
  if (detail) state.detail = detail;
  const edge = params.get('edge');
  if (edge && (!known?.edges || known.edges.has(edge))) state.edge = edge;
  return state;
}

export function serializeHash(state: ViewerState): string {
  const params = new URLSearchParams();
  if (state.view) params.set('view', state.view);
  if (state.focus) { params.set('focus', state.focus); if (state.reach) params.set('reach', state.reach); }
  if (state.route) params.set('route', state.route.join('~'));
  if (state.lens?.length) params.set('lens', state.lens.join('~'));
  if (state.detail) params.set('detail', state.detail);
  if (state.edge) params.set('edge', state.edge);
  const text = params.toString();
  return text ? `#${text}` : '';
}
