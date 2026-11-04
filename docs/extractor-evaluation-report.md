# Báo cáo đánh giá extractor (T33)

| | |
|---|---|
| Ngày | 2026-11-05 |
| Protocol | [evaluation-protocol.md](evaluation-protocol.md) v1.0, §3.3 và §4 |
| Trạng thái | **Chưa có kết quả đánh giá.** Công cụ đo đã xong và đã kiểm thử, nhưng chưa có phiếu ground truth nào được gán nhãn. Tài liệu này **không** chứa số liệu precision/recall của repo thật nào. |

## 1. Đo cái gì

Đối tượng đo là đầu ra mà mining **thực sự dùng**:

- `BE/src/infrastructure/services/DependencyExtractor.ts`: được tách nguyên văn khỏi `MiningService`, mining gọi đúng hàm này.
- `fileDependencies` (`BE/src/domain/architecture/buildView.ts`): resolve tên module thành file và bỏ các package npm.

Kết quả này được so với nhãn do người viết (phiếu trong `eval/extractor/*.json`). Kết quả AI refine **không** được dùng ở bất kỳ đâu trong phép đo.

## 2. Công cụ

| Phần | File |
|---|---|
| Chỉ số (TP/FP/FN, P/R/F1, micro/macro), lấy mẫu có seed, tạo phiếu trống, đọc và kiểm tra phiếu, xuất báo cáo | `BE/src/domain/evaluation/extractor.ts` |
| CLI `sample` / `score`, kiểm tra checkout đúng commit | `BE/scripts/extractor-eval.ts` (`npm run extractor-eval`) |
| Test | `BE/tests/extractor-eval.test.mjs` (7 test, pass) |

Cách tái lập: làm theo [evaluation-protocol.md](evaluation-protocol.md) §3.3 và §5. Lệnh `score` ghi `BE/extractor-results/report.md` (bảng theo repo, micro/macro, danh sách cạnh bỏ sót và cạnh sai) và `edges.csv`.

## 3. Điều đã biết trước khi đo (từ test, không phải từ repo thật)

Test end-to-end dùng một repo nhỏ do test tự dựng, với các phụ thuộc biết trước. Kết quả cho thấy extractor hiện tại:

| Cú pháp | Được tìm thấy? |
|---|---|
| `import … from './x'` | Có |
| `import type … from './x'` | Có |
| `export … from './x'` | **Không** |
| `require('./x')` | **Không** |
| `import('./x')` | Không (chỉ đọc khai báo cấp cao nhất) |
| Package npm (`import express from 'express'`) | Bị loại đúng, không tính thành FP |

Hệ quả dự kiến: recall sẽ thấp ở repo có nhiều file barrel (`index.ts` dùng `export * from`), và rất thấp ở repo CommonJS. Đây là lý do fastify chỉ nằm ở tập phụ ([repo-selection.md](repo-selection.md)). Mức độ thật phải chờ kết quả đo trên repo thật.

## 4. Kết quả

*Chưa có.* Điền mục này bằng nội dung `BE/extractor-results/report.md` sau khi:

- [ ] các phiếu `eval/extractor/{axios,nest,archtime}.json` được hai người gán nhãn và thống nhất (Pending = 0),
- [ ] ghi `agreement` của từng phiếu,
- [ ] chạy `score` trên checkout đúng commit đóng băng.

## 5. Đề xuất sau khi đo (không thuộc T33)

Nếu số liệu xác nhận các cạnh bị bỏ sót ở mục 3, nên thêm việc đọc `export … from`, `require()` và `import()` vào extractor. Sau đó **chạy lại cùng bộ phiếu** để so trước/sau. Bộ phiếu không cần làm lại vì nó độc lập với extractor.
