# RQ1-B: Hướng dẫn gán nhãn (tập kiểm tra, bản 2.1)

54 cặp mốc, mỗi người (`cong`, `truong`) chấm **toàn bộ, độc lập**. Luật chấm giữ nguyên như bản 1.0. Quy trình đầy đủ: [rq1-protocol.md](rq1-protocol.md) §4.

## Không được

- Mở phiếu của người kia, `labels/keys/`, `report.md`, `stability.csv`, `detection.csv`.
- Xem Architecture, Compare, Mentor của 5 workspace C11.
- Bàn nhãn với người kia, hoặc nhờ AI gán / gợi ý nhãn.

## Mỗi cặp: 3 bước

**1. Xem thay đổi** (`<clone>` = `…\next-task-280d27\BE\mining-cache\<id workspace>`, chỉ đọc):

```powershell
git -C "<clone>" log --oneline <from.hash>..<to.hash>
git -C "<clone>" diff --name-status -M <from.hash> <to.hash> -- '*.ts' '*.tsx' '*.js' '*.jsx'
```

Có thể dùng thêm `docs/annotations/rq1b/neutral-evidence-digest.md` (chỉ mô tả, không có nhãn).

**2. Ghi `trueChanges` trước khi đọc `changes`:** số khối chức năng được thêm, bỏ, tách, gộp hoặc tổ chức lại.

| Tính | Không tính |
|---|---|
| Nhóm file mới tạo năng lực mới | Chỉ sửa file có sẵn |
| Xoá hẳn một khối | Thêm 1–2 file vào vùng đã có |
| Tách / gộp module | Đổi tên file hay component |
| Chuyển nhóm file sang tầng / module khác | Merge commit; thêm bớt import |

- Không có file nguồn nào thêm / xoá / chuyển chỗ (diff chỉ có `M`) → `trueChanges = 0`, mọi thay đổi là `wrong`.
- Một năng lực trải nhiều thư mục tính 1 lần; back end và front end tính riêng.
- Ghi căn cứ (commit, file) vào `note`.

**3. Chấm từng mục trong `changes`:** `"correct"` nếu ứng với một thay đổi thật ở bước 2, ngược lại `"wrong"`. Hay `wrong`: split/merge khi vùng đó không có file thêm/xoá; gộp thư mục theo độ sâu; "added" chỉ 1 file hoặc toàn file cũ; đúng ý nhưng sai chỗ (FE thay vì BE). Chấm theo file, không theo tên component. Mục `correct` thì ghi `note`.

Không sửa `key`, `kind`, `before`, `after`, `from`, `to`.

## Nộp

Chạy trong `…\archtime-pipeline-audit-cba0ea\BE`:

```powershell
npx tsx scripts/rq1-labels.ts import --annotator <tên> --from "<thư mục của bạn>"
npx tsx scripts/rq1-labels.ts check --annotator <tên>
```

Nhập lại bao nhiêu lần cũng được. Khi `check` báo 0 lỗi và không còn cặp thiếu nhãn thì báo nhóm.

## Sau khi cả hai nộp

```powershell
npx tsx scripts/rq1-labels.ts agree --a cong --b truong                        # ghi số đồng thuận TRƯỚC
npx tsx scripts/rq1.ts --milestones --anchored --tolerance 0.02 --reconcile    # rồi hợp nhất
```

Thống nhất các chỗ `To settle: ...` theo luật trên (không theo người nào), rồi chạy lại lệnh `rq1.ts` không có `--reconcile` để tính điểm.
