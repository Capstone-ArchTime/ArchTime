# Implementation Summary: Iteration 1–5

| | |
|---|---|
| Ngày | 2026-11-05 |
| Nhánh | `Feature/evaluationRepo` (nền `010674b`), **chưa commit** |
| Kiểm thử cuối | BE **577/577 pass**, `tsc` sạch · FE **365/365 pass**, `tsc -b` + `vite build` sạch, `oxlint` 0 lỗi (các file mới/sửa không có cảnh báo) |

## 1. Trạng thái từng task

| Task | Trạng thái | File chính đã thay đổi | Test result | Ghi chú |
|---|---|---|---|---|
| T07 Test Plan | Completed | `docs/report5-test-plan.md` | Mọi test case trong plan trỏ tới test có thật và đang xanh | Có checklist UAT thủ công |
| T08 Phương pháp | Partially Completed | `docs/methodology-decision.md` | n/a (tài liệu) | **Chờ nhóm duyệt** (mục Phê duyệt còn trống) |
| T17 Mine theo mốc | Completed | `domain/mining/miningPlan.ts`, `MiningService.ts`, `MiningJobModel`, `SnapshotModel`, `MiningPanel.tsx`, `mining-api.ts` | `mining-plan.test.mjs` 9/9, `mining-service.test.mjs` 8/8 (repo git thật: tag nhẹ + tag annotated, chỉ mốc, rồi phần còn lại, không trùng, rebaseline, gắn tag cho snapshot cũ) | Chế độ `milestones` (+ `milestonesOnly`); tên tag lưu vào `version`/`tags` nên trang Compare tự hiển thị. Thêm `--tags` khi fetch |
| T18 Chọn repo | Partially Completed | `docs/repo-selection.md` | n/a | Số liệu lịch sử thật (đếm bằng git); **chưa chạy thực nghiệm**; chờ nhóm duyệt |
| T19 Protocol | Partially Completed | `docs/evaluation-protocol.md` | n/a | v1.0 kèm commit đóng băng; **có hiệu lực khi được ký duyệt** |
| T30 Gỡ thành viên | Completed | `OrganizationUseCases.ts`, `organizationGate.ts`, `ProjectInvitationUseCases.ts`, `InviteProjectMemberUseCase.ts`, `MongoPendingInvitationStore.ts`, `MembersTab.tsx` | `organizations.test.mjs` 16/16; system S04, S05 | Phần lớn đã có sẵn (cả audit). Đã vá: lời mời đang chờ bị thu hồi khi gỡ; mời hoặc chấp nhận vào project tổ chức đòi phải là thành viên tổ chức (trước đây tạo được membership "ngủ", sống lại khi người đó được thêm lại vào tổ chức) |
| T31 Hạ nhãn FACT | Completed | `domain/mentor/claimLabels.ts`, `ProjectChatUseCase.ts`, `ChatHistoryUseCases.ts`, `ChatConversationModel`, `chat-history.ts`, `Insights.tsx` | `mentor-claim-labels.test.mjs` 11/11; test chat cũ vẫn xanh | Kiểm tra hash với **mọi commit đã mine** của project (bỏ commit đã biến mất), không chỉ 60 mục trong ngữ cảnh. Kết quả kiểm tra được lưu vào lịch sử, ghi log và hiển thị dưới câu trả lời. ADR vẫn không nằm trong ngữ cảnh |
| T32 Canonical Map | Completed | `domain/architecture/canonical.ts`, `SaveProjectWorkspaceUseCase.ts`, `SaveProjectDiagramUseCase.ts`, `GetProjectWorkspaceUseCase.ts`, `Workspace`/`WorkspaceModel`, `canonical-map.ts`, `ComponentDiagram.tsx`, `LearningPath.tsx`, `ArchitectureWorkspace.tsx` | `canonical-map.test.mjs` BE 9/9, FE 4/4; system S08, S09 | Đã vá lỗ hổng: client từng gửi được `confirmedBy` tuỳ ý. Thêm `confirmedRevision`, tên người xác nhận, và tự mất xác nhận khi nội dung đổi. UI phân biệt Clustered / Refined / Canonical |
| T33 Đo extractor | Partially Completed | `DependencyExtractor.ts` (tách nguyên văn), `domain/evaluation/extractor.ts`, `scripts/extractor-eval.ts`, `docs/extractor-evaluation-report.md` | `extractor-eval.test.mjs` 7/7 | Công cụ xong. **Chưa có ground truth nên chưa có kết quả.** Test cho thấy extractor bỏ sót `export … from`, `require()`, `import()` |
| T39 Giao diện Newcomer | Completed | `LearningPath.tsx`, `Insights.tsx`, `onboarding-api.ts` | onboarding-*.test (đã có) và test mới của T31/T32; system S09 | Phần lớn đã có sẵn. Bổ sung: dải trạng thái Canonical/Draft, ghi chú kết quả kiểm tra nhãn. **Chưa kiểm tra trực quan trên trình duyệt** (UAT U4, U5) |
| T44 Admin tổ chức | Completed | `GetAdminOrganizationsUseCase.ts`, `AdminOrganizationController.ts`, `admin.routes.ts`, `MongoOrganizationRepository.ts`, `Organizations.tsx`, `admin-organizations.ts`, `permissions.ts`, `navigation.ts`, `App.tsx` | `admin-organizations.test.mjs` BE 2/2, FE 4/4; system S01, S11, S12 | Chỉ xem metadata (đã chốt): không có repoUrl, mô tả project, token. Có tìm kiếm và phân trang. **Chưa kiểm tra trực quan** (UAT U1) |
| T45 Đổi mật khẩu | Completed | `profile-and-sessions.test.mjs` (code đã có sẵn) | Test HTTP mới pass | Đã kiểm: mật khẩu cũ, luật mật khẩu, nhập lại, lưu dạng hash, không lộ trong response hay log, token cũ trả 401 |
| T50 System test | Completed | `tests/system-permissions.test.mjs`, `FE/tests/permissions.test.mjs`, `docs/system-test-report.md` | 12/12 pass; đã thử đột biến (S12 bắt được lỗi) | Lưu trữ chạy trong bộ nhớ, chưa chạy với MongoDB thật (đã ghi ở mục Giới hạn) |

## 2. Thay đổi API

| Endpoint | Thay đổi |
|---|---|
| `GET /api/admin/organizations`, `GET /api/admin/organizations/:id` | **Mới.** Chỉ System Administrator; chỉ metadata |
| `DELETE /api/organizations/:orgId/members/:memberId` | Response thêm `cancelledInvitations` |
| `POST /api/projects/:id/mine` | `mode` nhận thêm `milestones`; thêm `milestonesOnly` |
| `POST /api/projects/:id/chat` | Response thêm `labelCheck`. `answer` giờ là text **đã kiểm tra** |
| `PUT /api/projects/:id/workspace`, `PUT /diagram`, `POST /diagram/confirm` | `confirmedBy`, `confirmedRevision` do server đặt. Diagram rỗng thì không xác nhận được (400) |
| `GET /api/projects/:id/workspace` | Diagram có thêm `confirmedRevision`, `confirmedByName` |
| Mời hoặc chấp nhận vào project của tổ chức | 403 nếu người được mời không thuộc tổ chức |

## 3. Thay đổi database (chỉ thêm trường, không cần migration)

| Collection | Trường mới |
|---|---|
| `workspaces.diagram` | `confirmedRevision` (Number, mặc định null) |
| `snapshots` | `tags` ([String]); `version` giờ là tên tag nếu có |
| `miningjobs` | `mode` nhận thêm `milestones`; `milestonesOnly` |
| `chatconversations.messages` | `labelCheck` (Mixed) |

Bản ghi cũ vẫn đọc được bình thường. Lần Scan tiếp theo sẽ gắn tên tag cho các snapshot đã mine từ trước.

## 4. Khác

- **Test FE chạy được trên Node 22:** trước đây 20 test lỗi vì `t.mock.property` chỉ có từ Node 24. Đã thay bằng helper `FE/tests/mock-global.mjs`.
- **Đã biết, chưa sửa:**
  - `npm run lint` ở BE không chạy được vì thiếu `eslint.config.js` (có từ trước đợt này).
  - Extractor bỏ sót `export … from` và `require()`: chờ số liệu T33 rồi mới sửa ([extractor-evaluation-report.md](extractor-evaluation-report.md) §5).
  - `AcceptProjectInvitationUseCase` cho tài khoản đang đăng nhập chấp nhận lời mời dù email không khớp với email được mời (có từ trước; ngoài phạm vi đợt này, nên xử lý riêng).
- **Việc của nhóm:** ký duyệt T08 và T19; gán nhãn ba phiếu EX; chạy UAT U1–U7 trên trình duyệt với MongoDB thật.
