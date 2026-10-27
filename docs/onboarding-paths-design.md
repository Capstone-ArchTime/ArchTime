# Lộ trình onboarding (Onboarding Path): thiết kế back-end

Căn cứ: tài liệu tổng quan hệ thống 20/10/2026 (§3 khái niệm "Onboarding path", §4 phân quyền, §5 chức năng "Onboarding Paths"). Phần này mô tả cái đã làm ở back-end cho các task T13 (soạn lộ trình), T24 (giao lộ trình và theo dõi tiến độ) và T38 (ẩn tiến độ của đồng nghiệp). Mô-đun dựa trên T25 (`StepRevisionService`: ghim bước vào revision, kiểm tra commit còn tồn tại).

## 1. Khái niệm

- **Lộ trình** thuộc về một project, do mentor (Maintainer), Project Owner hoặc Organization Owner soạn. Gồm các **bước** theo thứ tự, mỗi bước thuộc một trong bốn loại:

| Loại | Trỏ tới | Ý nghĩa |
|---|---|---|
| `component` | `componentId`: id của một component trong sơ đồ workspace | Hiểu một component |
| `commit` | `commit`: hash commit đã mine (từ 7 ký tự) | Đọc một thay đổi kiến trúc và evidence của nó |
| `adr` | `adrId`: id của một quyết định thiết kế trong workspace | Đọc một quyết định thiết kế |
| `question` | không | Câu hỏi trắc nghiệm 2 đến 6 đáp án, một đáp án đúng, có lời giải thích |

- Mỗi bước có tiêu đề (tối đa 120 ký tự) và nội dung hướng dẫn (tối đa 4000 ký tự) do mentor viết.
- **Trạng thái**: `draft` (chỉ người soạn thấy, chưa giao được) hoặc `published` (giao được, người học thấy). Lộ trình công bố cần ít nhất một bước.
- **Giao lộ trình** (assignment): một lộ trình được giao cho một thành viên của project, mỗi người một lần. Tiến độ nằm trong lần giao.
- Giới hạn: 100 lộ trình mỗi project, 50 bước mỗi lộ trình, 50 người mỗi lần giao.

## 2. Ghim vào revision

Mỗi bước được ghim vào revision lúc soạn (commit đã mine, snapshot, revision của canonical map) bằng `StepRevisionService.pin`. Bước component và bước adr còn lưu thêm **dấu vân tay** (`revision.fingerprint`) của chính thứ bước đó nói tới, lấy lúc ghim (khi tạo, khi sửa mà đổi thứ bước trỏ tới, và khi mentor ghim lại trong trình soạn):

- bước component: tên, loại, mô tả của component, cùng các phụ thuộc đi vào và đi ra của nó trong canonical diagram (component ở đầu bên kia, tên của component đó, nhãn). Thứ tự lưu trong diagram và id của phụ thuộc không tính;
- bước adr: tiêu đề, trạng thái, context, decision, alternatives, consequences và `componentIds` (không tính thứ tự) của quyết định.

Dấu vân tay là SHA-256 (32 ký tự hex đầu) của các trường trên (`domain/onboarding/stepReference.ts`). Khi hiển thị, `assessStepRevision` cho từng bước một trong ba tình trạng:

- `current`: còn đúng;
- `outdated` (mã `MAP_CHANGED`): **chính** component hoặc quyết định của bước đã đổi so với lúc ghim. Lưu một rule, một ADR khác, một component khác, hay xác nhận lại diagram không làm bước nào bị cờ: trước đây mọi lần lưu workspace đều tăng revision nên mọi bước đều bị cờ, làm việc ghim mất nghĩa;
- `missing`: commit biến mất khỏi lịch sử (force-push, xóa nhánh, mã `COMMIT_GONE`), snapshot đã bị xóa (`SNAPSHOT_GONE`), hoặc component / quyết định của bước không còn trong workspace (`REF_GONE`; trước đây chỉ trang của người học ghi "no longer in the diagram", server không đếm vào `missingSteps`).

Bước question và bước commit không bao giờ `MAP_CHANGED`: câu hỏi không nói về thứ gì trong workspace, còn bước commit đã được `COMMIT_GONE` / `SNAPSHOT_GONE` lo. Revision của canonical map (`workspaceRevision`) vẫn được lưu để tham khảo nhưng không còn dùng để gắn cờ bước onboarding; không thể dùng `diagram.revision` thay thế vì server luôn đặt nó bằng revision của workspace (`MongoWorkspaceRepository.saveAt`). Kiểm tra chung `POST /api/projects/:id/revisions/check` (không biết vật liệu nói về gì) giữ nguyên cách cũ: canonical map đổi revision là `outdated`.

**Bước lưu trước khi có dấu vân tay** (không có `fingerprint`) được xét theo thời điểm: bước adr là `outdated` khi `updatedAt` của quyết định sau `pinnedAt` của bước; bước component là `outdated` khi `diagram.confirmedAt` sau `pinnedAt`; không có mốc thời gian nào (diagram đang là nháp, quyết định không có `updatedAt`) thì coi là `current`. Cách này có thể báo thừa (xác nhận lại diagram làm mọi bước component cũ bị cờ) nhưng không bỏ sót một lần sửa có ghi thời điểm; mentor ghim lại bước một lần là bước có dấu vân tay và từ đó chỉ bị cờ khi chính nó đổi. Lưu lộ trình mà không ghim lại thì bước cũ vẫn giữ nguyên, không tự được gắn dấu vân tay, để không che mất một thay đổi đã xảy ra sau lúc ghim.

Danh sách lộ trình của mentor cho biết mỗi lộ trình có bao nhiêu bước `outdated` và `missing`; người học cũng thấy cờ này ở từng bước, kèm lời giải thích cái gì đã đổi. Bước đã có và không đổi thì giữ nguyên revision đã ghim và id khi mentor lưu lại; mentor đổi thứ bước trỏ tới, hoặc gửi `repin: true`, thì bước được ghim lại vào revision hiện tại. Giữ id nghĩa là tiến độ của người học không mất khi mentor sửa lộ trình.

Workspace chưa mine lần nào thì chưa có snapshot để ghim: bước component, adr và question vẫn lưu được, gắn với revision của canonical map hiện tại. Bước commit thì bắt buộc commit đã mine.

## 3. Quyền (theo §4 của tài liệu tổng quan)

| Việc | Cần quyền | Ai có |
|---|---|---|
| Soạn, sửa, xóa, công bố, giao, thu hồi lộ trình; xem tiến độ của mọi người | ghi vào project (`write`) | Project Owner, Maintainer, Organization Owner (và quản trị hệ thống với project cá nhân: xem ghi chú dưới bảng) |
| Học: xem lộ trình được giao cho mình, đánh dấu bước xong, trả lời câu hỏi | đọc project (`read`) **và** được giao lộ trình đó | người được giao |

**Ghi chú về quản trị hệ thống.** Bảng §4.2 của tài liệu tổng quan để trống ô của System Administrator ở hai việc "soạn và giao onboarding path" và "xem tiến độ của người khác". Code hiện tại lệch một điểm so với bảng đó: `ProjectAccessPolicy` cho quản trị hệ thống toàn bộ quyền bảo trì (gồm `write`) trên project **cá nhân** (project của tổ chức thì chỉ có metadata), nên họ cũng soạn/giao lộ trình và xem tiến độ được ở project cá nhân. Chưa chặn riêng vì mọi tính năng ghi khác của project cá nhân (scan, mine, ADR, rule) đều đi qua cùng chính sách đó; nếu nhóm muốn siết thì sửa ở `ProjectAccessPolicy` cho mọi tính năng, không chỉ lộ trình.

**Thành viên chỉ thấy tiến độ của bản thân.** Cụ thể:

- Màn hình của người học (`mine`, `me`) luôn tra theo id của chính người đăng nhập; trong dữ liệu trả về không có id, tên, email của ai khác và không có người giao.
- Danh sách tiến độ của mọi người (`/assignments`) cần quyền `write`, nên thành viên nhận 403, kể cả khi chính họ đang được giao lộ trình đó.
- Đáp án đúng và lời giải thích của câu hỏi chỉ được gửi cho người đã trả lời đúng câu đó. Người khác trả lời đúng không mở khóa gì cho bạn.
- Lộ trình chưa được giao cho bạn, hoặc chưa công bố, là 404 (không phân biệt "không tồn tại" với "không phải của bạn").
- Người không còn là thành viên project (hoặc đã rời tổ chức sở hữu project, chủ project cũng vậy) không còn thấy lộ trình đó trong danh sách của mình và không giao thêm lộ trình cho họ được.

## 4. API

Tất cả đều cần đăng nhập. `:id` là id project.

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/projects/:id/onboarding-paths` | write | Danh sách: số bước, số người được giao, số người học xong, số bước `outdated` / `missing` |
| POST | `/api/projects/:id/onboarding-paths` | write | Soạn lộ trình mới |
| GET | `/api/projects/:id/onboarding-paths/:pathId` | write | Lộ trình đầy đủ (có đáp án) kèm tình trạng từng bước |
| PUT | `/api/projects/:id/onboarding-paths/:pathId` | write | Sửa; bắt buộc `expectedRevision`; 409 `CONFLICT` nếu người khác đã lưu trước |
| DELETE | `/api/projects/:id/onboarding-paths/:pathId` | write | Xóa lộ trình và các lần giao |
| GET | `/api/projects/:id/onboarding-paths/:pathId/assignments` | write | Tiến độ từng người, từng bước |
| POST | `/api/projects/:id/onboarding-paths/:pathId/assignments` | write | Giao cho `userIds` (lộ trình đã công bố, người nhận phải là thành viên project) |
| DELETE | `/api/projects/:id/onboarding-paths/:pathId/assignments/:userId` | write | Thu hồi (mất tiến độ của người đó) |
| GET | `/api/onboarding/me` | đăng nhập | Các lộ trình được giao cho tôi, ở các project tôi còn là thành viên, kèm tiến độ và `nextStep: { id, title, kind, index }` (bước đầu tiên chưa xong theo thứ tự của lộ trình; `null` khi đã xong hết) |
| GET | `/api/projects/:id/onboarding-paths/:pathId/mine` | read + được giao | Lộ trình như người học thấy, kèm tiến độ của riêng tôi |
| POST | `/api/projects/:id/onboarding-paths/:pathId/steps/:stepId/complete` | read + được giao | Đánh dấu một bước đã học xong (không dùng cho câu hỏi) |
| POST | `/api/projects/:id/onboarding-paths/:pathId/steps/:stepId/answer` | read + được giao | Trả lời câu hỏi (`{ choice }`); đúng thì bước xong |

Lỗi dữ liệu trả 400 `VALIDATION_ERROR` kèm `fields` theo từng trường, ví dụ `steps[2].componentId`, `steps[3].question.options`.

## 5. Dữ liệu

- `onboardingpaths`: `projectId, title, description, status, steps[{ id, kind, title, body, componentId?, adrId?, commitTitle?, question?, revision: { commit, snapshotId, workspaceRevision, pinnedAt, fingerprint? } }], revision, createdBy, updatedBy, createdAt, updatedAt`. Index `{ projectId: 1, updatedAt: -1 }`. `fingerprint` chỉ có ở bước component / adr ghim từ khi có tính năng này (§2).
- `onboardingassignments`: `projectId, pathId, userId, assignedBy, assignedAt, progress, updatedAt`; `progress` là một đối tượng theo id bước: `{ attempts?, lastChoice?, completedAt? }`. Index duy nhất `{ pathId: 1, userId: 1 }` và `{ userId: 1, updatedAt: -1 }`.
- Mỗi thao tác ghi tiến độ là một lệnh ghi nguyên tử trên đúng một khóa của bước (`$inc` số lần thử, `$set` thời điểm xong khi chưa có), nên bấm hai lần hoặc hai yêu cầu cùng lúc không làm hỏng dữ liệu; lần hoàn thành đầu tiên được giữ.
- Lưu lộ trình dùng kiểm tra revision và ghi trong một lệnh (`findOneAndUpdate` có điều kiện revision), như workspace: hai mentor cùng sửa thì chỉ người lưu trước thắng, người sau nhận 409 và không mất gì.
- Xóa project xóa luôn lộ trình và các lần giao của nó.

## 6. Quyết định đã chọn

Quyết định đã chọn (tài liệu tổng quan chưa nêu chi tiết, dễ đổi nếu nhóm muốn khác):

- **Câu hỏi kiểm tra là trắc nghiệm có chấm tự động**, để mentor thấy được số lần thử của từng người và lộ trình có đo được. Bước đọc (component, commit, adr) do người học tự đánh dấu "đã xong".
- Hoàn thành một câu hỏi cần trả lời đúng; trả lời sai chỉ tăng số lần thử, không giới hạn số lần, và lời giải thích chỉ hiện sau khi trả lời đúng.
- Chỉ **thành viên project** (hoặc chủ project) được giao lộ trình; Organization Owner không phải thành viên thì không nhận được, nhưng soạn và xem tiến độ được ở mọi project của tổ chức.
- Lộ trình thuộc một project, không dùng chung giữa các project.

## 7. Giao diện

Mục "Learning" trong thanh điều hướng của mọi tài khoản đăng nhập (vai trò hệ thống User), vì Maintainer là vai trò theo từng project chứ không còn là vai trò hệ thống:

| Đường dẫn | Dành cho | Nội dung |
|---|---|---|
| `/learning` (tab "My learning") | người học | Thẻ "Continue learning" ở trên cùng (lộ trình chưa xong được động tới gần nhất: tên, workspace, tiến độ, "Next: bước tiếp theo", nút mở thẳng bước đó), rồi các lộ trình được giao cho tôi, tiến độ của riêng tôi, bước tiếp theo, nút Start / Continue / Review |
| `/dashboard` | người học | Cùng thẻ "Continue learning" (kèm số lộ trình còn dở khác); không có gì khi chưa được giao lộ trình nào hoặc đã học xong hết |
| `/learning/:projectId/:pathId` (`?step=<id>` mở và cuộn tới một bước) | người học | Từng bước: đọc ghi chú của mentor; bước component có mô tả, các component nó phụ thuộc và phụ thuộc vào nó (tên, nhãn), các ADR Accepted có nhắc tới nó; bước adr có context, decision, alternatives, consequences, trạng thái, các component liên quan và nguồn (commit dẫn sang trang evidence, còn snapshot / evidence / approval chỉ là chữ vì hàng đợi phê duyệt chỉ dành cho maintainer); tên component / ADR có bước riêng trong lộ trình thì bấm để mở bước đó. Mỗi bước có nút "Ask the AI mentor about this" mở `/insights?projectId=&q=`: trang AI Insights chọn sẵn workspace và điền sẵn câu hỏi về component / ADR / commit đó **mà không gửi** (bước câu hỏi thì xin gợi ý, không xin đáp án). Đánh dấu "xong", trả lời câu hỏi; bước có thể đã cũ được gắn cờ kèm lý do. Tất cả dữ liệu lấy từ `GET /api/projects/:id/workspace` (quyền `read`) |
| `/learning?tab=manage` (tab "Manage paths") | mentor | Chỉ hiện với người là maintainer của ít nhất một workspace (`useMaintainsWorkspaces`; lúc chưa biết thì chỉ hiện khi đường dẫn có `?tab=manage`). Chọn workspace mình có quyền ghi (`GET /api/projects?scope=managed`), bảng lộ trình với số người, số người xong, số bước cần cập nhật; mở hộp thoại "People" để giao lộ trình và xem tiến độ từng người, từng bước (ô vuông xanh: xong, đỏ: thử từ 3 lần vẫn chưa xong) |
| `/learning/manage/:projectId/new` và `/learning/manage/:projectId/:pathId` | mentor | Trình soạn: tiêu đề, mô tả, nháp hoặc công bố, các bước (chọn component, commit, quyết định thiết kế từ chính workspace; câu hỏi có nhiều đáp án và đáp án đúng), đổi thứ tự, xóa, ghim lại vào revision hiện tại; lưu có kiểm tra revision và hỏi trước khi bỏ bản nháp để tải bản mới khi bị xung đột |

Trang mentor không có nút nào dẫn tới người không có quyền ghi: người không là maintainer của workspace nào không thấy tab "Manage paths", và mở thẳng đường dẫn trình soạn thì nhận 403 từ server. Ẩn tab chỉ là giao diện; server vẫn kiểm tra mọi yêu cầu.

Trong trình soạn, bước bị cờ `outdated` có ô "I have checked this step against the current version: mark it up to date when I save" (gửi `repin: true`); bước `REF_GONE` thì không ghim lại được, mentor chọn component / quyết định khác hoặc xóa bước.

## 8. Chưa làm

Báo cáo tiến độ toàn tổ chức cho Organization Owner; thông báo cho người học khi được giao lộ trình; thông báo cho mentor khi một bước chuyển sang `missing`.
