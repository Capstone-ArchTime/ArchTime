# Evaluation Protocol (T19)

| | |
|---|---|
| Phiên bản | **1.0, bản đề xuất đóng băng** |
| Ngày phát hành | 2026-11-05 |
| Trạng thái | Đóng băng kể từ khi có chữ ký ở mục *Phê duyệt*. Từ đó mọi thay đổi phải tăng phiên bản và ghi vào *Change log*, kèm lý do. Kết quả chạy theo phiên bản nào thì báo cáo ghi phiên bản đó. |
| Dựa trên | [methodology-decision.md](methodology-decision.md), [repo-selection.md](repo-selection.md), [rq1-protocol.md](rq1-protocol.md) |

## 1. Mục tiêu và câu hỏi

Đánh giá xem ArchTime có (A) khôi phục kiến trúc tốt hơn cách nhóm theo thư mục, (B) phát hiện đúng các thay đổi kiến trúc, và (EX) trích xuất phụ thuộc chính xác hay không. Định nghĩa từng câu hỏi ở [methodology-decision.md](methodology-decision.md) §1.

**Giả thuyết** (một phía, báo cáo kèm cỡ hiệu ứng, không chỉ đúng/sai):

- **H-A:** MoJoFM trung bình của kiến trúc khôi phục so với tham chiếu **lớn hơn** của baseline thư mục, trên từng repo.
- **H-B:** F1 phát hiện thay đổi của kiến trúc khôi phục **lớn hơn** của baseline.
- **EX** không có giả thuyết. Đây là phép đo mô tả, dùng để giải thích A và B.

## 2. Dữ liệu

| Repo | Commit đóng băng | Mốc dùng cho RQ1 | Vai trò |
|---|---|---|---|
| axios/axios | `aa54a5e1e0e50cd1a2561b854ae5490ff589d065` (v1.21.0) | tag `v1.*` | Chính |
| nestjs/nest | `59f33793c616eaf9669e8b81a35aa5f31accc5b4` (v12.3.3) | tag release, mine chế độ *Releases first* (chỉ tag) | Chính |
| ArchTime | ghi khi duyệt | mốc theo thời gian (không có tag) | Chính |
| fastify/fastify | `0c7413a8332a7892e12dcc351c27a190fefc0053` (v5.12.8) | — | Phụ: chỉ EX, báo cáo riêng |

Lý do chọn và hạn chế của từng repo: [repo-selection.md](repo-selection.md).

## 3. Chuẩn bị ground truth

### 3.1 RQ1-A: kiến trúc tham chiếu

Mỗi repo chính có một kiến trúc tham chiếu: danh sách component, mỗi component là tập tiền tố đường dẫn. Người viết dựa vào tài liệu chính thức của dự án (nếu có) và cấu trúc mã. Họ **không được xem** kết quả phân cụm hay AI của ArchTime trước khi viết xong. Tham chiếu được nhập qua panel Quality hoặc `PUT /api/projects/:id/architecture/reference`.

### 3.2 RQ1-B: nhãn thay đổi

Làm theo [rq1-protocol.md](rq1-protocol.md) §3, không đổi gì.

### 3.3 EX: nhãn phụ thuộc (T33)

1. Checkout repo đúng commit đóng băng.
2. `npm run extractor-eval -- sample --checkout <dir> --repo <name> --n 40 --seed 2026`. Lệnh tạo phiếu trong `eval/extractor/<repo>.json` với 40 file được chọn ngẫu nhiên (tái lập được), mỗi file để `null`.
3. **Hai người gán nhãn độc lập**, mỗi người một bản sao của phiếu, theo đúng luật ghi trong phiếu (`rules`). Tóm tắt luật: liệt kê mọi file nguồn JS/TS của repo mà file đó phụ thuộc ở cấp module, qua `import`, `import type`, `export … from`, `require()`, hoặc `import()` với đường dẫn literal. Không tính package npm, module có sẵn của Node, file test hay build output. Không được xem đầu ra của ArchTime khi gán nhãn.
4. Tính **tỉ lệ đồng thuận** = |A ∩ B| / |A ∪ B| trên tập cạnh của hai người, trước khi thống nhất. Ghi vào trường `agreement`.
5. Hai người thống nhất các chỗ lệch, rồi ghi tên vào `labeledBy`. Phiếu đã thống nhất là ground truth.

## 4. Chỉ số

| Câu hỏi | Chỉ số | Cách tính |
|---|---|---|
| RQ1-A | MoJoFM 0–100, ARI (phụ) | Trên các file mà tham chiếu bao phủ; trung bình theo repo; số mốc mà ArchTime vượt baseline |
| RQ1-B | Precision, recall, F1 | [rq1-protocol.md](rq1-protocol.md) §4 |
| EX | TP, FP, FN, precision, recall, F1 | Theo repo; micro (cộng dồn số đếm) và macro (trung bình theo repo); `domain/evaluation/extractor.ts` |

Khi mẫu số bằng 0 thì chỉ số được ghi là `n/a`, không ghi 0.

## 5. Chạy thực nghiệm và ghi nhận

| Bước | Lệnh | Đầu ra (không commit) |
|---|---|---|
| Mine | ArchTime UI: Scan, rồi mine theo chế độ ở §2 | DB |
| Dựng kiến trúc | `POST /api/projects/:id/architecture`. **Cùng một cách dựng (chỉ phân cụm, hoặc phân cụm + AI) cho mọi mốc của một repo** | DB |
| RQ1 | `npm run rq1 -- --project <id>` | `BE/rq1-results/` |
| EX | `npm run extractor-eval -- score --truth eval/extractor/<repo>.json --checkout <dir> ...` | `BE/extractor-results/report.md`, `edges.csv` |

Mỗi lần chạy chính thức phải ghi: phiên bản protocol, commit của ArchTime, ngày giờ, tên mô hình AI (nếu dùng), và đầu ra thô (đính kèm báo cáo).

Script `extractor-eval score` **từ chối chạy** nếu checkout không ở đúng commit mà phiếu đã được gán nhãn.

## 6. Tiêu chí so sánh

- **H-A** được ủng hộ trên một repo nếu MoJoFM trung bình của ArchTime lớn hơn của baseline. Báo cáo kèm chênh lệch và số mốc thắng/thua.
- **H-B** được ủng hộ nếu F1 của ArchTime lớn hơn của baseline, tính trên các cặp mốc đã gán nhãn đầy đủ.
- Với số lượng repo nhỏ (3), không dùng kiểm định thống kê. Kết luận chỉ áp dụng cho các repo này.

## 7. Dữ liệu thiếu hoặc không hợp lệ

| Trường hợp | Xử lý |
|---|---|
| File trong phiếu EX còn `null` | Không tính điểm cho file đó. Báo cáo ghi số file đang chờ (*Pending*). Kết quả chỉ được coi là cuối cùng khi Pending = 0 |
| Nhãn trỏ tới file không tồn tại ở commit đóng băng | Script cảnh báo. Người gán nhãn sửa phiếu, không được tự bỏ qua |
| Mốc không dựng được kiến trúc (lỗi mining hoặc commit không đọc được) | Loại mốc đó, ghi số lượng và lý do |
| Repo không có tham chiếu | Bỏ khỏi RQ1-A, vẫn tính RQ1-B (như RQ1 hiện tại) |
| Cặp mốc thiếu `trueChanges` hoặc thiếu `verdict` | Không tính (`isLabelled` = false) |
| Số thay đổi `correct` vượt `trueChanges` | Liệt kê ở *Label problems*, chỉ tính tối đa bằng `trueChanges` |

## 8. Mối đe doạ tính hợp lệ

Xem [rq1-protocol.md](rq1-protocol.md) §5 và [methodology-decision.md](methodology-decision.md) §4. Bổ sung thêm: kết quả EX trên fastify (CommonJS) phản ánh giới hạn đã biết của extractor (chưa đọc `require()`), không phải sai số ngẫu nhiên.

## Change log

| Phiên bản | Ngày | Thay đổi | Lý do |
|---|---|---|---|
| 1.0 | 2026-11-05 | Bản đầu tiên: RQ1 (giữ nguyên rq1-protocol.md) và EX (T33), danh sách repo, commit đóng băng | — |

## Phê duyệt

| Người duyệt | Vai trò | Ngày | Ghi chú |
|---|---|---|---|
| | | | |
