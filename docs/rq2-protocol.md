# RQ2: Protocol đánh giá AI Mentor

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-15 |
| Câu hỏi nghiên cứu | Thiết kế của AI Mentor (nhãn FACT / INFERENCE / UNKNOWN và bước kiểm tra trích dẫn) có làm câu trả lời có căn cứ hơn không? |
| Công cụ | `BE/scripts/rq2.ts` (`npm run rq2`), `BE/src/domain/evaluation/rq2.ts` (test: `BE/tests/rq2.test.mjs`) |
| Bộ câu hỏi | [rq2/questions.json](rq2/questions.json) |
| Repo | axios, nest, ArchTime (như RQ1, [evaluation-protocol.md](evaluation-protocol.md) §2) |

## 1. Ba điều kiện

Cùng một model, cùng câu hỏi; chỉ khác những gì model nhận được và những gì xảy ra sau khi nó trả lời.

| Điều kiện | Model nhận | Sau khi trả lời |
|---|---|---|
| **C0** | Chỉ câu hỏi và tên, địa chỉ repo. Không có dữ liệu project | Giữ nguyên |
| **C1** | Dữ liệu project như mentor thật (snapshot, change evidence, cấu trúc mới nhất), dặn chỉ trả lời từ dữ liệu; **không** gắn nhãn, **không** dặn trích dẫn commit | Giữ nguyên |
| **C2** | Mentor ArchTime đúng như người dùng gặp: cùng dữ liệu, prompt của mentor (gắn nhãn, trích dẫn commit) | Bước kiểm tra của mentor: hash không phải commit đã mine bị bỏ; FACT không còn trích dẫn hợp lệ bị hạ thành INFERENCE |

Dữ liệu project của C1 và C2 do cùng một hàm dựng (`mentorProjectData`), prompt C2 là `SYSTEM_PROMPT` của mentor, và bước
kiểm tra là `enforceClaimLabels`. So C1 với C2 vì thế đo đúng tác động của nhãn và bước kiểm tra trích dẫn; so C0 với C1
đo tác động của dữ liệu project.

## 2. Bộ câu hỏi

Mười câu cố định cho mỗi repo ([rq2/questions.json](rq2/questions.json)): Q1–Q8 trả lời được từ dữ liệu đã mine (cấu trúc,
thay đổi kiến trúc, file, tác giả, kích thước theo thời gian); Q9–Q10 **không** trả lời được từ dữ liệu (lý do thiết kế, số
người dùng) để đo việc từ chối đúng chỗ. Mỗi câu có cột `expected`: điều một câu trả lời phải có để tính là bao phủ.

Không sửa bộ câu hỏi sau khi đã chạy model; nếu phải sửa, tăng `version` và chạy lại toàn bộ.

## 3. Quy trình

1. **Chuẩn bị.** Mine mỗi repo đến commit đóng băng (như RQ1). Ghi model dùng (nhà cung cấp, tên, ngày) vào báo cáo.
2. **Chạy model.** `npm run rq2 -- list` để lấy id workspace, rồi với mỗi repo:
   `npm run rq2 -- run --project <id> --repo <axios|nest|archtime>`. Mỗi câu trả lời lưu ở
   `rq2-results/answers/<repo>.<câu>.<điều kiện>.json` (cả bản gốc và bản sau kiểm tra, token, thời gian). Câu đã có
   kết quả không bị hỏi lại (`--force` để hỏi lại), nên chạy tiếp sau khi gián đoạn không tốn thêm tiền.
3. **Phiếu chấm.** `npm run rq2 -- sheet`. Ra hai phiếu mẫu và hai file khoá:
   - `sheets/claims.csv`: mỗi dòng một khẳng định. Câu trả lời được tách thành khẳng định: mỗi đoạn có nhãn là một khẳng
     định; đoạn không nhãn tách theo câu; tiêu đề và mẩu dưới ba từ bị bỏ (`splitClaims`).
   - `sheets/answers.csv`: mỗi dòng một câu trả lời đầy đủ.
   - `keys/*.json`: dòng nào thuộc điều kiện nào. **Không đưa cho người chấm.**
4. **Chấm mù.** Hai người chấm độc lập, mỗi người copy hai phiếu thành `claims.<tên>.csv` và `answers.<tên>.csv`. Phiếu
   không có điều kiện, không có nhãn (nhãn làm lộ C2), thứ tự đã xáo trộn với seed cố định; trích dẫn được giữ vì cần để
   kiểm chứng. Người chấm kiểm chứng bằng chính repo ở commit đóng băng (`git show`, `git log`), không bằng ArchTime.
5. **Đối chiếu.** `npm run rq2 -- score --a <tên1> --b <tên2>`. Nếu có khẳng định hai người chấm khác nhau, công cụ ghi
   `sheets/claims.adjudicate.csv`; hai người thống nhất cột `verdict`, lưu thành `claims.adjudicated.csv`, rồi chạy lại
   `score`. Kết quả: `report.md`, `metrics.csv`.

## 4. Hướng dẫn chấm

**Khẳng định** (`verdict`):

| Giá trị | Khi nào |
|---|---|
| `S` Supported | Repo ở commit đóng băng cho thấy điều đó đúng; nếu khẳng định trích commit thì commit đó đúng là nơi nó xảy ra |
| `C` Contradicted | Repo cho thấy điều đó sai (commit, ngày, tác giả, số liệu, file sai) |
| `N` Not verifiable | Không kiểm chứng được từ repo (ý kiến, lý do, suy đoán, số liệu ngoài repo) |

**Câu trả lời**: `refusal` = `yes` nếu câu trả lời từ chối hoặc nói dữ liệu không trả lời được, `no` nếu không.
`coverage` (chỉ câu trả lời được) = `yes` nếu có đủ điều ghi ở cột `expected`, `partial` nếu có một phần, `no` nếu không.

## 5. Chỉ số (theo từng điều kiện)

| Chỉ số | Cách tính |
|---|---|
| Tỷ lệ không có căn cứ | (C + N) / số khẳng định đã có phán quyết cuối |
| Tỷ lệ sai | C / số khẳng định đã có phán quyết cuối |
| Độ chính xác trích dẫn | Trong các khẳng định có trích ít nhất một commit: tỷ lệ S |
| Độ hợp lệ trích dẫn | Hash được trích là commit đã mine / mọi hash được trích (tự động, không cần người chấm) |
| Độ chính xác nhãn FACT | Trong các khẳng định C2 mang nhãn FACT (sau bước kiểm tra): tỷ lệ S. C0, C1 không có nhãn |
| Tỷ lệ từ chối | Riêng câu không trả lời được (cao là tốt) và câu trả lời được (thấp là tốt); tính trên mọi phán quyết của cả hai người chấm |
| Độ bao phủ | Câu trả lời được: trung bình `coverage` (yes 1, partial 0,5, no 0) của cả hai người chấm |
| Độ đồng thuận | Cohen's kappa giữa hai người chấm, trên phán quyết khẳng định và trên `refusal` |

**Kỳ vọng:** C2 có tỷ lệ không có căn cứ thấp hơn C1, độ hợp lệ trích dẫn 100 % (bước kiểm tra bảo đảm), và từ chối câu
không trả lời được nhiều hơn C0. Báo cáo cả khi kết quả ngược kỳ vọng.

## 6. Hạn chế

- Một model, một lần chạy cho mỗi câu (nhiệt độ của nhà cung cấp): kết quả có độ dao động. Ghi rõ model và ngày chạy.
- Trích dẫn vẫn hiện trên phiếu nên người chấm có thể đoán C0 (thường không trích commit); nhãn đã được bỏ để giảm điều này.
- Tách khẳng định bằng luật (theo nhãn, theo câu) có thể gộp hai ý vào một khẳng định hoặc tách một ý làm hai.
- ArchTime do nhóm tự viết: người chấm biết repo, có thể thiên lệch; báo cáo riêng kết quả từng repo.
