# Architecture view (FE-09, phases 0-1)

Draws a reconstructed system as 8-15 named components. Everything here is pure TypeScript with no React, so the same
code is tested under Node (`npm test`) and can be reused by the backend pipeline.

| File | Role |
| --- | --- |
| `types.ts` | The typed IR: `ArchitectureView` = components, class-level dependencies and the component edges derived from them |
| `derive.ts` | `deriveComponentEdges`: the only way a component edge is created. Collapses class dependencies and keeps them as evidence |
| `validate.ts` | The verifier. Stable rule codes `S001/S002/V001-V009` (see the header comment). A view that fails is not drawn |
| `layout.ts` | Deterministic layered layout: tiers as rows, long edges routed through reserved slots, ports spread per node side |
| `layout-validate.ts` | Geometric gates `L001-L005` (overlap, edge through a node, port outside a node, ports too close, off canvas) |
| `queries.ts` | Reach (upstream/downstream), simple routes between two components, circular-dependency groups |
| `scene.ts` | Component scene, and the class scene shown when a component is opened |
| `highlight.ts` | What to emphasise for route / focus / reach / selected edge / role lens |
| `url-state.ts` | Shareable state in the URL hash: `#view=&focus=&reach=&route=a~b&lens=x~y&detail=&edge=` |
| `fixtures.ts` | Hand-built sample views, derived through `deriveComponentEdges` so they obey the same rules as real data |

UI lives in `src/components/architecture/` and `src/pages/developer-analyst/ArchitectureMap.tsx` (route `/architecture`).

## Contract for the abstraction pipeline (next phases)

The backend must return an `ArchitectureView` that passes `validateView`. Component membership and names may come from
clustering and an LLM, but edges must come from `deriveComponentEdges` over class dependencies. Keep `weight` equal to the
number of evidence entries. `layer` is an optional tier hint (0 = top); without it tiers come from the dependencies.

## Notes

- The layout is written in-house instead of using elkjs: elkjs is over 1 MB and the project enforces a 500 kB chunk budget (`npm run check:bundle`).
- Exports (SVG, PNG, standalone HTML, JSON) render the whole diagram without viewer state. PNG goes through a canvas, so it needs a browser.
- Arrows are not keyboard focusable (there can be dozens); keyboard users reach a dependency from the component's "Depends on / Used by" lists.
- Not done yet: real data, stable component identity across revisions, time slider, diff and drift overlays.
