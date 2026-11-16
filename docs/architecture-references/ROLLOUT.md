# Triển khai kiến trúc tham chiếu (T1, T6, RF-24)

| | |
|---|---|
| Ngày | 2026-11-16 |
| Hạn | **18/11/2026** (Công cần bản cuối trước khi chạy C11; T9 chờ C11) |
| Người phụ trách | Đặng Nhật Trường |
| Hướng dẫn chi tiết | [README.md](README.md) |

## 1. Hiện trạng

| Repo | Bản A | Bản B | MoJoFM A↔B | Bản cuối | Đã nhập (Công) |
|---|---|---|---|---|---|
| react-router | ✅ AI (Claude), 13 component | ⬜ | ⬜ | ⬜ | ⬜ |
| docusaurus | ✅ AI, 15 component | ⬜ | ⬜ | ⬜ | ⬜ |
| actual | ✅ AI, 19 component | ⬜ | ⬜ | ⬜ | ⬜ |
| react-admin | ✅ AI, 16 component | ⬜ | ⬜ | ⬜ | ⬜ |
| outline | ✅ AI, 16 component (gán từng file) | ⬜ | ⬜ | ⬜ | ⬜ |

Công cụ đã sẵn và có test: `reference-check` (kiểm một bản), `reference-agreement` (MoJoFM hai chiều), `reference-export` (nén không mất thông tin + kiểm giới hạn, ra file để nhập). Bản A của cả 5 repo đã thử qua `reference-export`: cách gán từng file giữ nguyên, và đều nhập được. Riêng outline (633 tiền tố) đã nhập thử thành công vào workspace demo rồi xoá đi.

## 2. Quyết định cần nhóm (trước khi viết bản B)

1. **Chấp nhận bản A do AI viết** làm người viết thứ nhất (có ghi rõ trong báo cáo, như người gán nhãn thứ nhất của tập phát triển RQ1-B)?
   - **Có:** chỉ cần 1 thành viên viết bản B cho mỗi repo.
   - **Không:** bỏ các file `*.claude.json`; mỗi repo cần 2 thành viên viết A và B.
2. Phân công người viết (bảng mục 3).

## 3. Phân công (điền tên)

| Repo | Người viết B | Ước lượng | Hạn |
|---|---|---|---|
| react-router (542 file, ADR trong `decisions/`) | | 2–3 giờ | 17/11 |
| docusaurus (813 file, `website/docs/advanced/architecture.mdx`) | | 2–3 giờ | 17/11 |
| react-admin (1.391 file, `docs/Architecture.md`) | | 3–4 giờ | 17/11 |
| actual (1.953 file, `packages/docs/.../architecture.md`) | | 4–5 giờ | 18/11 sáng |
| outline (2.056 file, `docs/ARCHITECTURE.md`; **gán từng file**) | | 5–6 giờ | 18/11 sáng |

Một người không viết bản B cho repo mà mình đã mở file `*.claude.json` của repo đó.

## 4. Các bước

| # | Ai | Việc | Lệnh (trong `BE`, Windows: dùng `npx tsx`) |
|---|---|---|---|
| 1 | Người viết B | Clone repo, checkout đúng commit (README §4); chép `b-templates/<repo>.B.json` thành `<repo>.<tên>.json`; viết theo README §1–§2; **không mở** `*.claude.json`, `outline.claude.rules.cjs`, không xem ArchTime | — |
| 2 | Người viết B | Kiểm bản của mình | `npx tsx scripts/reference-check.ts --checkout <repo> --ref <file>` |
| 3 | Trường | Đo đồng thuận, **ghi số trước khi thống nhất** vào `architecture-reference-evaluation.md` §2 | `npx tsx scripts/reference-agreement.ts --checkout <repo> --a <repo>.claude.json --b <repo>.<tên>.json --out ../docs/architecture-references/<repo>.agreement.md` |
| 4 | Trường + người viết B | Thống nhất theo tài liệu của repo, ghi từng quyết định (`architecture-reference-evaluation.md` §3); lưu `<repo>.final.json` | — |
| 5 | Trường | Chuẩn bị bản nhập | `npx tsx scripts/reference-export.ts --checkout <repo> --ref ../docs/architecture-references/<repo>.final.json` |
| 6 | Công | Nhập vào workspace của repo: dán `<repo>.final.import.json.txt` vào *Quality → Reference architecture*, hoặc gửi `<repo>.final.import.json` làm body của `PUT /api/projects/:id/architecture/reference` | — |
| 7 | Công | Chạy C11 | rq1-protocol §3 |

## 5. Tin nhắn gửi nhóm (soạn sẵn)

> Mọi người ơi, T6 (kiến trúc tham chiếu cho 5 repo tập kiểm tra) hạn **18/11**, Công cần bản cuối để chạy C11.
> Hiện trạng: mình đã có **bản A cho cả 5 repo do AI (Claude) viết** từ tài liệu kiến trúc và code của repo, ghi rõ tác
> giả là AI, chưa xem kết quả ArchTime; công cụ đo MoJoFM và xuất bản nhập đã sẵn (`docs/architecture-references/`).
> Cần nhóm:
> 1. Quyết định có chấp nhận bản A do AI viết không (giống cách tập phát triển RQ1-B dùng AI làm người gán nhãn thứ nhất).
> 2. Nhận viết **bản B** cho 1 repo mỗi người (2–6 giờ tuỳ repo): xem `docs/architecture-references/ROLLOUT.md` mục 3.
>    Người viết B **không mở** các file `*.claude.json` và không xem kết quả ArchTime của repo đó.
> Hướng dẫn: `docs/architecture-references/README.md`. Ai nhận repo nào thì reply giúp mình trong hôm nay nhé.
