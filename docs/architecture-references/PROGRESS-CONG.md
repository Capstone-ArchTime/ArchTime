# Reference A — Báo cáo chỉnh sửa sau phản biện

Ngày: 2026-11-18

## Các chỉnh sửa đã thực hiện

- **outline**: chuyển component Tích hợp dịch vụ bên ngoài sang `plugins/`; chuyển hạ tầng dùng chung sang `shared/` làm prefix dự phòng. `shared/editor/` vẫn được phân loại riêng vì prefix cụ thể hơn. Cập nhật responsibility frontend để nêu rõ `app/utils`.
- **actual**: đổi component `packages/api/` thành **API công khai cho script bên ngoài**; cập nhật responsibility/evidence theo `@actual-app/api`, README và docs/api. Sửa trách nhiệm CRDT thành lớp đồng bộ dùng chung client-server, không chỉ server.
- **react-router**: bỏ component kiểm thử/tích hợp và playground/tutorials khỏi phép đo.
- **react-admin**: bỏ component examples và Cypress/Storybook tooling khỏi phép đo.
- **docusaurus**: bỏ website/examples và công cụ bảo trì/kiểm thử khỏi phép đo.
- **actual**: bỏ component tài liệu/CI/tooling khỏi phép đo.

## Coverage sau khi bỏ mã ngoài phạm vi

Đếm theo source files ở đúng commit, loại test/build/declaration files theo bộ lọc đã dùng trong bước đếm. Coverage dưới đây là số file khớp các prefix sản phẩm còn giữ trên tổng source files; file không khớp prefix được bỏ khỏi phép đo như hướng dẫn.

| Repository | Components | Assigned | Total | Coverage |
|---|---:|---:|---:|---:|
| react-router | 6 | 219 | 542 | 40.4% |
| docusaurus | 8 | 679 | 813 | 83.5% |
| react-admin | 10 | 1,033 | 1,391 | 74.3% |
| actual | 8 | 1,896 | 1,953 | 97.1% |
| outline | 15 | 2,035 | 2,056 | 99.0% |

Các tỷ lệ này không phải mục tiêu tối ưu hóa; việc giảm coverage là có chủ ý để không đưa examples, playground, integration, website và tooling vào phép đo kiến trúc sản phẩm. Với react-router, 40.4% là phù hợp với lưu ý rằng phần lớn source files nằm trong playground/integration/tutorials.

## Trạng thái

Đã cập nhật 5 file `.cong.json`, tái tạo 5 payload import và kiểm tra cấu trúc JSON, số component (5–15), prefix không rỗng/không trỏ tới vùng đã xóa. Chưa tuyên bố checker/export chính thức đã chạy trên full local checkout. Cần chạy `reference-check.ts` bằng checkout đầy đủ tại đúng commit trước khi import vào workspace và chạy C11.
