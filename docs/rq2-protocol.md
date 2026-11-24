# RQ2: Protocol đánh giá AI Mentor

| | |
|---|---|
| Phiên bản | 1.2 (2026-11-19: mỗi câu chạy 3 lần, khoảng tin cậy bootstrap theo câu hỏi, so sánh C0–C1 và C1–C2 có hiệu chỉnh Holm, xem §3 và §5). 1.1 (2026-11-18): đổi repo sang ba repo của tập kiểm tra RQ1, xem §0 |
| Ngày | 2026-11-15 |
| Câu hỏi nghiên cứu | Thiết kế của AI Mentor (nhãn FACT / INFERENCE / UNKNOWN và bước kiểm tra trích dẫn) có làm câu trả lời có căn cứ hơn không? |
| Công cụ | `BE/scripts/rq2.ts` (`npm run rq2`), `BE/src/domain/evaluation/rq2.ts` (test: `BE/tests/rq2.test.mjs`) |
| Bộ câu hỏi | [rq2/questions.json](rq2/questions.json) |
| Repo | react-router, docusaurus, actual: ba trong năm repo của tập kiểm tra RQ1, cùng commit đóng băng ([rq1-protocol.md](rq1-protocol.md) §1, [architecture-references/README.md](architecture-references/README.md) §4) |

## 0. Chọn repo (quyết định 18/11/2026)

Bản 1.0 dùng axios, nest và ArchTime, là tập cũ trước khi RQ1 chuyển sang năm repo theo phiếu đăng ký. Bản 1.1 dùng ba
repo của tập kiểm tra RQ1 để paper và báo cáo dùng một tập dữ liệu, và dùng lại dữ liệu đã mine cho C11. Chưa câu trả lời
nào được thu theo bản 1.0, nên đổi lúc này không vi phạm quy tắc "không sửa sau khi đã chạy" (§2).

| Repo | Vì sao |
|---|---|
| remix-run/react-router | Rất nổi tiếng: model có thể đã học về nó, nên C0 mạnh hơn. Đây là phép thử khó cho C1/C2. Có ADR trong `decisions/` |
| facebook/docusaurus | Nổi tiếng, có trang kiến trúc chính thức |
| actualbudget/actual | Ít nổi tiếng hơn hẳn: cân lại hai repo trên |

Không dùng outline và react-admin để giữ khối lượng chấm vừa sức: 3 repo × 10 câu × 3 điều kiện = 90 câu trả lời mỗi lần
chạy; từ bản 1.2 mỗi câu chạy 3 lần nên tổng là **270** câu trả lời (§3).

**Q9 (lý do thiết kế) với react-router:** lý do có thể nằm trong ADR của repo dù không có trong dữ liệu đã mine. Một lý do
được nêu vẫn được chấm như mọi khẳng định: `S` chỉ khi repo ở commit đóng băng ghi đúng điều đó. Câu này vẫn tính là câu
"không trả lời được từ dữ liệu" khi đo tỷ lệ từ chối.

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
   `npm run rq2 -- run --project <id> --repo <react-router|docusaurus|actual>` (Windows PowerShell 5.1: `npx tsx scripts/rq2.ts run ...`).
   Mỗi câu được hỏi **3 lần** ở mỗi điều kiện, cùng model và cùng thiết lập (`--runs 3`, mặc định), tổng
   3 repo × 10 câu × 3 điều kiện × 3 lần = **270 câu trả lời**. Ba lần chạy cho thấy độ dao động của model; mọi tỷ lệ gộp
   cả ba lần, và báo cáo ghi thêm tỷ lệ thấp nhất, cao nhất giữa các lần. Lần 1 lưu ở
   `rq2-results/answers/<repo>.<câu>.<điều kiện>.json`, lần 2 và 3 thêm `.r2`, `.r3` (cả bản gốc và bản sau kiểm tra,
   token, thời gian). Câu đã có kết quả không bị hỏi lại (`--force` để hỏi lại), nên chạy tiếp sau khi gián đoạn không
   tốn thêm tiền.
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
   `score`. Kết quả: `report.md`, `metrics.csv`, `comparisons.csv`.

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
| Số khẳng định mỗi câu trả lời | Số khẳng định / số câu trả lời. Điều kiện nói ít có thể trông chính xác hơn, nên luôn báo cáo kèm |
| Câu trả lời rỗng | Không có khẳng định nào (từ ba từ trở lên) và không người chấm nào đánh dấu từ chối |

**Mẫu số.** Câu trả lời từ chối tính vào tỷ lệ từ chối. Câu trả lời rỗng tính riêng. Cả hai loại không vào mẫu số của các
tỷ lệ theo khẳng định.

**Khoảng tin cậy và kiểm định.** Khẳng định và các lần chạy của cùng một câu hỏi không độc lập, nên đơn vị lấy mẫu lại là
câu hỏi (một câu của một repo).
- Tỷ lệ không có căn cứ của mỗi điều kiện có khoảng tin cậy 95 % bằng cluster bootstrap: lấy mẫu lại có hoàn lại 30 câu
  hỏi, tính lại tỷ lệ gộp, 10.000 lần, lấy phân vị 2,5 % và 97,5 % (`bootstrapRatio`, `stats.ts`).
- So sánh C0 với C1 (tác dụng của dữ liệu) và C1 với C2 (tác dụng của nhãn và bước kiểm tra): cùng bootstrap nhưng ghép
  cặp theo câu hỏi (mỗi lần lấy mẫu dùng cùng các câu cho hai điều kiện), ra khoảng tin cậy của hiệu và p hai phía
  (`bootstrapRatioDifference`). p được hiệu chỉnh Holm cho hai phép so sánh (`holm`). Một hiệu được gọi là có ý nghĩa khi
  khoảng tin cậy không chứa 0 và p sau Holm dưới 0,05.
- Seed của bootstrap cố định, nên tính lại luôn ra cùng số.

**Kỳ vọng:** C2 có tỷ lệ không có căn cứ thấp hơn C1, độ hợp lệ trích dẫn 100 % (bước kiểm tra bảo đảm), và từ chối câu
không trả lời được nhiều hơn C0. Báo cáo cả khi kết quả ngược kỳ vọng.

## 5b. Bản ghi mỗi câu trả lời (bổ sung 24/11/2026; không đổi điều kiện, câu hỏi hay chỉ số chính)

Mỗi file trong `answers/` ghi thêm: `answerId` (`<repo>.<câu>.<điều kiện>.r<lần>`), `promptVersion` (dấu vân tay của prompt
cố định của điều kiện), `contextSha256` (dữ liệu project C1/C2 nhận; nội dung lưu một lần ở `contexts/`), `questionsVersion`,
`modelInfo`, `settings`, `status`. Yêu cầu bị lỗi được ghi vào `errors/` và hỏi lại ở lần chạy sau, không bao giờ được tính
là câu trả lời; `--force` chuyển bản cũ vào `answers/superseded/` thay vì ghi đè. `run-log.jsonl` ghi một dòng cho mỗi yêu
cầu. Báo cáo cảnh báo khi một điều kiện trộn nhiều phiên bản prompt hoặc model.

Chỉ số bổ sung (chỉ để đọc kèm, không thay chỉ số chính): Gwet's AC1 cạnh κ; "số khẳng định Supported mỗi câu trả lời
được" và "tỉ lệ câu trả lời được có ít nhất một khẳng định Supported", để tỷ lệ không có căn cứ thấp không thể đến từ việc
nói ít hay từ chối nhiều. Độ hợp lệ trích dẫn chỉ kiểm hash có phải commit đã mine; việc commit đó có thật sự ủng hộ khẳng
định nằm trong phán quyết `S` của người chấm (§4), nên độ chính xác trích dẫn mới là thước đo ngữ nghĩa.

**Phải quyết trước khi chạy (audit D6, docs/research-audit-report.md):** dữ liệu project của mentor hiện chỉ có snapshot,
evidence và tối đa 60 **tên file** (không có đường dẫn) của snapshot mới nhất; không có component, phụ thuộc giữa component
hay sự kiện tiến hoá. Paper (§3.6) lại viết mentor nhận "the current components with their dependencies". Câu Q1 (thư mục,
module chính) có thể không trả lời được từ dữ liệu này. Hoặc sửa paper cho đúng mã nguồn, hoặc đổi mentor rồi tăng protocol
lên 1.3 **trước** khi thu câu trả lời nào.

## 6. Hạn chế

- Một model, ba lần chạy cho mỗi câu (nhiệt độ của nhà cung cấp): ba lần cho thấy độ dao động nhưng chưa đủ để ước lượng
  nó chính xác. Ghi rõ model và ngày chạy.
- 30 câu hỏi là mẫu nhỏ: khoảng tin cậy sẽ rộng, và hiệu nhỏ có thể không đạt ý nghĩa thống kê.
- Hai người chấm mọi khẳng định của 270 câu trả lời: khối lượng chấm gấp ba so với bản 1.1.
- Trích dẫn vẫn hiện trên phiếu nên người chấm có thể đoán C0 (thường không trích commit); nhãn đã được bỏ để giảm điều này.
- Tách khẳng định bằng luật (theo nhãn, theo câu) có thể gộp hai ý vào một khẳng định hoặc tách một ý làm hai.
- Model có thể đã học về react-router và docusaurus khi huấn luyện, nên C0 có thể trả lời đúng mà không cần dữ liệu. Đây là
  chủ đích (phép thử khó hơn), nhưng phải báo cáo riêng kết quả từng repo.
- Người chấm là thành viên nhóm, biết ArchTime; phiếu đã bỏ nhãn và điều kiện để giảm thiên lệch.
