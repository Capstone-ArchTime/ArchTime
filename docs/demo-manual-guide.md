# Hướng dẫn chạy demo bằng tay (phần của Đức)

Chạy lại bằng tay các luồng đã demo tự động ngày 18/11/2026: WF-08 (kiểm tra commit mới), WF-09 (coding agent), WF-05
(newcomer học), chuyển workspace vào tổ chức (D8), liên kết GitHub (D9), gia hạn phiên (D1). Khoảng 30–40 phút.

Dùng server dev bình thường (backend `http://localhost:4000`, frontend `http://localhost:5173`) và các tài khoản test của
`npm run seed:test` ([manual-test-guide.md](manual-test-guide.md)).

## 0. Chuẩn bị (một lần)

### 0.1 Cho phép mine repo trên máy

Demo dùng một repo git nhỏ trên máy (3 commit) để kết quả lúc nào cũng giống nhau và mine trong vài giây. Mở `BE/.env`,
thêm dòng:

```
ARCHTIME_ALLOW_LOCAL_REPOS=true
```

Chỉ dùng khi dev. **Xoá dòng này sau khi demo xong** (mục 9).

### 0.2 Tạo repo demo

Mở **Git Bash** và chạy nguyên khối dưới đây. Nó tạo `C:\archtime-demo-repo` (đường dẫn không có dấu cách) với 3 commit
có ngày cố định:

```bash
R=/c/archtime-demo-repo
rm -rf "$R" && mkdir -p "$R/src/orders" "$R/src/billing" "$R/src/db" && cd "$R"
git init -q -b main && git config user.email demo@example.com && git config user.name Demo
printf 'export const order = 1;\n' > src/orders/model.ts
printf "import { order } from '../orders/model';\nexport const invoice = order;\n" > src/orders/service.ts
printf 'export const bill = 2;\n' > src/billing/invoice.ts
printf 'export const db = 3;\n' > src/db/client.ts
git add -A && GIT_AUTHOR_DATE="2026-10-01T10:00:00Z" GIT_COMMITTER_DATE="2026-10-01T10:00:00Z" git commit -qm "Baseline: orders, billing, db"
printf "import { order } from '../orders/model';\nexport const bill = order;\n" > src/billing/invoice.ts
git add -A && GIT_AUTHOR_DATE="2026-10-05T10:00:00Z" GIT_COMMITTER_DATE="2026-10-05T10:00:00Z" git commit -qm "Billing reads orders directly"
printf "import { order } from './model';\nimport { db } from '../db/client';\nexport const invoice = order + db;\n" > src/orders/service.ts
git add -A && GIT_AUTHOR_DATE="2026-10-09T10:00:00Z" GIT_COMMITTER_DATE="2026-10-09T10:00:00Z" git commit -qm "Orders writes to the db"
git log --format="%h %ad %s" --date=short
```

Kết quả là 3 commit (hash có thể khác trên máy bạn):

| Ngày | Commit | Ý nghĩa trong demo |
|---|---|---|
| 01/10 | *Baseline: orders, billing, db* | Sẽ là **baseline**: code lúc xác nhận sơ đồ |
| 05/10 | *Billing reads orders directly* | Billing import Orders: **vi phạm luật** |
| 09/10 | *Orders writes to the db* | Orders import Database: **phụ thuộc chưa khai báo** |

### 0.3 Chạy ứng dụng

```powershell
cd BE
npm run seed:test        # tài khoản test, mật khẩu chung Test@12345
npm run dev              # http://localhost:4000

cd ..\FE
npm run dev              # http://localhost:5173
```

### 0.4 Ba người trong demo

| Vai | Tài khoản | Ghi chú |
|---|---|---|
| Chủ workspace | `eve@archtime.test` | Không thuộc tổ chức nào |
| Maintainer (mentor) | `bob@archtime.test` | |
| Newcomer | `carl@archtime.test` | |

Mật khẩu: `Test@12345`. Mỗi tab trình duyệt giữ phiên riêng: mở cửa sổ thường cho Eve, một cửa sổ ẩn danh cho Bob, một
trình duyệt khác (hoặc đăng xuất/đăng nhập lại) cho Carl.

---

## 1. Tạo workspace và mine commit đầu tiên (Eve)

1. Đăng nhập Eve → *Workspaces* → **New workspace**.
2. *Workspace name*: `Shop Demo`; *Repository URL*: `file:///C:/archtime-demo-repo`; chọn **Public** → tạo.
3. Trên thẻ *Shop Demo* bấm **Manage mining** → **Scan repository** (đọc lịch sử commit).
4. Ở **Time range**, chọn khoảng chỉ chứa **01/10/2026** (ví dụ 30/09–02/10/2026) → **Mine this range**.

**Mong đợi:** job hoàn thành, workspace có **1 snapshot**. Chưa có finding nào (sơ đồ chưa xác nhận).

## 2. Thêm thành viên (Eve)

*Maintain → Team* → chọn *Shop Demo*:

1. *Email* `bob@archtime.test`, *Workspace role* **Maintainer** → **Send invitation**.
2. *Email* `carl@archtime.test`, vai **Member** → **Send invitation**.

**Mong đợi:** tài khoản đã có sẵn nên vào ngay, trạng thái *Active* (không cần e-mail mời).

## 3. Sơ đồ, path prefix và luật (Eve) — WF-08 chuẩn bị

### 3.1 Vẽ sơ đồ

*Maintain → Component Diagram* → chọn *Shop Demo*:

1. **Add component** ba lần:

   | Name | Type | Path prefixes (gõ rồi nhấn Enter) |
   |---|---|---|
   | Orders | Service | `src/orders` |
   | Billing | Service | `src/billing` |
   | Database | Database | `src/db` |

2. **Add dependency**: *Source* Orders → *Target* Billing, *Protocol* `REST`.
3. **Save draft**.

**Thử MSG24:** *Edit* Billing, thêm prefix `src/orders` → *Apply changes*. **Mong đợi:** báo *Path prefix "src/orders" is
already mapped to component "Orders"…*, không lưu. Bỏ prefix đó đi.

### 3.2 Đặt luật

*Maintain → Architecture Rules* → thêm luật: tên `Billing never calls back into Orders`, *Source* Billing, *Target*
Orders, **Forbidden**, mức **Error**, lý do `Orders publishes events; Billing consumes them.` → lưu.

### 3.3 Xác nhận sơ đồ

Về *Component Diagram* → **Confirm diagram** → OK.

**Mong đợi:**
- Tag **Canonical map**, dòng *Confirmed by Eve Solo … (revision N)*.
- Khung **This diagram is confirmed and locked**: không thêm/xoá component được nữa.
- Bấm *Edit* một component: hộp thoại tên **Map paths**, chỉ sửa được path. Đổi path thì sơ đồ **vẫn** là Canonical map.
- Commit 01/10 trở thành **baseline**: commit sau nó mới bị kiểm tra.

## 4. Mine commit mới: check tự chạy (Eve) — WF-08

1. *Workspaces* → *Shop Demo* → **Manage mining** → **Mine entire history** (mine nốt 2 commit còn lại).
2. Chờ job xong (vài giây). **Không cần bấm gì thêm**: check tự chạy sau khi mine.

**Mong đợi:**
- *Maintain → Maintainer overview* (chọn *Shop Demo*): khung vàng **You have N new conformance findings in Shop Demo to
  review**. Trên menu, mục *Conformance Findings* (và nhóm *Maintain* khi thu gọn) có số chưa đọc.
- **E-mail:** hệ thống gửi **1 e-mail** cho Eve và Bob (Carl là member thường thì không). Với địa chỉ `@archtime.test` thư
  không tới hộp thư được. Muốn xem e-mail thật: ở bước 2 thêm tài khoản của chính bạn (e-mail thật) làm Maintainer, với
  SMTP trong `BE/.env` đang chạy.

### 4.0 Gửi e-mail ngay bằng nút

Trên trang *Conformance Findings* có nút **E-mail new findings** (chỉ maintainer thấy dùng được). Nút gửi ngay e-mail các
finding **mới, chưa quyết định, chưa từng được báo** — cùng nội dung với e-mail tự động. Thông báo sau khi bấm:

| Thông báo | Nghĩa |
|---|---|
| *E-mailed N new findings to M people.* | Đã gửi |
| *Nothing new to e-mail…* | Mọi finding mở đã được báo trước đó (tự động sau khi mine, hoặc bấm nút rồi), hoặc đã được quyết định |
| *…but nobody can receive them…* | Chưa có chủ/maintainer nào có tài khoản hoạt động, e-mail đã xác minh; thêm người rồi bấm lại |
| *…could not be sent. Check the server's e-mail (SMTP) settings…* | SMTP lỗi; cửa sổ backend in lý do (`[conformance] could not e-mail findings…`); finding được giữ lại cho lần sau |

Lưu ý: nếu mine xong hệ thống đã tự gửi thì bấm nút sẽ báo *Nothing new*. Muốn thấy nút gửi được: dùng **Run check**
(chạy tay không tự gửi e-mail) trên finding mới, rồi bấm **E-mail new findings**.

### 4.1 Xem findings

*Maintain → Conformance Findings* → *Shop Demo*. Mở trang này là đánh dấu đã xem: số trên menu biến mất (chỉ với Eve; Bob
vẫn thấy số của mình).

**Mong đợi** (commit mới nhất, ô *Commit*):

| Finding | Loại |
|---|---|
| Billing → Orders is forbidden by "Billing never calls back into Orders" | error, Forbidden dependency |
| Orders → Database is not in the diagram | warning, Undeclared dependency |
| Các cảnh báo **Commit convention** (subject không theo `type(scope): summary`, thiếu `Task:`/`Arch-Change:`) | warning (T5 của nhóm) |

Mở **Files to look at** để thấy import gây ra, ví dụ `src/billing/invoice.ts imports src/orders/model.ts`.

### 4.2 Quyết định

1. Trên *Orders → Database is not in the diagram* bấm **Accept** → nút OK bị khoá cho tới khi ghi lý do → ghi lý do → Accept.
2. Lọc **Decided**: finding hiện *Accepted*, người quyết, thời điểm và lý do.
3. **Áp dụng sang commit sau:** chọn commit 05/10 trong ô *Commit*, **Accept** finding *Billing → Orders is forbidden*
   (ghi lý do). Chọn lại commit 09/10, lọc *Decided*: finding cùng loại ở đây đã *Accepted*, ghi *carried over from
   commit …*.
4. **Reopen** đưa finding về *Open*. **Fix** không cần lý do.

**Thử quyền:** đăng nhập Carl, mở `http://localhost:5173/project-maintainer/conformance` → Carl không phải maintainer nên
không quyết định được.

**Explain:** bấm **Explain** chỉ chạy khi máy có model AI (cấu hình `LLM_*` trong `BE/.env` hoặc trang AI Models). Câu trả
lời được lưu, bấm lại không tốn thêm.

## 5. Coding agent (Eve) — WF-09

*Maintain → Agent Access* → *Shop Demo*:

1. **Download AGENTS.md** → mở file: có bảng component với path, *Allowed dependencies* (Orders → Billing), luật cấm, quy
   ước commit, lệnh curl.
2. **New token** → tên `Claude Code on my laptop`, hạn 30 ngày → **Create token** → **sao chép token** (chỉ hiện một lần)
   → *I have copied it*. Token biến mất khỏi trang, danh sách chỉ hiện phần đầu.

Mở **PowerShell** (dùng `curl.exe`, không phải alias `curl`), dán token vào dòng đầu:

```powershell
$env:ARCHTIME_AGENT_TOKEN = "atk_...dán token vào đây..."

# Agent hỏi trước khi sửa một file
curl.exe -s -H "Authorization: Bearer $env:ARCHTIME_AGENT_TOKEN" "http://localhost:4000/api/agent/context?file=src/billing/invoice.ts"

# File không thuộc component nào
curl.exe -s -H "Authorization: Bearer $env:ARCHTIME_AGENT_TOKEN" "http://localhost:4000/api/agent/context?file=README.md"

# Token không mở API nào khác (thay <id> bằng id workspace trên thanh địa chỉ, ?project=<id>)
curl.exe -s -o NUL -w "%{http_code}`n" -H "Authorization: Bearer $env:ARCHTIME_AGENT_TOKEN" "http://localhost:4000/api/projects/<id>/workspace"
```

**Mong đợi:**
- Lệnh 1: `"component"` là Billing; `forbiddenDependencies` có Orders kèm luật và lý do; `commitConvention`; không có code.
- Lệnh 2: `"component": null` và hướng dẫn hỏi maintainer.
- Lệnh 3: `401`.

3. Trên trang bấm **Revoke** token → xác nhận. Chạy lại lệnh 1. **Mong đợi:** `This project token was revoked. Ask a
   maintainer for a new one.` (401).

## 6. Newcomer học (Bob, Carl) — WF-05

**Bob** (mentor): *Learning* → tab **Manage paths** → chọn *Shop Demo* → **New**:

1. *Title* `Week 1: how billing fits in`, *Description* tuỳ ý.
2. **Add a step** loại **Component** → chọn *Billing*, viết vài dòng.
3. **Add a step** loại **Question**: câu hỏi `Which direction is allowed between Orders and Billing?`, hai đáp án
   `Billing calls Orders` và `Orders calls Billing`, chọn đáp án đúng là cái thứ hai.
4. *Who can see it* → **Published: people it is given to** → **Save**.
5. Ở danh sách, bấm **People** → giao cho **Carl**.

**Carl** (newcomer): *Learning* → *My learning* → mở path.

1. **Mong đợi:** dải **Canonical map** (sơ đồ Eve đã xác nhận); bước Billing cho thấy *Used by: Orders · REST*.
2. **Mark as done** bước 1.
3. Câu hỏi: chọn *Billing calls Orders* → **Check my answer** → **Mong đợi:** *Not quite. Read the step again…*.
4. Chọn *Orders calls Billing* → **Check my answer** → bước hoàn thành, **You finished this path**, tiến độ 100 %.
5. (Tuỳ chọn, cần model AI) **Ask the AI mentor about this**: câu trả lời có nhãn `[FACT]`/`[INFERENCE]`/`[UNKNOWN]`; hash
   commit không có thật bị bỏ.

**Bob**: *Manage paths* → cột *People* 1, *Finished* 1. Carl mở `/learning?tab=manage` thì không xem được tiến độ người khác.

## 7. Chuyển workspace vào tổ chức (Eve) — D8

1. *Organizations* → tạo tổ chức `Eve Org` (Eve là owner).
2. *Workspaces* → trên thẻ *Shop Demo* bấm biểu tượng tòa nhà (**Move into an organization**) → chọn `Eve Org`.
3. **Mong đợi:** cảnh báo *2 members of this workspace are not in Eve Org and will lose access: Bob Mentor, Carl
   Newcomer…*; nút **Move workspace** màu đỏ.
4. **Move workspace** → *Shop Demo now belongs to Eve Org.*; biểu tượng tòa nhà biến mất khỏi thẻ.
5. Eve vẫn thấy đủ lịch sử (Compare, Evidence, Conformance Findings). Bob và Carl mở workspace thì không thấy nữa.

**Thử MSG18:** tạo workspace thứ hai cùng URL `file:///C:/archtime-demo-repo` (tên `Shop Demo again`) → **Move into an
organization** → chọn `Eve Org` → **Mong đợi:** *Eve Org already has a workspace for this repository ("Shop Demo")…*,
nút Move bị khoá.

## 8. Liên kết GitHub (D9) và gia hạn phiên (D1)

### 8.1 GitHub

*My profile* (menu tài khoản góc phải) → **How you sign in**:
- Eve có mật khẩu, chưa liên kết: nút **Link GitHub**. Bấm sẽ chuyển sang GitHub — **cần** `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` trong `BE/.env`. Không có thì quay về Profile với *GitHub sign-in is not
  configured…*.
- Khi đã liên kết: nút **Unlink** (có xác nhận). Tài khoản tạo bằng GitHub, chưa có mật khẩu: **Unlink** bị khoá, rê chuột
  thấy *GitHub is the only way you sign in. Set a password below first.*

### 8.2 Gia hạn phiên

1. Trong `BE/.env` đặt `JWT_EXPIRES_IN=1m`, khởi động lại backend.
2. Đăng nhập, mở *Analyze → Compare* hoặc *Changes & Evidence*, chờ **hơn 1 phút**, rồi bấm qua lại / tải dữ liệu.
3. **Mong đợi:** trang vẫn tải được, không bị đăng xuất (token được gia hạn ngầm). Trước khi sửa D1 các trang này lỗi 401.
4. Trả `JWT_EXPIRES_IN` về giá trị cũ (mặc định `60m`).

## 9. Dọn dẹp

```powershell
cd BE
npm run seed:test -- --remove      # xoá tài khoản @archtime.test và mọi thứ trong workspace của họ
```

- Xoá dòng `ARCHTIME_ALLOW_LOCAL_REPOS=true` khỏi `BE/.env`.
- Xoá thư mục `C:\archtime-demo-repo`, và trong `BE\mining-cache` các thư mục của workspace demo (tên là id workspace).

## 10. Bảng kiểm nhanh

| # | Luồng | Đạt khi |
|---|---|---|
| 1 | Mine commit đầu | 1 snapshot, chưa có finding |
| 2 | MSG24 | Gán trùng prefix bị từ chối |
| 3 | Xác nhận sơ đồ | Canonical map, bị khoá, vẫn *Map paths* được |
| 4 | Check tự động | Sau khi mine: finding Forbidden + Undeclared (+ convention), thông báo MSG26, số trên menu |
| 5 | Quyết định | Accept cần lý do; áp dụng sang commit sau; member không quyết định được |
| 6 | Agent | Context đúng; README → null; API khác 401; Revoke → 401 ngay |
| 7 | Learning path | Sai: *Not quite*; đúng: 100 %; mentor thấy *Finished 1* |
| 8 | Chuyển tổ chức | Báo trước người mất quyền; lịch sử đi theo; MSG18 với workspace trùng repo |
| 9 | GitHub | Nút Link/Unlink đúng trạng thái; Unlink khoá khi GitHub là cách đăng nhập duy nhất |
| 10 | Gia hạn phiên | Quá hạn access token vẫn dùng tiếp, không bị đăng xuất |
