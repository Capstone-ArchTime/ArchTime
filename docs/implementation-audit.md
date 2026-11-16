# Audit hiện trạng và theo dõi T1–T13 (Trường)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | `SEP490_FA26SE279_Tasks_Truong.pdf` (danh sách việc lập 12/11/2026); repo tại `Develop` `718415e` |
| BM04 | Đã đối chiếu với `SWP490_FA26SE279_R2_Commitment.pdf` (BM04 Review 2) ngày 2026-11-16: Report 5 §7 |
| Tài liệu không có | SRS, SDD, BM03 (BR, MSG, UC chi tiết). Chỗ dựa vào chúng ghi rõ là **diễn giải** |

## 1. Kiến trúc hiện có

| Phần | Hiện trạng |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript, Ant Design 6, Tailwind 4, react-router-dom 7. `FE/src/pages` (theo vai trò), `FE/src/features` (gọi API + logic thuần, có test), `FE/src/auth/permissions.ts` (route theo vai trò), `navigation.ts` (sidebar) |
| Backend | Express 4 + TypeScript (tsx), Clean Architecture: `domain/` (thuần, có test) → `application/use-cases` → `infrastructure/` (Mongo, git, LLM) → `presentation/` (routes + Swagger, controllers, middleware). Wiring ở `src/container.ts`, `src/app.ts` |
| Database | MongoDB qua Mongoose. Snapshot (đồ thị file mỗi commit), Evidence, Workspace (sơ đồ, rule, ADR), Conformance (finding, check), Organization… |
| Xác thực, phân quyền | JWT (access + refresh, `tokenVersion`), `authorize(role)` cho admin, `ProjectAccessPolicy` (metadata / read / write / admin / owner) cho mọi route project; System Administrator chỉ thấy metadata của project tổ chức |
| Mining | `MiningService`: scan / mine theo batch, mốc release; `DependencyExtractor` (AST, chỉ `import`); hook `onHistoryChanged` → conformance check + e-mail (D6) |
| So sánh, evidence (F-04) | `CompareSnapshotsUseCase` (diff file và cạnh), `GetEvidencesUseCase`, `bridge.ts` (chiếu thay đổi lên component, INFERENCE), component matching; FE `Compare.tsx`, `Evidence.tsx` |
| Conformance (D5, Đức) | `conformance.ts` (thuần) + `CheckConformanceUseCase`; kiểu finding chung `IConformanceFinding` (`forbidden-dependency`, `missing-required-dependency`, `undeclared-dependency`), khoá `(project, snapshot, key)` |
| Quy ước commit | Chỉ có `COMMIT_CONVENTION` (mô tả cho agent, `domain/agent/context.ts`), **chưa có kiểm tra** |
| Jira, task, sprint (F-13) | **Chưa có gì** (không model, API, màn hình) |
| Admin tổ chức | Danh sách + chi tiết chỉ metadata (T44). **Chưa có tạm khoá / mở lại** |
| Đánh giá | `domain/evaluation/{extractor,rq1,rq2,stats}.ts`, `mojo.ts` (MoJoFM, kiểm chứng brute force); scripts `rq1`, `rq1:milestones`, `extractor-eval`. Phiếu extractor cũ (axios / nest) **chưa từng được tạo trong repo** |
| Test | `node:test`; BE 685 test (có test MongoDB thật, CI cấp MongoDB 7 và fail khi có test bị bỏ qua), FE 404 test |
| CI | `.github/workflows/ci.yml`: BE (tsc, test trên MongoDB), FE (test, oxlint, build) ở mỗi push |

## 2. Đối chiếu yêu cầu với hiện trạng (trước đợt này)

| Yêu cầu | Có sẵn | Thiếu | Một phần |
|---|---|---|---|
| F-04 / WF-02 | Compare, evidence, bridge, matching, test đơn vị | Test luồng WF-02 qua HTTP; N-02 chưa đo | Compare tải mọi đồ thị (tìm ra khi đo) |
| F-13 / WF-07 / RF-07 | — | Toàn bộ: parser, model, use case, API, màn hình, liên kết commit | — |
| RF-30 | Mô tả quy ước | Parser, so khớp với thay đổi thật, finding | — |
| RF-14 / UC-25 | Xem metadata | Tạm khoá, mở lại, thực thi khi khoá | — |
| RF-24 | Protocol, MoJoFM, panel nhập tham chiếu | Tham chiếu của 5 repo; công cụ so 2 người viết | — |
| T8 | Công cụ đo, test | Phiếu cho 5 repo của tập kiểm tra; nhãn | — |

## 3. Rủi ro tích hợp

| Rủi ro | Xử lý trong đợt này |
|---|---|
| Đổi `GIT_LOG_FORMAT` (thêm trailers) làm hỏng phân tích log | Trailers đặt trước subject, cùng một dòng; test với `git log` thật |
| Thêm loại finding làm vỡ e-mail, FE, unread count | Thêm `convention` vào enum Mongo, FE, nhãn e-mail; khoá chứa hash commit để quyết định không lan sang commit khác |
| Kiểm lại toàn bộ snapshot sau khi đổi `CONFORMANCE_VERSION` | Có chủ đích, một lần (Report 5 K4) |
| Policy đọc thêm tổ chức ở mỗi request project tổ chức | Một `findById` theo `_id`; store cũ không có hàm này thì coi như không khoá |
| Nhánh song song cùng sửa `container.ts`, `app.ts` | Đã merge thử cả 5 nhánh trên nhánh tạm: không xung đột, 753 / 414 test pass |

## 4. Bảng theo dõi T1–T13

| Task | Status | Existing implementation | Missing work | Verification |
|---|---|---|---|---|
| T1 Tham chiếu 5 repo (bản 1) | IN_PROGRESS | Protocol, MoJoFM | Reference B (thành viên nhóm) cho react-router và docusaurus; nhóm chấp nhận người viết A là AI | Reference A (AI, ghi rõ) cho react-router (13 component, 208/542 file) và docusaurus (15 component, 671/813); `reference-check` báo không có tiền tố hỏng |
| T2 JiraExportParser | DONE (chờ review) | — | Câu chữ MSG22 theo SRS | 13 test viết trước code; thông báo nêu dòng của task hỏng (DS-07b); CI xanh trên Develop |
| T3 Chuẩn bị review | IN_PROGRESS (quá hạn 14/11) | — | MoJoFM giữa 2 người viết (chờ Reference B); ý kiến thầy | [review-preparation.md](review-preparation.md); `npm run jira-preview` với file mẫu |
| T4 Task, sprint, liên kết commit | DONE (chờ review) | — | UAT U-T7 | WF07-01…10, WF07-E2E, SM-09/SM-10, tác động kiến trúc của task (DS-07a); UAT U-T1…U-T6 pass |
| T5 Quy ước commit | DONE (chờ review) | Kiểu finding D5 | Đức xác nhận kiểu finding và chính sách e-mail; UAT U-V2 | `commit-convention` (10), conformance (+3), N-07; UAT U-V1 pass |
| T6 Hoàn tất 5 tham chiếu | IN_PROGRESS | — | Reference B cho 2 repo; cả A và B cho actual, react-admin, outline; MoJoFM; thống nhất; giao Công trước C11 | [architecture-reference-evaluation.md](architecture-reference-evaluation.md) |
| T7 Màn hình tổ chức cho admin | DONE (chờ review) | Xem metadata (T44) | — | S13, S14, `organization-suspension`, chặn chuyển workspace vào tổ chức bị khoá, thông báo cho thành viên; UAT U-O1…U-O3 pass |
| T8 Độ chính xác extractor | IN_PROGRESS | Công cụ, test | Nhãn của 2 người; quyết định về file test `*-test.ts` | 5 phiếu seed 2026, tái lập đã kiểm; [extractor-evaluation-report.md](extractor-evaluation-report.md) |
| T9 Gán nhãn tập kiểm tra | BLOCKED | Công cụ RQ1-B | Chờ C11 (Công), C11 chờ T6 | [test-set-annotation-report.md](test-set-annotation-report.md) (quy trình) |
| T10 Test WF-02, WF-07 | DONE (chờ review) | — | — | Đúng cơ cấu BM04: WF-02 8 test, WF-07 10 test, **18 / 18 trong CI** (BM04 yêu cầu ≥ 9); N-02 p95 ≤ 89,1 ms; CI xanh |
| T11 Thesis: chương đánh giá | IN_PROGRESS | — | Số liệu RQ1 / EX (chờ nhãn); Công ghép | [thesis-evaluation-content.md](thesis-evaluation-content.md) |
| T12 Report 5 | IN_PROGRESS | report5-test-plan.md (T07) | Bảng kết quả cho cả 101 test của nhóm cần phần của các thành viên khác | [report-5-test-plan-and-results.md](report-5-test-plan-and-results.md) §7 đối chiếu BM04 cho 18 test của Trường; UAT §5 |
| T13 Kiểm tra cuối | BLOCKED | — | Quyền staging; PR / CI | [final-verification-report.md](final-verification-report.md) (phần cục bộ) |

"DONE (chờ review / CI)": đã code, có test, test pass cục bộ, tài liệu đã cập nhật. Theo quy ước nhóm, việc chỉ xong khi đã merge qua PR có review và CI xanh: **chưa đạt**, vì các nhánh chưa được push.

## 5. Nhánh và thứ tự PR đề xuất

| Thứ tự | Nhánh | Nền | Task |
|---|---|---|---|
| 1 | `Feature/TaskTracking-DeveloperAnalyst` | `Develop` | T2, T4 |
| 2 | `Feature/OrganizationSuspension-SystemAdministrator` | `Develop` (độc lập) | T7 |
| 3 | `Feature/CommitConvention-DeveloperAnalyst` | nhánh 1 | T5 |
| 4 | `Feature/WorkflowTests-DeveloperAnalyst` | nhánh 3 | T10 (và sửa Compare cho N-02) |
| 5 | `docs/evaluation-truong` | nhánh 4 | T1, T3, T6, T8, T9, T11, T12, T13 (tài liệu và công cụ đánh giá) |

Nhánh 3–5 xếp chồng: mở PR theo thứ tự, PR sau chỉ còn diff riêng của nó khi PR trước đã merge.

## 6. Diễn giải đã chọn (cần đối chiếu SRS / BM04)

| Chỗ | Diễn giải | Vì sao |
|---|---|---|
| Định dạng Jira | JSON của Jira issue search (`{ issues: [{ key, fields }] }`, có thể kèm `names`), hoặc mảng issue | Là định dạng JSON Jira xuất ra; story points / sprint là custom field nên tìm theo tên qua `names`, nếu không thì theo id mặc định của Jira Cloud / Server |
| MSG22 | "task N in the file has no key … Nothing was imported", trả `fields.messageId = "MSG22"` | Câu chữ thật của MSG22 nằm trong SRS |
| Trường tuỳ chọn | Thiếu status / assignee / points / sprint → `null` (sprint null = backlog); **sai kiểu** thì từ chối cả file | Không bỏ qua dữ liệu sai một cách lặng lẽ |
| Export rỗng | Từ chối | Nếu chấp nhận, mọi task sẽ bị đánh dấu removed |
| Task có nhiều sprint | Sprint đang active, nếu không thì sprint cuối trong danh sách | Jira giữ sprint cũ của task bị chuyển sprint |
| Tiến độ sprint | Done / tổng, **không tính task removed**; sprint rỗng là `n/a`, không phải 0 % | 0 % sẽ ngụ ý còn việc |
| Quy ước commit | Scope bắt buộc; `Task:` bắt buộc khi commit đổi phụ thuộc giữa component; merge / revert của git được miễn; mọi finding là `warning` | Theo đúng chữ `type(scope): summary` và "kèm Task:, Arch-Change: khi đổi kiến trúc" |
| Tạm khoá tổ chức | Đóng mọi workspace của tổ chức với mọi người (kể cả owner), owner không sửa được tổ chức, token agent bị chặn; không xoá dữ liệu; cần lý do | UC-25 không có trong repo |
| SM-09, SM-10 | **Đã đối chiếu BM04 §6.7:** SM-09 là máy trạng thái của Task (4 chuyển trạng thái), SM-10 của Sprint (2). Cách gán theo luồng ở bản trước là sai và đã bỏ | Report 5 §7.2 |
