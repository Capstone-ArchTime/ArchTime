# RQ1-B: Hướng dẫn gán nhãn cho người gán nhãn thứ hai

Tài liệu này hướng dẫn từng bước cách tự gán nhãn 36 cặp mốc của tập phát triển. Quy trình chung nằm ở `docs/rq1-protocol.md`, mục 4.

## 0. Nguyên tắc bắt buộc

- **Không mở các file `*.claude.json`.** Đó là nhãn của người gán nhãn thứ nhất (trợ lý AI). Nếu đã xem, độ đồng thuận (kappa) không còn ý nghĩa.
- **Không mở `labels/keys/`.** Thư mục này cho biết thay đổi nào do cách nhóm nào báo ra; người gán nhãn không được biết điều đó.
- Làm một mình, không bàn với ai cho đến khi xong cả 36 cặp.
- Với mỗi cặp, **ghi `trueChanges` trước**, sau đó mới đọc danh sách `changes`.

## 1. Chuẩn bị

Phiếu trắng đã được tạo sẵn, mỗi workspace một file, trong `BE/rq1-results/labels/`:

| File | Số cặp | Số thay đổi cần chấm |
|---|---|---|
| `archtime-0eba04.cong.json` | 30 | 44 |
| `archtime-1f8c4f.cong.json` | 4 | 38 |
| `hackathon-741beb.cong.json` | 2 | 14 |

Người gán nhãn khác thì tạo phiếu của mình bằng `npm run rq1 -- --annotator <tên>` (cần database). Nếu không có database, chép `labels/<workspace>.json` sang `labels/<workspace>.<tên>.json` rồi sửa trường `"annotator"`.

Mở phiếu bằng VS Code: nó báo lỗi ngay khi JSON sai cú pháp.

Để xem commit và diff, cần đúng repo:
- **ArchTime (0eba04, 1f8c4f):** chính repo này. Các hash đều có trong lịch sử của nó.
- **Hackathon:** bản clone nằm ở `BE/mining-cache/6ac10b6e5a79cd6a59741beb` của checkout chính.

**Công cụ tham khảo (không bắt buộc):** script dưới đây in ra cho từng cặp các commit, các file nguồn được thêm, xoá, đổi tên, và danh sách thay đổi (đã ẩn tên cách nhóm, không có nhãn). Kết quả ghi vào `_scratch/pairs.txt`.

```
python "D:/FPT/Fall 2026/Capstone/_scratch/pairs.py"
```

Chạy lệnh này từ thư mục gốc của worktree.

## 2. Cấu trúc một cặp trong phiếu

```json
{
  "from": { "id": "...", "hash": "40111ad", "title": "Update Login.tsx", "date": "2026-10-02" },
  "to":   { "id": "...", "hash": "b35335e", "title": "...", "date": "2026-10-02" },
  "commits": [ { "hash": "b35335e", "title": "feat(fe): add shared API and isolated demo workspace infrastructure", "depAdded": 9, "depRemoved": 0 } ],
  "trueChanges": null,
  "changes": [
    { "key": "c0302af48", "kind": "added", "before": [], "after": [ { "name": "FE / Features", "files": 2, "sample": ["FE/src/features/demo-storage.ts", "..."] } ], "verdict": null }
  ]
}
```

Hai chỗ cần điền:
- `trueChanges`: một số nguyên, `0` là hợp lệ.
- `verdict` của từng thay đổi: `"correct"` hoặc `"wrong"`.

Có thể ghi lý do vào `"note"`, ở cấp cặp hoặc cấp thay đổi. Nên ghi, vì khi hai người thống nhất sẽ cần đến.

## 3. Quy trình cho mỗi cặp

### Bước 1: xem chuyện gì đã xảy ra giữa hai mốc

```
git log --oneline <from.hash>..<to.hash>
git diff --stat -M <from.hash> <to.hash> -- '*.ts' '*.tsx' '*.js' '*.jsx'
git diff --name-status -M <from.hash> <to.hash> -- '*.ts' '*.tsx' '*.js' '*.jsx'
```

Với Hackathon, thêm `-C <đường dẫn clone>` sau `git`. Chỉ quan tâm file mã nguồn; bỏ qua test, build và tài liệu.

### Bước 2: ghi `trueChanges`, chưa nhìn vào `changes`

Đếm số **thay đổi kiến trúc thật**: một **khối chức năng** được thêm, bỏ, tách, gộp hoặc tổ chức lại.

| Tính là thay đổi thật | Không tính |
|---|---|
| Một nhóm file mới tạo thành một năng lực mới (ví dụ thêm module admin: use cases + controller + routes) | Chỉ sửa nội dung file có sẵn |
| Xoá hẳn một khối (một nhóm file cùng chức năng bị xoá) | Thêm 1–2 file vào một vùng đã có (thêm một use case vào module auth) |
| Tách một module thành hai thư mục hay khối riêng | Merge commit không đổi file nguồn |
| Gộp hai module làm một | Đổi tên file, đổi tên component |
| Chuyển một nhóm file sang tầng hay module khác | Thêm hoặc bớt import giữa các file có sẵn |

Mẹo:
- Nếu `git diff --name-status` chỉ có dòng `M` (sửa) thì gần như chắc chắn `trueChanges = 0`.
- Khối thêm ở cả back end lẫn front end được đếm **riêng cho mỗi phía** khi mỗi phía có một nhóm file mới đáng kể (ví dụ admin back end và admin front end là 2).
- Bước dài nhiều tuần (1f8c4f, cặp đầu) có thể có tới khoảng 10 thay đổi. Hãy liệt kê các khối ra `note` rồi mới đếm.

### Bước 3: chấm từng thay đổi trong `changes`

Với mỗi mục, tự hỏi: **thay đổi này có ứng với một trong các thay đổi thật ở bước 2 không?**
- `"correct"`: có. Ví dụ "added: Admin Frontend [25 file]" khi đúng là module admin front end vừa được thêm.
- `"wrong"`: không. Các trường hợp hay gặp:
  - Báo "merged" hay "split" trong khi không có file nào được thêm hoặc xoá ở vùng đó, tức là nhóm lại do thuật toán.
  - Gộp thư mục kiểu `controllers + routes + middlewares => presentation`: chỉ là cách nhóm theo độ sâu thư mục thay đổi.
  - "added" một component chỉ có 1 file, hoặc gồm các file đã tồn tại từ trước (ví dụ "Data Persistence" khi models đã có sẵn).
  - Thay đổi đúng ý nhưng sai vị trí: báo ở front end trong khi thay đổi thật nằm ở back end.

Đôi khi **cùng một thay đổi** xuất hiện hai lần với `key` khác nhau, vì hai cách nhóm cùng báo ra. Hãy chấm từng mục độc lập; cả hai đều có thể `"correct"`.

Tên component có thể gợi ý cách nhóm, ví dụ `FE / Features` là tên thư mục, còn `Admin Frontend` là tên do AI đặt. Đừng để tên ảnh hưởng: chỉ chấm theo nội dung (số file, file mẫu) so với thay đổi thật.

### Bước 4: kiểm tra trước khi sang cặp sau

- Đã điền `trueChanges` và **mọi** `verdict`.
- Số `"correct"` không nên lớn hơn `trueChanges` cho cùng một cách nhóm. Vì không biết cách nhóm, chỉ cần để ý khi số `"correct"` vượt `trueChanges` quá nhiều và xem lại.

## 4. Ví dụ

**Cặp 40111ad → b35335e (ArchTime 0eba04).** Commit "add shared API and isolated demo workspace infrastructure" thêm 4 file: `FE/src/api/client.ts`, `FeaturePage.tsx`, `demo-storage.ts`, `useDemoStore.ts`. Đây là một lớp truy cập dữ liệu mới của front end, nên `trueChanges = 1`. Hai thay đổi "added: FE / Features [2 file: demo-storage, useDemoStore]" ứng với lớp này, nên chấm `"correct"`.

**Cặp 9a2b1cd → fe4656b.** Chỉ sửa 2 file (form cài đặt), nên `trueChanges = 0`. Hai thay đổi "restructured: Pages / Project Maintainer…" là nhóm lại do thuật toán, nên chấm `"wrong"`.

## 5. Khi đã xong

Kiểm tra tiến độ, độ đồng thuận và hợp nhất, không cần database. Chạy trong thư mục `BE`:

```
node --import tsx "D:/FPT/Fall 2026/Capstone/_scratch/agree.mts"              # tiến độ và kappa
node --import tsx "D:/FPT/Fall 2026/Capstone/_scratch/agree.mts" --reconcile  # hợp nhất vào labels/<workspace>.json
```

Khi có database, lệnh tương đương là `npm run rq1 -- --reconcile`.

1. **Ghi lại số liệu đồng thuận trước khi thống nhất:** tỉ lệ `trueChanges` trùng nhau và kappa. Đây là số đưa vào luận văn.
2. Mở `labels/<workspace>.json`. Các chỗ hai người lệch nhau để trống, kèm ghi chú `To settle: ...`. Hai người cùng xem lại, quyết định và điền vào. Lúc này được phép đọc `note` của nhau.
3. Chạy lại lệnh kiểm tra (không có `--reconcile`) để thấy precision, recall và F1 cuối cùng.
4. Gửi kết quả cho người viết luận văn để thay bảng VIII-3 và bỏ chữ "provisional".

Thời gian ước tính: 36 cặp, khoảng 3–4 giờ. Riêng cặp đầu của 1f8c4f (34 thay đổi, ba tuần code) mất khoảng 45 phút.
