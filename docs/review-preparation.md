# Chuẩn bị buổi review với thầy (T3)

| | |
|---|---|
| Ngày soạn | 2026-11-16 (buổi review dự kiến 14/11/2026 **đã qua**; tài liệu này là gói trình bày ở lần gặp tiếp theo) |
| Người trình bày | Đặng Nhật Trường, 5 phút |
| Trạng thái | Phần parser và công cụ: sẵn sàng. Phần "2 bản tham chiếu đầu tiên và MoJoFM giữa 2 người viết": **chưa có**, vì chưa có bản tham chiếu nào do người viết. Không có ý kiến của thầy nào được ghi ở đây. |

## 1. Nội dung 5 phút

| Phút | Nội dung | Bằng chứng |
|---|---|---|
| 0–1 | Phần việc: F-04, F-13, WF-02, WF-07, N-02; RF-07, RF-14, RF-24, RF-30 | [implementation-audit.md](implementation-audit.md) §4 |
| 1–2 | Parser Jira chạy với file mẫu (mục 2) | `docs/samples/jira-export-sample.json` |
| 2–3 | N-02: đo p95 trên 1.000 snapshot; lỗi Compare tìm ra và đã sửa | [report-5-test-plan-and-results.md](report-5-test-plan-and-results.md) §3.1 |
| 3–4 | Kiến trúc tham chiếu: quy trình, công cụ MoJoFM giữa 2 người viết, **trạng thái: chưa có bản nào** | [architecture-references/README.md](architecture-references/README.md), [architecture-reference-evaluation.md](architecture-reference-evaluation.md) |
| 4–5 | Việc đang vướng và câu hỏi cho thầy (mục 5) | — |

## 2. Parser Jira với file mẫu (đã chạy)

Hai file mẫu **tổng hợp** (không phải dữ liệu thật), cùng định dạng issue search của Jira:

```
cd BE
npm run jira-preview -- ../docs/samples/jira-export-sample.json ../docs/samples/jira-export-msg22-sample.json
```

Kết quả thực tế (2026-11-16):

| key | summary | status | nhóm | assignee | points | sprint |
|---|---|---|---|---|---|---|
| ARCH-12 | Parse Jira export | Done | done | Truong | 3 | Sprint 2 (`jira:7`) |
| ARCH-13 | Link commits to tasks | In Review | in-progress | Truong | 5 | Sprint 2 |
| ARCH-14 | Tasks & Sprints screen | To Do | todo | — | 2 | Sprint 2 (đã ở Sprint 1, chuyển sang) |
| T22 | Commit convention check | To Do | todo | Duc | — | Sprint 3 (`jira:8`) |
| ARCH-20 | Backlog item without sprint or points | — | todo | — | — | Backlog |

Tiến độ: Sprint 2 (active) 1 / 3 done, 33 %; Sprint 1 (closed) không còn task, `n/a`; Sprint 3 (future) 0 / 1, 0 %.

File thứ hai (task thứ 3 thiếu key): **bị từ chối cả file**:
`REFUSED [MSG22] MSG22: task 3 in the file has no key. Every task of a Jira export needs its key. Nothing was imported.`

Test: `BE/tests/jira-export-parser.test.mjs`, 11 / 11 pass, viết trước code.

## 3. Hai bản tham chiếu đầu tiên và MoJoFM

- **Chưa có.** Theo protocol, hai người viết độc lập từ tài liệu và code, trước khi xem kết quả ArchTime. Chưa ai viết.
- Đã chuẩn bị: commit cố định của 5 repo, mẫu file, hướng dẫn viết theo chức năng (gán từng file khi cần), thống kê số file theo thư mục, công cụ `npm run reference-agreement` (MoJoFM hai chiều trên file chung, cùng hàm của báo cáo RQ1, 6 test).
- Công cụ đã được chạy thử (smoke test) trên checkout react-router với hai file tham chiếu **giả lập** để chắc nó chạy; con số đó **không** phải kết quả và không được báo cáo.
- Đề xuất: react-router và docusaurus làm trước (nhỏ nhất, có ADR / trang kiến trúc).

## 4. Kết quả test

| Bộ | Kết quả |
|---|---|
| BE (cây tích hợp) | 753 / 753 pass, 0 bỏ qua, có MongoDB |
| FE | 414 / 414 pass; `tsc -b`, build sạch |
| WF-02 / WF-07 | 8 / 8 và 10 / 10 pass |

## 5. Vướng mắc và câu hỏi cho thầy

1. **Người viết tham chiếu thứ hai:** cần một người thứ hai cho mỗi repo (thành viên nhóm). Có chấp nhận người thứ nhất là trợ lý AI (có ghi rõ trong báo cáo, như tập phát triển RQ1-B) không?
2. **File test kiểu `*-test.ts` trong mẫu extractor** (react-router 5 / 40): giữ (đo đúng thứ mining phân tích) hay lọc rồi tạo lại phiếu?
3. **Quy ước commit:** commit không có scope (`docs: ...`) đang bị báo là finding `convention` theo đúng định dạng `type(scope): summary`. Thầy có muốn scope là tuỳ chọn không?
4. **101 test của Report 5:** cần danh sách trong BM04 §7 để ánh xạ.

## 6. Ghi ý kiến của thầy

| # | Ý kiến | Việc phải làm | Ai | Hạn |
|---|---|---|---|---|
| | *(điền sau buổi review)* | | | |
