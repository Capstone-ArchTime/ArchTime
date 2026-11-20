# Test case WF-05, WF-08, WF-09 (D11)

| | |
|---|---|
| Phiên bản | 1.1 |
| Ngày | 2026-11-15 |
| Nguồn | BM04 §6.5 (WF-05), §6.8 (WF-08), §6.9 (WF-09); danh sách việc D11 |
| Kế hoạch kiểm thử chung | [report5-test-plan.md](report5-test-plan.md) |
| CI | `.github/workflows/ci.yml`: mỗi lần push, chạy toàn bộ test BE (trên MongoDB 7) và FE, `tsc`, `oxlint`, build. Job fail nếu có test bị bỏ qua |

Luồng và chức năng (BM04):

| Luồng | Nội dung | Chức năng |
|---|---|---|
| WF-05 | Onboard a newcomer with a learning path (demo DS-05a, DS-05b) | F-11 Onboarding paths, F-06 AI mentor, F-12 User profile |
| WF-08 | Check architecture conformance of new commits (demo DS-08a, DS-08b) | F-14 Architecture conformance check & commit convention |
| WF-09 | Give AI coding agents the architecture context (demo DS-09a, DS-09b) | F-15 Architecture context for AI coding agents |

Yêu cầu phi chức năng: **N-01** Usability: ≤ 20 phút với 4/5 người dùng. **N-07** Reproducibility: 100 % finding giống
hệt, 0 bản trùng. **N-08** Security: 0 lần lộ dữ liệu.

> Mã SM-06, SM-11, SM-12 được gán theo luồng (SM-06 ↔ WF-05, SM-11 ↔ WF-08, SM-12 ↔ WF-09); cần đối chiếu lại với BM04.

## 1. Tổng hợp

| Luồng | Số test case | Tự động, chạy trên CI | Thủ công (UAT, demo) |
|---|---|---|---|
| WF-05 | 10 | 5 | 5 |
| WF-08 | 8 | 4 | 4 |
| WF-09 | 7 | 4 | 3 |
| **Tổng** | **25** | **13** | **12** |

Mỗi chức năng F-06, F-11, F-12, F-14, F-15 có ít nhất 3 test case. Một ca tự động **pass** khi mọi assert trong các test
được nêu đều đúng và không test nào bị bỏ qua. Một ca thủ công **pass** khi kết quả trên trình duyệt đúng như cột "Kết quả
mong đợi".

Lệnh chạy cục bộ: `cd BE && npm test` (có MongoDB ở `127.0.0.1:27017` hoặc `MONGODB_TEST_URI`), `cd FE && npm test`.

## 2. WF-05 Onboard a newcomer with a learning path

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-05-01 | CI | F-11 | Maintainer soạn và xuất bản một learning path; lưu path thiếu dữ liệu; lưu đè bản cũ | Path hợp lệ được nhận và giữ thứ tự bước; mọi lỗi được báo cùng lúc theo trường; lưu bản cũ là conflict | `BE/tests/onboarding-paths.test.mjs`, `onboarding-routes.test.mjs` |
| TC-05-02 | CI | F-11, SM-06 | Giao path cho thành viên; người học mở path; người khác thử xem | Chỉ giao được path đã xuất bản, cho thành viên project; người học chỉ đọc bản và tiến độ của mình; mentor xem được tiến độ cả nhóm; người ngoài không thấy gì | `onboarding-routes.test.mjs` |
| TC-05-03 | CI | F-11 | Sửa component mà một bước của path nói tới | Bước đó được báo có thể đã cũ, nói rõ điều gì đổi; bước không liên quan vẫn hiện hành | `onboarding-step-reference.test.mjs` |
| TC-05-04 | CI | F-06 | Người học hỏi AI mentor; câu trả lời có `[FACT]` không kèm hash, hoặc kèm hash chưa từng được mine | FACT bị hạ thành INFERENCE; hash bịa bị bỏ; câu trả lời, panel bằng chứng và lịch sử mang cùng bản đã kiểm tra | `mentor-claim-labels.test.mjs` |
| TC-05-05 | CI | F-12 | Sửa hồ sơ; xem cách đăng nhập; liên kết và gỡ GitHub | Không bao giờ trả hash mật khẩu hay GitHub id; cách đăng nhập đúng; không gỡ được GitHub khi đó là cách đăng nhập duy nhất | `profile-and-sessions.test.mjs`, `github-link.test.mjs` (BE, FE) |
| TC-05-06 | UAT | F-11 | (DS-05a) Newcomer mở path được giao, học từng bước, trả lời câu hỏi | Thấy dải Canonical/Draft, tiến độ tăng, câu trả lời đúng/sai được báo | Trình duyệt |
| TC-05-07 | UAT | F-06 | Trong một bước, bấm *Ask the AI mentor* về một commit không tồn tại | Hash bị bỏ khỏi câu trả lời; dòng "Checked by ArchTime…" giải thích | Trình duyệt |
| TC-05-08 | UAT | F-06 | Hỏi mentor về một commit có thay đổi kiến trúc | Panel bằng chứng liệt kê commit được trích, số phụ thuộc thêm/bớt và file | Trình duyệt |
| TC-05-09 | UAT | F-12 | Ở Profile: liên kết GitHub, gỡ liên kết; tài khoản chỉ có GitHub | Liên kết xong hiện "Linked"; gỡ xong "Not linked"; tài khoản chỉ có GitHub thấy nút gỡ bị khoá kèm lý do | Trình duyệt |
| TC-05-10 | UAT | SM-06 | (DS-05b) Mentor xem tiến độ nhóm sau khi newcomer học xong | Thấy tiến độ từng người; newcomer không xem được tiến độ người khác | Trình duyệt |

## 3. WF-08 Check architecture conformance of new commits

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-08-01 | CI | F-14 | Gán file theo path prefix của sơ đồ đã xác nhận | File thuộc component có prefix dài nhất chứa nó, so theo nguyên đoạn đường dẫn; file không thuộc component nào được liệt kê riêng | `BE/tests/conformance.test.mjs`, `component-path-prefixes.test.mjs` |
| TC-08-02 | CI | F-14, SM-11 | Check các commit sau baseline với luật cấm, luật bắt buộc và sơ đồ | Đủ ba loại finding (phụ thuộc bị cấm, thiếu phụ thuộc bắt buộc, phụ thuộc chưa khai báo), mỗi finding kèm file gây ra; chỉ commit sau baseline được check | `conformance.test.mjs`, `conformance-check.test.mjs`, `conformance-repository.test.mjs` |
| TC-08-03 | CI | N-07 | Check lại cùng các snapshot nhiều lần | 100 % finding giống hệt (cả bằng chứng và id document), 0 bản trùng, số đếm không đổi; không force thì không check lại | `BE/tests/nfr-n07-n08.test.mjs` (N-07), `conformance.test.mjs` (đầu vào đảo thứ tự) |
| TC-08-04 | CI | F-14 | Mine commit mới sau khi sơ đồ đã xác nhận | Check tự chạy; maintainer và chủ tổ chức nhận một e-mail; lần fetch sau không gửi lại | `BE/tests/conformance-notify.test.mjs` |
| TC-08-05 | UAT | F-14 | Gán cùng một path prefix cho hai component | Form báo MSG24, không lưu | Trình duyệt (Component Diagram) |
| TC-08-06 | UAT | SM-11 | (DS-08a) Mine commit vi phạm luật, mở Conformance Findings | Finding đúng loại, kèm file; Fix / Accept / Dismiss lưu được; Accept ở commit cũ áp dụng cho commit sau | Trình duyệt |
| TC-08-07 | UAT | F-14 | (DS-08b) Có finding mới; mở Maintainer overview rồi Conformance Findings | Thông báo MSG26 và badge số chưa đọc; mở trang findings thì badge biến mất | Trình duyệt |
| TC-08-08 | UAT | F-14 | Bấm Explain trên một finding (đã cấu hình model) | Có giải thích nêu file cần sửa; bấm lại không gọi model lần nữa; trang AI Usage có một lượt | Trình duyệt |

## 4. WF-09 Give AI coding agents the architecture context

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-09-01 | CI | F-15, F-14 | Agent hỏi ngữ cảnh của một file | Có component, phụ thuộc được phép và bị cấm, ADR liên quan, quy ước commit; không có source code | `BE/tests/agent-context.test.mjs` |
| TC-09-02 | CI | N-08 | Dùng token của project A để hỏi về project B (tham số, header), gọi API khác | 0 lần lộ dữ liệu của B; mọi API khác trả 401; token đăng nhập của người dùng bị từ chối | `BE/tests/nfr-n07-n08.test.mjs` (N-08) |
| TC-09-03 | CI | F-15 | Tạo token | Token hiện một lần; chỉ lưu hash; hạn 1–90 ngày; tối đa 10 token đang hoạt động; có audit | `agent-context.test.mjs` |
| TC-09-04 | CI | F-15 | Dùng token đã thu hồi, hết hạn, hoặc của project đã xoá | 401 ngay ở request tiếp theo | `agent-context.test.mjs`, `nfr-n07-n08.test.mjs` |
| TC-09-05 | UAT | F-15 | (DS-09a) Tạo token ở trang Agent Access, sao chép, đóng hộp thoại | Token không còn trên trang; danh sách chỉ hiện phần đầu của token | Trình duyệt |
| TC-09-06 | UAT | F-15 | Tải AGENTS.md | Nội dung khớp sơ đồ đã xác nhận: component và path, phụ thuộc được phép, luật, ADR, quy ước commit | Trình duyệt |
| TC-09-07 | UAT | SM-12 | (DS-09b) Coding agent (Claude Code, curl) hỏi trước khi sửa một file; thử khi sơ đồ chưa xác nhận | Agent nhận đúng ngữ cảnh; khi chưa xác nhận thì 409 với hướng dẫn | Terminal |

## 5. N-01: đo với người dùng thử

Không tự động hoá được. Đạt khi **4/5 người dùng** hoàn thành kịch bản trong **≤ 20 phút**. Kịch bản cố định (WF-05):
đăng nhập, mở learning path được giao, học hết các bước, hỏi AI mentor một câu, xem tiến độ của mình. Ghi lại thời gian
từng bước, bước bị kẹt, số lần cần trợ giúp.

| Người dùng | Thời gian phiên | Hoàn thành kịch bản | Bị kẹt ở | Ghi chú |
|---|---|---|---|---|
| U1 | | | | |
| U2 | | | | |
| U3 | | | | |
| U4 | | | | |
| U5 | | | | |

## 6. Kết quả lần chạy

| Ngày | Commit | CI | BE | FE | UAT |
|---|---|---|---|---|---|
| 2026-11-15 | `4e8434c` (nhánh `feat/ci-tests`) | [Run 43647168670](https://github.com/Capstone-ArchTime/ArchTime/actions/runs/43647168670): Backend và Frontend xanh, 0 test bị skip | Cục bộ 679/679 | Cục bộ 404/404 | Đã chạy trên trình duyệt khi làm D2–D9: TC-05-09, TC-08-05/06/07, TC-09-05/06 |
| 2026-11-15 | `312c431` (Develop) | [Run 43647369492](https://github.com/Capstone-ArchTime/ArchTime/actions/runs/43647369492): xanh | | | Còn lại: TC-05-06/07/08/10 (demo DS-05), TC-08-08 (cần model AI), TC-09-07 (DS-09b), N-01 |
