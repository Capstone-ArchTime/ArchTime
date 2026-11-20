import { defineMessages, message } from '../i18n/define.ts';
import type { Params } from '../i18n/index.ts';

/**
 * Small texts of several feature helpers (AI runs, chat history, unread findings, mining progress). English is the
 * wording the tests expect.
 */
export const HELPER_TEXT = defineMessages({
  // llm-api / llm-run-view
  accepted: 'Accepted', fallback: 'Fell back', failed: 'Failed', cancelled: 'Cancelled', answered: 'Answered', chatRun: 'AI Insights chat', namesOnly: 'names only',
  // chat-history
  downgraded: '{count} claims were marked FACT without citing a mined commit, so they now read INFERENCE',
  downgraded_one: '1 claim was marked FACT without citing a mined commit, so it now reads INFERENCE',
  removed: "{count} cited commits are not in this workspace's mined history and were removed ({list})",
  removed_one: "1 cited commit is not in this workspace's mined history and was removed ({list})",
  checked: 'Checked by ArchTime: {parts}.', today: 'Today {time}',
  // unread-findings
  inOne: ' in {name}', inMany: ' in {n} workspaces', unread: 'You have {count} new conformance findings{where} to review.', unread_one: 'You have 1 new conformance finding{where} to review.',
  // mining-coverage
  preparing: 'Preparing', batch: 'Batch {index}/{count} · {processed}/{total} commits',
  // agent-access
  active: 'Active', expired: 'Expired', revoked: 'Revoked',
  // organizations-api
  other: 'Other', nameLength: 'Use {min} to {max} characters.', atMost: 'Use at most {max} characters.', validEmail: 'Enter a valid email address.',
  lastOwner: 'An organization needs at least one owner. Make someone else an owner first.', personal: 'Personal space', and: ' and ',
  suspendedOne: '{list} is suspended by a System Administrator. Its workspaces are hidden and cannot be opened until it is reactivated; nothing was deleted.',
  suspendedMany: '{list} are suspended by a System Administrator. Its workspaces are hidden and cannot be opened until it is reactivated; nothing was deleted.',
  nameAndUrl: 'Workspace name and repository URL are required.', chooseCredential: "Choose one of the organization's credentials, or use a personal token.",
  tokenRequired: 'A personal access token is required for a private repository.',
  // tasks
  noTasks: 'No tasks', done: '{done} / {total} done ({pct} %)', created: '{n} new', updated: '{n} updated', unchanged: '{n} unchanged', markedRemoved: '{n} marked removed', restored: '{n} restored',
  imported: 'Imported: {parts}. {count} new commit links.', imported_one: 'Imported: {parts}. 1 new commit link.', unknownKeys: ' Commits also name {keys}, which are not tasks here.',
  noCommit: 'No commit names this task yet.', depsLine: '{added} dependencies added, {removed} removed', depsLine_one: '1 dependency added, {removed} removed',
  noDiagram: '{count} commits: {deps}. Map path prefixes in the Component Diagram to see the components.', noDiagram_one: '1 commit: {deps}. Map path prefixes in the Component Diagram to see the components.',
  inList: ' in {list}', taskSummary: '{count} commits, {arch} changing dependencies between components{where}; {deps}.', taskSummary_one: '1 commit, {arch} changing dependencies between components{where}; {deps}.',
  // project-transfer
  duplicate: '{org} already has a workspace for this repository ("{name}"). Use that workspace, or delete one of them first.',
  losing: '{count} members of this workspace are not in {org} and will lose access: {names}. Invite them to the organization to keep them.',
  losing_one: '1 member of this workspace is not in {org} and will lose access: {names}. Invite them to the organization to keep them.',
  // path-prefixes
  maxPrefixes: 'A component can have at most {max} path prefixes.', badPrefix: '"{value}" is not a path inside the repository. Use a folder or file path such as BE/src/billing.',
  prefixTaken: 'Path prefix "{prefix}" is already mapped to component "{other}"; it cannot also be mapped to "{name}". Each path prefix belongs to one component.',
  // onboarding-context
  srcCommit: 'Commit', srcSnapshot: 'Snapshot', srcEvidence: 'Evidence', srcApproval: 'Approved request',
  askComponent: 'What does the {name} component do in this workspace? What does it depend on, what depends on it, and how has it changed over the commit history?',
  theDecision: 'the design decision "{title}"', askDecision: 'Why was {what} decided? Which commits and components does it concern, and what are its consequences?',
  askCommitTitle: 'What changed in the architecture in the commit "{title}", and why?', askCommit: 'What changed in the architecture in commit {hash}{title}, and why?',
  askQuestion: 'Help me understand what this question is about, without telling me the answer: {prompt}',
  stepUnavailable: 'The workspace of that learning step is not available to you here, so its question was not filled in.', workspaceUnavailable: 'That workspace is not available to you here.',
  // managed-access
  notMaintainer: 'You do not maintain this workspace (any more). Reload the page to see the workspaces you maintain now.',
}, {
  accepted: 'Được chấp nhận', fallback: 'Dùng phương án dự phòng', failed: 'Thất bại', cancelled: 'Đã huỷ', answered: 'Đã trả lời', chatRun: 'Trò chuyện Phân tích AI', namesOnly: 'chỉ đặt tên',
  downgraded: '{count} khẳng định được gắn FACT mà không dẫn commit đã mining, nên giờ được ghi là INFERENCE',
  removed: '{count} commit được dẫn không có trong lịch sử đã mining của không gian làm việc này và đã bị bỏ ({list})',
  checked: 'ArchTime đã kiểm tra: {parts}.', today: 'Hôm nay {time}',
  inOne: ' trong {name}', inMany: ' trong {n} không gian làm việc', unread: 'Bạn có {count} phát hiện tuân thủ mới{where} cần xem.',
  preparing: 'Đang chuẩn bị', batch: 'Đợt {index}/{count} · {processed}/{total} commit',
  active: 'Đang dùng', expired: 'Hết hạn', revoked: 'Đã thu hồi',
  other: 'Khác', nameLength: 'Dùng từ {min} đến {max} ký tự.', atMost: 'Dùng tối đa {max} ký tự.', validEmail: 'Hãy nhập địa chỉ email hợp lệ.',
  lastOwner: 'Tổ chức cần ít nhất một chủ sở hữu. Hãy cho người khác làm chủ sở hữu trước.', personal: 'Không gian cá nhân', and: ' và ',
  suspendedOne: '{list} đang bị quản trị viên hệ thống tạm ngưng. Các không gian làm việc của tổ chức bị ẩn và không mở được cho tới khi được kích hoạt lại; không có gì bị xoá.',
  suspendedMany: '{list} đang bị quản trị viên hệ thống tạm ngưng. Các không gian làm việc của các tổ chức này bị ẩn và không mở được cho tới khi được kích hoạt lại; không có gì bị xoá.',
  nameAndUrl: 'Cần có tên không gian làm việc và URL repository.', chooseCredential: 'Hãy chọn một thông tin xác thực của tổ chức, hoặc dùng token cá nhân.',
  tokenRequired: 'Repository riêng tư cần token truy cập cá nhân.',
  noTasks: 'Không có task', done: '{done} / {total} xong ({pct} %)', created: '{n} mới', updated: '{n} cập nhật', unchanged: '{n} không đổi', markedRemoved: '{n} đánh dấu đã xoá', restored: '{n} khôi phục',
  imported: 'Đã nhập: {parts}. {count} liên kết commit mới.', unknownKeys: ' Các commit còn nhắc tới {keys}, nhưng đó không phải task ở đây.',
  noCommit: 'Chưa có commit nào nhắc tới task này.', depsLine: '{added} phụ thuộc được thêm, {removed} bị xoá',
  noDiagram: '{count} commit: {deps}. Hãy ánh xạ tiền tố đường dẫn trong Sơ đồ thành phần để thấy các thành phần.',
  inList: ' trong {list}', taskSummary: '{count} commit, {arch} commit thay đổi phụ thuộc giữa các thành phần{where}; {deps}.',
  duplicate: '{org} đã có một không gian làm việc cho repository này ("{name}"). Hãy dùng không gian đó, hoặc xoá một trong hai trước.',
  losing: '{count} thành viên của không gian làm việc này không thuộc {org} và sẽ mất quyền truy cập: {names}. Hãy mời họ vào tổ chức để giữ lại.',
  maxPrefixes: 'Một thành phần có tối đa {max} tiền tố đường dẫn.', badPrefix: '"{value}" không phải đường dẫn bên trong repository. Hãy dùng đường dẫn thư mục hoặc tệp, ví dụ BE/src/billing.',
  prefixTaken: 'Tiền tố đường dẫn "{prefix}" đã được gán cho thành phần "{other}"; không thể gán thêm cho "{name}". Mỗi tiền tố chỉ thuộc một thành phần.',
  srcCommit: 'Commit', srcSnapshot: 'Ảnh chụp', srcEvidence: 'Bằng chứng', srcApproval: 'Yêu cầu đã duyệt',
  askComponent: 'Thành phần {name} làm gì trong không gian làm việc này? Nó phụ thuộc vào gì, cái gì phụ thuộc vào nó, và nó đã thay đổi thế nào qua lịch sử commit?',
  theDecision: 'quyết định thiết kế "{title}"', askDecision: 'Vì sao {what} được đưa ra? Nó liên quan tới những commit và thành phần nào, và hệ quả của nó là gì?',
  askCommitTitle: 'Commit "{title}" đã thay đổi gì trong kiến trúc, và vì sao?', askCommit: 'Commit {hash}{title} đã thay đổi gì trong kiến trúc, và vì sao?',
  askQuestion: 'Giúp tôi hiểu câu hỏi này nói về điều gì, nhưng đừng cho tôi biết đáp án: {prompt}',
  stepUnavailable: 'Bạn không truy cập được không gian làm việc của bước học đó ở đây, nên câu hỏi chưa được điền sẵn.', workspaceUnavailable: 'Bạn không truy cập được không gian làm việc đó ở đây.',
  notMaintainer: 'Bạn không (còn) bảo trì không gian làm việc này. Hãy tải lại trang để thấy các không gian làm việc bạn đang bảo trì.',
});

export const hx = (key: Parameters<typeof message<typeof HELPER_TEXT.en>>[1], params?: Params): string => message(HELPER_TEXT, key, params);
