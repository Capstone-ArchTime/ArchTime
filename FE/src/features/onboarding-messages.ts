import { defineMessages, message } from '../i18n/define.ts';
import type { Params } from '../i18n/index.ts';

/** Texts of the learning-path helpers (onboarding-view.ts); English is the wording the tests expect. */
export const LEARN_VIEW = defineMessages({
  kindComponent: 'Component', kindComponentHint: 'Explain one component of the architecture',
  kindCommit: 'Commit', kindCommitHint: 'Walk through one mined commit and its evidence',
  kindAdr: 'Design decision', kindAdrHint: 'Read one design decision (ADR)',
  kindQuestion: 'Question', kindQuestionHint: 'Check understanding with a multiple-choice question',
  mayDescribe: '{changed} The step may describe it as it was.', changed: 'What this step is about changed after it was written, so it may describe an older version.',
  gone: 'What this step was written about is no longer in the repository.',
  progress: '{done} of {count} steps', progress_one: '{done} of 1 step',
  correctFirst: 'Correct, on the first try.', correctAfter: 'Correct, after {n} tries.', notQuite: 'Not quite. Read the step again and try another answer.',
  published: 'Published', draft: 'Draft',
  missing: '{count} steps point at something that is gone', missing_one: '1 step points at something that is gone', outdated: '{n} may be out of date',
  notStarted: 'not started', inProgress: 'in progress', finished: 'finished',
  needTitle: 'Give the path a title.', needStep: 'A published path needs at least one step.', maxSteps: 'At most {n} steps.', stepTitle: 'Give the step a title.',
  chooseComponent: 'Choose a component.', chooseAdr: 'Choose a design decision.', chooseCommit: 'Choose a commit.', writeQuestion: 'Write the question.',
  fillAnswers: 'Fill in every answer, or remove the empty ones.', sameAnswers: 'Two answers are the same.', markRight: 'Mark the right answer.',
}, {
  kindComponent: 'Thành phần', kindComponentHint: 'Giải thích một thành phần của kiến trúc',
  kindCommit: 'Commit', kindCommitHint: 'Đi qua một commit đã mining và bằng chứng của nó',
  kindAdr: 'Quyết định thiết kế', kindAdrHint: 'Đọc một quyết định thiết kế (ADR)',
  kindQuestion: 'Câu hỏi', kindQuestionHint: 'Kiểm tra mức hiểu bằng câu hỏi trắc nghiệm',
  mayDescribe: '{changed} Bước này có thể đang mô tả nó như trước đây.', changed: 'Nội dung bước này nói tới đã thay đổi sau khi được viết, nên có thể mô tả phiên bản cũ hơn.',
  gone: 'Nội dung bước này nói tới không còn trong repository.',
  progress: '{done} / {count} bước',
  correctFirst: 'Chính xác, ngay lần đầu.', correctAfter: 'Chính xác, sau {n} lần thử.', notQuite: 'Chưa đúng. Hãy đọc lại bước này và thử đáp án khác.',
  published: 'Đã xuất bản', draft: 'Bản nháp',
  missing: '{count} bước trỏ tới thứ đã không còn', outdated: '{n} bước có thể đã cũ',
  notStarted: 'chưa bắt đầu', inProgress: 'đang học', finished: 'đã xong',
  needTitle: 'Hãy đặt tiêu đề cho lộ trình.', needStep: 'Lộ trình đã xuất bản cần ít nhất một bước.', maxSteps: 'Tối đa {n} bước.', stepTitle: 'Hãy đặt tiêu đề cho bước.',
  chooseComponent: 'Hãy chọn một thành phần.', chooseAdr: 'Hãy chọn một quyết định thiết kế.', chooseCommit: 'Hãy chọn một commit.', writeQuestion: 'Hãy viết câu hỏi.',
  fillAnswers: 'Hãy điền mọi đáp án, hoặc xoá các đáp án trống.', sameAnswers: 'Có hai đáp án giống nhau.', markRight: 'Hãy đánh dấu đáp án đúng.',
});

export const lx = (key: Parameters<typeof message<typeof LEARN_VIEW.en>>[1], params?: Params): string => message(LEARN_VIEW, key, params);
