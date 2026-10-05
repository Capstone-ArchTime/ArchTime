import type { KeyboardEvent, Ref } from 'react';
import type { GraphLayout, RoutedEdge } from '@/features/architecture/layout';
import type { Scene, SceneNode } from '@/features/architecture/scene';
import type { Highlight } from '@/features/architecture/highlight';
import type { DiagramTheme } from '@/features/architecture/theme';

export interface DiagramSvgProps {
  scene: Scene;
  layout: GraphLayout;
  theme: DiagramTheme;
  title: string;
  highlight?: Highlight;
  selectedNode?: string;
  selectedEdge?: string;
  hoverEdge?: string;
  showWeights?: boolean;
  /** Static output (exports) has no handlers, no focus stops and no viewer state. */
  interactive?: boolean;
  idPrefix?: string;
  svgRef?: Ref<SVGSVGElement>;
  onNodeClick?: (id: string) => void;
  onNodeOpen?: (id: string) => void;
  onEdgeClick?: (id: string) => void;
  onEdgeHover?: (id: string | undefined) => void;
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);
const edgeWidth = (weight: number) => 1.25 + Math.min(weight, 12) * 0.25;

export default function DiagramSvg({ scene, layout, theme, title, highlight, selectedNode, selectedEdge, hoverEdge, showWeights, interactive = true, idPrefix = 'arch', svgRef, onNodeClick, onNodeOpen, onEdgeClick, onEdgeHover }: DiagramSvgProps) {
  const nodeById = new Map(scene.nodes.map(n => [n.id, n]));
  const sceneEdge = new Map(scene.edges.map(e => [e.id, e]));
  const dimNode = (id: string) => !!highlight?.nodes && !highlight.nodes.has(id);
  const dimEdge = (id: string) => !!highlight?.edges && !highlight.edges.has(id);
  const primary = new Set(highlight?.primaryRoute?.edges ?? []);
  const marker = (name: string) => `${idPrefix}-arrow-${name}`;

  const edgeStyle = (e: RoutedEdge) => {
    const selected = e.id === selectedEdge;
    const dim = dimEdge(e.id) && !selected;
    const emphasised = !!highlight?.edges && highlight.edges.has(e.id);
    const color = dim ? theme.edgeDim : selected ? theme.focus : primary.has(e.id) ? theme.route : e.inCycle ? theme.cycle : emphasised ? theme.focus : theme.edge;
    const arrow = dim ? 'dim' : selected ? 'focus' : primary.has(e.id) ? 'route' : e.inCycle ? 'cycle' : emphasised ? 'focus' : 'default';
    return { color, arrow, dim, selected, emphasised };
  };
  const arrows: [string, string][] = [['default', theme.edge], ['dim', theme.edgeDim], ['focus', theme.focus], ['route', theme.route], ['cycle', theme.cycle]];

  const onNodeKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (event.shiftKey) onNodeOpen?.(id); else onNodeClick?.(id); }
  };

  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={title} fontFamily={theme.sans}>
      <title>{title}</title>
      <defs>
        {arrows.map(([name, color]) => (
          <marker key={name} id={marker(name)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9 Z" fill={color} />
          </marker>
        ))}
      </defs>
      <rect width={layout.width} height={layout.height} fill={theme.background} />

      <g>
        {layout.edges.map(e => {
          const st = edgeStyle(e);
          const model = sceneEdge.get(e.id);
          const labelVisible = !!model && (showWeights || st.selected || st.emphasised || e.id === hoverEdge) && !st.dim;
          return (
            <g key={e.id} data-edge={e.id}>
              <path d={e.path} fill="none" stroke={st.color} strokeWidth={st.selected ? edgeWidth(model?.weight ?? 1) + 1 : edgeWidth(model?.weight ?? 1)} strokeDasharray={e.reversed && !e.inCycle ? '6 4' : undefined} strokeLinejoin="round" markerEnd={`url(#${marker(st.arrow)})`} opacity={st.dim ? 0.5 : 1} />
              {interactive && <path d={e.path} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} aria-hidden="true"
                onClick={() => onEdgeClick?.(e.id)} onMouseEnter={() => onEdgeHover?.(e.id)} onMouseLeave={() => onEdgeHover?.(undefined)} />}
              {labelVisible && model && (
                <g transform={`translate(${e.labelAt.x},${e.labelAt.y})`} pointerEvents="none">
                  <rect x={-14} y={-9} width={28} height={18} rx={9} fill={theme.badgeFill} stroke={st.color} strokeWidth={1} />
                  <text textAnchor="middle" y={4} fontSize={11} fontFamily={theme.mono} fill={theme.text}>{model.weight}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>

      <g>
        {layout.nodes.map(p => {
          const node = nodeById.get(p.id);
          if (!node) return null;
          const dim = dimNode(p.id);
          const selected = p.id === selectedNode;
          return (
            <g key={p.id} transform={`translate(${p.x},${p.y})`} data-node={p.id} opacity={dim ? 0.35 : 1}
              {...(interactive ? {
                role: 'button', tabIndex: 0, 'aria-label': node.aria, 'aria-pressed': selected,
                style: { cursor: 'pointer', outline: 'none' },
                onClick: () => onNodeClick?.(p.id), onDoubleClick: () => onNodeOpen?.(p.id), onKeyDown: (event: KeyboardEvent) => onNodeKey(event, p.id),
              } : {})}>
              <NodeCard node={node} width={p.width} height={p.height} theme={theme} selected={selected} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function NodeCard({ node, width, height, theme, selected }: { node: SceneNode; width: number; height: number; theme: DiagramTheme; selected: boolean }) {
  const accent = node.role ? theme.role[node.role] : theme.muted;
  const neighbour = node.kind === 'neighbour';
  const roomy = height > 60;
  const left = neighbour ? 12 : 16;
  const tagColor = node.tag ? theme.tag[node.tag] : theme.muted;
  const subtitleRoom = Math.floor((width - left - 12) / 6.1);
  return (
    <>
      <rect width={width} height={height} rx={8} fill={theme.card} stroke={selected ? theme.focus : theme.cardStroke} strokeWidth={selected ? 2 : 1} strokeDasharray={neighbour ? '5 4' : undefined} />
      {!neighbour && <rect x={0} y={0} width={5} height={height} rx={2.5} fill={accent} />}
      <text x={left} y={roomy ? 28 : neighbour ? 19 : 22} fontSize={13} fontWeight={600} fill={neighbour ? theme.muted : theme.text}>{truncate(node.title, Math.floor((width - left - 12) / 7.2))}</text>
      <text x={left} y={roomy ? 47 : neighbour ? 34 : 40} fontSize={11} fill={theme.muted}>{truncate(node.subtitle, subtitleRoom)}</text>
      {node.tag && <text x={left} y={68} fontSize={9} fontWeight={700} letterSpacing={0.6} fontFamily={theme.mono} fill={tagColor}>{node.tag}</text>}
    </>
  );
}
