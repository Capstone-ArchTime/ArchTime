# System Test Report: phân quyền và tổ chức (T50)

| | |
|---|---|
| Ngày chạy | 2026-11-05 |
| Môi trường | Windows 11, Node.js 22.15.0 |
| Commit nền | `010674b` (Develop) cộng các thay đổi của đợt này (chưa commit) |
| Bộ test | `BE/tests/system-permissions.test.mjs` (12 kịch bản), chạy cùng toàn bộ bộ test BE |
| Kết quả | **12/12 pass.** Toàn bộ BE: 577/577 pass. FE: 365/365 pass |

## 1. Cách kiểm thử

Bộ test mount các **router thật** (`/api/organizations`, `/api/admin`, `/api/projects` kể cả onboarding) với **middleware xác thực thật** (`authenticate`, `authorize`), **`ProjectAccessPolicy` thật** và **use case tổ chức thật**, rồi gọi qua HTTP. Có hai thứ được thay:

- **Lưu trữ:** repository trong bộ nhớ, có cùng giao diện với repository Mongo.
- **Controller sau các route project:** luôn trả 200 kèm tên handler. Mã trạng thái nhận được vì vậy phản ánh đúng quyết định của tầng phân quyền.

Dữ liệu dùng trong test: tổ chức Acme có alice (owner), bob (member, maintainer của acme-api), carl (member, newcomer trên acme-api), frank (member, maintainer của acme-web). Tổ chức Beta có dora (owner). Ngoài ra có eve (không thuộc tổ chức nào; một project public và một project private), gina (người ngoài), sam (tài khoản bị khoá), và admin.

**Kiểm tra test không pass rỗng:** mình tạm sửa policy để admin được quyền đọc project tổ chức. Khi đó S12 lỗi ngay. Sau đó policy được khôi phục, `git diff` xác nhận không còn thay đổi.

## 2. Kết quả từng kịch bản

| # | Kịch bản | Kiểm tra chính | Kết quả |
|---|---|---|---|
| S01 | System Administrator quản lý tổ chức | Danh sách kèm số thành viên và số project; chi tiết không chứa repoUrl hay mô tả project | Pass |
| S02 | Organization Owner xem tổ chức của mình | Chỉ thấy Acme với vai trò owner; xem được thành viên | Pass |
| S03 | Owner mời (thêm) thành viên | Owner 201; member 403; owner của tổ chức khác 404 | Pass |
| S04 | Owner gỡ thành viên | Member gỡ người khác bị 403; owner gỡ được: `{ removedProjectMemberships: 1, cancelledInvitations: 1 }`; có ghi audit; không gỡ được owner cuối cùng (400) | Pass |
| S05 | Người bị gỡ mất quyền vào project tổ chức | **Cùng token đăng nhập từ trước**: metadata, read và write trên acme-web và acme-api đều 403; tổ chức 404; project cá nhân vẫn 200; membership trong project cá nhân giữ nguyên | Pass |
| S06 | Thành viên không vào được tổ chức khác | Tổ chức khác 404; project của tổ chức khác 403; project tổ chức để public vẫn 403 với người ngoài | Pass |
| S07 | Project Owner quản lý project | Mời, xem lời mời, duyệt approval, xoá project đều 200 | Pass |
| S08 | Maintainer quản lý tri thức | Xác nhận diagram, tạo ADR và rule, tạo và giao learning path, xem tiến độ đều 200; xoá project 403; project mình không maintain 403 | Pass |
| S09 | Newcomer chỉ học và xem tiến độ của mình | Đọc, học, trả lời đều 200; xác nhận diagram, tạo ADR, soạn path, xem tiến độ người khác, mời người đều 403 | Pass |
| S10 | Viewer chỉ xem project public cá nhân | Project public cá nhân: đọc 200, ghi 403; project private và project tổ chức 403 | Pass |
| S11 | Người không có quyền gọi API quản trị | 5 endpoint admin: không token 401, owner tổ chức 403, admin 200; tự nâng quyền 403; tài khoản bị khoá 401; token đã thu hồi 401; token hỏng 401 | Pass |
| S12 | System Administrator không đọc được nội dung project tổ chức | Metadata và tiến độ mining 200; snapshot, evidence, kiến trúc, diagram, ADR, learning path, xác nhận diagram, xoá đều 403; tổ chức 404 | Pass |

## 3. Bao phủ theo khía cạnh yêu cầu

| Khía cạnh | Bằng chứng |
|---|---|
| API authorization | S01–S12 |
| Frontend route protection | `FE/tests/permissions.test.mjs` (mọi route của mỗi vai trò, có cả `/system-administrator/organizations` và `/learning/*`), `FE/tests/admin-organizations.test.mjs` |
| Authentication | S11 (thiếu token, token hỏng, token bị thu hồi, tài khoản bị khoá), `profile-and-sessions.test.mjs` |
| Organization membership | S02–S06, `organizations.test.mjs` |
| Project-level permission | S07–S10, S12, `access-policy-and-repo-url.test.mjs` |
| Database data isolation | S04/S05 (xoá đúng membership của project tổ chức, giữ project cá nhân); `organizations.test.mjs`; chat history giới hạn theo người và project (`chat-history.test.mjs`) |
| Truy cập trái phép | S03, S04, S06, S08–S12 |

## 4. Giới hạn

- Lưu trữ chạy trong bộ nhớ, **chưa chạy với MongoDB thật**. Các bộ lọc Mongo (ví dụ `deleteMany` theo `projectId $in`) được kiểm tra bằng bản giả có cùng ngữ nghĩa, chứ không phải bằng Mongo. Checklist UAT ([report5-test-plan.md](report5-test-plan.md) §8) bù phần này.
- Giao diện chưa được kiểm thử tự động trên trình duyệt. Mới kiểm thử logic định tuyến và lớp API.
