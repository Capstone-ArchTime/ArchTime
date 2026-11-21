import { defineMessages, message } from '../i18n/define.ts';
import type { Params } from '../i18n/index.ts';

/** Texts of the conformance helpers (conformance.ts); English is the wording the tests expect. */
export const CONFORMANCE_TEXT = defineMessages({
  forbidden: 'Forbidden dependency', forbiddenHelp: 'A rule forbids this dependency, and the code has it.',
  missing: 'Missing required dependency', missingHelp: 'A rule requires this dependency, and the code does not have it.',
  undeclared: 'Undeclared dependency', undeclaredHelp: 'The code has this dependency, but the confirmed diagram does not declare it.',
  convention: 'Commit convention', conventionHelp: 'The commit message is not "type(scope): summary" with Task: and Arch-Change:, or its Arch-Change differs from the dependencies the commit really changed.',
  fix: 'To fix', fixVerb: 'Fix', fixHelp: 'A real departure: the code is to be changed.',
  accept: 'Accepted', acceptVerb: 'Accept', acceptHelp: 'Intended: the diagram should follow, through an architecture change request. Carries over to later commits.',
  dismiss: 'Dismissed', dismissVerb: 'Dismiss', dismissHelp: 'Not a real problem (a false positive, generated code). Carries over to later commits.',
  noConvention: 'The commit does not follow the commit convention', byRule: ' by "{rule}"',
  isForbidden: '{pair} is forbidden{by}', isMissing: '{pair} is required{by} but missing', notInDiagram: '{pair} is not in the diagram',
  otherJob: 'Another job (mining, a scan or a check) is running for this workspace. Mining runs the check by itself when it finishes; otherwise try again then.',
  cannotStart: 'The check could not start.', newFindings: '{count} new findings', newFindings_one: '1 new finding',
  nothingNew: 'Nothing new to e-mail: every open finding was already e-mailed, or has been decided.',
  nobody: '{findings}, but nobody can receive them: the owner and maintainers need an active account with a verified e-mail. They will be e-mailed once someone can.',
  notSent: "The e-mail about {findings} could not be sent. Check the server's e-mail (SMTP) settings; they will be e-mailed on the next try.",
  people: '{count} people', people_one: '1 person', someOf: '{sent} of {count} people', someOf_one: '{sent} of 1 person', mailed: 'E-mailed {findings} to {people}.',
}, {
  forbidden: 'Phụ thuộc bị cấm', forbiddenHelp: 'Một quy tắc cấm phụ thuộc này, nhưng mã nguồn lại có.',
  missing: 'Thiếu phụ thuộc bắt buộc', missingHelp: 'Một quy tắc yêu cầu phụ thuộc này, nhưng mã nguồn không có.',
  undeclared: 'Phụ thuộc chưa khai báo', undeclaredHelp: 'Mã nguồn có phụ thuộc này, nhưng sơ đồ đã xác nhận không khai báo.',
  convention: 'Quy ước commit', conventionHelp: 'Thông điệp commit không theo dạng "type(scope): summary" kèm Task: và Arch-Change:, hoặc Arch-Change khác với các phụ thuộc commit thực sự thay đổi.',
  fix: 'Cần sửa', fixVerb: 'Sửa', fixHelp: 'Một sai lệch thật: mã nguồn cần được sửa.',
  accept: 'Chấp nhận', acceptVerb: 'Chấp nhận', acceptHelp: 'Có chủ đích: sơ đồ sẽ cập nhật theo, qua một yêu cầu thay đổi kiến trúc. Áp dụng tiếp cho các commit sau.',
  dismiss: 'Bỏ qua', dismissVerb: 'Bỏ qua', dismissHelp: 'Không phải vấn đề thật (báo nhầm, mã sinh tự động). Áp dụng tiếp cho các commit sau.',
  noConvention: 'Commit không theo quy ước commit', byRule: ' bởi "{rule}"',
  isForbidden: '{pair} bị cấm{by}', isMissing: '{pair} là bắt buộc{by} nhưng đang thiếu', notInDiagram: '{pair} không có trong sơ đồ',
  otherJob: 'Đang có việc khác (mining, quét hoặc kiểm tra) chạy cho không gian làm việc này. Mining sẽ tự chạy kiểm tra khi xong; nếu không, hãy thử lại sau.',
  cannotStart: 'Không bắt đầu được việc kiểm tra.', newFindings: '{count} phát hiện mới',
  nothingNew: 'Không có gì mới để gửi: mọi phát hiện mở đều đã được gửi email hoặc đã được quyết định.',
  nobody: '{findings}, nhưng không ai nhận được: chủ sở hữu và người bảo trì cần tài khoản đang hoạt động với email đã xác minh. Email sẽ được gửi khi có người nhận được.',
  notSent: 'Không gửi được email về {findings}. Hãy kiểm tra cài đặt email (SMTP) của máy chủ; email sẽ được gửi ở lần thử tới.',
  people: '{count} người', someOf: '{sent} / {count} người', mailed: 'Đã gửi email về {findings} tới {people}.',
});

export const cx = (key: Parameters<typeof message<typeof CONFORMANCE_TEXT.en>>[1], params?: Params): string => message(CONFORMANCE_TEXT, key, params);
