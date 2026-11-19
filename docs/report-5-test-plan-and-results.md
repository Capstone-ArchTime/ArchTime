# Report 5: Test plan và kết quả, phần của Trường (T10, T12)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày chạy | 2026-11-16 |
| Nguồn | BM04 §6.2 (WF-02), §6.7 (WF-07), §7, §8; danh sách việc T10, T12 |
| Kế hoạch chung | [report5-test-plan.md](report5-test-plan.md) (mức kiểm thử, môi trường, tiêu chí pass/fail dùng chung); [system-test-report.md](system-test-report.md) (S01–S12); [d11-test-cases-wf05-wf08-wf09.md](d11-test-cases-wf05-wf08-wf09.md) (phần của Đức) |
| Môi trường | Windows 11, Node.js 22.15.0, MongoDB cục bộ `127.0.0.1:27017` (test tạo database tạm và xoá sau khi chạy), git 2.50 |
| CI | `.github/workflows/ci.yml` chạy toàn bộ test BE (MongoDB 8) và FE ở mỗi lần push; job BE fail nếu có test bị bỏ qua. **Các nhánh của đợt này chưa được push, nên CI chưa chạy trên chúng** (mục 6) |

## 1. Phạm vi

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| WF-02 Analyse architecture evolution; WF-07 Track project work against architecture changes | Chất lượng kiến trúc khôi phục (RQ1, cần nhãn người) |
| F-04 Comparison & evidence; F-13 Project tasks & sprints (Jira export) | Độ chính xác extractor (T8, cần nhãn người) |
| RF-07 (Jira), RF-14 (tạm khoá tổ chức), RF-30 (quy ước commit) | Giao diện trên trình duyệt (chưa có test tự động; UAT ở mục 5) |
| N-02 Performance ≤ 1 s | Staging (chưa có quyền truy cập) |

## 2. Chiến lược

- **Tự động, chạy trong CI:** mọi test dưới đây nằm trong `BE/tests/*.test.mjs` hoặc `FE/tests/*.test.mjs`, nên chạy trong CI ở mỗi lần push (sau khi nhánh được push).
- **HTTP thật:** WF-07 chạy qua router task thật, middleware xác thực thật, `ProjectAccessPolicy` thật và use case thật; lưu trữ trong bộ nhớ (cùng ngữ nghĩa với bản Mongo, được test riêng trên MongoDB thật trong `task-repository.test.mjs`). WF-02 chạy qua **toàn bộ ứng dụng** (`src/app.ts`) trên MongoDB thật.
- **Không phụ thuộc dịch vụ ngoài:** không gọi Jira, GitHub hay mô hình AI. Repo git của test mining được test tự tạo trong thư mục tạm.
- **N-02 đo được, tái lập được:** 1.000 snapshot seed tất định (đồ thị ~120–139 file, ~200–219 cạnh mỗi snapshot), 3 request khởi động, 30 request đo tuần tự, p95 theo nearest-rank.

## 3. Test case WF-02 (8 test, 8 trong CI)

File: `BE/tests/wf02-architecture-evolution.test.mjs`. Dữ liệu chung: một workspace cá nhân với 1.000 snapshot (10 snapshot có tag `v1.0.0`…`v1.9.0`), 30 evidence, một workspace khác có 1 snapshot, chủ workspace và một người ngoài.

| ID | Yêu cầu | Kịch bản | Tiền điều kiện | Kết quả mong đợi | Kết quả thực tế | Pass/Fail | CI |
|---|---|---|---|---|---|---|---|
| WF02-01 | WF-02 | Xem lịch sử theo trang | 1.000 snapshot | 50 dòng mới nhất trước, `meta.total` = 1.000, không có `nodes`/`edges`; trang 20 kết thúc ở commit đầu | Đúng như mong đợi | Pass | Có |
| WF02-02 | WF-02 | Bộ chọn revision tải toàn bộ danh sách tóm tắt | như trên | 1.000 dòng, có tên release (`v1.9.0`, `v1.8.0` mới nhất trước), không có đồ thị | Đúng | Pass | Có |
| WF02-03 | **F-04** | So sánh revision đầu và cuối; so một revision với chính nó | như trên | +19 file, −0 file, 120 file giữ nguyên, có cạnh thêm; so với chính nó: 0 thay đổi | Đúng | Pass | Có |
| WF02-04 | **F-04** | So với revision của workspace khác; id sai; thiếu tham số | snapshot ngoại | 404; 400; 400 | Đúng | Pass | Có |
| WF02-05 | **F-04** | Danh sách evidence | 30 evidence | Trang 10 dòng, `total` 30, mới nhất trước, mỗi dòng có commit và file nguồn | Đúng | Pass | Có |
| WF02-06 | WF-02, bảo mật | Người ngoài và người không đăng nhập đọc lịch sử, so sánh, evidence | người ngoài | 403 và 401 cho cả ba API | Đúng | Pass | Có |
| WF02-07 | **N-02** | p95 khi liệt kê 1.000 snapshot (tóm tắt) và một trang 50 | 1.000 snapshot | p95 ≤ 1.000 ms cho cả hai | Xem mục 3.1 | Pass | Có |
| WF02-08 | N-02 (ghi nhận) | Liệt kê 1.000 snapshot **kèm đồ thị** (cách trang Compare tải trước T10) | 1.000 snapshot | Chỉ ghi số; khẳng định đồ thị chiếm phần lớn dung lượng (> 20 lần bản tóm tắt) | 24,8 MB, xem 3.1 | Pass | Có |

\

### 3.1 N-02: số đo thực tế

Lệnh: `cd BE && node --import tsx --import ./tests/setup-env.mjs --test tests/wf02-architecture-evolution.test.mjs` (số đo in ra dưới dạng diagnostic `# N-02 …`).

| Lần chạy | Liệt kê 1.000 (tóm tắt) p50 / **p95** / max | Một trang 50 p50 / **p95** | Kèm đồ thị (trước sửa) p50 / p95, dung lượng |
|---|---|---|---|
| 1 (nhánh T10) | 41,9 / **66,5** / 67,6 ms | 9,5 / **13,7** ms | 940,8 / 1 064,7 ms, 24,8 MB |
| 2 (nhánh T10) | 32,7 / **47,7** / 48,2 ms | 10,9 / **17,0** ms | 930,8 / 1 001,7 ms |
| 3 (nhánh T10) | 31,3 / **52,1** / 56,4 ms | 9,2 / **11,9** ms | 904,8 / 1 131,9 ms |
| 4 (cây tích hợp, cả bộ test) | 64,8 / **89,1** / 89,6 ms | 14,2 / **20,8** ms | 1 144,4 / 1 215,4 ms |
| Lần đầu (seed qua Mongoose, đồ thị có `_id` cho từng phần tử) | 61,3 / **79,3** / 99,9 ms | 19,3 / **45,7** ms | 2 975,9 / **3 796,7** ms, 36,0 MB |

- **Kết luận:** danh sách 1.000 snapshot mà ứng dụng dùng đạt N-02 với dư lớn (p95 cao nhất đo được 89,1 ms).
- **Lỗi tìm ra nhờ phép đo:** trang Compare (F-04) tải **toàn bộ** snapshot kèm đồ thị: 25–36 MB, p95 1,0–3,8 s với 1.000 snapshot, tức **vi phạm N-02**. Bộ chọn revision chỉ cần tên, ngày, tiêu đề. Đã sửa để gọi `?summary=1` (`FE/src/pages/developer-analyst/Compare.tsx`); `FE/tests/compare-n02.test.mjs` chặn hồi quy.
- **Giới hạn:** đo trên máy phát triển, MongoDB cục bộ, không có độ trễ mạng; chưa đo trên staging. Số đo trên trình duyệt (render) chưa có.

## 4. Test case WF-07 (10 test, 10 trong CI)

File: `BE/tests/wf07-task-tracking.test.mjs` (WF07-01…06, 08…10) và `BE/tests/mining-service.test.mjs` (WF07-07). Dữ liệu: workspace "shop" của owen, mia là maintainer, dev là member, out là người ngoài; workspace "org-app" của tổ chức Acme; System Administrator.

| ID | Yêu cầu | Kịch bản | Tiền điều kiện | Kết quả mong đợi | Kết quả thực tế | Pass/Fail | CI |
|---|---|---|---|---|---|---|---|
| WF07-01 | **F-13**, RF-07 | Maintainer nhập file Jira (3 task, 1 sprint, 1 task backlog) | chưa có task | 3 tạo mới; bảng có key, summary, status, assignee, story points, sprint | Đúng | Pass | Có |
| WF07-02 | F-13, RF-07 | Nhập lại cùng file (lần hai gửi dạng object) | đã nhập | 0 tạo mới, 2 unchanged; vẫn 2 task, 1 sprint | Đúng | Pass | Có |
| WF07-03 | **F-13**, RF-07 | Lần nhập sau thiếu một task | đã nhập 2 task | Task thiếu được đánh dấu `removed`, có `removedAt`, vẫn hiển thị | Đúng | Pass | Có |
| WF07-04 | RF-07, MSG22, BR-25 | File có task thiếu key; file JSON hỏng; thiếu file | đã có ARCH-1 | 400, `messageId` MSG22, nêu "task 2", "Nothing was imported"; ARCH-1 không đổi, ARCH-5 không được tạo; 400; 400 | Đúng | Pass | Có |
| WF07-05 | RF-07, phân quyền | Owner, member, người ngoài, không token, workspace không tồn tại | — | Owner nhập 200; member đọc 200, nhập / relink 403; người ngoài 403; không token 401; 404 | Đúng | Pass | Có |
| WF07-06 | **F-13** | Tiến độ sprint qua ba lần nhập | — | Sprint 1: 2/3 = 67 % (task removed không tính); sprint rỗng: `percent` null; sprint mới 0/1 = 0 % | Đúng | Pass | Có |
| WF07-07 | F-13, RF-07 | Mine commit thật có `Task: ARCH-12` và `T22` trong tiêu đề, batch size 1 | repo git thật 2 commit mới | Hook chạy một lần mỗi batch; trailers được giữ trên snapshot; liên kết ARCH-12 (trailer) và T22 (subject) | Đúng | Pass | Có |
| WF07-08 | F-13 | Commit mine trước khi nhập task; relink | 2 commit đã mine | Nhập tạo 3 liên kết; relink thêm 0 (không trùng); commit hiện dưới từng task | Đúng | Pass | Có |
| WF07-09 | RF-07, quyền riêng tư | System Administrator đọc / nhập task của workspace tổ chức | olga đã nhập ACME-1 | 403, response không chứa "ACME-1"; nhập 403 | Đúng | Pass | Có |
| WF07-10 | F-13 | Commit nêu khoá không phải task (ARCH-404, HTTP2) | — | 0 liên kết; `unknownKeys` liệt kê hai khoá | Đúng | Pass | Có |

Ba test cho mỗi feature: **F-04** = WF02-03, WF02-04, WF02-05; **F-13** = WF07-01, WF07-03, WF07-06.

### 4.1 Test bổ trợ (đơn vị và tích hợp)

| File | Số test | Nội dung |
|---|---:|---|
| `BE/tests/jira-export-parser.test.mjs` | 11 | T2, viết trước code: export hợp lệ, nhiều task, MSG22, JSON hỏng, file không phải export, trường tuỳ chọn thiếu, export rỗng, sai kiểu, sprint (active / cuối cùng / chuỗi Jira Server), tìm field theo `names`, khoá T22 |
| `BE/tests/task-tracking.test.mjs` | 11 | Trích khoá từ commit, kế hoạch nhập, nhập lại, removed / restored, file bị từ chối không ghi gì, tách project, liên kết, tiến độ sprint |
| `BE/tests/task-repository.test.mjs` | 2 | Trên MongoDB thật: hai lần nhập đồng thời vẫn một document mỗi khoá; liên kết duy nhất; commit lấy từ snapshot, bỏ commit đã bị force-push |
| `BE/tests/mining-plan.test.mjs` | +1 | `git log` thật: trailers `Task:`, `Arch-Change:` được đọc |
| `BE/tests/mining-service.test.mjs` | +1 | Hook liên kết lỗi chỉ ghi log, không làm hỏng job mining |
| `BE/tests/commit-convention.test.mjs` | 10 | T5: message hợp lệ / sai, thiếu scope, thiếu summary, task, Arch-Change, khớp / lệch với thay đổi thật, nhiều component, commit đầu tiên, file không thuộc component |
| `BE/tests/conformance-check.test.mjs` | +2 | T5 trong use case: finding `convention` cạnh finding cũ; quyết định không chuyển sang commit khác |
| `BE/tests/conformance-repository.test.mjs` | +1 | T5 trên MongoDB: message và đồ thị base của snapshot |
| `BE/tests/nfr-n07-n08.test.mjs` | (sửa) | N-07 giờ kiểm cả finding `convention` là tất định |
| `BE/tests/system-permissions.test.mjs` | +2 | **S13, S14** (T7, mục 4.2) |
| `BE/tests/organization-suspension.test.mjs` | 3 | T7: ghi có điều kiện trên MongoDB, token agent bị chặn, policy |
| `BE/tests/reference-agreement.test.mjs` | 6 | T1/T6: MoJoFM giữa hai tham chiếu (ví dụ tính tay), luật độc lập |
| `FE/tests/tasks.test.mjs` | 5 | Trang Tasks & Sprints: tiến độ, lọc, đọc dữ liệu, tóm tắt nhập, quyền vào trang |
| `FE/tests/admin-organizations.test.mjs` | +4 | T7: trạng thái, lý do, gọi API suspend / reactivate, thông báo 403 |
| `FE/tests/conformance.test.mjs`, `layout.test.mjs` | (sửa) | Loại finding `convention`; mục Tasks & Sprints trong nhóm Analyze |
| `FE/tests/compare-n02.test.mjs` | 1 | Compare chỉ tải bản tóm tắt |

### 4.2 System test tổ chức (T7, RF-14, UC-25)

| ID | Kịch bản | Kết quả mong đợi | Thực tế |
|---|---|---|---|
| S13 | Chỉ System Administrator tạm khoá / mở lại, có lý do | Không token 401; owner, member 403; thiếu lý do 400; tổ chức không có 404; khoá 200 kèm người khoá và lý do, không có repoUrl / mô tả project; khoá lần hai 409; danh sách có trạng thái; audit `ORGANIZATION_SUSPEND` / `REACTIVATE`; mở lại lần hai 409 | Pass |
| S14 | Trong lúc khoá | Alice (owner), bob, carl: 403 cả metadata, đọc, ghi, thông báo có chữ "suspended"; owner không sửa được tổ chức (403) nhưng vẫn thấy tổ chức (200); tổ chức Beta và project cá nhân không bị ảnh hưởng; admin vẫn chỉ metadata; mở lại thì quyền trở về như cũ, không mất thành viên | Pass |

## 5. UAT thủ công (chạy ngày 2026-11-16)

Môi trường: máy phát triển, `npm run dev` (BE + FE), MongoDB cục bộ, tài khoản của `npm run seed:demo`. Workspace demo "Dự án lớn" của eve trỏ tới một repo git cục bộ có 4 commit (`ffd4807` có `Task: ARCH-12`; `9858b3e` thêm phụ thuộc Billing → Orders nhưng ghi `Arch-Change: none`; `f98f807 update stuff`; `87446ea fix(orders): T22 rounding`). Mine repo cục bộ cần `ARCHTIME_ALLOW_LOCAL_REPOS=true`. Người chạy: Đặng Nhật Trường, đối chiếu từng bước qua ảnh chụp màn hình.

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| U-T0 | `npm run jira-preview` trên hai file mẫu | 5 task; Sprint 2: 1/3 (33 %); Sprint 1 n/a; Backlog 1; file thứ hai: `REFUSED [MSG22] … task 3 … Nothing was imported` | **Pass** |
| U-T1 | (DS-07a) *Tasks & Sprints*, nhập `jira-export-sample.json` | 5 task mới; Sprint 2: 1/3 done (33 %) · 3/10 points; Sprint 3: 0/1; Sprint 1: "No tasks"; Backlog: 0/1; ARCH-12 có 1 commit mine **trước** khi nhập | **Pass** (lần đầu **Fail**, xem K9) |
| U-T2 | Nhập `jira-export-msg22-sample.json` | Hộp đỏ "The export was not imported", nêu MSG22 và task 3; dữ liệu không đổi (giờ "last import" giữ nguyên) | **Pass** |
| U-T3 | Mở dòng ARCH-12 | Commit `ffd4807 feat(orders): order model`, nhãn "Task: trailer" | **Pass** |
| U-T4 | Nhập lại cùng file | "0 new, 0 updated, 5 unchanged"; vẫn 5 task | **Pass** |
| U-T5 | Nhập file thiếu ARCH-13 | "4 tasks, 1 removed"; Sprint 2 thành 1/2 (50 %); ARCH-13 chỉ hiện khi bật "Show removed tasks", gạch ngang, nhãn removed | **Pass** |
| U-T6 | (DS-07b) Mine thêm 3 commit | T22 có commit `87446ea` (khớp qua tiêu đề); ARCH-13 (removed) vẫn có commit `9858b3e` (trailer); "3 linked commits" | **Pass** |
| U-T7 | Member (không phải maintainer) mở trang | Không có nút Import / Link | Chưa chạy |
| U-V1 | Conformance Findings, commit `9858b3e` | "Commit convention": Billing → Orders … declares "Arch-Change: none"; kèm finding Undeclared dependency của D5 | **Pass** |
| U-V2 | Commit `f98f807`; Dismiss nó; xem lại `9858b3e` | Finding "subject … is not type(scope): summary"; Dismiss không lan sang commit khác | Chưa chạy |
| U-C1 | (DS-02a) Compare `ffd4807` → `87446ea`, xem tab Network | Danh sách gọi `snapshots?summary=1`; Dependencies +1/−0; mũi tên mới billing → orders; change log "bill.ts → order.ts" | **Pass** |
| U-C2 | (DS-02b) Changes & Evidence, mở evidence `9858b3e` | +1 added / −0 removed, file `src/billing/bill.ts`, nhãn INFERENCE. Phần component bị ảnh hưởng ghi "Not grouped into components yet" vì workspace chưa được phân cụm ở Architecture Map (đúng thiết kế) | **Pass** |
| U-O1 | Admin khoá Acme có lý do | Status Suspended; khung ghi thời điểm, người khoá, lý do, "Nothing was deleted"; chỉ metadata; đủ 4 thành viên | **Pass** (lần đầu **Fail**, xem K9) |
| U-O2 | bob đăng nhập trong lúc khoá | Không thấy workspace nào của Acme; mở thẳng acme-api: 403 "organization is suspended" | **Pass**, nhưng trang Workspaces chỉ hiện "Create your first workspace", không nói lý do (K10) |
| U-O3 | Admin Reactivate | Acme Active; bob thấy lại acme-api như trước | **Pass** |
| U-T8 | (DS-07b) Nhập lại `jira-export-msg22-sample.json` sau khi thêm số dòng | *MSG22: task 3 (line 7) …*; dòng 7 của file đúng là task thiếu key | **Pass** |
| U-T9 | (DS-07a) Mở ARCH-13 (removed), T22, ARCH-12 | ARCH-13: "1 commit, 1 changing dependencies between components in Billing, Orders", thẻ +1/−0, Billing → Orders +1, nút xem evidence; T22 và ARCH-12: +0/−0, không có cạnh | **Pass** (link evidence lúc đầu quá nhỏ: đổi thành nút "View evidence", K11) |
| U-T10 | (SM-09, SM-10) Nhập `jira-sm-1`…`jira-sm-5` | ARCH-14: To Do → In Progress → In Review → In Progress → In Review → Done; Sprint 3 Future → Active; Sprint 2 Active → Closed, 2/2 (100 %); vẫn 4 task, 1 removed, 3 commit liên kết | **Pass** |
| U-O4 | Tổ chức bị khoá: bob và alice mở chi tiết Acme | Cảnh báo vàng có thời điểm và lý do; không có nút Edit; owner không còn form thêm thành viên, ô đổi vai trò, nút Remove; member vẫn có nút Leave | **Pass** sau khi sửa K12 (lần đầu owner vẫn thấy các nút quản lý thành viên) |

## 6. Kết quả toàn bộ bộ test (đã chạy)

| Cây mã | BE | FE | `tsc` BE | `tsc -b` + build FE | oxlint |
|---|---|---|---|---|---|
| Develop `718415e` (trước đợt này) | 685 / 685 | 404 / 404 | — | — | — |
| `Feature/TaskTracking-DeveloperAnalyst` (T2, T4) | 721 / 721 | 409 / 409 | Sạch | Sạch | Không cảnh báo mới |
| `Feature/CommitConvention-DeveloperAnalyst` (+T5) | 734 / 734 | 409 / 409 | Sạch | Sạch | Không cảnh báo mới |
| `Feature/OrganizationSuspension-SystemAdministrator` (T7, từ Develop) | 690 / 690 | 408 / 408 | Sạch | Sạch | Không cảnh báo mới |
| `Feature/WorkflowTests-DeveloperAnalyst` (+T10) | 742 / 742 | 410 / 410 | Sạch | Sạch | Không cảnh báo mới |
| **Cây tích hợp** (mọi nhánh trên + công cụ đánh giá, nhánh tạm đã xoá) | **753 / 753**, 0 bỏ qua | **414 / 414** | Sạch | Sạch | Không cảnh báo mới |

"Không cảnh báo mới": `oxlint` không báo gì trong các file đã thêm hoặc sửa; các cảnh báo cũ (ví dụ `Projects.tsx`) vẫn còn.

## 7. Đối chiếu với BM04 Review 2 (phần của Trường)

Nguồn: `SWP490_FA26SE279_R2_Commitment.pdf` (BM04 Review 2), §6.2 WF-02, §6.7 WF-07, §4 N-02, §8 và §9. BM04 cam kết **101 test case cho cả nhóm, 52 tự động trong CI**; phần của Trường là **18 test, ít nhất 9 trong CI**, 4 demo (DS-02a, DS-02b, DS-07a, DS-07b).

### 7.1 WF-02: 8 test (BM04: 4 trong CI)

| Loại (BM04) | Mã BM04 | Test | CI |
|---|---|---|---|
| Feature F-04 | FE-04-TC01 | WF02-03: so hai revision, liệt kê file / phụ thuộc thêm, bớt, giữ nguyên | Có |
| Feature F-04 | FE-04-TC02 | WF02-04: không so được revision của workspace khác, id sai, thiếu tham số | Có |
| Feature F-04 | FE-04-TC03 | WF02-05: evidence của thay đổi; component giữ / đổi tên / tách / gộp: `component-matching.test.mjs` | Có |
| Feature F-06 | FE-07-TC01 | Mọi claim có nhãn; FACT không trích dẫn hạ xuống INFERENCE (`mentor-claim-labels.test.mjs`) | Có |
| Feature F-06 | FE-07-TC02 | Chỉ trích dẫn commit có thật; hash bịa bị gỡ (`mentor-claim-labels.test.mjs`) | Có |
| Feature F-06 | FE-07-TC03 | Câu hỏi thứ 16 trong một phút bị từ chối (MSG10), không gọi mô hình (`mentor-claim-labels.test.mjs`, mới) | Có |
| End-to-end | DS-02a | WF02-E2E: so sánh → mở evidence → hỏi mentor trên ứng dụng thật và MongoDB; câu trả lời có nhãn, chỉ trích dẫn commit đã mine | Có |
| NFR N-02 | N-02 | WF02-07: p95 liệt kê 1.000 snapshot ≤ 1 s (đo: 47,7–89,1 ms) | Có |

**8 / 8 tự động, 8 trong CI** (BM04 yêu cầu 4). Ngoài 8 test trên còn các test bổ trợ WF02-01, 02, 06, 08.
**DS-02b** (mô hình đăng ký với key sai → giữ kết quả phân cụm, nêu lý do MSG08): đã có trong `architecture-refine-service.test.mjs` ("when the model cannot give a verifiable answer, the clustering result is stored with the reason", "a job whose model fails still completes and says it did so without AI").

### 7.2 WF-07: 10 test (BM04: 5 trong CI)

| Loại (BM04) | Mã BM04 | Test | CI |
|---|---|---|---|
| Feature F-13 | FE-14-TC01 | WF07-02: nhập cùng file hai lần, không trùng task | Có |
| Feature F-13 | FE-14-TC02 | WF07-07 (mining thật) và WF07-08: commit "T22 …" / "ARCH-12 …" được liên kết sau khi mine | Có |
| Feature F-13 | FE-14-TC03 | WF07-06: tiến độ sprint = Done / tổng; WF07-05: Member nhập → 403 | Có |
| End-to-end | DS-07a | WF07-E2E: nhập file 2 sprint → liên kết commit đã mine → mở T47: commit, evidence, component | Có |
| SM-09 (Task) | T1 | To Do → In Progress (`wf07-state-transitions.test.mjs`) | Có |
| SM-09 (Task) | T2 | In Progress → In Review | Có |
| SM-09 (Task) | T3 | In Review → Done (tiến độ sprint tính task) | Có |
| SM-09 (Task) | T4 | In Review → In Progress (làm lại) | Có |
| SM-10 (Sprint) | S1 | Future → Active | Có |
| SM-10 (Sprint) | S2 | Active → Closed | Có |

**10 / 10 tự động, 10 trong CI** (BM04 yêu cầu 5). **DS-07b** (file có task thiếu key → từ chối, chỉ ra dòng của task hỏng, task cũ không đổi): WF07-04 và `jira-export-parser.test.mjs` ("DS-07b: a refusal names the line…"); thông báo: *MSG22: task 3 (line 7) in the file has no key…*.

### 7.3 Tiêu chí đạt ở Defense 1.1 (BM04 §6.2, §6.7)

| Tiêu chí | WF-02 | WF-07 |
|---|---|---|
| Chạy end-to-end trên staging với dữ liệu seed | **Chưa** (chưa có quyền staging); đạt trên máy phát triển | **Chưa**; đạt trên máy phát triển |
| Kịch bản chính đạt | Đạt cục bộ (WF02-E2E, UAT U-C1, U-C2) | Đạt cục bộ (WF07-E2E, UAT U-T1…U-T6) |
| Kịch bản ngoại lệ đạt | 1 / 1 (DS-02b, test tự động) | 1 / 1 (DS-07b) |
| Tỉ lệ test đạt ≥ 90 %; 100 % test đường chính | 100 % | 100 % |
| Lỗi Critical / High còn mở | 0 (K1, K9 đã sửa) | 0 |

### 7.4 Chỗ lệch giữa danh sách việc và BM04 (cần nhóm xác nhận)

| Mục | Danh sách việc (12/11) | BM04 Review 2 | Ghi chú |
|---|---|---|---|
| RF của Trường | RF-07, RF-14, RF-24, RF-30 | §8.2 "Required fixes owned": RF-07, RF-14, **RF-15, RF-16** | RF-15 (mine theo release tag, T17) và RF-16 (FACT không trích dẫn → INFERENCE, T31) đã làm ở đợt trước, có test: `mining-plan`, `mining-service` (milestones) và `mentor-claim-labels`. RF-24 (tham chiếu RQ1) và RF-30 (quy ước commit) có trong danh sách việc; chủ của RF-24 trong bảng §9 cần đối chiếu lại |
| Workflow của F-13 | WF-07 | Bảng §8.1 ghi F-13 ở dòng WF-04 (Bảo) nhưng §6.7 và §2 ghi WF-07 / Trường | Có thể do bảng bị lệch cột khi xuất PDF |
| Câu chữ MSG22 | "task thiếu key (MSG22)" | Không có trong BM04 | Cần SRS; hiện dùng câu tự diễn giải |

## 8. Lỗi đã biết và hạn chế

| # | Mô tả | Mức | Trạng thái |
|---|---|---|---|
| K1 | Compare tải mọi đồ thị snapshot (vi phạm N-02 ở 1.000 snapshot) | Cao | **Đã sửa** trong T10 |
| K2 | Snapshot mine trước đợt này không có trailers: liên kết task chỉ dùng tiêu đề; quy ước commit chỉ kiểm được tiêu đề | Thấp | Ghi nhận; mine lại với `force` nếu cần |
| K3 | Finding `convention` được gửi e-mail như finding khác (RF-29): repo có nhiều commit không theo quy ước sẽ nhận nhiều e-mail ở lần check đầu | Trung bình | Cần Đức quyết định (lọc theo loại, hoặc chỉ commit sau baseline mới) |
| K4 | `CONFORMANCE_VERSION` tăng lên `conformance-2`: lần check tự động đầu tiên sau khi deploy kiểm lại mọi snapshot sau baseline | Thấp | Có chủ đích, một lần |
| K5 | Test file theo kiểu `*-test.ts` không bị `isAnalyzable` loại | Trung bình | Ghi ở [extractor-evaluation-report.md](extractor-evaluation-report.md) §6, chờ nhóm quyết định |
| K6 | Tạm khoá tổ chức: job mining đang chạy không bị dừng; e-mail finding vẫn có thể gửi cho maintainer của tổ chức bị khoá | Thấp | Ghi nhận |
| K7 | Giao diện chưa có test trình duyệt tự động | Trung bình | UAT mục 5 |
| K8 | Câu chữ MSG22 chưa đối chiếu với SRS (SM-09 / SM-10 đã đối chiếu với BM04, mục 7) | Thấp | Cần SRS |
| K9 | Nút Import Jira và nút Suspend gửi JSON mà không có `Content-Type` (`apiRequest` không tự thêm), nên server thấy body rỗng: "Attach the Jira export file". Test FE giả lập `fetch` nên không bắt được | Cao | **Đã sửa** (`fix/json-content-type`); test kiểm header và quét mọi `apiRequest` có body JSON |
| K10 | Thành viên của tổ chức bị khoá chỉ thấy danh sách workspace trống, không có lời giải thích; owner vẫn chuyển được workspace cá nhân **vào** tổ chức đang bị khoá | Trung bình | **Đã sửa** (`fix/suspended-org-notice`): thông báo trên Workspaces, thẻ "Suspended" và cảnh báo trên Organizations, tổ chức bị khoá không còn trong danh sách nơi tạo workspace; chuyển workspace vào tổ chức bị khoá trả 403 |
| K11 | Link "Evidence" của commit trong Tasks & Sprints là chữ nhỏ, khó thấy | Thấp | **Đã sửa** (`fix/task-evidence-button`): nút "View evidence" có viền và biểu tượng |
| K12 | Khi tổ chức bị khoá, owner vẫn **gỡ được thành viên khác** (`removeMember` không kiểm tra trạng thái khoá), và tab Members vẫn hiện form thêm, ô đổi vai trò, nút Remove | Trung bình | **Đã sửa** (`fix/suspended-org-members`): server trả 403 khi gỡ người khác, vẫn cho tự rời; giao diện chỉ còn nút Leave; system test S15 (đã thử bỏ bản sửa, S15 fail) |
