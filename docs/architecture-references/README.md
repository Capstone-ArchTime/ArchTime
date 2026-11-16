# Kiến trúc tham chiếu cho tập kiểm tra (T1, T6)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-11-16 |
| Nguồn | BM04 RF-24; [rq1-protocol.md](../rq1-protocol.md) §1–§2; danh sách việc T1, T6 |
| Trạng thái (2026-11-16) | **Reference A của cả 5 repo** đã có, do **trợ lý AI (Claude)** viết, ghi rõ trong trường `author` (cách làm giống người gán nhãn thứ nhất của tập phát triển RQ1-B). **Reference B (thành viên nhóm) chưa có**, nên chưa có MoJoFM. |

> ⚠️ **Người viết Reference B: không mở các file `*.claude.json` và `outline.claude.rules.cjs`** cho tới khi đã nộp bản
> của mình. Nếu đã mở, báo nhóm và đổi người viết; đồng thuận đo sau đó không còn ý nghĩa. Khi nhóm chấp nhận người viết
> thứ nhất là AI, báo cáo RQ1 phải ghi rõ điều đó (rq1-protocol §4).

Tài liệu này dành cho **hai người viết** tham chiếu của mỗi repo. Đọc hết mục 1 trước khi bắt đầu.

## 1. Nguyên tắc bắt buộc (độc lập)

1. **Không xem kết quả ArchTime** của repo (Architecture Map, Compare, cụm component, kết quả AI) trước khi viết xong và nộp bản của mình. Nếu đã lỡ xem, báo nhóm và đổi người viết cho repo đó.
2. **Mỗi người một file**, tên `<repo>.<tên-người-viết>.json`. Không mở file của người kia cho đến khi cả hai đã nộp.
3. Không bàn với người kia về cách chia component khi đang viết.
4. Trợ lý AI **không** được là người viết thứ hai. Nếu nhóm quyết định dùng AI làm người viết thứ nhất (như đã làm ở tập phát triển RQ1-B), phải ghi rõ trong báo cáo và người còn lại phải là thành viên nhóm.

## 2. Viết theo chức năng, không theo thư mục

- Một component là **một khối chức năng** có trách nhiệm rõ (ví dụ "Định tuyến", "Đồng bộ dữ liệu", "Trình soạn thảo"), dựa trên **tài liệu kiến trúc của repo** (bảng mục 4) và code.
- Mỗi component là một danh sách **tiền tố đường dẫn**. Một tiền tố có thể là **đường dẫn đầy đủ của một file**: khi một thư mục chứa file thuộc nhiều chức năng, hãy gán từng file.
- **Viết tiền tố thư mục có dấu `/` ở cuối** (`server/routes/`, không phải `server/routes`). ArchTime so khớp tiền tố theo chuỗi (`quality.ts referenceGrouping`), nên `app/component` cũng khớp `app/components/...`. Dấu `/` tránh lỗi này.
- Tiền tố cụ thể nhất thắng: `src/` cho component A và `src/b/two.ts` cho component B thì file đó thuộc B.
- Không cần phủ 100 % file. File không thuộc tiền tố nào bị bỏ khỏi phép đo. Nhưng nên phủ phần mã sản phẩm chính; file trong `examples/`, `playground/`, `integration/`, `website/` chỉ gán khi tài liệu coi chúng là một phần kiến trúc.
- Với mỗi component, ghi `responsibility` (một câu) và `evidence` (tài liệu hoặc file cho thấy điều đó). Đây là bằng chứng để hai người thống nhất sau này và để thầy kiểm tra.
- Mức chi tiết gợi ý: 5–15 component mỗi repo.

## 3. Định dạng và công cụ

- Mẫu: [TEMPLATE.json](TEMPLATE.json). Trường bắt buộc: `repo`, `commit`, `author`, `components[].name`, `components[].prefixes` (ít nhất 2 component).
- `commit` là commit ghi ở bảng mục 4. Mọi người viết trên **cùng commit**.
- So hai bản (chạy trong `BE`, checkout repo đúng commit):

  ```
  npm run reference-agreement -- --checkout <thư-mục-repo> --a <repo>.<A>.json --b <repo>.<B>.json --out ../docs/architecture-references/<repo>.agreement.md
  ```

  Script kiểm tra: cùng repo, cùng commit, hai tác giả khác nhau, checkout đúng commit. Nó báo tiền tố không khớp file nào (lỗi chính tả), số file mỗi bản phủ, **MoJoFM hai chiều** trên các file cả hai cùng gán (cùng hàm `mojoFM` mà báo cáo RQ1 dùng, đã kiểm chứng bằng brute force trong `BE/tests/mojo.test.mjs`), và các component bị bản kia tách ra (điểm bắt đầu khi thống nhất).
- Trước khi so, kiểm tra một bản: `npm run reference-check -- --checkout <thư-mục-repo> --ref <repo>.<tên>.json` (đọc được không, tiền tố nào không khớp file nào, mỗi component phủ bao nhiêu file).
- Số báo cáo: **chiều thấp hơn** của MoJoFM (MoJoFM không đối xứng). Ghi cả hai chiều vào [architecture-reference-evaluation.md](../architecture-reference-evaluation.md).
- Sau khi thống nhất: một file `<repo>.final.json`, rồi Công nhập vào workspace của repo qua *Quality → Reference architecture* (hoặc `PUT /api/projects/:id/architecture/reference` với `{ components: [{ name, prefixes }] }`).

## 4. Năm repo, commit và tài liệu kiến trúc

Commit là HEAD của nhánh mặc định ngày 2026-11-16 (clone nông). Đây cũng là commit của phiếu extractor (T8), nên một lần checkout dùng được cho cả hai. "File nguồn" là file JS/TS mà ArchTime phân tích (bỏ test, `__tests__`, build, `.d.ts`); con số khác bảng ở rq1-protocol vì bảng đó còn bỏ examples, scripts và docs.

| Repo | Commit | File nguồn | Tài liệu kiến trúc để đọc trước |
|---|---|---:|---|
| outline/outline | `c0288df8eb4f4b33171e2a26b1f1f51a95f76ae5` | 2 056 | `docs/ARCHITECTURE.md` |
| facebook/docusaurus | `4c4ec4aaabc6d70288d53e10203c6d271f0cac7a` | 813 | `website/docs/advanced/architecture.mdx` |
| actualbudget/actual | `33912a083822f19090fe45a562d58fe29499ca25` | 1 953 | `packages/docs/.../project-details/architecture.md`, ADR |
| marmelab/react-admin | `f466cf73330d1458c9e371c5a7bce2659ede5817` | 1 391 | `docs/Architecture.md` |
| remix-run/react-router | `5d7962ea44fefef43718a6f9e6cce17f4e7e04ab` | 542 | thư mục `decisions/` (ADR) |

Lấy đúng commit: `git clone https://github.com/<owner>/<repo>.git && git -C <repo> checkout <commit>`. Trên Windows, docusaurus cần `git -c core.longpaths=true clone ...` (một số fixture trong `__tests__` có đường dẫn quá dài; chúng không thuộc phần được phân tích).

### Phân bố file nguồn theo thư mục (để ước lượng khối lượng, không phải gợi ý cách chia)

| Repo | Thư mục lớn nhất (số file nguồn) |
|---|---|
| outline | `app/components` 342, `shared/editor` 212, `app/scenes` 191, `server/routes` 133, `server/queues` 105, `app/hooks` 85, `server/models` 76, `app/editor` 67 |
| docusaurus | `packages/docusaurus-theme-classic` 218, `packages/docusaurus` 119, `website/src` 64, `packages/docusaurus-theme-common` 48, `packages/docusaurus-plugin-content-docs` 39 |
| actual | `packages/desktop-client` 966, `packages/component-library` 454, `packages/loot-core` 290, `packages/sync-server` 121 |
| react-admin | `packages/ra-core` 497, `packages/ra-ui-materialui` 411, `examples/crm` 143, `examples/demo` 99 |
| react-router | `integration` 100, `packages/react-router` 89, `packages/react-router-dev` 74, `playground/*` ~120 |

## 5. Thứ tự đề xuất

1. react-router và docusaurus trước (nhỏ nhất, có ADR / trang kiến trúc rõ): đủ hai repo cho buổi review (T1, T3).
2. react-admin, actual, outline (T6). outline là repo mà thư mục **không** phản ánh kiến trúc chức năng (tiêu chí 4 của protocol), nên cần gán theo file nhiều nhất.
3. Ước lượng: 2–4 giờ mỗi repo mỗi người với repo nhỏ, lâu hơn với outline và actual.
