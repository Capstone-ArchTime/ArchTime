# Report 5: Test Plan (T07)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-05 |
| Phương pháp | [methodology-decision.md](methodology-decision.md) §3 |
| Kết quả kiểm thử hệ thống | [system-test-report.md](system-test-report.md) |

## 1. Mục tiêu

1. Chứng minh mỗi chức năng làm đúng nghiệp vụ đã đặc tả, với dữ liệu thật chứ không phải dữ liệu demo.
2. Chứng minh **phân quyền** đúng ở cả ba cấp (hệ thống, tổ chức, project), kể cả khi người dùng gọi thẳng API.
3. Phát hiện hồi quy: mọi thay đổi phải chạy lại toàn bộ bộ test trước khi merge.

## 2. Phạm vi

**Trong phạm vi:** backend (API, use case, domain, repository), frontend (logic định tuyến, gọi API, hiển thị), mining trên repo git, kiến trúc, AI Mentor (phần hậu xử lý), tổ chức, onboarding, quản trị.

**Ngoài phạm vi:** chất lượng câu trả lời của mô hình AI (thuộc đánh giá nghiên cứu), hiệu năng tải lớn, tương thích nhiều trình duyệt.

## 3. Mức kiểm thử và phương pháp

| Mức | Cách làm | Công cụ |
|---|---|---|
| Functional / Unit | Hàm thuần trong `domain/`, use case với repository giả | `node:test` |
| Integration | Mining trên repo git thật do test tạo; luồng HTTP qua router và middleware thật | `node:test`, `express`, `fetch` |
| System | Các kịch bản phân quyền end-to-end qua HTTP, với router, middleware và policy thật | `BE/tests/system-permissions.test.mjs` |
| Permission | Ma trận vai trò × hành động (metadata / read / write / admin / owner) và các ca truy cập trái phép | Như trên, cùng `access-policy-and-repo-url.test.mjs` và `organizations.test.mjs` |
| Frontend | Chặn route theo vai trò, lớp API, logic hiển thị | `FE/tests/*.test.mjs` |
| UAT thủ công | Checklist mục 8, trên trình duyệt | Người kiểm thử |

## 4. Module và test case chính

Cột "Bằng chứng" trỏ tới file test tự động. Kết quả mong đợi là điều mà test kiểm tra (assert).

| Module | Test case | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|
| Xác thực | Đăng ký, OTP, đăng nhập, refresh, đăng xuất mọi thiết bị | Token cũ bị thu hồi sau khi tăng `tokenVersion`; OTP được hash và giới hạn số lần thử | `otp-*.test.mjs`, `auth-*.test.mjs`, `profile-and-sessions.test.mjs` |
| Đổi mật khẩu (T45) | Sai mật khẩu cũ, mật khẩu yếu, nhập lại không khớp, thành công | 400 / 400 / 400 / 200. Lưu dạng hash; không lộ trong response hay log; token cũ trả 401 | `profile-and-sessions.test.mjs` (HTTP change-password) |
| Tổ chức (T28, T30) | Tạo, thêm, đổi vai trò, gỡ thành viên, rời tổ chức | Chỉ owner thay đổi được; không gỡ được owner cuối cùng; người bị gỡ mất mọi vai trò và lời mời trong project của tổ chức | `organizations.test.mjs` |
| Lời mời project | Mời hoặc chấp nhận vào project tổ chức khi không phải thành viên tổ chức | 403, không tạo membership "ngủ" | `organizations.test.mjs` |
| Project và phân quyền | Ma trận vai trò; project tổ chức không bao giờ public; System Administrator chỉ xem metadata | Đúng như `ProjectAccessPolicy` | `access-policy-and-repo-url.test.mjs`, `core0*.test.mjs` |
| Mining (T17) | Theo khoảng thời gian, phần còn lại, *Releases first*; huỷ giữa chừng rồi tiếp tục; force-push | Không có snapshot trùng; mốc được mine trước; snapshot mang tên tag; tiếp tục đúng chỗ đã dừng | `mining-service.test.mjs`, `mining-plan.test.mjs`, `mining-baseline.test.mjs` |
| Kiến trúc | Phân cụm, đặt tên, MoJoFM, ghép component, evidence bridge | Kết quả tất định; MoJoFM khớp kiểm chứng brute force | `architecture-*.test.mjs`, `mojo.test.mjs`, `component-matching.test.mjs` |
| Canonical Map (T32) | Xác nhận, sửa sau khi xác nhận, client gửi sẵn người xác nhận, Member hoặc Viewer xác nhận | Server tự ghi người, thời điểm và revision; nội dung đổi thì mất xác nhận; Member/Viewer bị 403 | `canonical-map.test.mjs` (BE, FE) |
| AI Mentor (T31) | FACT không có citation, hash bịa, hash hợp lệ, nhiều claim trên một dòng | FACT bị hạ xuống INFERENCE; hash bịa bị bỏ; phần còn lại của text giữ nguyên; lịch sử lưu kết quả kiểm tra | `mentor-claim-labels.test.mjs`, `chat-*.test.mjs`, `project-chat.test.mjs` |
| Onboarding / Newcomer (T39) | Soạn, giao, học, trả lời câu hỏi, xem tiến độ | Learner chỉ đọc được tiến độ của mình; mentor xem được tiến độ cả nhóm | `onboarding-*.test.mjs` |
| Quản trị (T44) | Danh sách và chi tiết tổ chức; người không phải admin gọi API | Chỉ có metadata, không có repoUrl, mô tả hay token; 401 / 403 | `admin-organizations.test.mjs` (BE, FE), `sa-*.test.mjs` |
| Đánh giá (T33, RQ1) | Chỉ số, lấy mẫu có seed, checkout sai commit | Chỉ số `n/a` khi mẫu số bằng 0; script từ chối checkout sai commit | `extractor-eval.test.mjs`, `rq1.test.mjs` |
| Frontend | Chặn route theo vai trò, sidebar, lớp API | Vai trò không có quyền gặp trang 403; route lạ bị từ chối | `FE/tests/permissions.test.mjs`, `layout.test.mjs`, `*-api.test.mjs` |

## 5. Môi trường và dữ liệu

| | |
|---|---|
| Hệ điều hành | Windows 11 (máy phát triển). Mã không phụ thuộc hệ điều hành |
| Node.js | 22.15 (tối thiểu); test FE chạy được trên cả Node 22 và 24 |
| Database | Test tự động dùng lưu trữ trong bộ nhớ, không cần MongoDB. UAT dùng MongoDB thật với `BE/.env` |
| Git | Có trong PATH (test mining tạo repo thật trong thư mục tạm) |
| Dữ liệu | Test tự tạo dữ liệu, không cần seed hay dữ liệu thật. UAT dùng repo công khai trong [repo-selection.md](repo-selection.md) |

Lệnh chạy: `cd BE && npm test && npx tsc -p tsconfig.json --noEmit`; `cd FE && npm test && npm run build && npm run lint`.

## 6. Tiêu chí Pass/Fail

- **Một test case pass** khi mọi assert của nó đúng. Test bị bỏ qua (`skip`) tính là chưa chạy.
- **Một bản build được chấp nhận** khi: 0 test lỗi ở BE và FE; `tsc` (BE) và `tsc -b && vite build` (FE) không có lỗi; `oxlint` không có lỗi (cảnh báo cũ được phép, nhưng file mới hoặc file đã sửa không được thêm cảnh báo).
- **Một task chỉ được đánh dấu Completed** khi có test tự động cho phần đã làm và bộ test đầy đủ đang xanh.

## 7. Rủi ro và hướng xử lý

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Lưu trữ trong bộ nhớ khác MongoDB thật (toán tử truy vấn, index) | Trung bình | Repository Mongo giữ mỏng; UAT trên Mongo thật; nếu gặp lỗi chỉ xảy ra trên Mongo thì thêm `mongodb-memory-server` |
| Phân quyền bị nới lỏng khi thêm route mới | Cao | Mọi route project đi qua `checkRole(...)`; system test S01–S12 chạy trên router thật. Đã thử đột biến: nới quyền admin thì S12 lỗi ngay |
| Bộ test phụ thuộc phiên bản Node | Thấp | Đã bỏ `t.mock.property` (chỉ có từ Node 24) bằng helper `FE/tests/mock-global.mjs` |
| Mô hình AI trả lời khác nhau giữa các lần | Trung bình | Test AI Mentor dùng mô hình giả; luật hậu xử lý là hàm thuần nên kết quả tất định |
| `npm run lint` của BE không chạy (thiếu `eslint.config.js`) | Thấp | Đã ghi nhận; `tsc` vẫn chặn lỗi kiểu. Đề xuất thêm cấu hình ESLint |
| Lỗi giao diện mà test logic không bắt được | Trung bình | Checklist UAT ở mục 8 trước mỗi lần demo |

**Quy trình khi gặp lỗi:** tái hiện lỗi bằng một test đỏ, sửa, rồi chạy lại toàn bộ bộ test. Không merge khi còn test đỏ.

## 8. Checklist UAT thủ công (trình duyệt)

| # | Bước | Mong đợi |
|---|---|---|
| U1 | Admin mở *Organizations*, tìm theo tên, mở chi tiết | Thấy owner, số thành viên, số workspace; không có link vào workspace |
| U2 | Owner tổ chức gỡ một thành viên đang mở workspace ở tab khác | Thông báo nêu số vai trò đã kết thúc và lời mời đã thu hồi; tab kia gặp lỗi quyền ở lần tải tiếp theo |
| U3 | Maintainer xác nhận Component Diagram, sửa một component, rồi lưu | Tag chuyển *Canonical map* → *Draft*; dòng "Confirmed by … (revision N)" biến mất |
| U4 | Newcomer mở một learning path | Thấy dải trạng thái Canonical/Draft, tiến độ, nút *Ask the AI mentor* |
| U5 | Hỏi AI Mentor về một commit không tồn tại | Hash bị bỏ khỏi câu trả lời; dòng "Checked by ArchTime…" giải thích lý do |
| U6 | Mở *Mining* → *Releases first, then the rest* trên repo có tag | Các snapshot đầu tiên mang tên tag; trang Compare hiển thị tên tag |
| U7 | Đổi mật khẩu ở Profile | Bị đăng xuất mọi nơi; đăng nhập được bằng mật khẩu mới |
