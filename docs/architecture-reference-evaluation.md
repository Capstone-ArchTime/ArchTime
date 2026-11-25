# Đánh giá kiến trúc tham chiếu (T6)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 RF-24; [rq1-protocol.md](rq1-protocol.md) §2.3; danh sách việc T1, T6 |
| Hướng dẫn cho người viết | [architecture-references/README.md](architecture-references/README.md) |
| Trạng thái | **IN_PROGRESS (cập nhật 24/11/2026).** Reference A của cả 5 repo do **Nguyễn Duy Công** viết ngày 18/11/2026 (`<repo>.cong.json`: react-router 6, docusaurus 8, react-admin 10, actual 8, outline 15 component; mọi component có `responsibility` và `evidence`). Các bản do AI viết (`*.claude.json`, bảng §2 bên dưới) **không dùng** (quyết định 18/11/2026, ROLLOUT.md). **Reference B: 0/5.** C11 (21/11/2026) đã chấm bằng Reference A. |
| Phụ thuộc | T6 phải xong trước khi Công chạy C11 (tập kiểm tra). Hạn trong danh sách việc: 18/11/2026 |

> Tài liệu này **không** chứa số MoJoFM nào. Mỗi ô "—" được điền từ đầu ra của `npm run reference-agreement` sau khi
> hai người đã viết xong. Không điền bằng ước lượng.

### Bổ sung 24/11/2026 (audit)

- **Kiểm tra độ đầy đủ trước khi so sánh:** `reference-check` nay báo thêm (lỗi → exit 1): còn chữ mẫu `<...>`, component
  thiếu `responsibility` hoặc `evidence`, một tiền tố thuộc hai component; (cảnh báo): số component ngoài 5–15, tiền tố
  không khớp file nào, component không nhận file nào (bị tiền tố cụ thể hơn che), tiền tố thư mục thiếu `/` ở cuối mà khớp
  cả thư mục anh em (`referenceProblems`, `BE/src/domain/evaluation/referenceAgreement.ts`).
- **Danh sách file lệch để thống nhất:** `reference-agreement ... --csv <file.csv>` ghi mọi file chỉ một bản phủ
  (`only-in-A`, `only-in-B`) và mọi file nằm ở hai component không phải cặp khớp nhất của nhau (`different-component`);
  đổi tên component mà giữ nguyên file thì không sinh dòng nào (`fileDisagreements`).
- **Độc lập của người viết B:** thư mục `docs/architecture-references/` chứa cả bản A (`*.cong.json`) lẫn bản AI. Người viết B
  nên làm trên một bản checkout riêng chỉ từ `b-templates/<repo>.B.json`, không mở thư mục này, và ghi lại điều đó.
- **Paper §4.3** viết hai bản được viết "before the repository is mined". Bằng chứng sớm nhất trong git của bản A là commit
  `0c5e1f8` (19/11/2026), còn ghi chép mine C11 đề ngày 18/11/2026. Cần nêu đúng điều có bằng chứng (viết trước khi xem bất
  kỳ đầu ra nào của ArchTime) hoặc bổ sung bằng chứng thời điểm.

## 1. Phương pháp so sánh

1. Hai người viết độc lập (luật ở hướng dẫn §1), mỗi người một file `<repo>.<tên>.json` trên **cùng commit**.
2. Mọi file nguồn mà ArchTime phân tích ở commit đó (git ls-files, JS/TS, bỏ test, build, `.d.ts`) được gán vào component theo **tiền tố cụ thể nhất**, đúng như ArchTime gán khi chấm điểm với tham chiếu (`quality.ts referenceGrouping`).
3. MoJoFM tính trên các file **cả hai** cùng gán, bằng `mojoFM` của `BE/src/domain/architecture/mojo.ts` (cùng hàm của báo cáo RQ1; đã kiểm chứng với brute force trong `BE/tests/mojo.test.mjs`). Hai chiều: A → B (B là chuẩn) và B → A. **Số báo cáo là chiều thấp hơn.**
4. Lệnh (trong `BE`): `npx tsx scripts/reference-agreement.ts --checkout <repo> --a <A>.json --b <B>.json --out ../docs/architecture-references/<repo>.agreement.md`. Script từ chối hai file cùng tác giả, khác commit, khác repo, hoặc checkout sai commit; liệt kê tiền tố không khớp file nào và các component bị bản kia tách ra.
5. Kiểm thử của công cụ: `BE/tests/reference-agreement.test.mjs` (6 test, có một ví dụ tính tay: lệch một file trên 4 file → MoJoFM 50 cả hai chiều).

### Đọc con số

- MoJoFM 100: hai người chia giống hệt (trên file chung). MoJoFM đo số thao tác *move/join* tối thiểu để biến cách chia này thành cách kia, chuẩn hoá theo số thao tác tối đa.
- Đồng thuận thấp là **thông tin**, không phải lỗi: nó cho biết kiến trúc của repo mơ hồ tới đâu, và là trần hợp lý cho MoJoFM của ArchTime so với tham chiếu. Báo cáo RQ1 nên đặt MoJoFM của các method cạnh con số này.
- Ghi kèm độ phủ (số file mỗi bản gán / tổng): MoJoFM trên 20 % file nói ít hơn trên 80 %.

## 2. Kết quả theo repo

Reference A của hai repo đầu do trợ lý AI viết từ ADR / trang kiến trúc và mã nguồn, **không** dùng đầu ra ArchTime (hai repo này chưa được mine). Người viết thứ hai phải là thành viên nhóm, không mở file của AI trước khi nộp bản của mình. Phủ ít ở react-router (38 %) và react-admin (71 %) là có chủ đích: `integration/`, `playground/`, `examples/`, `cypress/` không thuộc kiến trúc theo tài liệu. Với actual và outline, component là **chức năng cắt ngang các tầng**: một chức năng gồm giao diện, xử lý ở background server / API và (nếu có) route của sync-server. outline gán **từng file** bằng quy tắc theo từ trong tên file (ghi trong trường `note` và tái lập bằng `outline.claude.rules.cjs`); đã soát tay các trường hợp khớp nhầm (ví dụ `Spinner`, `startup`, `shared/constants.ts`) và một mẫu ngẫu nhiên 25 file.

| Repo | Commit | Reference A (tác giả, số component, phủ) | Reference B (tác giả, số component, phủ) | File chung | MoJoFM A→B | MoJoFM B→A | Đồng thuận | Trạng thái |
|---|---|---|---|---:|---|---|---|---|
| react-router | `5d7962e` | Claude (AI), 13 component, 208 / 542 | — | — | — | — | — | Chờ Reference B |
| docusaurus | `4c4ec4a` | Claude (AI), 15 component, 671 / 813 | — | — | — | — | — | Chờ Reference B |
| react-admin | `f466cf7` | Claude (AI), 16 component, 994 / 1391 | — | — | — | — | — | Chờ Reference B |
| actual | `33912a0` | Claude (AI), 19 component, 1789 / 1953 | — | — | — | — | — | Chờ Reference B |
| outline | `c0288df` | Claude (AI), 16 component, 2035 / 2056, gán từng file theo quy tắc ghi trong `outline.claude.rules.cjs` | — | — | — | — | — | Chờ Reference B |

## 3. Thống nhất và bản cuối

Với mỗi repo, sau khi đã ghi số ở mục 2 (số **trước** khi thống nhất):

1. Đi qua danh sách "Components split by the other reference" trong báo cáo của script, bắt đầu từ component bị tách nhiều file nhất.
2. Quyết định theo **tài liệu kiến trúc của repo** (trường `evidence`), không theo người nào. Ghi mỗi quyết định vào bảng dưới.
3. Ghi bản cuối `<repo>.final.json` (`author` = "A + B, reconciled"). Chạy lại script giữa bản cuối và từng bản gốc để ghi lại mức thay đổi (không bắt buộc).
4. Chạy `npx tsx scripts/reference-export.ts --checkout <repo> --ref <repo>.final.json`; giao Công file `.final.import.json.txt` (dán vào *Quality → Reference architecture*) hoặc `.final.import.json` (body của API), **trước** C11.

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
