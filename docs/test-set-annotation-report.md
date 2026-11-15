# Gán nhãn thay đổi trên tập kiểm tra: người gán nhãn thứ hai (T9)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Nguồn | BM04 N-06; [rq1-labelling-guide.md](rq1-labelling-guide.md); [rq1-protocol.md](rq1-protocol.md) §4 |
| Trạng thái | **BLOCKED.** Điều kiện trước: Công chạy xong C11 (tập kiểm tra), mà C11 lại cần T6 (tham chiếu của 5 repo). Chưa có phiếu nào của tập kiểm tra. |
| Người gán nhãn thứ hai | Đặng Nhật Trường (thành viên nhóm, người thật). **Trợ lý AI không làm người gán nhãn thứ hai** |

> Tài liệu này không chứa nhãn, `trueChanges`, kappa hay số đồng thuận nào. Mọi ô "—" được điền từ đầu ra của
> `npm run rq1 -- --milestones --reconcile` sau khi hai người đã gán nhãn xong.

## 1. Quy trình (làm theo rq1-labelling-guide.md, áp dụng cho tập kiểm tra)

1. **Sau khi C11 xong**, tạo phiếu riêng: `cd BE && npm run rq1 -- --milestones --annotator truong` (cần database đã mine 5 repo).
2. Không mở phiếu của người thứ nhất (`labels/<workspace>.<người-1>.json`), không mở `labels/keys/`. Không trao đổi khi đang làm.
3. Với **từng cặp mốc**, theo đúng thứ tự:
   1. đọc `commits` của cặp, hoặc `git log --oneline <from>..<to>` và diff trên checkout của repo;
   2. **ghi `trueChanges` trước**: số thay đổi kiến trúc thật (khối chức năng được thêm, bỏ, tách, gộp, tổ chức lại). `0` là hợp lệ. Áp dụng luật "chỉ sửa file" (rq1-protocol §4): cặp không có file nguồn nào thêm, xoá hay chuyển chỗ thì `trueChanges = 0`;
   3. sau đó mới đọc `changes` và đặt `verdict` (`correct` / `wrong`) cho **từng thay đổi độc lập**, có thể ghi `note`.
4. Khi cả hai xong: `npm run rq1 -- --milestones --reconcile`. Ghi độ đồng thuận **trước** khi thống nhất (mục 3).
5. Thống nhất chỗ lệch theo luật viết sẵn trong hướng dẫn (mục 4 của rq1-labelling-guide và rq1-protocol §4), không theo người nào; ghi chú "Settled by the labelling guide".
6. Chạy lại `npm run rq1 -- --milestones` để tính điểm trên phiếu đã hợp nhất.

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
3. Nếu người gán nhãn thứ nhất là trợ lý AI (như ở tập phát triển), báo cáo phải ghi rõ, và người thứ hai phải chấm **toàn bộ** cặp (không chỉ mẫu) để kappa có ý nghĩa trên tập kiểm tra. Cần nhóm quyết định trước khi bắt đầu.
