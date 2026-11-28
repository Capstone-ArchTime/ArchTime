# RQ2: Protocol đánh giá AI Mentor

| | |
|---|---|
| Phiên bản | **1.3 (2026-11-24): mentor context with architecture, see "Protocol 1.3" below (English). Implemented; approved for the test-set run on 2026-11-28 (model `gemini/gemini-3.1-flash-lite`), see 1.3.5 and 1.3.11.** 1.2 (2026-11-19: mỗi câu chạy 3 lần, khoảng tin cậy bootstrap theo câu hỏi, so sánh C0–C1 và C1–C2 có hiệu chỉnh Holm, xem §3 và §5), giữ nguyên bên dưới để tái lập. 1.1 (2026-11-18): đổi repo sang ba repo của tập kiểm tra RQ1, xem §0 |
| Ngày | 2026-11-15 |
| Câu hỏi nghiên cứu | Thiết kế của AI Mentor (nhãn FACT / INFERENCE / UNKNOWN và bước kiểm tra trích dẫn) có làm câu trả lời có căn cứ hơn không? |
| Công cụ | `BE/scripts/rq2.ts` (`npm run rq2`), `BE/src/domain/evaluation/rq2.ts` (test: `BE/tests/rq2.test.mjs`) |
| Bộ câu hỏi | [rq2/questions.json](rq2/questions.json) |
| Repo | react-router, docusaurus, actual: ba trong năm repo của tập kiểm tra RQ1, cùng commit đóng băng ([rq1-protocol.md](rq1-protocol.md) §1, [architecture-references/README.md](architecture-references/README.md) §4) |

## Protocol 1.3 (2026-11-24)

Decision: **option B** of [mentor-context-audit.md](mentor-context-audit.md) §8, chosen by the team on 2026-11-24.
Everything not stated in this section is unchanged from 1.2 (the Vietnamese sections §0–§6 below): repositories, the
three runs, claim splitting, blind sheets, the annotation guide, metrics, bootstrap and Holm. Execution status:
**implemented and trialled on a development workspace; approved for the test-set run on 2026-11-28** (see "Approval"
below). Not run yet.

### 1.3.1 Why 1.2 was insufficient

Measured on the three RQ2 workspaces (mentor-context-audit.md §2): the 1.2 PROJECT DATA held the 15 newest snapshots
(the last 1–4 days of a two-year mined window), the 25 newest evidence records and 60 file base names, and **no**
components, component dependencies or evolution events, although the paper describes the mentor as receiving them.
Q2 ("which commits changed dependencies the most") could not be answered correctly from it (react-router: largest
change in the history +1,240 dependencies, largest shown +7); Q1 and Q5 only partially.

### 1.3.2 What changed

| | 1.2 | 1.3 |
|---|---|---|
| Snapshot/evidence part | 15 newest snapshots, 25 newest evidence, flag "architectural changes", LATEST STRUCTURE (60 file base names), cut at 24,000 chars | same snapshots and evidence; flag renamed "dependency changes" (it is 1 when any dependency changed); no file-name list; cut at **15,000** chars |
| ARCHITECTURE block | none | folders of the latest snapshot; components of the latest milestone (name, role, generated description, file count, 3 files ranked by fan-in); component dependencies (imports between components, by weight); evolution events between consecutive milestones (split, merged, restructured, added, removed, with the evidence rule; renames counted, not listed); milestones (≤12, spread evenly, oldest first); the 10 largest dependency changes of the whole mined history (commits still in the repository); cut at **9,000** chars with per-section budgets |
| Provenance | — | header: membership and dependencies derived from imports; names, roles and descriptions written by an AI model, not facts |
| Prompts (C0, C1, C2) | `C0_PROMPT`, `C1_PROMPT`, mentor `SYSTEM_PROMPT` | **unchanged** (same prompt-version fingerprints) |
| Question set | 1.1 | **1.1, unchanged** |
| Citation check (C2) | non-mined hashes removed; vanished commits accepted (defect) | non-mined **and vanished** hashes removed, as in the app (`minedCommitFilter`) |
| Answer record | id, prompt version, context fingerprint, … | + `contextVersion`, `contextWithheld`, `contextStats` |
| Test-set protection | none | test-set lock (below) |
| Run gate | `--approve-protocol 1.2` | `--approve-protocol 1.3`; preflight requires context version 1.3, all ARCHITECTURE sections, lock lifted |

Code: `BE/src/domain/mentor/architectureContext.ts` (block, assembly), `BE/src/application/use-cases/llm/ProjectChatContext.ts`
(`MENTOR_CONTEXT_VERSION = "1.3"`, `buildProjectContext(…, { version })`), `ProjectChatUseCase.ts` (`mentorProjectData`,
`architectureForMentor`), `BE/src/domain/evaluation/testSet.ts`, `rq2Preflight.ts` (`RQ2_PROTOCOL_VERSION = "1.3"`).
Version 1.2 remains available as `mentorProjectData(project, { version: "1.2" })` and produces the 1.2 text unchanged.
The app's mentor uses 1.3 too, so C2 is still "the ArchTime mentor unchanged".

### 1.3.3 Exact model input per condition

| | C0 | C1 | C2 |
|---|---|---|---|
| System message | `C0_PROMPT` + "Project: <name> (<repository URL>)" | `C1_PROMPT` + `--- PROJECT DATA ---` + *D* + `--- END PROJECT DATA ---` | `SYSTEM_PROMPT` + `--- PROJECT DATA ---` + *D* + `--- END PROJECT DATA ---` |
| User message | the question | the question | the question |
| *D* (project data) | none | 1.3 PROJECT DATA (snapshot/evidence part + ARCHITECTURE block) | **byte-identical** to C1 |
| Labels requested | no | no | FACT / INFERENCE / UNKNOWN |
| Post-processing | none | none | citation filter + FACT downgrade |

C2 receives no evidence that C1 does not: the only differences are the instructions and the post-processing, so C1→C2
isolates labels and filtering; C0→C1 now measures the effect of the evidence *including* the recovered architecture.
Verified by test (`mentor-context-13.test.mjs`: "C1 and C2 receive byte-identical PROJECT DATA").

### 1.3.4 Context construction and retrieval

Deterministic, no query-dependent retrieval: the same *D* for every question of a repository (one fingerprint per
repository, recorded with every answer; the text is saved once in `contexts/`). Ranking: files by fan-in, component
dependencies by import count, whole-history changes by added + removed dependencies (ties: newer first), milestones
spread evenly. Budgets: snapshot/evidence part 15,000 characters; ARCHITECTURE block 9,000 (folders 8 %, components
30 %, dependencies 12 %, events 22 %, milestones 13 %, whole-history changes 15 %), each section listing what it left
out. Never included: source code, patches, the reference architecture (RQ1 ground truth), annotators' labels.

### 1.3.5 Model configuration

Verified from code and the model registry on 2026-11-24 (not yet from a test-set run):

| Item | Value | Status |
|---|---|---|
| Model | default registry model `gemini/gemini-3.1-flash-lite`, Google OpenAI-compatible endpoint | verified (registry) |
| Actual model version returned by the provider | not recorded by the client | **unknown**: to record if the provider reports it |
| Temperature | not sent: the stored model has no temperature, and the Gemini client leaves it to the provider (`runtime.ts`) | provider default; value **not known** |
| Output limit | `maxTokens: 2000`, `plain: true` (no JSON mode) | verified (script) |
| Date of the run | — | to record from `askedAt` |

The team must confirm or change this model before approval; whatever is used is recorded per answer (`model`, `modelInfo`).

**Model decision (2026-11-28).** Claude Opus 5.5 (`anthropic/claude-opus-5-5`) was chosen first on 2026-11-28 and
**replaced the same day**: no Anthropic model in the registry could answer (Opus 5.5 has no key; the other Anthropic
models' account has no credit), so it could not be trialled. The approved model is the one that ran:

| Item | Value | Status |
|---|---|---|
| Model | `gemini/gemini-3.1-flash-lite`, registry id `6ac63ccc9e2094ce0770c4bf` (the registry default), Google OpenAI-compatible endpoint (`generativelanguage.googleapis.com`) | **approved 2026-11-28**; pass it with `--model 6ac63ccc9e2094ce0770c4bf` |
| Actual model version returned by the provider | not recorded by the client | **unknown**: to record if the provider reports it |
| Temperature | not sent (provider default) | value **not known** |
| Output limit | `maxTokens: 2000`, `plain: true` | verified; in the trial below the longest answer used 484 output tokens, none was cut off |
| Fallback to another model | none (the Gemini client has no server-side fallback) | — |
| Quota | the key's quota was exceeded during the trial (12 of 50 requests) | failures are stored in `errors/`, never scored, and retried by running again; the 270 answers may need several sessions |
| Date of the run | — | to record from `askedAt` |

Check of the model on 2026-11-28 (development workspace ArchTime `6ac02d6c05de42f87e0eba04`, `mentor-trial.ts --ask
--model 6ac63ccc9e2094ce0770c4bf`, one run, technical only, not RQ2 evidence): 38 of 50 requests answered, 12 failed
on quota; 132 of 136 citations were mined commits (the 4 others in C0, which has no data); Q2 named the largest
dependency change of the whole history with context 1.3 in C1 and C2. Of the other registry models, only the Groq
(`gpt-oss-20b`, `gpt-oss-120b`, `qwen3.8-27b`) and some OpenRouter models answered a one-line test.

### 1.3.6 Evidence and citation handling

Citations are short hashes in backticks. C2: a hash that is not a mined commit still in the repository is removed and a
FACT left without a valid citation becomes INFERENCE (`enforceClaimLabels`); counts are stored per answer. Citation
validity (all conditions) is automatic and means only "the hash is a mined commit"; whether the commit supports the
claim is part of the annotators' verdict (§4: S requires the cited commit to be where it happened).

### 1.3.7 Test-set lock

While the RQ1-B annotation is in progress, the ARCHITECTURE block of the five test-set workspaces would show the
evolution events annotators judge. `mentorProjectData` therefore withholds it for those workspaces (replaced by a
one-line note) unless `ARCHTIME_TEST_SET_LOCK=off`; the lock is on by default, also in the app's mentor. The preflight
refuses a run while the block is withheld. `scripts/mentor-trial.ts` refuses the five repositories outright. The lock is
lifted only for the RQ2 run, after both RQ1-B annotators have submitted their sheets.

### 1.3.8 Development-set trial (procedure)

On a development workspace only (ArchTime or Hackathon): `npx tsx scripts/mentor-trial.ts --project <id>` (contexts,
sizes, sections, facts from the database), then with `--ask` (C0 once, C1 and C2 with contexts 1.2 and 1.3, one run).
Results: [mentor-context-trial-report.md](mentor-context-trial-report.md). Spot checks compare answers with database
facts; they are not RQ2 metrics. Test-set answers may not be looked at before the run.

### 1.3.9 Test-set execution procedure

1. Both RQ1-B annotators submitted (test-set-annotation-report.md).
2. Team records approval in this section: date, people, model, and confirmation of 1.3.5.
3. For each of react-router, docusaurus, actual, with `ARCHTIME_TEST_SET_LOCK=off`:
   `npx tsx scripts/rq2.ts preflight --project <id> --repo <repo> --approve-protocol 1.3` → no error.
4. `npx tsx scripts/rq2.ts run --project <id> --repo <repo> --approve-protocol 1.3` (3 runs, 90 answers per repository).
5. Restore the lock; then sheets, two annotators, scoring (§3).

### 1.3.10 Limitations and threats (in addition to §6)

- The ARCHITECTURE block is ArchTime's own output: C1/C2 may repeat its errors (grouping, generated names) as claims;
  annotators judge them against the repository, so such claims count as unsupported or contradicted.
- C0→C1 is no longer "evidence vs none" alone: it includes the recovered architecture. C1→C2 is unaffected.
- The development trial used two small workspaces (31 and 84 commits); their histories are short enough that the 1.2
  context already contained the largest change, so the trial cannot show the Q2 improvement on long histories. That
  improvement rests on construction (a whole-history query) and tests, and is not demonstrated on the test set before
  the run (which the lock forbids looking at).
- Temperature and the provider's exact model version are not controlled or known (1.3.5).
- Generated names in a workspace that mixes clustering-only and LLM-refined milestones change between milestones;
  renames are therefore not listed as events.

### 1.3.11 Approval

| Item | Status |
|---|---|
| Option B decided | 2026-11-24, by the project lead (this request) |
| Implementation and tests | done (see research-completion-report.md §0b) |
| Development trial | done, see the trial report |
| RQ1-B annotation finished (lock may be lifted) | **yes**: both annotators submitted, reconciled and scored on 2026-11-27 (test-set-annotation-report.md) |
| Model confirmed | **yes**: `gemini/gemini-3.1-flash-lite` (registry `6ac63ccc9e2094ce0770c4bf`), 2026-11-28, after Claude Opus 5.5 could not be used (1.3.5) |
| Temperature, provider model version, run date | temperature not sent (provider default, unknown); provider version and date **to record at the run** |
| Approval for the test-set run (`--approve-protocol 1.3`) | **given** on 2026-11-28 by Nguyễn Duy Công |
| Test-set run | **not run yet** |

## 0. Chọn repo (quyết định 18/11/2026)

Bản 1.0 dùng axios, nest và ArchTime, là tập cũ trước khi RQ1 chuyển sang năm repo theo phiếu đăng ký. Bản 1.1 dùng ba
repo của tập kiểm tra RQ1 để paper và báo cáo dùng một tập dữ liệu, và dùng lại dữ liệu đã mine cho C11. Chưa câu trả lời
nào được thu theo bản 1.0, nên đổi lúc này không vi phạm quy tắc "không sửa sau khi đã chạy" (§2).

| Repo | Vì sao |
|---|---|
| remix-run/react-router | Rất nổi tiếng: model có thể đã học về nó, nên C0 mạnh hơn. Đây là phép thử khó cho C1/C2. Có ADR trong `decisions/` |
| facebook/docusaurus | Nổi tiếng, có trang kiến trúc chính thức |
| actualbudget/actual | Ít nổi tiếng hơn hẳn: cân lại hai repo trên |

Không dùng outline và react-admin để giữ khối lượng chấm vừa sức: 3 repo × 10 câu × 3 điều kiện = 90 câu trả lời mỗi lần
chạy; từ bản 1.2 mỗi câu chạy 3 lần nên tổng là **270** câu trả lời (§3).

**Q9 (lý do thiết kế) với react-router:** lý do có thể nằm trong ADR của repo dù không có trong dữ liệu đã mine. Một lý do
được nêu vẫn được chấm như mọi khẳng định: `S` chỉ khi repo ở commit đóng băng ghi đúng điều đó. Câu này vẫn tính là câu
"không trả lời được từ dữ liệu" khi đo tỷ lệ từ chối.

## 1. Ba điều kiện

Cùng một model, cùng câu hỏi; chỉ khác những gì model nhận được và những gì xảy ra sau khi nó trả lời.

| Điều kiện | Model nhận | Sau khi trả lời |
|---|---|---|
| **C0** | Chỉ câu hỏi và tên, địa chỉ repo. Không có dữ liệu project | Giữ nguyên |
| **C1** | Dữ liệu project như mentor thật (snapshot, change evidence, cấu trúc mới nhất), dặn chỉ trả lời từ dữ liệu; **không** gắn nhãn, **không** dặn trích dẫn commit | Giữ nguyên |
| **C2** | Mentor ArchTime đúng như người dùng gặp: cùng dữ liệu, prompt của mentor (gắn nhãn, trích dẫn commit) | Bước kiểm tra của mentor: hash không phải commit đã mine bị bỏ; FACT không còn trích dẫn hợp lệ bị hạ thành INFERENCE |

Dữ liệu project của C1 và C2 do cùng một hàm dựng (`mentorProjectData`), prompt C2 là `SYSTEM_PROMPT` của mentor, và bước
kiểm tra là `enforceClaimLabels`. So C1 với C2 vì thế đo đúng tác động của nhãn và bước kiểm tra trích dẫn; so C0 với C1
đo tác động của dữ liệu project.

## 2. Bộ câu hỏi

Mười câu cố định cho mỗi repo ([rq2/questions.json](rq2/questions.json)): Q1–Q8 trả lời được từ dữ liệu đã mine (cấu trúc,
thay đổi kiến trúc, file, tác giả, kích thước theo thời gian); Q9–Q10 **không** trả lời được từ dữ liệu (lý do thiết kế, số
người dùng) để đo việc từ chối đúng chỗ. Mỗi câu có cột `expected`: điều một câu trả lời phải có để tính là bao phủ.

Không sửa bộ câu hỏi sau khi đã chạy model; nếu phải sửa, tăng `version` và chạy lại toàn bộ.

## 3. Quy trình

1. **Chuẩn bị.** Mine mỗi repo đến commit đóng băng (như RQ1). Ghi model dùng (nhà cung cấp, tên, ngày) vào báo cáo.
2. **Chạy model.** `npm run rq2 -- list` để lấy id workspace, rồi với mỗi repo:
   `npm run rq2 -- run --project <id> --repo <react-router|docusaurus|actual>` (Windows PowerShell 5.1: `npx tsx scripts/rq2.ts run ...`).
   Mỗi câu được hỏi **3 lần** ở mỗi điều kiện, cùng model và cùng thiết lập (`--runs 3`, mặc định), tổng
   3 repo × 10 câu × 3 điều kiện × 3 lần = **270 câu trả lời**. Ba lần chạy cho thấy độ dao động của model; mọi tỷ lệ gộp
   cả ba lần, và báo cáo ghi thêm tỷ lệ thấp nhất, cao nhất giữa các lần. Lần 1 lưu ở
   `rq2-results/answers/<repo>.<câu>.<điều kiện>.json`, lần 2 và 3 thêm `.r2`, `.r3` (cả bản gốc và bản sau kiểm tra,
   token, thời gian). Câu đã có kết quả không bị hỏi lại (`--force` để hỏi lại), nên chạy tiếp sau khi gián đoạn không
   tốn thêm tiền.
3. **Phiếu chấm.** `npm run rq2 -- sheet`. Ra hai phiếu mẫu và hai file khoá:
   - `sheets/claims.csv`: mỗi dòng một khẳng định. Câu trả lời được tách thành khẳng định: mỗi đoạn có nhãn là một khẳng
     định; đoạn không nhãn tách theo câu; tiêu đề và mẩu dưới ba từ bị bỏ (`splitClaims`).
   - `sheets/answers.csv`: mỗi dòng một câu trả lời đầy đủ.
   - `keys/*.json`: dòng nào thuộc điều kiện nào. **Không đưa cho người chấm.**
4. **Chấm mù.** Hai người chấm độc lập, mỗi người copy hai phiếu thành `claims.<tên>.csv` và `answers.<tên>.csv`. Phiếu
   không có điều kiện, không có nhãn (nhãn làm lộ C2), thứ tự đã xáo trộn với seed cố định; trích dẫn được giữ vì cần để
   kiểm chứng. Người chấm kiểm chứng bằng chính repo ở commit đóng băng (`git show`, `git log`), không bằng ArchTime.
5. **Đối chiếu.** `npm run rq2 -- score --a <tên1> --b <tên2>`. Nếu có khẳng định hai người chấm khác nhau, công cụ ghi
   `sheets/claims.adjudicate.csv`; hai người thống nhất cột `verdict`, lưu thành `claims.adjudicated.csv`, rồi chạy lại
   `score`. Kết quả: `report.md`, `metrics.csv`, `comparisons.csv`.

## 4. Hướng dẫn chấm

**Khẳng định** (`verdict`):

| Giá trị | Khi nào |
|---|---|
| `S` Supported | Repo ở commit đóng băng cho thấy điều đó đúng; nếu khẳng định trích commit thì commit đó đúng là nơi nó xảy ra |
| `C` Contradicted | Repo cho thấy điều đó sai (commit, ngày, tác giả, số liệu, file sai) |
| `N` Not verifiable | Không kiểm chứng được từ repo (ý kiến, lý do, suy đoán, số liệu ngoài repo) |

**Câu trả lời**: `refusal` = `yes` nếu câu trả lời từ chối hoặc nói dữ liệu không trả lời được, `no` nếu không.
`coverage` (chỉ câu trả lời được) = `yes` nếu có đủ điều ghi ở cột `expected`, `partial` nếu có một phần, `no` nếu không.

## 5. Chỉ số (theo từng điều kiện)

| Chỉ số | Cách tính |
|---|---|
| Tỷ lệ không có căn cứ | (C + N) / số khẳng định đã có phán quyết cuối |
| Tỷ lệ sai | C / số khẳng định đã có phán quyết cuối |
| Độ chính xác trích dẫn | Trong các khẳng định có trích ít nhất một commit: tỷ lệ S |
| Độ hợp lệ trích dẫn | Hash được trích là commit đã mine / mọi hash được trích (tự động, không cần người chấm) |
| Độ chính xác nhãn FACT | Trong các khẳng định C2 mang nhãn FACT (sau bước kiểm tra): tỷ lệ S. C0, C1 không có nhãn |
| Tỷ lệ từ chối | Riêng câu không trả lời được (cao là tốt) và câu trả lời được (thấp là tốt); tính trên mọi phán quyết của cả hai người chấm |
| Độ bao phủ | Câu trả lời được: trung bình `coverage` (yes 1, partial 0,5, no 0) của cả hai người chấm |
| Độ đồng thuận | Cohen's kappa giữa hai người chấm, trên phán quyết khẳng định và trên `refusal` |
| Số khẳng định mỗi câu trả lời | Số khẳng định / số câu trả lời. Điều kiện nói ít có thể trông chính xác hơn, nên luôn báo cáo kèm |
| Câu trả lời rỗng | Không có khẳng định nào (từ ba từ trở lên) và không người chấm nào đánh dấu từ chối |

**Mẫu số.** Câu trả lời từ chối tính vào tỷ lệ từ chối. Câu trả lời rỗng tính riêng. Cả hai loại không vào mẫu số của các
tỷ lệ theo khẳng định.

**Khoảng tin cậy và kiểm định.** Khẳng định và các lần chạy của cùng một câu hỏi không độc lập, nên đơn vị lấy mẫu lại là
câu hỏi (một câu của một repo).
- Tỷ lệ không có căn cứ của mỗi điều kiện có khoảng tin cậy 95 % bằng cluster bootstrap: lấy mẫu lại có hoàn lại 30 câu
  hỏi, tính lại tỷ lệ gộp, 10.000 lần, lấy phân vị 2,5 % và 97,5 % (`bootstrapRatio`, `stats.ts`).
- So sánh C0 với C1 (tác dụng của dữ liệu) và C1 với C2 (tác dụng của nhãn và bước kiểm tra): cùng bootstrap nhưng ghép
  cặp theo câu hỏi (mỗi lần lấy mẫu dùng cùng các câu cho hai điều kiện), ra khoảng tin cậy của hiệu và p hai phía
  (`bootstrapRatioDifference`). p được hiệu chỉnh Holm cho hai phép so sánh (`holm`). Một hiệu được gọi là có ý nghĩa khi
  khoảng tin cậy không chứa 0 và p sau Holm dưới 0,05.
- Seed của bootstrap cố định, nên tính lại luôn ra cùng số.

**Kỳ vọng:** C2 có tỷ lệ không có căn cứ thấp hơn C1, độ hợp lệ trích dẫn 100 % (bước kiểm tra bảo đảm), và từ chối câu
không trả lời được nhiều hơn C0. Báo cáo cả khi kết quả ngược kỳ vọng.

## 5b. Bản ghi mỗi câu trả lời (bổ sung 24/11/2026; không đổi điều kiện, câu hỏi hay chỉ số chính)

Mỗi file trong `answers/` ghi thêm: `answerId` (`<repo>.<câu>.<điều kiện>.r<lần>`), `promptVersion` (dấu vân tay của prompt
cố định của điều kiện), `contextSha256` (dữ liệu project C1/C2 nhận; nội dung lưu một lần ở `contexts/`), `questionsVersion`,
`modelInfo`, `settings`, `status`. Yêu cầu bị lỗi được ghi vào `errors/` và hỏi lại ở lần chạy sau, không bao giờ được tính
là câu trả lời; `--force` chuyển bản cũ vào `answers/superseded/` thay vì ghi đè. `run-log.jsonl` ghi một dòng cho mỗi yêu
cầu. Báo cáo cảnh báo khi một điều kiện trộn nhiều phiên bản prompt hoặc model.

Chỉ số bổ sung (chỉ để đọc kèm, không thay chỉ số chính): Gwet's AC1 cạnh κ; "số khẳng định Supported mỗi câu trả lời
được" và "tỉ lệ câu trả lời được có ít nhất một khẳng định Supported", để tỷ lệ không có căn cứ thấp không thể đến từ việc
nói ít hay từ chối nhiều. Độ hợp lệ trích dẫn chỉ kiểm hash có phải commit đã mine; việc commit đó có thật sự ủng hộ khẳng
định nằm trong phán quyết `S` của người chấm (§4), nên độ chính xác trích dẫn mới là thước đo ngữ nghĩa.

**Phải quyết trước khi chạy (audit D6, docs/research-audit-report.md):** dữ liệu project của mentor hiện chỉ có snapshot,
evidence và tối đa 60 **tên file** (không có đường dẫn) của snapshot mới nhất; không có component, phụ thuộc giữa component
hay sự kiện tiến hoá. Paper (§3.6) lại viết mentor nhận "the current components with their dependencies". Câu Q1 (thư mục,
module chính) có thể không trả lời được từ dữ liệu này. Hoặc sửa paper cho đúng mã nguồn, hoặc đổi mentor rồi tăng protocol
lên 1.3 **trước** khi thu câu trả lời nào.

## 5c. Kiểm tra trước khi chạy và đề xuất bản 1.3 (24/11/2026)

> **Đã được thay bằng "Protocol 1.3" ở đầu tài liệu** (phương án B đã chọn ngày 24/11/2026). Phần dưới là bản ghi của
> buổi kiểm tra trước đó, giữ lại để truy vết; lệnh chạy nay cần `--approve-protocol 1.3`.

**Preflight (đã có, không gọi model):** `npx tsx scripts/rq2.ts preflight --project <id> --repo <repo> [--approve-protocol <phiên bản>]`
kiểm: protocol đã được duyệt (`--approve-protocol` phải bằng `RQ2_PROTOCOL_VERSION`, hiện 1.2), model cấu hình được (không
thử bằng một lần gọi, nên khoá API sai chỉ lộ ra ở yêu cầu đầu), bộ câu hỏi (có version, đúng 10 câu, id không trùng, 8 trả
lời được + 2 không, không placeholder lạ), workspace (tồn tại, có snapshot, có evidence), dữ liệu project (đủ ba phần, có bị
cắt không), và các câu trả lời đã có (trùng answer id, tên file sai, điều kiện lạ, khác phiên bản prompt, khác model, khác
dữ liệu project). `run` tự chạy preflight trước và **dừng nếu có lỗi**, nên một lần chạy thật cần `--approve-protocol 1.2`.
Ngày 24/11/2026 preflight của react-router, docusaurus, actual chỉ báo một lỗi: protocol chưa được duyệt.

**Sửa lỗi không đổi điều kiện:** bước kiểm tra trích dẫn của C2 nay chỉ nhận commit còn trong repo (`missingSince: null`),
đúng như mentor trong ứng dụng (trước đây nhận cả commit đã biến mất). Ba repo hiện có 0 commit như vậy. Mỗi câu trả lời ghi
thêm `contextStats` (số ký tự, có bị cắt không, số snapshot và evidence đã đưa).

**Phải quyết trước khi chạy** ([mentor-context-audit.md](mentor-context-audit.md)): dữ liệu project hiện chỉ có 15
snapshot mới nhất (vài ngày cuối của cửa sổ hai năm), 25 evidence mới nhất và 60 tên file; không có component, phụ thuộc
giữa component hay sự kiện tiến hoá. Q2 thực tế không trả lời được đúng (lớn nhất cả lịch sử 1.240 phụ thuộc so với 7 trong
dữ liệu, react-router); Q1, Q5 chỉ trả lời được một phần.

| Phương án | Thay đổi | Ảnh hưởng tới tính hợp lệ |
|---|---|---|
| A — giữ 1.2 | Sửa paper §3.6 cho đúng; ghi hạn chế cửa sổ; có thể sửa Q2/Q5/Q8 (bộ câu hỏi 1.2) | C0/C1/C2 không đổi; RQ2 đánh giá mentor "cửa sổ gần đây" |
| B — 1.3 (khuyến nghị) | Thêm khối ARCHITECTURE (`architectureContext.ts`: component, phụ thuộc, sự kiện, mốc, thay đổi lớn nhất cả lịch sử, tóm tắt thư mục) vào `mentorProjectData`; thay LATEST STRUCTURE bằng tóm tắt thư mục; đổi nhãn "architectural changes" thành "dependency changes" | Nội dung C1 và C2 đổi (vẫn giống nhau, nên C1→C2 vẫn chỉ đo nhãn + kiểm tra); C0 không đổi; mentor của ứng dụng đổi theo; cần chạy thử trên một workspace của tập phát triển; tăng `RQ2_PROTOCOL_VERSION` lên 1.3 |

Chưa có câu trả lời nào được thu, nên đổi lúc này không vi phạm luật "không sửa sau khi đã chạy" (§2). Quyết định phải được
ghi vào mục 0 (ngày, người, phương án) trước khi chạy.

## 6. Hạn chế

- Một model, ba lần chạy cho mỗi câu (nhiệt độ của nhà cung cấp): ba lần cho thấy độ dao động nhưng chưa đủ để ước lượng
  nó chính xác. Ghi rõ model và ngày chạy.
- 30 câu hỏi là mẫu nhỏ: khoảng tin cậy sẽ rộng, và hiệu nhỏ có thể không đạt ý nghĩa thống kê.
- Hai người chấm mọi khẳng định của 270 câu trả lời: khối lượng chấm gấp ba so với bản 1.1.
- Trích dẫn vẫn hiện trên phiếu nên người chấm có thể đoán C0 (thường không trích commit); nhãn đã được bỏ để giảm điều này.
- Tách khẳng định bằng luật (theo nhãn, theo câu) có thể gộp hai ý vào một khẳng định hoặc tách một ý làm hai.
- Model có thể đã học về react-router và docusaurus khi huấn luyện, nên C0 có thể trả lời đúng mà không cần dữ liệu. Đây là
  chủ đích (phép thử khó hơn), nhưng phải báo cáo riêng kết quả từng repo.
- Người chấm là thành viên nhóm, biết ArchTime; phiếu đã bỏ nhãn và điều kiện để giảm thiên lệch.
