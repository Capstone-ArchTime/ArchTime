# Thiết kế: Đa model AI + Metrics đánh giá model cho vẽ kiến trúc

> Trạng thái: **Đã triển khai** (key mã hoá trong DB, mặc định = model Admin chọn, có Benchmark).
> Code chính: `BE/src/domain/architecture/llm/metrics.ts` (công thức), `BE/src/infrastructure/llm/registry.ts`, `BE/src/infrastructure/services/LlmRunService.ts`, `BE/src/application/use-cases/llm/LlmUseCases.ts`; FE: `AiModels.tsx`, `AiMetrics.tsx`, `AiUsage.tsx`, `components/architecture/ModelPicker.tsx`. Test: `BE/tests/llm-metrics.test.mjs`.
> Khác với bản đề xuất: benchmark chạy tuần tự các model trong **một** job (hàng đợi chỉ cho 1 job/project); benchmark được xếp hạng với tối thiểu 1 run/model; feedback 👍/👎 đã có (`POST /api/llm/runs/:id/feedback`).

---

## 1. Kiến trúc hiện tại (as-is)

### 1.1 Phân lớp BE
Express + Mongoose, chia theo Clean Architecture:

| Lớp | Thư mục | Vai trò trong luồng AI |
|---|---|---|
| domain | `BE/src/domain/architecture/llm/*` | `LlmClient` interface, `refineMapping` (vòng lặp tối đa 3 attempt), `verify*` (rule M001–M008), prompt |
| application | `use-cases/projects/ArchitectureUseCase.ts` | Kiểm tra quyền sở hữu project và tạo job `abstract` |
| infrastructure | `llm/runtime.ts`, `llm/ClaudeClient.ts`, `llm/OpenAiCompatibleClient.ts`, `services/ArchitectureService.ts`, `services/ArchitectureJob.ts`, `services/MiningService.ts` | Tạo client từ env, chạy job nền, lưu mapping |
| presentation | `ProjectController.refineArchitecture`, `project.routes.ts`, `admin.routes.ts` | REST API |
| DI | `container.ts` | Khởi tạo controller và use-case |

### 1.2 Luồng "Refine with AI"
```
FE ArchitectureMap ──POST /projects/:id/architecture/refine {snapshotId}
  → ArchitectureUseCase.refine  (loadOwnedProject, getLlmRuntime().client phải tồn tại)
  → MiningService.startAbstractJob  → MiningJob{kind:'abstract', target:snapshotId}  (hàng đợi trong RAM)
  → runArchitectureJob → ArchitectureService.refine
      → proposeMapping (Louvain clustering, xác định)
      → refineMapping(client)  ×≤3 attempt: complete() → parseJson → verifyRefine/verifyNaming
      → ArchitectureMappingModel.findOneAndUpdate(upsert theo projectId+snapshotId)  {components, receipt}
FE poll GET /projects/:id/mining (activeJob) → reload GET /architecture → hiển thị receipt
```

### 1.3 Các thiếu hụt so với yêu cầu
| # | Thiếu hụt | Vị trí |
|---|---|---|
| G1 | `complete()` chỉ trả `string`, `usage` provider trả về bị bỏ, không đo latency | `ClaudeClient.send`, `OpenAiCompatibleClient.send` |
| G2 | Chỉ có **1 model toàn cục**, đọc từ env, tạo một lần (singleton) | `runtime.ts` |
| G3 | Mapping upsert theo snapshot, ghi đè lần chạy trước, **không có lịch sử run** | `ArchitectureService.store` |
| G4 | `RefineReceipt` không có token/latency/cost | `llm/types.ts` |
| G5 | `SystemSettings.defaultLlmProvider` có trong DB nhưng runtime **không đọc** | `SystemSettingsModel`, `runtime.ts` |
| G6 | Admin services-status kiểm `OPENAI_API_KEY` dù runtime không hỗ trợ, chỉ kiểm env có key chứ không kiểm API sống | `GetAdminServicesStatusUseCase` |
| G7 | `MiningJob` không lưu model nào được dùng | `MiningJobModel` |

### 1.4 Tài sản tái sử dụng được
- `RefineReceipt` đã có `provider/model/mode/filesSent/attempts/accepted/movedRatio/fallbackReason`. Chỉ cần mở rộng.
- Rule verify M001–M008 và `validateView()` cho ra **tín hiệu chất lượng khách quan**, không cần đáp án mẫu.
- `cluster.ts` (Louvain) đã tính modularity, nên dùng lại được để đo độ gắn kết cấu trúc của kết quả AI.
- `LlmError.kind` đã phân loại lỗi (auth/billing/rate_limit/timeout/...) để tính độ ổn định.
- `AuditService` cho các thao tác admin.

---

## 2. Bộ metrics và công thức

### 2.1 Metrics cho mỗi lần chạy (per run)

**Token** (lấy từ response của provider, cộng qua mọi attempt, kể cả attempt lỗi verify vì vẫn tốn token):
- Anthropic: `usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`
- OpenAI-compatible/Gemini: `usage.prompt_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens`
- Provider không trả `usage` (một số bản Ollama): ước lượng `ceil(chars / 4)` và gắn `estimated: true`

```
inputTokens  = Σ_attempt input_a        outputTokens = Σ_attempt output_a
totalTokens  = inputTokens + outputTokens
```

**Latency**
```
latencyMs      = Σ_attempt (t_response − t_request)        // thời gian chờ model
wallMs         = finishedAt − startedAt của job             // tham khảo
latencyPer100  = latencyMs / max(1, filesSent) × 100        // chuẩn hoá theo kích thước repo
```

**Cost** (giá do Admin nhập cho từng model, đơn vị USD / 1M token; model self-host = 0)
```
cost = (input − cacheRead)/1e6 · P_in + cacheRead/1e6 · P_cacheRead + output/1e6 · P_out
```
Giá được **chụp lại vào run** (`pricingSnapshot`), nên khi Admin đổi giá về sau thì lịch sử không bị sai.

**Chất lượng kiến trúc Q ∈ [0,1]**. Chỉ dùng tín hiệu tự động, kiểm chứng được:

| Thành phần | Công thức | Ý nghĩa |
|---|---|---|
| `pass` | 1 nếu `accepted`, ngược lại 0 | Câu trả lời qua verify M001–M008 |
| `E` (attempt efficiency) | `1 / attemptsUsed` | Đúng ngay lần đầu được điểm cao |
| `V` (validity) | `max(0, 1 − 0.25·errors − 0.05·warnings)` từ `validateView` | View cuối hợp lệ |
| `M` (structural cohesion) | `min(1, Q_mod(final) / Q_mod(cluster baseline))` | AI không phá vỡ cấu trúc phụ thuộc (dùng Newman modularity trên đồ thị file) |
| `R` (role coverage) | `1 − (#component role='other') / #components` | Model nhận diện được vai trò |
| `B` (boundedness) | `1 − max(0, movedRatio − 0.5·maxMoveRatio) / (0.5·maxMoveRatio)`, chỉ áp dụng mode `refine` | Sửa vừa phải, không viết lại toàn bộ |

```
Q_run = pass × (0.30·V + 0.25·M + 0.20·R + 0.15·E + 0.10·B)
        (mode name-only: M=1 và B bị bỏ, trọng số được chia lại theo tỷ lệ)
```
Tuỳ chọn: User đánh giá 👍/👎 (`H ∈ {0,1}`). Khi có đánh giá thì `Q'_run = 0.8·Q_run + 0.2·H`.

### 2.2 Độ ổn định của mỗi model (cửa sổ N run gần nhất, mặc định 30 ngày)
```
successRate   = #accepted / #runs (không tính run bị user huỷ)
firstPassRate = #accepted ở attempt 1 / #runs
providerErr   = #runs có LlmError (auth/billing/rate_limit/timeout/network/other) / #runs
latencyCV     = stdev(latencyPer100) / mean(latencyPer100)
S = 0.45·successRate + 0.20·firstPassRate + 0.25·(1 − providerErr) + 0.10·(1 − min(1, latencyCV))
```

### 2.3 Điểm tổng hợp ModelScore ∈ [0,100]
Latency và token chỉ tính trên các lần chạy **được chấp nhận**. Model chưa có lần nào được chấp nhận thì `L_n = C_n = T_n = 0`, vì một model lỗi trả về ngay (vài ms, 0 token) không được coi là "nhanh, rẻ". Lỗi này đã gặp khi chạy thật và có test hồi quy.

Chỉ so sánh **trong cùng một mode** (`refine` ≤ 400 file, `name-only` > 400 file) vì độ khó khác nhau. Các chỉ số chi phí được chuẩn hoá **tương đối so với model tốt nhất** trong tập so sánh:

```
q̄      = mean(Q_run)                                            (đã thuộc [0,1])
L      = median(latencyPer100)       → L_n = min_m(L) / L
C      = Σcost / max(1,#accepted)    → C_n = (C==0) ? 1 : min_m(C>0) / C   // chi phí cho mỗi lần THÀNH CÔNG
T      = median(totalTokens / filesSent × 100) → T_n = min_m(T) / T

ModelScore = 100 × (w_Q·q̄ + w_S·S + w_L·L_n + w_C·C_n + w_T·T_n)
```
Preset trọng số (Admin chọn hoặc tự chỉnh, tổng = 1):

| Preset | w_Q | w_S | w_L | w_C | w_T |
|---|---|---|---|---|---|
| **Balanced** (mặc định) | .40 | .20 | .15 | .15 | .10 |
| Quality-first | .55 | .25 | .10 | .05 | .05 |
| Budget | .25 | .20 | .10 | .30 | .15 |

**Hiệu chỉnh khi ít dữ liệu** (Bayesian shrinkage, k = 5):
`q̂ = (n·q̄ + k·q_global) / (n + k)`, áp dụng tương tự cho `successRate`. Nếu `n < 5`, model bị gắn nhãn *"chưa đủ dữ liệu"*.

**Điều kiện loại khỏi đề xuất (hard gates):** model đang tắt, health = `down`, `successRate < 0.5`, hoặc `n < 3`.

**Đề xuất (recommended)** = `argmax ModelScore` trong số model qua gate, tính theo mode dự kiến của snapshot (`files ≤ maxRefineFiles ? refine : name-only`).

### 2.4 Benchmark (so sánh công bằng)
Dữ liệu sinh ra từ sử dụng thực tế bị lệch vì mỗi model chạy trên repo khác nhau. Benchmark giải quyết điều này: Admin chọn 1 snapshot và K model, mỗi model chạy một lần trên **cùng input**. Kết quả được lưu thành run với `purpose:'benchmark'` và **không ghi đè mapping của user**. Leaderboard cho phép lọc `purpose`.

---

### 2.5 Chất lượng v2: sơ đồ có ý nghĩa không? (`domain/architecture/quality.ts`)

Các chỉ số này chấm **mọi** sơ đồ, kể cả sơ đồ do clustering tạo ra mà không dùng AI, nên clustering là mốc so sánh. Chúng hiển thị trên Architecture Map (panel *Quality*) và được lưu cùng mỗi lần chạy.

| Ký hiệu | Chỉ số | Cách tính | Trong Q? |
|---|---|---|---|
| G | Grounding (ngược với hallucination) | Tỷ lệ component có tên chứa ít nhất một từ được đường dẫn file bên trong hỗ trợ (cùng gốc 5 ký tự: `Authentication` ↔ `auth/`). Tên chỉ toàn từ chung chung ("Core Services") tính là không được hỗ trợ | ✅ |
| C | Acyclicity | 1 − (số component nằm trong vòng phụ thuộc / tổng số component), dùng Tarjan SCC | ✅ |
| L | Layering | 1 − (trọng số mũi tên đi ngược tầng / tổng trọng số mũi tên giữa các component có tầng). Tầng: controller 0 → service 1 → entity 2 → repository/gateway/config/util 3 | ✅ |
| Bal | Balance | Entropy chuẩn hoá của kích thước component: H / ln k | ✅ |
| – | Agreement | Adjusted Rand Index so với kiến trúc tham chiếu (`PUT /api/projects/:id/architecture/reference`: tên + tiền tố đường dẫn) | Báo riêng |
| – | Stability | ARI so với các component của snapshot liền trước, tính trên các file chung | Báo riêng |

**Q v2 (refine):** `Q = pass × Σ wᵢ·xᵢ / Σ wᵢ`, chỉ tính trên các thành phần áp dụng được. Trọng số: V .20, M .15, R .10, E .10, B .05, G .20, C .08, L .07, Bal .05 (tổng = 1). Ở chế độ name-only bỏ M và B. Attempt bị rate limit hoặc phải chuyển sang name-only không tính vào E.

Dùng **ARI** chứ không dùng MoJoFM: ARI có công thức chính xác và phổ biến, phù hợp để báo cáo.

### 2.6 Giảm token (đo thật trên ArchTime, 127 file, 2026-10-08)

Các thay đổi:
- **A.** Model trả lời dạng delta `{clusters, newClusters, moves}`. Hệ thống dựng lại kết quả đầy đủ và kiểm tra bằng đúng các rule M001–M008. Câu trả lời đầy đủ kiểu cũ vẫn được chấp nhận.
- **B.** Prompt gom file theo thư mục. Chỉ gửi số liên kết import giữa các cụm cho file ở ranh giới. Tên file có ký tự lạ được đặt trong chuỗi JSON để chống prompt injection.
- **C.** `options.maxRequestTokens` cho từng model: ngân sách câu trả lời được tính cho vừa; prompt không vừa thì gửi ở chế độ name-only ngay từ đầu.
- **D.** Khi bị rate limit, chờ đúng thời gian provider báo (Retry-After / "try again in …s"), tối đa 2 lần, không tính là attempt. Khi gặp `too_large`/`truncated` thì tự chuyển sang name-only.

| Model | Trước: token in/out · kết quả · Q | Sau: token in/out · kết quả · Q |
|---|---|---|
| gemini-3.1-flash-lite (×3) | ~10.0k / 2.1k · luôn sai lần 1 (M001) · Q 63–72 | **2.9–6.6k / 0.5–1.6k** · 1/3 đúng ngay lần 1 · **Q 80–86** |
| openai/gpt-oss-20b (Groq) | ❌ truncated 8000 + rate limit ×2 | ✅ chờ rate limit rồi thành công · Q 83 |
| openai/gpt-oss-120b (Groq) | ✅ 3.3k / 3.9k · Q 86 | ✅ 5.7k / 3.4k (2 attempt) · Q 80 |
| qwen/qwen3.8-27b (Groq) | ✅ 4.1k / 1.3k · Q 84 | ✅ **2.7k / 1.5k** · Q 87 |

**Thay đổi hành vi cần biết:** với định dạng delta, model **chuyển ít file hơn hẳn**. Gemini có M (giữ gắn kết) 11–25% → 92–98%, nhưng mức khớp với kiến trúc tham chiếu (bản nháp chia theo tầng) giảm 61–65% → 33–37%. Q tăng chủ yếu vì Q đánh giá cao việc giữ gắn kết phụ thuộc. Sơ đồ giờ bám sát cấu trúc phụ thuộc thật hơn, nhưng ít giống cách nhìn "theo tầng/thư mục" hơn. Mẫu đo còn nhỏ (Gemini 3 lần, Groq 1 lần; cùng model dao động khoảng ±5 điểm Q), nên cần chạy thêm Benchmark trước khi kết luận chắc chắn.

**Quyết định (2026-10-08): giữ hành vi mới, ưu tiên phụ thuộc thật.** Đúng với nguyên tắc của ArchTime: sơ đồ phải dựa trên bằng chứng trong code (`types.ts`: *"nothing in a view is allowed to exist only because a model said so"*). AI dùng để đặt tên, gán vai trò và chỉ chuyển những file mà phụ thuộc hoặc thư mục cho thấy rõ là nằm sai chỗ; AI không gom lại toàn bộ theo thư mục hay tầng. Vì vậy:
- Điểm **M (giữ gắn kết)** là kỳ vọng chính khi so sánh model.
- **Agreement** với kiến trúc tham chiếu vẫn được báo để tham khảo, nhưng không đưa vào Q. Mức khớp thấp với một bản tham chiếu chia theo tầng không có nghĩa là sơ đồ sai.
- Nếu sau này cần một góc nhìn "theo tầng", nên thêm thành **một chế độ xem riêng**, không đổi prompt mặc định.

## 3. Thay đổi database (MongoDB)

### 3.1 Collection mới `llmmodels` (Model registry)
```ts
{
  key: string (unique, slug),            // "claude-opus-5-5"
  displayName: string,
  provider: 'anthropic' | 'gemini' | 'openai-compatible',
  model: string,                          // id gửi cho API
  baseUrl?: string,
  apiKey: { ciphertext, iv, tag, last4 } | null,   // AES-256-GCM, khoá LLM_SECRET_KEY (xem §6 Q1)
  options: { effort?, maxTokens?, temperature?, jsonMode?, timeoutMs? },
  pricing: { inputPerMTok, outputPerMTok, cacheReadPerMTok?, currency:'USD' },
  enabled: boolean, visibleToUsers: boolean, isDefault: boolean,
  health: { status:'unknown'|'up'|'degraded'|'down', checkedAt?, latencyMs?, lastError? },
  createdBy, updatedBy, timestamps
}
```
**Seed khi khởi động:** nếu registry rỗng mà env đã cấu hình model (luồng cũ), tự tạo 1 bản ghi `isDefault`. Cách này giữ tương thích ngược hoàn toàn.

### 3.2 Collection mới `llmruns` (một bản ghi cho mỗi lần chạy AI)
```ts
{
  projectId, snapshotId, userId, jobId,
  modelId, modelKey, provider, model,          // denormalize để giữ lịch sử khi model bị xoá
  purpose: 'user' | 'benchmark',
  mode: 'refine' | 'name-only', filesSent,
  status: 'accepted' | 'fallback' | 'failed' | 'cancelled',
  errorKind?, fallbackReason?,
  attempts: [{ n, ok, issueCodes[], inputTokens, outputTokens, latencyMs, errorKind? }],
  usage: { inputTokens, outputTokens, cacheReadTokens, reasoningTokens, totalTokens, estimated },
  latencyMs, wallMs,
  cost: { amount, currency, pricingSnapshot },
  quality: { score, pass, V, M, R, E, B, errors, warnings, modularity, baselineModularity, movedRatio, attemptsUsed },
  feedback?: { rating: 1 | 0, at },
  createdAt
}
Index: {userId:1,createdAt:-1}, {modelId:1,mode:1,createdAt:-1}, {projectId:1,createdAt:-1}
```

### 3.3 Sửa collection hiện có
| Collection | Thay đổi |
|---|---|
| `miningjobs` | thêm `modelId?: string`, `purpose?: 'user'\|'benchmark'` |
| `architecturemappings.receipt` | thêm `runId, modelId, usage, latencyMs, cost` (Mixed, nên không cần migration) |
| `systemsettings` | thêm `defaultModelId`, `scoring: { preset, weights, windowDays }`, `allowUserModelChoice: boolean`; giữ `defaultLlmProvider` để tương thích nhưng đánh dấu deprecated |
| `auditlogs` | action mới: `LLM_MODEL_CREATE/UPDATE/DELETE/TEST`, `LLM_BENCHMARK_START` |

---

## 4. Thay đổi code BE

### 4.1 Lớp LLM (domain + infrastructure)
- `llm/types.ts`: thêm `LlmUsage { inputTokens, outputTokens, cacheReadTokens?, reasoningTokens?, estimated }` và `CompleteOptions.onUsage?(u: LlmUsage, latencyMs: number)`. **Giữ nguyên chữ ký `complete(): Promise<string>`**, nên test hiện có không vỡ. Callback được gọi trước khi throw `truncated`/`refusal`, vì những trường hợp đó vẫn tốn token.
- `ClaudeClient` / `OpenAiCompatibleClient`: đọc `response.usage`, đo `performance.now()`.
- `refine.ts`: gom usage/latency vào từng `RefineAttempt`, tổng hợp vào `RefineReceipt.usage/latencyMs`.
- Module mới `domain/architecture/llm/metrics.ts`, gồm các hàm thuần (dễ test): `runQuality()`, `runCost()`, `modelStability()`, `modelScore()`, `recommend()`. Cần thêm `modularity(files, edges, assignment)` (tính trên đồ thị file).

### 4.2 Registry + runtime
- `infrastructure/llm/runtime.ts` → `LlmModelRegistry`:
  `resolve(modelId?): Promise<{ client, model }>` theo thứ tự `modelId` → `settings.defaultModelId` → model `isDefault` → env (fallback cũ).
  Cache client theo `modelId + updatedAt`.
  Giữ `getLlmRuntime()` cho code và test cũ.
- `infrastructure/llm/secrets.ts`: hàm encrypt/decrypt bằng AES-256-GCM với `LLM_SECRET_KEY`.
- `infrastructure/services/LlmHealthService.ts`: gửi prompt nhỏ `{"ok":true}`, đo latency và token, cập nhật `health`. Admin bấm "Test", và có thể bật kiểm tra định kỳ.

### 4.3 Luồng refine
- `ArchitectureUseCase.refine(body.modelId?)`: kiểm tra model `enabled && visibleToUsers` (và `allowUserModelChoice`), sau đó `startAbstractJob(..., modelId)`.
- `ArchitectureService.refine(projectId, snapshotId, hooks, options, modelId)`: resolve client, chạy refine, tính quality, ghi `LlmRun`, rồi ghi `runId` vào receipt.
- Run bị huỷ hoặc lỗi cũng ghi `LlmRun` (status tương ứng). Đây là dữ liệu cần cho độ ổn định.

### 4.4 API mới / thay đổi
**User** (đã đăng nhập):
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/llm/models?projectId&snapshotId` | Danh sách model user được chọn, kèm `host/external/pricing/health/score` và cờ `recommended` theo mode của snapshot |
| POST | `/api/projects/:id/architecture/refine` | body thêm `modelId?` |
| GET | `/api/projects/:id/architecture` | `mapping.receipt` có thêm `usage, latencyMs, cost, runId` |
| GET | `/api/projects/:id/architecture/runs` | Lịch sử các lần chạy AI của project |
| GET | `/api/llm/runs/me?projectId&page&limit` | Lịch sử của tôi: model, token in/out/total, cost, latency, trạng thái, kèm tổng cộng |
| POST | `/api/llm/runs/:runId/feedback` | 👍/👎 (tuỳ chọn) |

**Admin** (`/api/admin`, đã có `authorize(SYSTEM_ADMINISTRATOR)`):
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/llm-models` | Liệt kê / thêm model (apiKey chỉ ghi, trả về `last4`) |
| PATCH/DELETE | `/llm-models/:id` | Sửa / xoá (nếu đã có run thì chỉ disable) |
| POST | `/llm-models/:id/test` | Health check |
| POST | `/llm-models/:id/default` | Đặt làm mặc định |
| GET | `/llm-usage?from&to&modelId&userId&groupBy=day\|model\|user` | Tổng hợp token, cost, số run, tỷ lệ lỗi |
| GET | `/llm-models/leaderboard?mode&windowDays&purpose&preset` | ModelScore và breakdown (q̄, S, L, C, T, n), kèm model đề xuất |
| PUT | `/settings` | thêm `defaultModelId, scoring, allowUserModelChoice` |
| POST | `/llm-models/benchmark` | `{snapshotId, modelIds[]}` (giai đoạn 6) |
| GET | `/services/status` | `aiProviders` lấy từ health của registry thay vì kiểm env |

---

## 5. Thay đổi FE
| Trang | Thay đổi |
|---|---|
| `developer-analyst/ArchitectureMap.tsx` | `Select` chọn model cạnh nút "Refine with AI" (nhãn ⭐ Recommended, giá ước tính, tag External/Local, health). Modal xác nhận dùng host/model đã chọn. `receiptNote` hiển thị **Model · Input · Output · Total tokens · Latency · Cost**. |
| **Mới** `developer-analyst/AiUsage.tsx` (nav "AI Usage") | Bảng các lần chạy của tôi, thẻ tổng token/cost, lọc theo project |
| **Mới** `system-administrator/AiModels.tsx` | CRUD model, nhập key (ẩn), giá, bật/tắt, đặt mặc định, nút Test, tag health |
| **Mới** `system-administrator/AiMetrics.tsx` | Thẻ tổng (token, cost, run, lỗi), biểu đồ token theo ngày, leaderboard (score + breakdown + n + recommended), chọn preset trọng số, top user theo token, chạy benchmark |
| `system-administrator/Dashboard.tsx` | Thẻ tóm tắt AI (token hôm nay, model mặc định, health) |
| `features/architecture/api.ts`, `features/admin-api.ts`, mới `features/llm-api.ts` | Client API và kiểu dữ liệu |

---

## 6. Quyết định cần chốt
1. **Lưu API key ở đâu?** (a) Mã hoá trong DB bằng `LLM_SECRET_KEY`, để Admin nhập trên UI (khuyến nghị). (b) Chỉ lưu *tên biến env* (`apiKeyEnv: "ANTHROPIC_API_KEY"`), không bao giờ lưu secret trong DB, nhưng thêm model mới thì phải sửa `.env` và restart.
2. **Model mặc định khi user không chọn:** model Admin đặt mặc định (khuyến nghị, dễ dự đoán), hay tự động lấy model recommended?
3. **Benchmark** đưa vào đợt này hay để sau?

## 7. Kế hoạch triển khai
1. **Thu thập usage**: `LlmUsage` + `onUsage` trong 2 client, gom trong `refine.ts`, mở rộng receipt, test.
2. **`llmruns` + `metrics.ts`** (quality/cost/stability/score, có unit test) và ghi run sau mỗi job.
3. **Registry**: model + secrets + seed từ env + `resolve(modelId)` + health check + admin CRUD + audit.
4. **Chọn model**: `modelId` qua API → job → service, `GET /api/llm/models`.
5. **API thống kê**: usage, leaderboard, runs/me, project runs.
6. **FE**: model picker + hiển thị token, trang AI Usage, trang AI Models, trang AI Metrics.
7. *(Tuỳ chọn)* Benchmark + feedback 👍/👎.

Mỗi giai đoạn giữ tương thích ngược: nếu không cấu hình registry, hệ thống chạy như hiện tại bằng env.
