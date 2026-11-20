import { defineMessages } from '@/i18n/define';

/** Texts shared by the maintainer pages: the workspace picker, loading and save conflicts. */
export const MAINT = defineMessages({
  noManaged: 'You do not maintain any workspace yet. {link}, or ask a workspace owner to make you a maintainer.', createWorkspace: 'Create a workspace',
  noWorkspaces: 'You are not in any workspace yet. {link}, or ask a workspace owner to invite you.', loadFailed: 'Your workspaces could not be loaded.',
  loading: 'Loading your workspaces…', retry: 'Retry', switchTitle: 'Switch workspace without saving?', switchBody: 'The current diagram has unsaved changes.',
  discardSwitch: 'Discard and switch', keepEditing: 'Keep editing', workspace: 'Workspace', notMaintained: 'You do not maintain the workspace in this link, so one you maintain is shown instead.',
  storageError: 'This workspace could not be loaded from the server. Editing is disabled until it loads.', loadLatestTitle: 'Load the latest version?',
  loadLatestBody: 'Your unsaved changes will be discarded. Copy anything you want to keep before continuing.', discardLoad: 'Discard and load latest',
  conflictTitle: 'Not saved: this workspace was changed by someone else', conflictKept: '{error} Your changes were kept here but not saved.', loadLatest: 'Load latest version', newCount: '{name}: {count} new',
}, {
  noManaged: 'Bạn chưa bảo trì không gian làm việc nào. {link}, hoặc nhờ chủ sở hữu cho bạn làm người bảo trì.', createWorkspace: 'Tạo không gian làm việc',
  noWorkspaces: 'Bạn chưa tham gia không gian làm việc nào. {link}, hoặc nhờ chủ sở hữu mời bạn.', loadFailed: 'Không tải được các không gian làm việc của bạn.',
  loading: 'Đang tải các không gian làm việc của bạn…', retry: 'Thử lại', switchTitle: 'Đổi không gian làm việc mà không lưu?', switchBody: 'Sơ đồ hiện tại có thay đổi chưa lưu.',
  discardSwitch: 'Bỏ thay đổi và đổi', keepEditing: 'Tiếp tục sửa', workspace: 'Không gian làm việc', notMaintained: 'Bạn không bảo trì không gian làm việc trong liên kết này, nên đang hiển thị một không gian bạn bảo trì.',
  storageError: 'Không tải được không gian làm việc này từ máy chủ. Không sửa được cho tới khi tải xong.', loadLatestTitle: 'Tải phiên bản mới nhất?',
  loadLatestBody: 'Các thay đổi chưa lưu sẽ bị bỏ. Hãy sao chép những gì bạn muốn giữ trước khi tiếp tục.', discardLoad: 'Bỏ thay đổi và tải bản mới nhất',
  conflictTitle: 'Chưa lưu: người khác đã sửa không gian làm việc này', conflictKept: '{error} Thay đổi của bạn vẫn được giữ ở đây nhưng chưa được lưu.', loadLatest: 'Tải phiên bản mới nhất', newCount: '{name}: {count} mới',
});
