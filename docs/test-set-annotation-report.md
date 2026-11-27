# Gán nhãn thay đổi trên tập kiểm tra: người gán nhãn thứ hai (T9)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 N-06; [rq1-labelling-guide.md](rq1-labelling-guide.md); [rq1-protocol.md](rq1-protocol.md) §4 |
| Trạng thái | **Hoàn tất 27/11/2026.** C11 đã chạy ngày 21/11/2026 (54 cặp mốc: react-router 11, docusaurus 10, react-admin 11, actual 11, outline 11). Cả hai người đã gán nhãn đủ 54/54 cặp; đã đo đồng thuận, hợp nhất, thống nhất hết 262 chỗ lệch và tính điểm (`backendCommit a7a22df`). Phiếu và kết quả nằm ở `BE/rq1-results/` của máy chạy C11 (gitignored), chưa lưu vào repo. Tham chiếu B (T6) vẫn chưa có; RQ1-B không cần tham chiếu. |
| Người gán nhãn thứ nhất | **Nguyễn Duy Công** (thành viên nhóm, `--annotator cong`). Quyết định 18/11/2026; xem lưu ý ở §1 |
| Người gán nhãn thứ hai | Đặng Nhật Trường (thành viên nhóm, người thật, `--annotator truong`). **Trợ lý AI không gán nhãn trên tập kiểm tra** |
| Phạm vi | **Cả hai người chấm toàn bộ các cặp** của 5 repo (không chấm theo mẫu như tập phát triển) |

> Tài liệu này chỉ chứa số gộp (theo repo và toàn tập): số cặp, số mục, đồng thuận, số chỗ lệch. Không chứa nhãn của từng
> cặp hay từng thay đổi (`trueChanges`, `verdict`, `note`). Số đồng thuận lấy từ `rq1-results/agreement/agreement.json`
> (`npx tsx scripts/rq1-labels.ts agree --a cong --b truong`, 27/11/2026); số chỗ lệch từ lần chạy
> `npx tsx scripts/rq1.ts --milestones --anchored --tolerance 0.02 --reconcile`; điểm từ `rq1-results/report.md` mục B và
> `summary.json`.

## 1. Quy trình (làm theo rq1-labelling-guide.md, áp dụng cho tập kiểm tra)

1. **Sau khi C11 xong**, mỗi người tạo phiếu riêng: `cd BE && npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator <cong|truong>` (cần database đã mine 5 repo; phải có `--anchored` để phiếu có cả thay đổi của phương pháp đóng băng).
   - **Lưu ý cho Công** (người chạy C11): không mở `labels/keys/`, không đọc `report.md` hay `stability.csv` trước khi nộp phiếu của mình.
2. Không mở phiếu của người thứ nhất (`labels/<workspace>.<người-1>.json`), không mở `labels/keys/`. Không trao đổi khi đang làm.
3. Với **từng cặp mốc**, theo đúng thứ tự:
   1. đọc `commits` của cặp, hoặc `git log --oneline <from>..<to>` và diff trên checkout của repo;
   2. **ghi `trueChanges` trước**: số thay đổi kiến trúc thật (khối chức năng được thêm, bỏ, tách, gộp, tổ chức lại). `0` là hợp lệ. Áp dụng luật "chỉ sửa file" (rq1-protocol §4): cặp không có file nguồn nào thêm, xoá hay chuyển chỗ thì `trueChanges = 0`;
   3. sau đó mới đọc `changes` và đặt `verdict` (`correct` / `wrong`) cho **từng thay đổi độc lập**, có thể ghi `note`.
4. Mỗi người kiểm tra phiếu của mình: `npm run rq1:labels -- check --annotator <cong|truong>` (đủ cặp, đủ verdict, khớp khoá; script không in tên method).
5. Khi cả hai xong, **trước khi thống nhất**: `npm run rq1:labels -- agree --a cong --b truong` → `rq1-results/agreement/agreement.json` (κ và Gwet's AC1 theo từng repo và gộp, tỉ lệ `trueChanges` trùng, chênh lệch trung bình) và `disagreements.csv`. Ghi số này vào mục 3.
6. `npm run rq1 -- --milestones --anchored --tolerance 0.02 --reconcile`.
7. Thống nhất chỗ lệch theo luật viết sẵn trong hướng dẫn (mục 4 của rq1-labelling-guide và rq1-protocol §4), không theo người nào; ghi chú "Settled by the labelling guide".
8. Chạy lại `npm run rq1 -- --milestones --anchored --tolerance 0.02` để tính điểm trên phiếu đã hợp nhất (bảng gộp và theo từng repo; `detection.csv`).

> **Sửa 24/11/2026:** bước 6 và 8 trước đây thiếu `--anchored --tolerance 0.02`. Mỗi lần chạy, script dựng lại khoá và
> phiếu đã hợp nhất từ các method của lần chạy đó, nên thiếu cờ sẽ xoá các thay đổi của phương pháp đóng băng khỏi khoá.
> Script nay dừng lại nếu khoá cũ có một method mà lần chạy mới không tính (`--allow-dropping-methods` để bỏ qua).

## 2. Số cặp và số thay đổi

"Số mục" là số verdict mỗi người phải đặt (mỗi thay đổi được báo, của mọi method, trong phiếu ẩn method).

| Repo | Workspace | Số cặp mốc | Số mục (verdict) | Phiếu của Trường |
|---|---|---:|---:|---|
| react-router | `react-router-c11-test-set-893f2f` | 11 | 381 | Đã nhập 27/11/2026 |
| docusaurus | `docusaurus-c11-test-set-893f4a` | 10 | 29 | Đã nhập 27/11/2026 |
| react-admin | `react-admin-c11-test-set-893f50` | 11 | 35 | Đã nhập 27/11/2026 |
| actual | `actual-c11-test-set-893f56` | 11 | 194 | Đã nhập 27/11/2026 |
| outline | `outline-c11-test-set-893f5c` | 11 | 153 | Đã nhập 27/11/2026 |
| **Tổng** | | **54** | **792** | |

Tổng số thay đổi thật (Σ `trueChanges` trên phiếu đã hợp nhất): **133**.

Hai người làm độc lập: Nguyễn Duy Công (`cong`) và Đặng Nhật Trường (`truong`). Phiếu của Trường được nhập ngày
27/11/2026; `check` báo 0 lỗi. Mọi cặp đều có `trueChanges` và `note`, mọi verdict `correct` đều có `note`.

## 3. Đồng thuận trước khi thống nhất

Đo bằng `npx tsx scripts/rq1-labels.ts agree --a cong --b truong` ngày 27/11/2026, trước khi thống nhất.

| Repo | `trueChanges` trùng hẳn | Chênh lệch trung bình | `verdict` trùng | Cohen's κ | Gwet's AC1 |
|---|---|---|---|---|---|
| react-router | 27,3% | 4,09 | 78,0% | 0,23 | 0,69 |
| docusaurus | 70,0% | 0,30 | 69,0% | 0,20 | 0,50 |
| react-admin | 81,8% | 0,18 | 57,1% | 0,18 | 0,19 |
| actual | 27,3% | 2,09 | 67,5% | 0,19 | 0,46 |
| outline | 27,3% | 1,55 | 59,5% | 0,14 | 0,25 |
| **Gộp (792 verdict)** | | | **70,6%** | **0,2146** | **0,5345** |

- Có 262 chỗ lệch (gồm cả `trueChanges` và `verdict`). `agree` không cảnh báo hai phiếu giống hệt nhau.
- Phiếu của từng người không đổi nhãn nào sau khi đo; đã kiểm bằng cách so từng giá trị.
- Theo thang thường dùng, κ 0,21 là mức "fair", AC1 0,53 là mức "moderate". Lệch nhiều nhất ở cách đếm `trueChanges`:
  chỉ 27,3% cặp trùng hẳn ở react-router, actual và outline.

Ghi chú: ở tập phát triển, κ = −0,07 dù 14/16 verdict trùng, vì gần như mọi thay đổi bị chấm `wrong` (nghịch lý kappa). Nên báo cáo kèm AC1 như đã làm ở rq1-protocol §4.
Từ 24/11/2026 AC1 do script tính (`gwetAC1` trong `BE/src/domain/evaluation/stats.ts`), không còn tính tay; test tái lập đúng
số của tập phát triển (κ −0,0667, AC1 0,8584).

## 4. Thống nhất

Chạy `npx tsx scripts/rq1.ts --milestones --anchored --tolerance 0.02 --reconcile`: 17 cặp trùng hoàn toàn, 37 cặp có chỗ
lệch. Chỗ lệch được thống nhất theo luật viết sẵn trong hướng dẫn (mục 4 của rq1-labelling-guide và rq1-protocol §4), không
theo người nào. Bảng dưới chỉ ghi số đếm; quyết định của từng chỗ nằm trong phiếu đã hợp nhất, không chép vào đây.

| Repo | Cặp có chỗ lệch | Số chỗ lệch | Đã thống nhất | Còn `To settle` |
|---|---:|---:|---:|---:|
| react-router | 8/11 | 92 | 92 | 0 |
| docusaurus | 3/10 | 12 | 12 | 0 |
| react-admin | 6/11 | 17 | 17 | 0 |
| actual | 10/11 | 71 | 71 | 0 |
| outline | 10/11 | 70 | 70 | 0 |
| **Tổng** | **37/54** | **262** | **262** | **0** |

Sau khi thống nhất, `check` báo 0 lỗi trên 15 phiếu của tập kiểm tra.

> **TEAM:** Công và Trường xác nhận rằng 262 chỗ lệch được thống nhất theo luật của hướng dẫn, không theo người nào, và ghi
> ngày thống nhất: ______ (Công) / ______ (Trường).

## 5. Trạng thái cuối

| Repo | Đã gán (người 2) | Đã thống nhất | Được tính điểm |
|---|---|---|---|
| react-router | Có (11/11) | Có | Có |
| docusaurus | Có (10/10) | Có | Có |
| react-admin | Có (11/11) | Có | Có |
| actual | Có (11/11) | Có | Có |
| outline | Có (11/11) | Có | Có |

Điểm cuối tính bằng `npx tsx scripts/rq1.ts --milestones --anchored --tolerance 0.02` (không có `--reconcile`): "54 pairs
labelled, 0 still to label"; `summary.json` ghi `backendCommit a7a22df`. Kết quả gộp (micro; precision / recall / F1, tính
từ phân số chính xác nên có thể lệch 0,1 điểm so với `report.md`):

| Cách nhóm | TP | FP | FN | Precision | Recall | F1 | Macro P / R / F1 |
|---|---:|---:|---:|---:|---:|---:|---|
| ArchTime anchored (phương pháp chốt) | 105 | 205 | 28 | 33,9% | 78,9% | 47,4% | 36,3% / 83,6% / 50,2% |
| Clustering only | 78 | 152 | 55 | 33,9% | 58,6% | 43,0% | 43,2% / 56,3% / 46,7% |
| ArchTime recovered | 74 | 157 | 59 | 32,0% | 55,6% | 40,7% | 39,6% / 56,7% / 45,1% |
| Directory baseline | 13 | 8 | 120 | 61,9% | 9,8% | 16,9% | 72,2%¹ / 11,3% / 16,9% |

¹ Chỉ trên 3 repo; ở docusaurus và outline baseline không báo thay đổi nào nên precision không xác định.

Bảng theo từng repo: `BE/rq1-results/report.md` mục B, "Per project (reconciled sheets)". Anchored có recall và F1 cao
nhất khi gộp, nhưng precision chỉ khoảng 1/3 và kết quả không đều: ở react-router anchored chỉ đạt F1 20,6%, kém clustering
(35,6%); anchored đạt recall 100% ở docusaurus và F1 70,7% ở outline.

## 6. Việc mở

1. **TEAM:** xác nhận việc thống nhất ở mục 4 (người và ngày).
2. **TEAM:** quyết định có công bố phiếu đã hợp nhất (ví dụ vào `docs/annotations/rq1b/labels/`) hay không. Hiện phiếu và
   kết quả chỉ nằm trong `BE/rq1-results/` (gitignored) của máy chạy C11; cần sao lưu dù có công bố hay không.
3. Chạy `--sensitivity 0.3,0.5,0.7` (thăm dò, nhãn đã có) và chỉ báo cáo ở phần threats. Chưa chạy.
4. RQ1-A vẫn chờ tham chiếu B (T6).
5. ~~Người gán nhãn thứ nhất là ai?~~ **Đã quyết (18/11/2026):** Công là người thứ nhất, Trường là người thứ hai, cả hai chấm toàn bộ cặp; không dùng trợ lý AI.
6. ~~Gán nhãn 54 cặp, đo đồng thuận, thống nhất, tính điểm.~~ **Xong 27/11/2026.**
