# RQ1: Quy trình đánh giá

RQ1 hỏi: **kiến trúc ArchTime khôi phục được có tốt hơn các cách nhóm đơn giản hơn không**, ở hai mặt:

- **A. Độ chính xác khôi phục:** kiến trúc khôi phục khớp với kiến trúc tham chiếu (do người viết) tới đâu.
- **B. Phát hiện thay đổi:** các thay đổi kiến trúc mà mỗi cách báo ra giữa hai mốc liên tiếp có đúng không, và có bỏ sót thay đổi thật không.

Các cách nhóm được so sánh (gọi là *method*):

| Method | Ý nghĩa |
|---|---|
| `recovered` | Component đã lưu của ArchTime: phân cụm, có AI tinh chỉnh nếu đã dùng |
| `clustering` | Chỉ phân cụm tất định, không AI (baseline thứ nhất). Tính lại khi chạy, cùng khoảng số component với `recovered` |
| `baseline` | Mỗi thư mục ở một độ sâu là một component (baseline thứ hai) |
| `anchored` | Biến thể thử nghiệm: `recovered` được neo theo mốc trước (xem mục 6). Chỉ bật khi được yêu cầu |

Phần tính toán nằm ở `BE/src/domain/evaluation/rq1.ts` (phiếu nhãn, điểm, báo cáo), `BE/src/domain/evaluation/stats.ts` (Wilcoxon, Cohen's kappa) và `BE/src/domain/architecture/anchored.ts`. Test: `BE/tests/rq1.test.mjs`, `rq1-stats.test.mjs`, `architecture-anchored.test.mjs`.

## 1. Tập phát triển và tập kiểm tra

Đây là quy tắc quan trọng nhất của phương pháp.

- **Tập phát triển:** các workspace hiện có (repo ArchTime, Hackathon). Được dùng để thử và chỉnh thuật toán, tham số, biến thể `anchored`.
- **Tập kiểm tra:** 5 repo mã nguồn mở theo phiếu đăng ký. **Chốt thuật toán và tham số trước** (ghi commit hash của BE vào báo cáo), rồi chạy một lần. Không chỉnh gì theo kết quả trên tập này. Nếu buộc phải sửa lỗi, ghi rõ trong báo cáo và chạy lại toàn bộ.

### Tiêu chí chọn 5 repo (ghi lại trước khi chạy)

1. Ít nhất 80% mã là JavaScript/TypeScript, khoảng 200–3.000 file sau khi bỏ test, build và `node_modules`.
2. Lịch sử từ 2 năm trở lên và ít nhất 10 release tag.
3. Có tài liệu kiến trúc (ARCHITECTURE.md, ADR, thư mục docs) để viết tham chiếu mà không cần nhìn kết quả ArchTime.
4. Không phải repo của nhóm. Có ít nhất một repo mà cấu trúc thư mục **không** phản ánh đúng kiến trúc chức năng.

### Tập kiểm tra đã chọn (07/11/2026)

Số liệu lấy từ GitHub API ngày 07/11/2026 (nhánh mặc định). "File nguồn" là số file .ts/.tsx/.js/.jsx/.mjs/.cjs, đã bỏ test, build, docs, examples và scripts.

| Repo | JS/TS | File nguồn | Tag | Có từ | Tài liệu kiến trúc |
|---|---|---|---|---|---|
| outline/outline | 99% | 2.012 | 255 | 2016 | `docs/ARCHITECTURE.md` |
| facebook/docusaurus | 98% | 690 | 189 | 2017 | `website/docs/advanced/architecture.mdx` |
| actualbudget/actual | 99% | 1.824 | 64 | 2022 | `packages/docs/.../project-details/architecture.md`, ADR |
| marmelab/react-admin | 100% | 1.056 | 448 | 2016 | `docs/Architecture.md` |
| remix-run/react-router | 100% | 512 | 1.081 | 2014 | thư mục `decisions/` (ADR) |

- **Tiêu chí 4:** outline thoả. Thư mục của nó chia theo tầng (`app/`, `server/`, `shared/`), còn các khối chức năng (document, collection, search, auth...) cắt ngang các tầng.
- **Repo bị loại:**
  - eslint/eslint: viết bằng CommonJS (`require`), mà bộ trích xuất chỉ đọc `import` kiểu ES (LI-02), nên đồ thị phụ thuộc gần như rỗng.
  - excalidraw, typeorm, nest, vite, insomnia: không có tài liệu kiến trúc.
  - immich: chỉ 53% mã là JS/TS.
  - bruno, astro: tài liệu "architecture" chỉ là file hướng dẫn cho AI.
- **Dự phòng** (nếu một repo không mine được): tldraw/tldraw, keystonejs/keystone.
- **Lịch sử lớn:** với repo có lịch sử dài (outline, react-router), chỉ mine một cửa sổ 2–3 năm gần nhất chứa đủ release tag, rồi chọn khoảng 12 tag minor bằng `--tags`. Ghi lại cửa sổ đã dùng.

## 2. Chuẩn bị dữ liệu

1. **Tạo workspace và mine toàn bộ lịch sử** của mỗi repo (Manage mining → Scan → Mine remaining), để các commit có tag đều có snapshot.
2. **Chọn và dựng các mốc**, mọi mốc của một workspace dựng **cùng một cách**:

   ```
   npm run rq1:milestones -- --project <workspaceId> --dry-run      # xem trước các mốc được chọn
   npm run rq1:milestones -- --project <workspaceId>                # dựng bằng phân cụm (không AI)
   npm run rq1:milestones -- --project <workspaceId> --mode refine  # dựng bằng phân cụm + AI (tốn token)
   ```

   Mặc định chọn tối đa 15 commit có tag, rải đều và luôn lấy mốc đầu, mốc cuối. `--tags '<regex>'` lọc tag (ví dụ `'^v\d+\.\d+\.0$'` chỉ lấy minor release), `--count N` đổi số mốc. Nếu repo có ít hơn 2 tag, script rải đều trên lịch sử đã mine. Kết quả ghi vào `rq1-results/milestones/<workspace>.json`.

   Với `--mode refine`, mốc nào có câu trả lời AI không qua kiểm tra sẽ giữ kết quả phân cụm. Báo cáo liệt kê các cách dựng của từng workspace và **cảnh báo khi bị trộn**.
3. **Kiến trúc tham chiếu (phần A):**
   - Hai người viết **độc lập** từ tài liệu và code, **trước khi xem** kết quả ArchTime.
   - Tham chiếu là danh sách component, mỗi component có các tiền tố đường dẫn. Một tiền tố có thể là **đường dẫn đầy đủ của một file**, nên gán được từng file theo chức năng chứ không chỉ theo thư mục.
   - So hai bản bằng MoJoFM (dán thành hai workspace tham chiếu, hoặc tính trong script riêng) và ghi con số này vào báo cáo. Sau đó thống nhất một bản và nhập ở panel **Quality → Reference architecture** (hoặc `PUT /api/projects/:id/architecture/reference`).

## 3. Chạy

Chạy trong thư mục `BE`, với `BE/.env` trỏ tới đúng database:

```
npm run rq1 -- --milestones                       # mọi workspace có file mốc, chỉ dùng các mốc đó
npm run rq1 -- --milestones --project <id>        # một workspace (lặp --project để chọn nhiều)
npm run rq1 -- --milestones --annotator an        # tạo / làm mới phiếu riêng của người gán nhãn "an"
npm run rq1 -- --milestones --reconcile           # hợp nhất phiếu của các người gán nhãn
npm run rq1 -- --anchored --tolerance 0.02        # thêm biến thể anchored (chỉ trên tập phát triển)
```

Không có `--milestones` thì script dùng mọi snapshot đã có component (tối đa 60 snapshot gần nhất), giống phiên bản trước. `--no-clustering` bỏ method `clustering`.

Script chỉ **đọc** database. Kết quả nằm trong `BE/rq1-results/` (đã gitignore):

| File | Nội dung |
|---|---|
| `report.md` | Tập dữ liệu và cách dựng, bảng A kèm kiểm định Wilcoxon, độ ổn định, độ đồng thuận giữa người gán nhãn, bảng B |
| `recovery.csv` | Từng snapshot: số file, số component và MoJoFM so với tham chiếu của từng method |
| `stability.csv` | Từng cặp mốc: độ ổn định và số thay đổi cấu trúc của từng method |
| `labels/<workspace>.<người>.json` | Phiếu gán nhãn riêng của từng người |
| `labels/<workspace>.json` | Phiếu đã hợp nhất; **chỉ phiếu này được tính điểm** |
| `labels/keys/<workspace>.json` | Khoá cho biết method nào báo thay đổi nào. **Không đưa cho người gán nhãn** |

Chạy lại bao nhiêu lần cũng được: **nhãn đã đánh được giữ nguyên** cho các thay đổi vẫn còn xuất hiện. Phiếu kiểu cũ (danh sách `recovered` / `baseline` riêng) được tự chuyển sang kiểu mới và giữ nhãn.

## 4. Gán nhãn (phần B)

Phiếu được thiết kế **ẩn tên method**:
- Mỗi cặp mốc có một danh sách `changes` duy nhất, gộp thay đổi của mọi method.
- Mỗi thay đổi có mã ngẫu nhiên `key` (ví dụ `c3f9a01be`), danh sách được sắp theo mã nên không đoán được method qua thứ tự.
- Mỗi component trong thay đổi có tên, số file và tối đa 5 file mẫu.
- Mỗi cặp có `commits`: các commit đã mine giữa hai mốc, với tiêu đề và số dependency thêm/bớt.

Tên component vẫn có thể gợi ý method (tên thư mục so với tên chức năng); đây là giới hạn đã biết và cần ghi vào phần threats.

Quy trình cho mỗi workspace:

1. **Hai người gán nhãn độc lập**, mỗi người tạo phiếu riêng: `npm run rq1 -- --milestones --annotator <tên>`. Không trao đổi khi đang làm.
2. Với mỗi cặp, **trước tiên** đọc `commits` (hoặc `git log --oneline <from.hash>..<to.hash>` và diff) rồi ghi `trueChanges`: số thay đổi kiến trúc thật (một khối chức năng bị tách, gộp, tổ chức lại, bỏ đi, thêm mới). `0` là câu trả lời hợp lệ. Làm bước này **trước khi** xem `changes`.
3. Sau đó đặt `verdict` cho từng thay đổi:
   - `"correct"`: ứng với một thay đổi thật ở bước 2.
   - `"wrong"`: không ứng với thay đổi thật nào, ví dụ nhiễu do phân cụm lại, đổi tên bị báo thành tách, vài file đổi chỗ bị báo thành gộp.

   Có thể ghi lý do vào `note`.
4. Khi cả hai xong, chạy `npm run rq1 -- --milestones --reconcile`.
   - Báo cáo ghi **độ đồng thuận trước khi hợp nhất**: tỉ lệ `trueChanges` trùng nhau, chênh lệch trung bình, và Cohen's kappa trên các `verdict`.
   - Phiếu `labels/<workspace>.json` được điền sẵn những chỗ hai người đồng ý. Chỗ lệch để trống, kèm ghi chú `To settle: …`.
5. Hai người cùng thống nhất các chỗ lệch ngay trong `labels/<workspace>.json`, rồi chạy lại `npm run rq1 -- --milestones` để tính điểm.

Một cặp được tính khi đã có `trueChanges` và đủ mọi `verdict`. Nếu một method có nhiều thay đổi `correct` hơn `trueChanges`, báo cáo liệt kê cặp đó ở mục *Label problems* và chỉ tính tối đa bằng `trueChanges`.

Ước lượng công sức: khoảng 5–10 phút cho mỗi cặp, với mỗi người.

**Trạng thái tập phát triển (07/11/2026):**
- 36 cặp đã được gán nhãn bởi **một** người gán nhãn là trợ lý AI (Claude), trong file `labels/<workspace>.claude.json`.
- Quy tắc đã dùng: một thay đổi thật là một khối chức năng được thêm, bỏ, tách, gộp hay tổ chức lại, nhìn thấy qua một nhóm file mới hoặc bị xoá tạo thành một năng lực. Không tính các trường hợp chỉ sửa file, thêm 1–2 file vào vùng có sẵn, hay merge commit không đổi mã nguồn.
- Vì người gán nhãn đầu là AI, **người thứ hai phải là thành viên nhóm**, làm độc lập và không mở phiếu của Claude. Báo cáo phải ghi rõ một người gán nhãn là AI.

## 5. Chỉ số và kiểm định

- **A:** MoJoFM (0–100) của từng method so với tham chiếu, trên các file mà tham chiếu bao phủ.
  - Báo cáo ghi trung bình theo workspace, số mốc mà `recovered` vượt `baseline`, và **kiểm định Wilcoxon signed-rank** cặp đôi theo snapshot giữa `recovered` và từng method khác.
  - p-value lấy chính xác khi n ≤ 25 và không có giá trị bằng nhau; ngược lại dùng xấp xỉ chuẩn có hiệu chỉnh ties.
  - Effect size: matched-pairs rank-biserial r, dương khi `recovered` cao hơn.
  - Các snapshot của một repo không độc lập với nhau, nên đọc p theo từng repo và không gộp qua các repo.
- **Độ ổn định:** MoJoFM giữa hai mốc liên tiếp, trên các file chung, lấy mốc sau làm chuẩn. 100 nghĩa là không file nào đổi component.
- **B:** tính trên phiếu đã hợp nhất, cho từng method:
  - precision = số thay đổi `correct` / số thay đổi đã báo
  - recall = số thay đổi `correct` / tổng `trueChanges`
  - F1 là trung bình điều hoà của precision và recall
- **Đồng thuận:** Cohen's kappa của hai người trên `verdict`, tỉ lệ `trueChanges` trùng nhau và chênh lệch trung bình.

## 6. Biến thể anchored (chỉ trên tập phát triển)

Mỗi mốc được phân cụm lại từ đầu, nên có thể đổi nhóm của những file không hề thay đổi, sinh ra "thay đổi" giả. `--anchored` thêm method `anchored`:
- Mốc đầu giữ nguyên nhóm của `recovered`.
- Từ mốc sau: file đã có giữ component cũ. File mới vào component chứa nhiều hàng xóm phụ thuộc nhất; file không có hàng xóm nào đã được xếp thì giữ component của lần phân cụm mới.
- Nhóm mới chỉ thay nhóm neo khi modularity cao hơn quá `--tolerance` (mặc định 0.02). Khi đó coi như kiến trúc thật sự đã đổi.

Chỉ chọn tolerance trên tập phát triển. Nếu đưa `anchored` vào pipeline chính, phải chốt trước khi chạy tập kiểm tra.

## 7. Các mối đe doạ tính hợp lệ

- **Tham chiếu viết bằng tiền tố thư mục có lợi cho `baseline`.** Trên repo ArchTime, baseline đạt 64.69 so với 55.74 của `recovered`. Hãy viết tham chiếu theo chức năng (gán từng file khi cần) và báo cáo độ đồng thuận giữa hai người viết.
- **Baseline ổn định 100 chỉ vì thư mục ít thay đổi.** Ổn định cao không có nghĩa là phát hiện thay đổi tốt; phần B mới trả lời điều đó.
- **Người gán nhãn thiên lệch:** hai người độc lập, phiếu ẩn method, ghi kappa trước khi hợp nhất. Tên component vẫn có thể gợi ý method.
- **Chỉnh theo dữ liệu kiểm tra:** tách tập phát triển và tập kiểm tra (mục 1).
- **Dữ liệu nhỏ:** 5 repo kiểm tra; kết luận chỉ áp dụng cho các repo cùng loại.
- **Phân cụm là tất định** (Louvain có thứ tự cố định), nhưng tên do AI đặt có thể khác giữa các lần chạy. Phần ghép component không dựa vào tên.
