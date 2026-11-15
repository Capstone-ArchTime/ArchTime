# Kiểm tra cuối, phần của Trường (T13)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 §9; danh sách việc T13 |
| Bản kiểm tra | Cây tích hợp cục bộ của các nhánh `Feature/TaskTracking-DeveloperAnalyst`, `Feature/CommitConvention-DeveloperAnalyst`, `Feature/OrganizationSuspension-SystemAdministrator`, `Feature/WorkflowTests-DeveloperAnalyst`, `docs/evaluation-truong` (nền `Develop` `718415e`) |
| Môi trường | Máy phát triển (Windows 11, Node 22.15, MongoDB cục bộ); **không phải staging** |
| Trạng thái | **BLOCKED cho phần staging**: chưa có quyền vào staging, các nhánh chưa được push, CI chưa chạy, chưa được review. Phần kiểm tra cục bộ đã làm (mục 2). |

> Tài liệu này **không** khẳng định đã kiểm tra trên staging hay CI xanh. Cột "Staging" để trống cho tới khi có quyền.

## 1. Các RF của mình (BM04 §9)

| RF | Nội dung | Làm ở | Bằng chứng (cục bộ) | Trạng thái đề xuất | Còn thiếu để Done |
|---|---|---|---|---|---|
| RF-07 | Nhập task / sprint từ Jira, MSG22, liên kết commit | T2, T4 | `jira-export-parser` (11), `task-tracking` (11), `task-repository` (2, MongoDB), WF07-01…10; parser chạy trên `docs/samples/*.json` | **Đã làm, chờ review** | PR + review + CI xanh; UAT U-T1…U-T4; đối chiếu câu chữ MSG22 với SRS |
| RF-14 | Admin xem tổ chức (chỉ metadata), tạm khoá / mở lại | T7 (T44 làm phần xem) | S01, S11–S14, `organization-suspension` (3), FE `admin-organizations` (+4) | **Đã làm, chờ review** | PR + review + CI; UAT U-O1 |
| RF-24 | Kiến trúc tham chiếu 5 repo, đồng thuận MoJoFM | T1, T6 | Công cụ `reference-agreement` + 6 test; mẫu và hướng dẫn | **BLOCKED** | Cần hai người viết tham chiếu cho 5 repo; số MoJoFM; giao Công |
| RF-30 | Quy ước commit, finding `convention` | T5 | `commit-convention` (10), `conformance-check` (+2), `conformance-repository` (+1), N-07 | **Đã làm, chờ review** | PR + review + CI; Đức xác nhận dùng chung kiểu finding (D5) và cách gửi e-mail (K3 ở Report 5); UAT U-V1 |

## 2. Luồng, chức năng, NFR

| Mục | Kiểm tra | Cục bộ | Staging |
|---|---|---|---|
| WF-02 | 8 test qua ứng dụng thật trên MongoDB | 8 / 8 pass | — |
| WF-07 | 10 test (HTTP thật + mining thật) | 10 / 10 pass | — |
| F-04 | So sánh, ranh giới project, evidence | WF02-03…05 pass | — |
| F-13 | Nhập, removed, tiến độ sprint, liên kết | WF07-01, 03, 06 pass | — |
| N-02 | p95 liệt kê 1.000 snapshot ≤ 1 s | p95 47,7–89,1 ms qua 4 lần đo | — |
| Phân quyền API | Người ngoài, member, admin, không token | WF02-06, WF07-05, WF07-09, S13, S14 pass | — |
| Nhất quán dữ liệu | Nhập lại không trùng, liên kết không trùng (index duy nhất trên MongoDB), tạm khoá ghi có điều kiện | `task-repository`, `organization-suspension` pass | — |
| Tính tiến độ | Done / tổng, bỏ task removed, sprint rỗng `n/a` | WF07-06, `task-tracking` pass | — |
| Toàn bộ bộ test | BE 753 / 753 (0 bỏ qua), FE 414 / 414, `tsc`, build, oxlint | Sạch | CI: chưa chạy |

## 3. Demo

| Demo | Kịch bản | Trạng thái |
|---|---|---|
| DS-02a | Compare hai release của một workspace đã mine | Chưa chạy trên trình duyệt; phần API đã kiểm bằng WF02-02…04 |
| DS-02b | Changes & Evidence, mở evidence, xem component bị ảnh hưởng | Chưa chạy trên trình duyệt; WF02-05 |
| DS-07a | Nhập `docs/samples/jira-export-sample.json`, xem tiến độ sprint | Chưa chạy trên trình duyệt; WF07-01, 06 |
| DS-07b | Mine commit có `Task:`, thấy commit dưới task; file MSG22 bị từ chối | Chưa chạy trên trình duyệt; WF07-04, 07, 08 |

## 4. Việc để đóng T13

1. Push 5 nhánh, mở PR vào `Develop` (thứ tự ở [implementation-audit.md](implementation-audit.md) §5), chờ CI xanh và ít nhất 1 người review.
2. Có quyền staging: deploy, chạy DS-02a/b, DS-07a/b, UAT ở [report-5-test-plan-and-results.md](report-5-test-plan-and-results.md) §5; đo lại N-02 trên staging (cùng test WF02-07, trỏ `MONGODB_TEST_URI` vào database staging tạm, hoặc đo bằng trình duyệt).
3. Cập nhật dòng RF-07, RF-14, RF-30 trong BM04 §9 thành Done **sau** bước 1–2; RF-24 sau T6.
