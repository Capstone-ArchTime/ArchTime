# Quyết định phương pháp (T08)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-05 |
| Trạng thái | **Đề xuất, chờ nhóm duyệt.** Có hiệu lực khi được ghi vào mục *Phê duyệt* ở cuối tài liệu. |
| Dùng bởi | [evaluation-protocol.md](evaluation-protocol.md) (T19), [repo-selection.md](repo-selection.md) (T18), [report5-test-plan.md](report5-test-plan.md) (T07) |

Tài liệu này chốt **cách** ArchTime được đánh giá (nghiên cứu) và kiểm thử (phần mềm). Mỗi mục ghi lựa chọn, lý do, và các phương án đã cân nhắc nhưng không chọn.

## 1. Câu hỏi cần trả lời

| Mã | Câu hỏi | Đo cái gì |
|---|---|---|
| RQ1-A | Kiến trúc ArchTime khôi phục có khớp kiến trúc tham chiếu tốt hơn cách nhóm theo thư mục không? | Độ chính xác khôi phục |
| RQ1-B | Thay đổi kiến trúc ArchTime báo ra giữa hai mốc có đúng không, có bỏ sót không? | Phát hiện thay đổi |
| EX | Extractor tìm phụ thuộc file→file chính xác tới đâu? (T33) | Đầu vào của mọi bước sau |
| SW | Hệ thống có làm đúng nghiệp vụ và phân quyền không? | Kiểm thử phần mềm |

EX được đo riêng vì RQ1 dựng trên đồ thị phụ thuộc. Nếu extractor bỏ sót cạnh thì RQ1 thấp vì đầu vào sai chứ không vì thuật toán, và cần tách được hai nguyên nhân này.

## 2. Đánh giá nghiên cứu

### 2.1 RQ1-A: độ chính xác khôi phục

**Chọn:** MoJoFM (0–100) giữa cách nhóm của ArchTime và kiến trúc tham chiếu do người viết, so với **baseline thư mục**. Tính trên các file mà tham chiếu bao phủ. Chỉ số ARI (đã có trong panel Quality) được báo cáo kèm làm chỉ số phụ.

**Lý do:** MoJoFM là chỉ số chuẩn trong tài liệu về khôi phục kiến trúc, so sánh được với các nghiên cứu khác, và đã có cài đặt kèm kiểm chứng brute force (`domain/architecture/mojo.ts`). Baseline thư mục là đối thủ "ngây thơ" mạnh nhất có thể chạy cho mọi repo mà không cần công cụ ngoài.

| Không chọn | Vì sao |
|---|---|
| a2a / c2c | Ít dùng hơn, không có cài đặt sẵn, cần thêm thời gian kiểm chứng |
| So với ACDC, Bunch, LIMBO | Không có bản chạy được cho JS/TS. Tự cài lại thì rủi ro sai lệch so với bản gốc, chi phí cao |
| So với baseline ngẫu nhiên | Quá yếu: thắng baseline ngẫu nhiên không chứng minh được gì |

### 2.2 RQ1-B: phát hiện thay đổi

**Chọn:** người gán nhãn đọc commit giữa hai mốc liên tiếp, ghi số thay đổi kiến trúc thật, rồi chấm từng thay đổi mà mỗi cách báo ra là `correct` hay `wrong`. Từ đó tính precision, recall và F1 (`domain/evaluation/rq1.ts`). Khuyến nghị hai người gán nhãn độc lập rồi thống nhất.

| Không chọn | Vì sao |
|---|---|
| Ground truth tự động từ commit message | Commit message hiếm khi mô tả thay đổi kiến trúc; nhãn sẽ sai một cách hệ thống |
| Dùng kết quả AI refine làm chuẩn | AI là một phần của hệ thống đang được đánh giá, không thể vừa đá bóng vừa thổi còi |

### 2.3 EX: độ chính xác extractor (T33)

**Chọn:** người đọc mã của một **mẫu ngẫu nhiên có seed** gồm 40 file mỗi repo và liệt kê các file nội bộ mà từng file phụ thuộc. Sau đó so với đầu ra mà mining thực sự dùng (`DependencyExtractor` + `fileDependencies`) để tính TP/FP/FN, precision/recall/F1 theo repo, cộng micro và macro. Công cụ: `npm run extractor-eval`.

**Lý do:** chỉ có con người là nguồn độc lập với extractor. Lấy mẫu cố định seed thì tái lập được. 40 file mỗi repo gán nhãn được trong vài giờ.

| Không chọn | Vì sao |
|---|---|
| Lấy dependency-cruiser hoặc madge làm ground truth | Công cụ đó cũng có sai số riêng. Kết quả sẽ thành "ArchTime giống công cụ X tới đâu" chứ không phải "đúng tới đâu". Chỉ được dùng để soát nhãn người, không thay nhãn người |
| Gán nhãn toàn bộ repo | Chi phí quá cao với repo lớn (Nest có 1.165 file nguồn) |
| Điền sẵn phiếu bằng đầu ra của extractor rồi cho người sửa | Gây thiên lệch neo (anchoring): người gán nhãn sẽ có xu hướng chấp nhận cái có sẵn. Công cụ cố ý tạo phiếu trống |

### 2.4 Đơn vị và phạm vi

- Ngôn ngữ trong phạm vi: **JavaScript/TypeScript** (giống phạm vi hiện tại của extractor AST).
- Đơn vị phụ thuộc: cạnh file→file trong repo. Package npm và module có sẵn của Node không tính.
- Mốc thời gian: commit có tag release (mine bằng chế độ *Releases first* của T17). Repo không có tag thì dùng các mốc theo thời gian, ghi rõ trong báo cáo.

## 3. Kiểm thử phần mềm

| Mức | Chọn | Công cụ |
|---|---|---|
| Unit | Hàm thuần trong `domain/` và luật nghiệp vụ trong use case, dùng repository giả trong bộ nhớ | `node:test` (BE), `node:test` với `--experimental-strip-types` (FE) |
| Integration | Mining chạy trên **repo git thật** tạo trong test. Collection Mongo được thay bằng bản giả có cùng giao diện | `tests/mining-service.test.mjs` |
| System (API) | Mount **router thật** với middleware xác thực và phân quyền thật qua HTTP. Chỉ phần lưu trữ chạy trong bộ nhớ | `tests/system-permissions.test.mjs` |
| Frontend | Logic định tuyến và phân quyền route (`canAccess`), lớp gọi API, logic hiển thị | `FE/tests/*.test.mjs` |
| Hồi quy | Toàn bộ bộ test BE + FE, `tsc`, `vite build`, lint FE | `npm test`, `npm run build`, `npm run lint` |

| Không chọn (lúc này) | Vì sao | Khi nào xem lại |
|---|---|---|
| E2E với MongoDB thật (mongodb-memory-server) | Thêm phụ thuộc nặng (tải binary Mongo), chậm CI. Rủi ro chính, tức phân quyền, đã được bao ở tầng policy và HTTP | Khi có lỗi chỉ tái hiện được với truy vấn Mongo thật |
| E2E trình duyệt (Playwright) | Chi phí bảo trì cao khi UI còn thay đổi nhiều | Trước buổi demo cuối; tạm thay bằng checklist UAT thủ công trong Report 5 |
| Test hiệu năng tải lớn | Ngoài phạm vi capstone | — |

## 4. Mối đe doạ tính hợp lệ đã biết

- **Tham chiếu viết bằng tiền tố đường dẫn có lợi cho baseline thư mục** (đã ghi trong RQ1).
- **Extractor chưa đọc `require()` và `export … from`.** Repo CommonJS sẽ cho recall rất thấp. Vì vậy chọn repo ESM/TS làm tập chính; nếu có repo CommonJS thì phải tách riêng khi báo cáo ([repo-selection.md](repo-selection.md)).
- **Tác giả tự gán nhãn repo của mình** (ArchTime) dễ thiên lệch. Giảm thiểu bằng hai người gán nhãn và báo tỉ lệ đồng thuận.

## Phê duyệt

| Người duyệt | Vai trò | Ngày | Ghi chú |
|---|---|---|---|
| | | | |
