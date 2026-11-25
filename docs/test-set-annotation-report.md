# Gán nhãn thay đổi trên tập kiểm tra: người gán nhãn thứ hai (T9)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 N-06; [rq1-labelling-guide.md](rq1-labelling-guide.md); [rq1-protocol.md](rq1-protocol.md) §4 |
| Trạng thái | **Chờ người gán nhãn** (cập nhật 24/11/2026). C11 đã chạy ngày 21/11/2026 (54 cặp mốc: react-router 11, docusaurus 10, react-admin 11, actual 11, outline 11; phiếu ở `BE/rq1-results/labels/` của máy chạy C11, chưa lưu vào repo). **0/54 cặp đã gán nhãn** bởi cả hai người. Tham chiếu B (T6) vẫn chưa có; RQ1-B không cần tham chiếu. |
| Người gán nhãn thứ nhất | **Nguyễn Duy Công** (thành viên nhóm, `--annotator cong`). Quyết định 18/11/2026; xem lưu ý ở §1 |
| Người gán nhãn thứ hai | Đặng Nhật Trường (thành viên nhóm, người thật, `--annotator truong`). **Trợ lý AI không gán nhãn trên tập kiểm tra** |
| Phạm vi | **Cả hai người chấm toàn bộ các cặp** của 5 repo (không chấm theo mẫu như tập phát triển) |

> Tài liệu này không chứa nhãn, `trueChanges`, kappa hay số đồng thuận nào. Mọi ô "—" được điền từ đầu ra của
> `npm run rq1 -- --milestones --reconcile` sau khi hai người đã gán nhãn xong.

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

| Repo | Workspace | Số cặp mốc | Số thay đổi cần chấm | Phiếu của Trường |
|---|---|---:|---:|---|
| outline | — | — | — | Chưa tạo (chờ C11) |
| docusaurus | — | — | — | Chưa tạo (chờ C11) |
| actual | — | — | — | Chưa tạo (chờ C11) |
| react-admin | — | — | — | Chưa tạo (chờ C11) |
| react-router | — | — | — | Chưa tạo (chờ C11) |

## 3. Đồng thuận trước khi thống nhất

| Repo | `trueChanges` trùng hẳn | Chênh lệch trung bình | `verdict` trùng | Cohen's κ | Gwet's AC1 |
|---|---|---|---|---|---|
| (5 repo) | — | — | — | — | — |

Ghi chú: ở tập phát triển, κ = −0,07 dù 14/16 verdict trùng, vì gần như mọi thay đổi bị chấm `wrong` (nghịch lý kappa). Nên báo cáo kèm AC1 như đã làm ở rq1-protocol §4.
Từ 24/11/2026 AC1 do script tính (`gwetAC1` trong `BE/src/domain/evaluation/stats.ts`), không còn tính tay; test tái lập đúng
số của tập phát triển (κ −0,0667, AC1 0,8584). Tập kiểm tra hiện **chưa có nhãn nào**.

## 4. Thống nhất

| Repo | Cặp / thay đổi | Người 1 | Người 2 | Quyết định | Căn cứ trong hướng dẫn |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## 5. Trạng thái cuối

| Repo | Đã gán (người 2) | Đã thống nhất | Được tính điểm |
|---|---|---|---|
| outline | Không | Không | Không |
| docusaurus | Không | Không | Không |
| actual | Không | Không | Không |
| react-admin | Không | Không | Không |
| react-router | Không | Không | Không |

## 6. Việc mở

1. T6 (tham chiếu) → C11 (Công chạy tập kiểm tra) → T9. Đường găng của RQ1 trên tập kiểm tra.
2. Ước lượng công: 5–10 phút mỗi cặp (rq1-protocol §4). Với khoảng 12–15 mốc mỗi repo, 5 repo ≈ 55–70 cặp ≈ 5–12 giờ mỗi người.
3. ~~Người gán nhãn thứ nhất là ai?~~ **Đã quyết (18/11/2026):** Công là người thứ nhất, Trường là người thứ hai, cả hai chấm toàn bộ cặp; không dùng trợ lý AI.
