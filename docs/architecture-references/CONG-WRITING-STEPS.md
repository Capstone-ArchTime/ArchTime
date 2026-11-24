# Viết kiến trúc tham chiếu: các bước cho Công (Reference A)

| | |
|---|---|
| Ngày | 2026-11-18 |
| Người viết | Nguyễn Duy Công (Reference A). Người viết thứ hai (Reference B) bổ sung sau |
| Khung | `<repo>.cong.json` trong thư mục này, đã điền repo, commit và tài liệu cần đọc |
| Luật chung | [README.md](README.md) §1–§3 |

## 0. Ba điều không được làm (đọc trước)

1. **Không mở** `<repo>.claude.json`, `outline.claude.rules.cjs` hay `<repo>.agreement.md` của bất kỳ repo nào. Nếu lỡ mở
   file của một repo, báo nhóm: bản của bạn cho repo đó không còn độc lập.
2. **Không xem kết quả ArchTime** của 5 repo (Architecture Map, Compare, cụm component) trước khi nộp đủ 5 bản. Vì vậy
   **viết xong cả 5 bản rồi mới chạy C11.**
3. **Không sửa file của người khác.** Mỗi người chỉ sửa file `<repo>.<tên>.json` của mình.

## 1. Thứ tự và thời gian

| # | Repo | File nguồn | Tài liệu đọc trước | Ước lượng |
|---|---|---:|---|---|
| 1 | react-router | 542 | `decisions/` (ADR) | 2–3 giờ |
| 2 | docusaurus | 813 | `website/docs/advanced/architecture.mdx` | 2–3 giờ |
| 3 | react-admin | 1 391 | `docs/Architecture.md` | 3–4 giờ |
| 4 | actual | 1 953 | `packages/docs/.../project-details/architecture.md`, ADR | 4–5 giờ |
| 5 | outline | 2 056 | `docs/ARCHITECTURE.md` | 5–6 giờ |

Repo nhỏ trước để quen cách làm. outline cuối cùng vì thư mục của nó chia theo tầng (`app/`, `server/`, `shared/`), nên sẽ
phải gán theo từng file nhiều nhất.

## 2. Các bước cho mỗi repo

### Bước 1. Lấy đúng commit

```bash
git clone https://github.com/<owner>/<repo>.git
git -C <repo> checkout <commit trong file .cong.json>
```

docusaurus trên Windows: `git -c core.longpaths=true clone ...`.

### Bước 2. Xem code nằm ở đâu (không phải gợi ý cách chia)

Trong thư mục repo, đếm file nguồn theo thư mục 3 cấp đầu (bỏ test, build, `.d.ts`), giống cách ArchTime đếm:

```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' | grep -vE '(\.test\.|\.spec\.|(^|/)(tests?|__tests__|node_modules|dist|build)/|\.d\.ts$)' | cut -d/ -f1-3 | sort | uniq -c | sort -rn | head -40
```

### Bước 3. Đọc tài liệu và viết danh sách chức năng trước

Đọc tài liệu kiến trúc của repo (bảng §1), rồi **trước khi gán file**, viết ra 5–15 khối chức năng, mỗi khối có:

- `name`: tên chức năng ("Định tuyến", "Đồng bộ dữ liệu"), **không** đặt theo tên thư mục;
- `responsibility`: một câu nói nó chịu trách nhiệm gì;
- `evidence`: chỗ trong tài liệu hoặc code cho thấy điều đó (mục trong ARCHITECTURE.md, tên ADR, comment đầu module).

Chép các khối này vào `components` của file `<repo>.cong.json`.

### Bước 4. Gán file vào chức năng

- Thư mục nào thuộc trọn một chức năng: thêm tiền tố thư mục **có `/` ở cuối** (`server/routes/`).
- Thư mục chứa file của nhiều chức năng: gán **từng file** bằng đường dẫn đầy đủ (`app/stores/AuthStore.ts`).
- Có thể gán thư mục cho A rồi gán riêng vài file trong đó cho B: tiền tố cụ thể nhất thắng.
- Không cần phủ 100 %. Bỏ `examples/`, `playground/`, `integration/`, `website/`, script build, trừ khi tài liệu coi
  chúng là một phần kiến trúc. File không thuộc tiền tố nào sẽ bị bỏ khỏi phép đo.
- Một file chỉ thuộc một component.

### Bước 5. Kiểm tra

Trong thư mục `BE` của ArchTime (PowerShell 5.1 cũng dùng đúng lệnh này):

```bash
npx tsx scripts/reference-check.ts --checkout <đường-dẫn-repo> --ref ../docs/architecture-references/<repo>.cong.json
```

Lặp bước 4–5 cho tới khi:

- không còn tiền tố "không khớp file nào" (lỗi chính tả, hoặc quên `/`);
- phần mã sản phẩm chính đã được phủ (xem số file mỗi component);
- không còn chỗ `<...>` nào trong file.

### Bước 6. Nộp

1. Điền `writtenAt` và bổ sung `sources` (mọi tài liệu đã đọc).
2. Có thể xoá trường `_notes`.
3. Commit **chỉ** file `<repo>.cong.json` của bạn, ghi vào bảng ở [ROLLOUT.md](ROLLOUT.md) §1 và
   [architecture-reference-evaluation.md](../architecture-reference-evaluation.md) §2 (tác giả, số component, số file phủ).

## 3. Sau khi xong cả 5 bản

1. **Bản dùng để chấm điểm, tạm thời:** chưa có người viết thứ hai, nên chấm bằng bản của bạn. Chuẩn bị bản nhập rồi nhập
   vào workspace của repo (*Quality → Reference architecture*):

   ```bash
   npx tsx scripts/reference-export.ts --checkout <đường-dẫn-repo> --ref ../docs/architecture-references/<repo>.cong.json
   ```

2. Chạy C11 ([rq1-protocol.md](../rq1-protocol.md) §1, bảng "Phương pháp đóng băng").
3. **Khi người viết thứ hai nộp Reference B:** đo đồng thuận bằng `reference-agreement` (`--a <repo>.cong.json --b
   <repo>.<tên>.json`), ghi số **trước khi thống nhất**, thống nhất thành `<repo>.final.json`, nhập lại và chạy lại
   `npm run rq1 -- --milestones --anchored --tolerance 0.02`. Chạy lại chỉ đọc database nên nhanh; phiếu gán nhãn thay đổi
   (RQ1-B) không phụ thuộc tham chiếu nên không phải chấm lại.
4. Người viết thứ hai phải là người **chưa mở** cả file của bạn lẫn file `*.claude.json`.

## 4. Các file `*.claude.json`

Đây là bản do trợ lý AI viết trước đó. Theo quyết định ngày 18/11/2026, **paper không dùng chúng**: Reference A là bản của
Công. Các file vẫn giữ trong repo (không xoá lịch sử) nhưng không được nhập vào workspace và không vào bất kỳ phép đo nào.
