# RQ1: Quy trình đánh giá

RQ1 hỏi: **kiến trúc ArchTime khôi phục được có tốt hơn cách nhóm ngây thơ theo thư mục không**, ở hai mặt:

- **A. Độ chính xác khôi phục:** kiến trúc khôi phục khớp với kiến trúc tham chiếu (do người viết) tới đâu, so với baseline thư mục.
- **B. Phát hiện thay đổi:** các thay đổi kiến trúc mà mỗi cách báo ra giữa hai mốc liên tiếp có đúng không, và có bỏ sót thay đổi thật không.

Phần tính toán nằm ở `BE/src/domain/evaluation/rq1.ts`, có test trong `BE/tests/rq1.test.mjs`. Các khối dùng lại:

| Khối | File | Task |
|---|---|---|
| Ghép component giữa hai mốc | `domain/architecture/matching.ts` | T22 |
| Baseline thư mục | `domain/architecture/baseline.ts` | T23 |
| MoJoFM | `domain/architecture/mojo.ts` (đối chiếu brute force) | T23 |
| Đánh giá theo thời gian | `domain/architecture/evaluation.ts` | T23 |
| Số thay đổi dependency theo dòng first parent | `domain/mining/baseline.ts` | sửa lỗi mining |

## 1. Chuẩn bị dữ liệu

1. **Số liệu mining phải đúng.** Sau khi bản sửa mining (PR #53) được merge, bấm **Scan** cho từng workspace. Bước này tính lại số dependency và các bản ghi Evidence; không cần mine lại.
2. **Mỗi mốc cần có component.** RQ1 chỉ dùng các snapshot đã dựng kiến trúc (`POST /api/projects/:id/architecture`), tối đa 60 snapshot gần nhất của mỗi workspace. Cách dựng (chỉ phân cụm, hay phân cụm + AI) phải **giống nhau cho mọi mốc** trong một workspace, nếu không thì độ ổn định đo cả sự khác nhau giữa hai cách dựng.
3. **Kiến trúc tham chiếu cho phần A.** Khai báo trong workspace, ở panel **Quality**, nút **Reference architecture**; hoặc qua `PUT /api/projects/:id/architecture/reference`: danh sách component, mỗi component gồm các tiền tố đường dẫn. Workspace không có tham chiếu thì bị bỏ qua ở phần A, nhưng vẫn được tính ở phần B.

## 2. Chạy

Chạy trong thư mục `BE`, với `BE/.env` trỏ tới đúng database:

```
npm run rq1
npm run rq1 -- --project <workspaceId>
```

Lệnh thứ hai chỉ chạy một workspace (lặp `--project` để chọn nhiều workspace).

Script chỉ **đọc** database. Kết quả nằm trong `BE/rq1-results/` (đã gitignore):

| File | Nội dung |
|---|---|
| `report.md` | Bảng tổng hợp A, độ ổn định, và B |
| `recovery.csv` | Từng snapshot: số file, số component, MoJoFM của từng cách so với tham chiếu |
| `stability.csv` | Từng cặp mốc: độ ổn định và số thay đổi cấu trúc của từng cách |
| `labels/<workspace>.json` | Phiếu gán nhãn cho phần B |

Chạy lại bao nhiêu lần cũng được: **nhãn đã đánh được giữ nguyên** cho các thay đổi vẫn còn xuất hiện.

## 3. Gán nhãn (phần B)

Mỗi phần tử trong `pairs` là một cặp mốc liên tiếp (`from` → `to`, có hash, tiêu đề và ngày commit). Hai danh sách `recovered` và `baseline` liệt kê các thay đổi cấu trúc mà mỗi cách báo ra: `split`, `merged`, `restructured`, `removed`, `added`. `kept` và `renamed` không được đưa vào, vì không phải thay đổi cấu trúc.

1. Xem các commit giữa hai mốc: `git log --oneline <from.hash>..<to.hash>` cùng diff của chúng.
2. Ghi vào `trueChanges` **số thay đổi kiến trúc thật**: một khối chức năng bị tách, gộp, tổ chức lại, bỏ đi hoặc thêm mới. `0` là câu trả lời hợp lệ.
3. Với từng thay đổi trong `recovered` và `baseline`, đặt `verdict`:
   - `"correct"`: nó ứng với một trong các thay đổi thật ở bước 2.
   - `"wrong"`: không ứng với thay đổi thật nào, ví dụ do phân cụm lại sinh nhiễu, đổi tên bị báo thành tách, hay vài file đổi chỗ bị báo thành gộp.
4. Có thể ghi lý do vào `note` (của thay đổi hoặc của cặp).

Một cặp được tính khi đã có `trueChanges` và đủ mọi `verdict`. Nếu một cách có nhiều thay đổi `correct` hơn `trueChanges`, báo cáo sẽ liệt kê cặp đó ở mục *Label problems* và chỉ tính tối đa bằng `trueChanges`.

**Khuyến nghị:** hai người gán nhãn độc lập cho cùng một phiếu, so sánh, rồi thống nhất các chỗ lệch. Nên ghi tỉ lệ đồng thuận trước khi thống nhất vào báo cáo.

## 4. Chỉ số

- **A:** MoJoFM (0–100) của từng cách so với tham chiếu, trên các file mà tham chiếu bao phủ. Báo cáo ghi trung bình theo workspace và số mốc mà kiến trúc khôi phục vượt baseline.
- **Độ ổn định:** MoJoFM giữa hai mốc liên tiếp, trên các file chung, lấy mốc sau làm chuẩn. Giá trị 100 nghĩa là không file nào đổi component.
- **B:** trên các cặp đã gán nhãn:
  - precision = số thay đổi `correct` / số thay đổi đã báo
  - recall = số thay đổi `correct` / tổng `trueChanges`
  - F1 là trung bình điều hoà của precision và recall

## 5. Các mối đe doạ tính hợp lệ

- **Tham chiếu viết bằng tiền tố đường dẫn có lợi cho baseline thư mục.** Trên repo ArchTime, baseline đạt 64.69 so với 55.74 của kiến trúc khôi phục. Cần nêu rõ điều này, hoặc thêm một tham chiếu không dựa vào thư mục.
- **Baseline ổn định 100 chỉ vì thư mục ít thay đổi.** Ổn định cao không có nghĩa là phát hiện thay đổi tốt; phần B mới trả lời điều đó.
- **Một người gán nhãn** dễ thiên lệch. Xem khuyến nghị ở mục 3.
- **Dữ liệu nhỏ:** ba workspace, phần lớn là repo của chính nhóm. Kết luận chỉ áp dụng cho các repo này.
- **Phân cụm là tất định** (Louvain có thứ tự cố định), nhưng tên do AI đặt thì có thể khác giữa các lần chạy. Phần ghép component đã không dựa vào tên, nên ảnh hưởng tới kết quả là nhỏ.
