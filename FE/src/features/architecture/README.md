# Architecture view (FE-09, phases 0-3)

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
- Not done yet: stable component identity across revisions, time slider, diff and drift overlays (phase 4).

## Real data (phase 2)

`api.ts` reads and generates the architecture of a mined project. The backend side lives in `BE/src/domain/architecture/`:

| File | Role |
| --- | --- |
| `types.ts`, `derive.ts`, `validate.ts` | Copies of the files above. `BE/tests/architecture-domain.test.mjs` fails if they drift apart (imports differ only by `.ts` / `.js`) |
| `resolveImport.ts` | Maps an import to a file of the snapshot: extensions, `index` files, `./x.js` for `x.ts`, and `@/` aliases |
| `cluster.ts` | Deterministic Louvain grouping with a folder affinity, dependency weights scaled down for hub files, and folding / splitting to reach 8-15 components |
| `naming.ts` | Names, roles and tiers from folder names. Roles are INFERENCE at best, never FACT |
| `buildView.ts` | Mapping to `ArchitectureView`; the only source of edges is `deriveComponentEdges` |

Endpoints (owner only): `GET /api/projects/:id/architecture?snapshotId=` and `POST /api/projects/:id/architecture` (body `{ snapshotId?, minComponents?, maxComponents? }`; latest snapshot by default).
`GET /api/projects/:id/snapshots?summary=1` omits the dependency graph so the snapshot picker stays small.
Only the mapping (which file is in which component, plus names and roles) is stored, in `ArchitectureMapping`. The view is rebuilt from the snapshot on every read, and a stored mapping is reported as stale when the snapshot graph or the algorithm version no longer matches.

Known limits: files are the unit (there is no Java extractor yet), so one component may mix layers when the dependencies do; names come from folders and can be generic ("FE", "FE 2"). Grouping is done inside the request and is capped at 20,000 files.

## AI refinement (phase 3)

`POST /api/projects/:id/architecture/refine` (body `{ snapshotId? }`, owner only) starts a background job (`kind: "abstract"`, same queue and progress fields as mining; one job per project at a time) and answers `202 { jobId }`. `GET .../architecture` always reports what the server can do in `llm` (`enabled`, `provider`, `model`, `host`, `external`, `reason`), so the UI can offer the option, ask before anything leaves the network, and say why it is unavailable.

What is sent: file **paths** and which file imports which. Never source code, commit messages, author names, tokens or the repository URL. In `name-only` mode (more than `LLM_MAX_REFINE_FILES` files) only the 25 most-used paths of each cluster are sent.

What the model may do: name and describe the components, choose a role, and (up to `LLM_MAX_MOVE_RATIO` of the files, default 40%) regroup files. It never adds, removes or connects anything: edges are always derived from the file dependencies.

Every answer goes through `domain/architecture/llm/verify.ts` before it is used. Rule codes: `M001` malformed, `M002` files missing / repeated / unknown, `M003` component count outside 8-15, `M004` too many files moved, `M005` bad or repeated name, `M006` role not allowed, `M007` description too long, `M008` component too small. A failed answer is sent back with the codes (up to 3 attempts in total). Bad credentials and refusals stop immediately. If no attempt passes, the clustering result is stored unchanged and the receipt (`mapping.receipt`) records why. Labels are INFERENCE (or UNKNOWN for role `other`), never FACT.

Server configuration (environment):

| Variable | Meaning |
| --- | --- |
| `LLM_PROVIDER` | `none`, `anthropic`, `gemini` or `openai-compatible`. Default: `anthropic` when `ANTHROPIC_API_KEY` is set, else `gemini` when `GEMINI_API_KEY` is set, else `none` |
| `GEMINI_API_KEY` | Google Gemini through its OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`). Model defaults to `gemini-3.6-flash`; set `LLM_MODEL` to change it (Google retires model ids, so check the current list if you get "model not found"). Temperature is left at the model default |
| `ANTHROPIC_API_KEY` | Claude through the official SDK. Model defaults to `claude-opus-5-5`; set `LLM_MODEL` to change it. The request uses structured output and the server-side refusal fallback |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Self-hosted model behind a chat-completions API (Ollama `http://localhost:11434/v1`, vLLM, LM Studio). `LLM_BASE_URL` and `LLM_MODEL` are required. A loopback or private-network host is reported as not external |
| `LLM_JSON_MODE` | `false` if your server rejects `response_format` (default true) |
| `LLM_TIMEOUT_MS`, `LLM_MAX_REFINE_FILES`, `LLM_MAX_MOVE_RATIO` | Limits; defaults 180000, 400 and 0.4 |
| `LLM_EFFORT` | Claude only: `low`, `medium` (default) or `high`. Lower is faster and cheaper |

With nothing configured, the feature is off and the button is disabled with the reason.

### When refinement does not work

The warning on the page lists every attempt with its code and the provider's own message. `M000` is a provider failure (the request never produced an answer); `M001`-`M008` are verification failures of an answer that did arrive. The same text is written to the server log as `[architecture] project <id>: attempt n/3 failed: ...`.

Common causes: `network: Could not reach the provider` (no route to the API host from the server); `request: ... not found` (wrong `LLM_MODEL`, or the key has no access to it); `auth` (wrong or revoked key); `billing` (the Anthropic account has no API credit: add credit under Plans & Billing in the Console, a Claude subscription does not cover the API); `timeout` (raise `LLM_TIMEOUT_MS` or set `LLM_EFFORT=low`); `truncated` (the model spent its output budget, usually on reasoning; lower `LLM_EFFORT`). Errors that retrying cannot fix (`auth`, `billing`, `request`, `refusal`) stop after the first attempt. If the provider rejects the refusal-fallback option or schema-constrained output, that option is switched off for the rest of the process and noted under the result.

Gemini notes: Google reports an invalid key as a 400 ("API key not valid"); it is mapped to `auth`. A server that rejects `response_format` has JSON mode switched off once and the request repeated, with a note on the page. Check Google's terms for how prompts are handled on your plan (they differ between free and paid use); only file paths and import relations are sent.
