# Test case WF-05, WF-08, WF-09 (D11)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-15 |
| Nguồn | BM04 §6.5 (WF-05 AI Mentor), §6.8 (WF-08 Conformance check), §6.9 (WF-09 Agent context) |
| Kế hoạch kiểm thử chung | [report5-test-plan.md](report5-test-plan.md) |
| CI | `.github/workflows/ci.yml`: mỗi lần push, chạy toàn bộ test BE (trên MongoDB 7) và FE, `tsc`, `oxlint`, build |

> **Cần đối chiếu BM04.** Cột "Yêu cầu" mới ghi chắc chắn F-14 (conformance), N-07 và N-08. Các mã F-06, F-11, F-12, F-15
> và SM-06, SM-11, SM-12 được gán theo tên chức năng; cần đối chiếu lại khi có BM04 trong repo.

## 1. Tổng hợp

| Luồng | Số test case | Tự động, chạy trên CI | Thủ công (UAT) |
|---|---|---|---|
| WF-05 AI Mentor | 10 | 5 | 5 |
| WF-08 Conformance check | 8 | 4 | 4 |
| WF-09 Agent context | 7 | 4 | 3 |
| **Tổng** | **25** | **13** | **12** |

Một ca tự động **pass** khi mọi assert trong các test được nêu đều đúng và không test nào bị bỏ qua (CI cho job fail nếu có
test bị skip). Một ca thủ công **pass** khi kết quả trên trình duyệt đúng như cột "Kết quả mong đợi".

Lệnh chạy cục bộ: `cd BE && npm test` (có MongoDB ở `127.0.0.1:27017` hoặc `MONGODB_TEST_URI`), `cd FE && npm test`.

## 2. WF-05 AI Mentor

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-05-01 | CI | F-06 | Câu trả lời có claim `[FACT]` không kèm hash commit | Claim bị hạ thành `[INFERENCE]`, phần còn lại giữ nguyên | `BE/tests/mentor-claim-labels.test.mjs` (FACT without any citation) |
| TC-05-02 | CI | F-06 | `[FACT]` trích một hash chưa từng được mine | Hash bị bỏ, claim bị hạ | `mentor-claim-labels.test.mjs` (never mined) |
| TC-05-03 | CI | F-06 | Nhiều claim trên một dòng, mỗi claim một hash | Mỗi claim xét riêng theo hash của nó | `mentor-claim-labels.test.mjs` (each claim on a line) |
| TC-05-04 | CI | SM-06 | Hỏi mentor, xem câu trả lời, panel bằng chứng và lịch sử | Cả ba mang cùng một bản đã kiểm tra | `mentor-claim-labels.test.mjs` (chat answer, evidence panel, saved history) |
| TC-05-05 | CI | N-08 | Dựng ngữ cảnh gửi model từ dữ liệu project có repoUrl kèm token | Token bị xoá khỏi ngữ cảnh; ngữ cảnh không vượt giới hạn kích thước | `BE/tests/project-chat.test.mjs` (strips repo credentials, size limit) |
| TC-05-06 | UAT | F-06 | Hỏi mentor về một commit không tồn tại | Hash bị bỏ khỏi câu trả lời; dòng "Checked by ArchTime…" giải thích | Trình duyệt |
| TC-05-07 | UAT | SM-06 | Hỏi về một commit có thay đổi kiến trúc | Panel bằng chứng liệt kê commit được trích, số phụ thuộc thêm/bớt và file | Trình duyệt |
| TC-05-08 | UAT | F-06 | Viewer hỏi quá giới hạn trong ngày do chủ project đặt | Thông báo đã hết lượt trong ngày, không gọi model | Trình duyệt |
| TC-05-09 | UAT | F-06 | Hỏi, đóng trang, mở lại hội thoại | Câu hỏi và câu trả lời (đã kiểm tra) còn nguyên | Trình duyệt |
| TC-05-10 | UAT | SM-06 | Tắt model AI rồi hỏi | Thông báo dịch vụ AI không dùng được; trang AI Usage ghi một lượt `failed` | Trình duyệt |

## 3. WF-08 Conformance check

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-08-01 | CI | F-14 | Gán file theo path prefix của sơ đồ đã xác nhận | File thuộc component có prefix dài nhất chứa nó, so theo nguyên đoạn đường dẫn; file không thuộc component nào được liệt kê riêng | `BE/tests/conformance.test.mjs` |
| TC-08-02 | CI | F-14, SM-11 | Check các commit sau baseline với luật cấm, luật bắt buộc và sơ đồ | Có đủ ba loại finding (phụ thuộc bị cấm, thiếu phụ thuộc bắt buộc, phụ thuộc chưa khai báo), mỗi finding kèm file gây ra; chỉ commit sau baseline được check | `conformance.test.mjs`, `conformance-check.test.mjs`, `conformance-repository.test.mjs` |
| TC-08-03 | CI | N-07 | Check lại cùng các snapshot nhiều lần | Finding, bằng chứng, id document và số đếm giống hệt; không force thì không check lại | `BE/tests/nfr-n07-n08.test.mjs` (N-07), `conformance.test.mjs` (đầu vào đảo thứ tự) |
| TC-08-04 | CI | F-15 | Mine commit mới sau khi sơ đồ đã xác nhận | Check tự chạy; maintainer và chủ tổ chức nhận một e-mail; lần fetch sau không gửi lại | `BE/tests/conformance-notify.test.mjs` |
| TC-08-05 | UAT | F-14 | Gán cùng một path prefix cho hai component | Form báo MSG24, không lưu | Trình duyệt (Component Diagram) |
| TC-08-06 | UAT | SM-11 | Accept một finding (ghi lý do) ở commit cũ, mở commit sau | Finding cùng loại ở commit sau đã ở trạng thái Accepted, ghi "carried over from commit …" | Trình duyệt (Conformance Findings) |
| TC-08-07 | UAT | F-15 | Có finding mới; mở Maintainer overview rồi mở Conformance Findings | Thông báo MSG26 và badge số chưa đọc; mở trang findings thì badge biến mất | Trình duyệt |
| TC-08-08 | UAT | SM-11 | Bấm Explain trên một finding (đã cấu hình model) | Có giải thích nêu file cần sửa; bấm lại không gọi model lần nữa; trang AI Usage có một lượt | Trình duyệt |

## 4. WF-09 Agent context

| ID | Loại | Yêu cầu | Bước | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| TC-09-01 | CI | F-11, SM-12 | Agent hỏi ngữ cảnh của một file | Có component, phụ thuộc được phép và bị cấm, ADR liên quan, quy ước commit; không có source code | `BE/tests/agent-context.test.mjs` |
| TC-09-02 | CI | N-08 | Dùng token của project A để hỏi về project B (tham số, header), gọi API khác | Không có dữ liệu nào của B; mọi API khác trả 401; token đăng nhập của người dùng bị từ chối | `BE/tests/nfr-n07-n08.test.mjs` (N-08) |
| TC-09-03 | CI | F-12 | Tạo token | Token hiện một lần; chỉ lưu hash; hạn 1–90 ngày; tối đa 10 token đang hoạt động; có audit | `agent-context.test.mjs` |
| TC-09-04 | CI | F-12 | Dùng token đã thu hồi, hết hạn, hoặc của project đã xoá | 401 ngay ở request tiếp theo | `agent-context.test.mjs`, `nfr-n07-n08.test.mjs` |
| TC-09-05 | UAT | F-12 | Tạo token ở trang Agent Access, sao chép, đóng hộp thoại | Token không còn trên trang; danh sách chỉ hiện phần đầu của token | Trình duyệt |
| TC-09-06 | UAT | F-11 | Tải AGENTS.md | Nội dung khớp sơ đồ đã xác nhận: component và path, phụ thuộc được phép, luật, ADR, quy ước commit | Trình duyệt |
| TC-09-07 | UAT | SM-12 | Coding agent (Claude Code, curl) hỏi trước khi sửa một file; thử khi sơ đồ chưa xác nhận | Agent nhận đúng ngữ cảnh; khi chưa xác nhận thì 409 với hướng dẫn | Terminal |

## 5. N-01: đo với người dùng thử

Không tự động hoá được. Mỗi người trong 5 người dùng thử làm một phiên không quá 20 phút, theo kịch bản cố định (đăng nhập,
mở workspace, đọc canonical map, hỏi mentor một câu, xem một finding). Ghi lại: thời gian hoàn thành từng bước, bước bị kẹt,
số lần cần trợ giúp. Kết quả ghi vào bảng sau.

| Người dùng | Thời gian phiên | Bước hoàn thành | Bị kẹt ở | Ghi chú |
|---|---|---|---|---|
| U1 | | | | |
| U2 | | | | |
| U3 | | | | |
| U4 | | | | |
| U5 | | | | |

## 6. Kết quả lần chạy

| Ngày | Commit | CI | BE | FE | UAT |
|---|---|---|---|---|---|
| 2026-11-15 | `4e8434c` (nhánh `feat/ci-tests`) | [Run 43647168670](https://github.com/Capstone-ArchTime/ArchTime/actions/runs/43647168670): Backend và Frontend xanh, 0 test bị skip | Cục bộ 679/679 | Cục bộ 404/404 | Đã chạy trên trình duyệt khi làm D2–D9: TC-08-05/06/07, TC-09-05/06. Còn lại: TC-05-06…10, TC-08-08 (cần model AI), TC-09-07 |
