# Chọn repository đánh giá (T18)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-05 |
| Trạng thái | **Đề xuất, chờ nhóm duyệt.** Chưa chạy thực nghiệm nào trên các repo này; tài liệu không chứa kết quả đánh giá. |

## 1. Tiêu chí

| # | Tiêu chí | Vì sao |
|---|---|---|
| C1 | JavaScript/TypeScript, **dùng `import` (ESM/TS)** | Phạm vi của extractor AST. Repo CommonJS (`require`) sẽ đo giới hạn của extractor chứ không đo khôi phục kiến trúc |
| C2 | Lịch sử dài, có **tag release** | Cần nhiều mốc cho RQ1-B; mine theo mốc (T17) |
| C3 | Cấu trúc module rõ, cỡ vừa phải (khoảng 50–1.500 file nguồn) | Có kiến trúc đáng khôi phục, nhưng vẫn gán nhãn được |
| C4 | Còn hoạt động, mã nguồn mở, ai cũng clone được | Tái lập được |
| C5 | Viết được kiến trúc tham chiếu (tài liệu chính thức, hoặc người hiểu repo) | Cần cho RQ1-A |

## 2. Số liệu thật của các ứng viên

Lấy ngày 2026-11-05 bằng `git clone --bare --filter=tree:0` và `git ls-tree` tại HEAD. "File nguồn" là file JS/TS không thuộc test, build, ví dụ hay benchmark. "Kiểu module" đếm trên 25 file nguồn đầu tiên: số file có `require(` và số file có `import`/`export … from`.

| Repo | Commit | Tag | Lịch sử | File nguồn | Kiểu module (25 file) | Tag mới nhất (commit) |
|---|---:|---:|---|---:|---|---|
| expressjs/express | 6.186 | 306 | 2009-06 → 2026-11 | 7 | require 7 · import 0 | — |
| koajs/koa | 1.319 | 126 | 2013-08 → 2026-11 | 9 | require 8 · import 0 | — |
| fastify/fastify | 4.924 | 338 | 2016-09 → 2026-11 | 36 | require 21 · import 0 | v5.12.8 (`0c7413a`) |
| axios/axios | 2.267 | 149 | 2014-08 → 2026-11 | 92 | require 0 · import 20 | v1.21.0 (`aa54a5e`) |
| nestjs/nest | 22.435 | 392 | 2017-01 → 2026-11 | 1.165 | require 1 · import 25 | v12.3.3 (`59f3379`) |
| ArchTime (repo nhóm) | 204 | 0 | 2026 | 358 | TS/ESM | HEAD `010674b` |

## 3. Đề xuất

**Tập chính (ba repo):**

1. **axios/axios @ v1.21.0.** Cỡ vừa (92 file), module rõ (`lib/core`, `lib/adapters`, `lib/helpers`, `lib/cancel`, `lib/platform`), 149 tag. Hạn chế: các bản trước 1.0 dùng CommonJS, nên các mốc cũ chỉ được dùng cho RQ1-B khi đã lọc bỏ những mốc này (chỉ lấy tag `v1.*`).
2. **nestjs/nest @ v12.3.3.** TypeScript, monorepo nhiều package (`packages/core`, `common`, `microservices`...), kiến trúc có tài liệu chính thức, 392 tag. Hạn chế: 22.435 commit là quá nặng để mine toàn bộ, nên **chỉ mine các mốc release** (chế độ *Releases first*, chỉ tag), và 1.165 file nên chỉ gán nhãn mẫu 40 file.
3. **ArchTime @ commit được đóng băng.** TypeScript, kiến trúc phân lớp rõ (presentation / application / domain / infrastructure), nhóm viết được tham chiếu chính xác nhất. Hạn chế: không có tag (nên dùng mốc theo thời gian), lịch sử ngắn, và **tác giả tự đánh giá** (phải có hai người gán nhãn).

**Tập phụ (chỉ để đo giới hạn, báo cáo riêng):** **fastify/fastify @ v5.12.8.** Repo CommonJS đủ lớn (36 file) để cho thấy extractor hiện bỏ qua `require()`. Không gộp vào điểm chung.

**Loại:** express (7 file) và koa (9 file). Quá nhỏ để có kiến trúc đáng khôi phục, lại là CommonJS.

## 4. Việc cần làm trước khi đánh giá chính thức

1. Nhóm duyệt danh sách và commit đóng băng của từng repo (ghi vào [evaluation-protocol.md](evaluation-protocol.md) §3).
2. Clone từng repo, checkout đúng commit, chạy `npm run extractor-eval -- sample --checkout <dir> --repo <name> --n 40 --seed 2026`.
3. Đăng ký repo trong ArchTime, Scan, rồi mine theo chế độ đã ghi ở mục 3.
4. Viết kiến trúc tham chiếu cho RQ1-A (panel Quality → *Reference architecture*).
