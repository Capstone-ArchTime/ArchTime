# Đánh giá kiến trúc tham chiếu (T6)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 RF-24; [rq1-protocol.md](rq1-protocol.md) §2.3; danh sách việc T1, T6 |
| Hướng dẫn cho người viết | [architecture-references/README.md](architecture-references/README.md) |
| Trạng thái | **IN_PROGRESS.** react-router và docusaurus: có Reference A do trợ lý AI viết (ghi rõ), chờ Reference B của một thành viên nhóm. actual, react-admin, outline: chưa có bản nào. Công cụ (`reference-check`, `reference-agreement`), mẫu, hướng dẫn và commit đã sẵn sàng. |
| Phụ thuộc | T6 phải xong trước khi Công chạy C11 (tập kiểm tra). Hạn trong danh sách việc: 18/11/2026 |

> Tài liệu này **không** chứa số MoJoFM nào. Mỗi ô "—" được điền từ đầu ra của `npm run reference-agreement` sau khi
> hai người đã viết xong. Không điền bằng ước lượng.

## 1. Phương pháp so sánh

1. Hai người viết độc lập (luật ở hướng dẫn §1), mỗi người một file `<repo>.<tên>.json` trên **cùng commit**.
2. Mọi file nguồn mà ArchTime phân tích ở commit đó (git ls-files, JS/TS, bỏ test, build, `.d.ts`) được gán vào component theo **tiền tố cụ thể nhất**, đúng như ArchTime gán khi chấm điểm với tham chiếu (`quality.ts referenceGrouping`).
3. MoJoFM tính trên các file **cả hai** cùng gán, bằng `mojoFM` của `BE/src/domain/architecture/mojo.ts` (cùng hàm của báo cáo RQ1; đã kiểm chứng với brute force trong `BE/tests/mojo.test.mjs`). Hai chiều: A → B (B là chuẩn) và B → A. **Số báo cáo là chiều thấp hơn.**
4. Lệnh: `npm run reference-agreement -- --checkout <repo> --a <A>.json --b <B>.json --out ../docs/architecture-references/<repo>.agreement.md`. Script từ chối hai file cùng tác giả, khác commit, khác repo, hoặc checkout sai commit; liệt kê tiền tố không khớp file nào và các component bị bản kia tách ra.
5. Kiểm thử của công cụ: `BE/tests/reference-agreement.test.mjs` (6 test, có một ví dụ tính tay: lệch một file trên 4 file → MoJoFM 50 cả hai chiều).

### Đọc con số

- MoJoFM 100: hai người chia giống hệt (trên file chung). MoJoFM đo số thao tác *move/join* tối thiểu để biến cách chia này thành cách kia, chuẩn hoá theo số thao tác tối đa.
- Đồng thuận thấp là **thông tin**, không phải lỗi: nó cho biết kiến trúc của repo mơ hồ tới đâu, và là trần hợp lý cho MoJoFM của ArchTime so với tham chiếu. Báo cáo RQ1 nên đặt MoJoFM của các method cạnh con số này.
- Ghi kèm độ phủ (số file mỗi bản gán / tổng): MoJoFM trên 20 % file nói ít hơn trên 80 %.

## 2. Kết quả theo repo

Reference A của hai repo đầu do trợ lý AI viết từ ADR / trang kiến trúc và mã nguồn, **không** dùng đầu ra ArchTime (hai repo này chưa được mine). Người viết thứ hai phải là thành viên nhóm, không mở file của AI trước khi nộp bản của mình. Phủ ít ở react-router (38 %) là có chủ đích: `integration/`, `playground/` không thuộc kiến trúc theo ADR.

| Repo | Commit | Reference A (tác giả, số component, phủ) | Reference B (tác giả, số component, phủ) | File chung | MoJoFM A→B | MoJoFM B→A | Đồng thuận | Trạng thái |
|---|---|---|---|---:|---|---|---|---|
| react-router | `5d7962e` | Claude (AI), 13 component, 208 / 542 | — | — | — | — | — | Chờ Reference B |
| docusaurus | `4c4ec4a` | Claude (AI), 15 component, 671 / 813 | — | — | — | — | — | Chờ Reference B |
| react-admin | `f466cf7` | — | — | — | — | — | — | BLOCKED: chưa có bản nào |
| actual | `33912a0` | — | — | — | — | — | — | BLOCKED: chưa có bản nào |
| outline | `c0288df` | — | — | — | — | — | — | BLOCKED: chưa có bản nào |

## 3. Thống nhất và bản cuối

Với mỗi repo, sau khi đã ghi số ở mục 2 (số **trước** khi thống nhất):

1. Đi qua danh sách "Components split by the other reference" trong báo cáo của script, bắt đầu từ component bị tách nhiều file nhất.
2. Quyết định theo **tài liệu kiến trúc của repo** (trường `evidence`), không theo người nào. Ghi mỗi quyết định vào bảng dưới.
3. Ghi bản cuối `<repo>.final.json` (`author` = "A + B, reconciled"). Chạy lại script giữa bản cuối và từng bản gốc để ghi lại mức thay đổi (không bắt buộc).
4. Giao Công nhập bản cuối vào workspace của repo (*Quality → Reference architecture*), **trước** C11.

| Repo | Chỗ lệch | Quyết định | Căn cứ |
|---|---|---|---|
| — | — | — | — |

| Repo | Bản cuối | Đã giao Công | Ngày nhập |
|---|---|---|---|
| react-router | — | Chưa | — |
| docusaurus | — | Chưa | — |
| react-admin | — | Chưa | — |
| actual | — | Chưa | — |
| outline | — | Chưa | — |

## 4. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Tham chiếu viết theo thư mục có lợi cho baseline thư mục (rq1-protocol §7) | Hướng dẫn yêu cầu viết theo chức năng, gán từng file khi cần, ghi `evidence` |
| `referenceGrouping` so khớp tiền tố theo chuỗi, không theo đoạn đường dẫn (`app/component` khớp `app/components/x`) | Hướng dẫn yêu cầu tiền tố thư mục có `/` ở cuối; script báo tiền tố không khớp file nào. Không sửa hàm của RQ1 vì sẽ đổi điểm của mọi tham chiếu đã nhập |
| Người viết đã xem kết quả ArchTime | Luật §1 của hướng dẫn; nếu vi phạm thì đổi người viết |
| Trễ hạn 18/11 làm C11 trễ | Làm react-router và docusaurus trước (nhỏ nhất); báo nhóm ngay nếu trễ quá 1 ngày (quy ước chung) |
