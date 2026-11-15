# D14: Kiểm tra cuối (phần của Đức)

| | |
|---|---|
| Ngày | 2026-11-15 |
| Bản kiểm tra | `Develop` tại `cebc4fd` |
| Môi trường | Máy phát triển (Windows 11, Node 24, MongoDB cục bộ), database tạm; chưa có staging |
| CI | [Run trên Develop](https://github.com/Capstone-ArchTime/ArchTime/actions): xanh từ `312c431` đến `38582b1` |

## 1. Các RF của mình (BM04 §9)

| RF | Nội dung | Làm ở | Commit | Bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| RF-21 | Gia hạn phiên khi access token hết hạn (lỗi #7) | D1 | `e87a579` | `FE/tests/api-client.test.mjs`; chạy thật với token 3 giây | Done |
| RF-08 | Path prefix cho component; kiểm tra tuân thủ kiến trúc, quyết định, giải thích | D2, D3, D5 | `9b144b2`, `2162b6d`, `1690069` | `component-path-prefixes`, `conformance*`, `nfr-n07-n08` | Done |
| RF-29 | Check tự động sau fetch/mine; e-mail một lần; finding chưa đọc trong app (MSG26) | D6 | `0f1f7ec` | `conformance-notify`, `conformance-repository`; mục 2 (DS-08) | Done |
| RF-09 | Agent context API, project token, AGENTS.md | D7 | `696c0c8` | `agent-context`, `nfr-n07-n08` (N-08) | Done |
| RF-11 | Chuyển workspace cá nhân vào tổ chức (MSG18) | D8 | `01a9b32` | `project-transfer` | Done |
| RF-19 | Liên kết / gỡ GitHub trong Profile | D9 | `b06c2a1` | `github-link` (BE, FE) | Done; chưa thử với OAuth app GitHub thật |

Yêu cầu phi chức năng:

| NFR | Mục tiêu | Kết quả |
|---|---|---|
| N-07 | 100 % finding giống hệt, 0 bản trùng | Đạt: check lại 3 lần (`nfr-n07-n08`) và check lại có `force` trong mục 2: cùng finding, cùng id, không trùng |
| N-08 | 0 lần lộ dữ liệu | Đạt: token của project A không đọc được gì của B (tham số, header), mọi API khác 401; đã thử cài lỗ hổng để chắc test bắt được |
| N-01 | ≤ 20 phút với 4/5 người dùng | **Chưa đo**: cần 5 người dùng thử ([d11-test-cases-wf05-wf08-wf09.md](d11-test-cases-wf05-wf08-wf09.md) §5) |

## 2. Demo DS-05, DS-08, DS-09

Chạy bằng một script end-to-end trên **ứng dụng thật** (router, middleware, use case, repository), **MiningService thật**
trên một repo git 3 commit, và một database tạm (xoá sau khi chạy). E-mail được chặn lại để kiểm tra nội dung, không gửi
qua SMTP. Kết quả: **34/34 bước đạt**.

| Demo | Bước kiểm tra | Kết quả |
|---|---|---|
| DS-08a | Mine commit đầu; xác nhận sơ đồ (baseline = commit đầu); mine tiếp | Check tự chạy; 3 finding đúng loại trên 2 commit sau baseline; không có finding trước khi xác nhận |
| DS-08a | E-mail | Chủ workspace và maintainer nhận đúng 1 e-mail; thành viên thường không; mỗi vấn đề một dòng; có link; fetch sau đó không gửi lại |
| DS-08b | MSG26, quyết định | Số chưa đọc đúng cho từng người; mở findings thì về 0 cho riêng người đó; member không quyết định được (403); Accept cần lý do; Accept áp dụng cho commit sau |
| N-07 | Check lại có `force` | Vẫn 3 finding, không trùng |
| DS-05a | Mentor soạn và giao learning path; newcomer học | Newcomer đọc được path; trả lời sai không qua, đúng thì xong bước; tiến độ 100 % |
| DS-05b | Xem tiến độ | Mentor xem được tiến độ nhóm; newcomer không xem được của người khác (403) |
| DS-09a | Token, context | Member không tạo được token; context nêu đúng component *Billing* và phụ thuộc bị cấm *Orders*; không có source code |
| DS-09b | AGENTS.md, thu hồi | AGENTS.md sinh từ sơ đồ đã xác nhận; token không mở API khác (401); thu hồi xong bị từ chối ngay |
| D8 | Chuyển vào tổ chức | Xem trước nêu đúng 2 người mất quyền; lịch sử đi theo; người ngoài tổ chức mất quyền (403); workspace thứ hai cùng repo bị MSG18 |
| D9 | Gỡ GitHub | Gỡ khi chưa liên kết bị từ chối (409) |

Ngoài ra, giao diện của từng chức năng đã được thử trên trình duyệt trong lúc làm (D2–D9) và chụp lại trong
[user-guide/conformance-agents-guide.md](user-guide/conformance-agents-guide.md).

## 3. Bộ test

| | Kết quả |
|---|---|
| Backend | 685/685 pass, 0 bị bỏ qua (có MongoDB); `tsc` sạch |
| Frontend | 404/404 pass; `tsc -b`, `oxlint` (không thêm cảnh báo mới), `vite build` sạch |
| CI | Mỗi lần push chạy cả hai; job BE fail nếu có test bị bỏ qua |

## 4. Còn mở

| Việc | Ai | Ghi chú |
|---|---|---|
| Chạy demo trên **staging** | Nhóm | Chưa có quyền vào staging; kịch bản ở mục 2 chạy lại được |
| Chạy RQ2 đầy đủ và chấm | Nhóm (2 người chấm) | Mine nest và ArchTime trước; [rq2-protocol.md](rq2-protocol.md) |
| Đo N-01 | Nhóm | 5 người dùng thử |
| Thử liên kết GitHub với OAuth app thật | Nhóm | Cần `GITHUB_CLIENT_ID/SECRET` |
| Thử gửi e-mail finding qua SMTP thật | Nhóm | Cần cấu hình SMTP của nhóm |
| Đối chiếu câu chữ MSG18/24/26 và mã SM-06/11/12 với BM04 | Đức | Khi có BM04/SRS trong repo |
| Kiểm tra commit `484aa4f` của axios (+217 phụ thuộc chỉ vì sửa `CHANGELOG.md`) | Nhóm | Có thể là lỗi chọn baseline khi mine; ảnh hưởng số liệu RQ1/RQ2 |
