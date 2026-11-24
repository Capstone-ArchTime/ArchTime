# Báo cáo đánh giá extractor (T33 → T8)

| | |
|---|---|
| Phiên bản | 2.1 (2026-11-24, audit: hồ sơ cú pháp `all-static`, lệnh `agree`, `validate`, `--syntax`, `results.json`, `summary.csv`; mục 5b, 7b). 2.0 (2026-11-16, T8). Bản 1.0 (2026-11-05, T33) dùng axios / nest / ArchTime |
| Protocol | [evaluation-protocol.md](evaluation-protocol.md) §3.3, §4, §7; [rq1-protocol.md](rq1-protocol.md) §1 (tập kiểm tra 5 repo) |
| Trạng thái | **Chưa có kết quả đánh giá.** Phiếu mẫu cho 5 repo của tập kiểm tra đã được tạo với seed cố định, nhưng **chưa có nhãn nào**. Tài liệu này **không** chứa precision/recall/F1 của repo thật nào. |

## 1. Đo cái gì

Đầu ra mà mining **thực sự dùng**:

- `BE/src/infrastructure/services/DependencyExtractor.ts` (mining gọi đúng hàm này);
- `fileDependencies` (`BE/src/domain/architecture/buildView.ts`): resolve tên module thành file, bỏ package npm, bỏ file không phân tích.

So với nhãn do người viết. Kết quả AI refine **không** tham gia phép đo.

## 2. Tập dữ liệu và seed

Phiếu nằm ở `BE/eval/extractor/<repo>.json`, tạo ngày 2026-11-16 bằng:

```
cd BE
npm run extractor-eval -- sample --checkout <repo> --repo <tên> --n 40 --seed 2026
```

| Repo | Commit (ghi trong phiếu) | File trong pool | Mẫu | Nhãn |
|---|---|---:|---:|---|
| outline | `c0288df` | 2 056 | 40 | 0 / 40 |
| docusaurus | `4c4ec4a` | 813 | 40 | 0 / 40 |
| actual | `33912a0` | 1 955 | 40 | 0 / 40 |
| react-admin | `f466cf7` | 1 391 | 40 | 0 / 40 |
| react-router | `5d7962e` | 542 | 40 | 0 / 40 |

- **Pool** = file extractor coi là phân tích được, cộng các file JS/TS (`.mjs`, `.cjs`, …) mà `git ls-files` liệt kê và `isAnalyzable` chấp nhận, để file extractor bỏ sót vẫn có thể được chọn.
- **Seed 2026, n = 40** cho mọi repo (như protocol §3.3). Commit đầy đủ nằm trong trường `commit` của phiếu; commit giống commit của kiến trúc tham chiếu ([architecture-references/README.md](architecture-references/README.md) §4), nên một checkout dùng cho cả hai việc.
- **Tái lập đã kiểm tra:** chạy lại `sample` với cùng seed trên cùng checkout react-router (ra file khác) cho đúng danh sách 40 file.

## 3. Phương pháp

### 3.1 Đơn vị đánh giá

Một **cạnh phụ thuộc có hướng giữa hai file của repo**: (file trong mẫu → file nó phụ thuộc). Dự đoán là các cạnh mà extractor + `fileDependencies` cho ra **xuất phát từ file trong mẫu**. Ground truth là danh sách người gán nhãn ghi cho file đó.

- TP: cạnh có ở cả hai. FP: chỉ ở dự đoán. FN: chỉ ở ground truth.
- Precision = TP / (TP + FP); Recall = TP / (TP + FN); F1 = 2·P·R / (P + R).

### 3.2 Gộp

- **Micro:** cộng TP, FP, FN của mọi repo rồi tính P/R/F1 một lần (repo nhiều cạnh nặng hơn).
- **Macro:** P/R/F1 của từng repo, rồi lấy trung bình các repo (mỗi repo nặng như nhau). Repo có chỉ số `n/a` không vào trung bình của chỉ số đó.

### 3.3 Tập rỗng

- File có nhãn `[]` (không phụ thuộc file nào) và extractor cũng không cho cạnh nào: đóng góp 0 TP, 0 FP, 0 FN (đúng, nhưng không làm số đẹp lên).
- File có nhãn `[]` mà extractor cho cạnh: mọi cạnh đó là FP.
- Khi mẫu số bằng 0 (ví dụ một repo không có cạnh dự đoán nào: TP + FP = 0) thì chỉ số là **`n/a`, không phải 0** (`prf` trong `BE/src/domain/evaluation/extractor.ts`).
- File còn `null` (chưa gán nhãn) **không được tính**; báo cáo ghi số file *Pending*. Kết quả chỉ là cuối cùng khi Pending = 0 ở mọi phiếu.

### 3.4 Gán nhãn (hai người, độc lập)

Luật nằm trong trường `rules` của mỗi phiếu. Tóm tắt: liệt kê mọi file JS/TS của repo mà file đó phụ thuộc ở cấp module qua `import`, `import type`, `export … from`, `require()`, hoặc `import()` với đường dẫn literal; đường dẫn tương đối gốc repo, dấu `/`; không tính package npm, module Node, file test, build output; **không xem đầu ra ArchTime**.

1. Mỗi người chép phiếu thành `<repo>.<tên>.json` và gán nhãn một mình.
2. Tính độ đồng thuận |A ∩ B| / |A ∪ B| trên tập cạnh của hai người **trước khi** thống nhất; ghi vào `agreement`.
3. Thống nhất chỗ lệch, ghi tên vào `labeledBy` của `<repo>.json`. Phiếu đã thống nhất là ground truth.
4. Chạy `npm run extractor-eval -- score --truth eval/extractor/<repo>.json --checkout <repo> [...]`. Script **từ chối** checkout sai commit.

Ước lượng: 40 file × 5 repo × 2 người; khoảng 2–5 phút mỗi file với IDE có "Go to definition".

## 4. Kết quả

| Repo | File đã gán | Pending | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---|---|---|
| outline | 0 | 40 | — | — | — | — | — | — |
| docusaurus | 0 | 40 | — | — | — | — | — | — |
| actual | 0 | 40 | — | — | — | — | — | — |
| react-admin | 0 | 40 | — | — | — | — | — | — |
| react-router | 0 | 40 | — | — | — | — | — | — |
| **Micro** | | | — | — | — | — | — | — |
| **Macro** | | | | | | — | — | — |

*Chưa có số liệu. Điền bảng này từ `BE/extractor-results/report.md` sau khi Pending = 0.*

## 5. Điều đã biết trước khi đo (từ test, không phải từ repo thật)

Test end-to-end (`BE/tests/extractor-eval.test.mjs`) trên một repo nhỏ do test tự dựng cho thấy extractor hiện tại:

| Cú pháp | Được tìm thấy? |
|---|---|
| `import … from './x'`, `import type … from './x'` | Có |
| `export … from './x'` | **Không** |
| `require('./x')` | **Không** |
| `import('./x')` | Không (chỉ đọc khai báo cấp cao nhất) |
| Package npm | Bị loại đúng, không tính FP |

Dự kiến: recall thấp ở repo có nhiều file barrel (`index.ts` dùng `export * from`).

## 5b. Hồ sơ cú pháp (bổ sung 2026-11-24)

`extractDependencies(dir, { moduleSyntax })` có hai hồ sơ (`BE/src/infrastructure/services/DependencyExtractor.ts`,
hàm thuần `moduleSpecifiers` để test cú pháp không cần checkout):

| Cú pháp | `es-import` (mặc định, mining dùng, phương pháp đóng băng) | `all-static` (chỉ dùng cho đánh giá) |
|---|---|---|
| `import x from`, `import { a } from`, `import * as ns from`, `import './x'`, `import type` (cấp cao nhất) | Có | Có |
| `export * from`, `export { a } from`, `export type { T } from` | Không | Có |
| `require('<literal>')`, `` require(`<literal>`) ``, `import x = require('<literal>')` (ở bất kỳ đâu trong file) | Không | Có |
| `import('<literal>')` | Không | Có |
| `require(name)`, `` import(`./${x}`) ``, `obj.require('./x')` | Không | Không (không đoán) |
| Đuôi `.mjs .cjs .mts .cts` | Không đọc | Đọc |
| Đuôi `.ts .tsx .js .jsx`, phân giải không đuôi, `.js`→`.ts`, `index`, bỏ package npm, bỏ import không phân giải được | Có | Có |

Test: `BE/tests/extractor-syntax.test.mjs` (từng cú pháp, ca biên, import không phân giải, cả hai hồ sơ, CLI).

**Vì sao mining vẫn dùng `es-import`:** đổi extractor của mining làm đổi mọi snapshot, mọi nhóm và mọi kết quả RQ1 đã tính
ở commit đóng băng `0c5e1f8`; theo rq1-protocol §1 đó là thay đổi phương pháp, cần quyết định của nhóm và chạy lại toàn bộ
tập kiểm tra. Hồ sơ `all-static` cho phép đo trước nó thêm được bao nhiêu cạnh đúng (và có thêm cạnh sai không) trên cùng
nhãn.

## 6. Hạn chế và việc cần nhóm quyết định

1. **File test không theo đuôi `.test.`/`.spec.` lọt vào mẫu.** `isAnalyzable` chỉ loại `*.test.*`, `*.spec.*` và các thư mục `test(s)/`, `__tests__/`. React-router đặt test là `*-test.ts` trong `integration/`, nên 5 / 40 file mẫu của react-router là file test (react-admin 1 / 40). Luật gán nhãn lại nói "không tính file test" ở **đích** của cạnh, không nói gì về file nguồn trong mẫu. Hai cách, cần nhóm chọn **trước khi** gán nhãn và ghi vào protocol:
   - (a) giữ nguyên: đo đúng thứ mining phân tích (mining cũng coi những file này là mã nguồn);
   - (b) tạo lại phiếu với bộ lọc test rộng hơn, và sửa `isAnalyzable` cho cả mining (thay đổi kết quả RQ1, phải làm trước khi chạy tập kiểm tra).
2. **Mẫu có cả `examples/`, `playground/`, `integration/`, `website/`** (react-router 19 / 40, react-admin 11 / 40, docusaurus 6 / 40), vì mining phân tích chúng. Đây là phạm vi đo hiện tại, nhưng khác cách đếm "file nguồn" trong rq1-protocol §1 (đã bỏ examples và docs).
3. 40 file mỗi repo là mẫu nhỏ; khoảng tin cậy rộng. Báo cáo P/R/F1 kèm số cạnh.
4. Hai người gán nhãn đều là thành viên nhóm, biết ArchTime: có thể thiên về cú pháp mà extractor đọc được. Luật liệt kê rõ mọi cú pháp để giảm điều này.

## 7. Tái lập

1. Clone repo, `git checkout <commit trong phiếu>` (docusaurus trên Windows: `git -c core.longpaths=true clone`).
2. Chạy lại lệnh `sample` ở mục 2 với `--out` khác: danh sách file phải trùng phiếu.
3. Chạy `score` như mục 3.4; đầu ra `BE/extractor-results/report.md` và `edges.csv` (không commit), đính kèm vào báo cáo cùng commit của ArchTime.

## 7b. Quy trình đầy đủ với công cụ mới (2026-11-24)

```
npm run extractor-eval -- agree --a eval/extractor/<repo>.<A>.json --b eval/extractor/<repo>.<B>.json --out extractor-results/agreement/<repo>.json
# thống nhất vào eval/extractor/<repo>.json, ghi labeledBy và agreement (số Jaccard ở trên)
npm run extractor-eval -- validate --truth eval/extractor/<repo>.json --checkout <dir>     # exit 1 nếu còn null hay đường dẫn sai
npm run extractor-eval -- score --syntax both --truth ... --checkout ... (5 cặp)
```

- `agree`: Jaccard |A ∩ B| / |A ∪ B| trên các file cả hai đã gán; `null` nếu cả hai không ghi cạnh nào; liệt kê từng file lệch.
- `validate`: file còn `null`, đường dẫn không có trong checkout, đích bị luật loại (test, build, `.d.ts`, không phải JS/TS),
  `labeledBy` hay `agreement` còn trống.
- `score --syntax both`: hai thư mục con `es-import/` và `all-static/`, mỗi thư mục có `report.md`, `edges.csv`,
  `results.json` (mọi số, kèm `final: false` khi còn file chưa gán và commit BE) và `summary.csv`. Số báo cáo trong paper
  là của `es-import`.

Bảng mục 4 vẫn để trống: **chưa có nhãn nào (0/200)**.
