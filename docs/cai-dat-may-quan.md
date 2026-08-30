# Cài lên máy quán — danh sách việc

Làm theo đúng thứ tự. Mỗi bước có cách tự kiểm chứng ngay, đừng bỏ qua bước kiểm chứng —
gần như mọi lỗi của công cụ này đều thuộc loại **hỏng im lặng**: máy vẫn sáng, Grab vẫn chạy,
chỉ có đơn là không về ccmany, và không ai biết cho tới khi khách gọi hỏi.

---

## 0. Kiểm tra Smart App Control — làm TRƯỚC TIÊN

Windows 11 có một lớp bảo vệ tên **Smart App Control** chặn thẳng mọi `.exe` chưa ký số. Không
phải cảnh báo bấm "Run anyway" được — nó chặn hẳn.

Mở PowerShell trên máy quán, chạy:

```powershell
$v = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -EA SilentlyContinue).VerifiedAndReputablePolicyState
switch ($v) { 0 {"TAT - cai dat binh thuong duoc"} 1 {"DANG BAT - se bi chan"} 2 {"Dang danh gia"} default {"Khong ro: $v"} }
```

| Kết quả | Dùng bản nào ở bước 5 |
|---|---|
| `TAT` | Bản nào cũng được. Có thể gặp cảnh báo SmartScreen một lần → *More info* → *Run anyway* |
| `DANG BAT` | **Bắt buộc dùng bản thư mục.** File cài đặt sẽ bị chặn |

**Không cần tắt Smart App Control.** (Mà cũng không nên: tắt rồi thì muốn bật lại phải cài lại
Windows.) Bản thư mục được làm riêng để đi qua được nó — xem giải thích dưới đây.

<details>
<summary>Vì sao bản thư mục chạy được mà file cài đặt thì không</summary>

Đo trên máy thật, Smart App Control đang bật:

| File | SHA-256 | Chạy được? |
|---|---|---|
| `electron.exe` bản phát hành chính thức | `1DC2D12E…` | ✅ |
| Bản do electron-builder dựng | `F6717AA3…` | ❌ |
| Bản chép nguyên xi, **đổi tên** | `1DC2D12E…` | ✅ |

Cả ba đều **không ký số**. Nên Smart App Control ở đây không xét chữ ký, cũng không xét tên file
— nó xét **danh tiếng của từng file theo hash**. `electron.exe` bản chính thức đã được hàng triệu
máy tải nên Microsoft biết nó lành. electron-builder thì sửa vào ruột file (nhét icon, thông tin
phiên bản, chuỗi kiểm tra asar) nên ra một file chưa ai từng thấy → chặn. Cái uninstaller mà bộ
cài NSIS tự sinh ra rồi chạy cũng chung số phận, nên **dựng file cài đặt cũng hỏng**, không chỉ
chạy nó.

Dòng thứ ba là lối thoát: đổi tên không đổi hash. `scripts/make-portable.mjs` chép nguyên xi file
thực thi rồi chỉ đổi tên, nên qua được. Đánh đổi: file `.exe` không có icon riêng — nhưng lối tắt
ngoài desktop vẫn mang icon của công cụ, mà đó mới là chỗ người dùng nhìn vào.

</details>

---

## 1. Tài khoản Windows

Mục tiêu: **bật máy lên là vào thẳng desktop**, không dừng ở màn hình đăng nhập. Vì `openAtLogin`
chạy lúc *đăng nhập*, không phải lúc *bật máy* — máy tự khởi động lại lúc 3h sáng mà dừng ở màn
hình khoá thì công cụ nằm im tới sáng.

- Dùng **tài khoản cục bộ** (không phải tài khoản Microsoft — loại đó bắt buộc có mật khẩu/PIN)
- **Không đặt mật khẩu.** Windows sẽ tự đăng nhập, không cần cấu hình gì thêm

Đổi lại thì ai ngồi được vào máy là dùng được Grab Merchant của quán. Đây là chuyện đặt máy ở
đâu, không phải chuyện phần mềm.

**Kiểm chứng:** khởi động lại máy → phải vào thẳng desktop, không hỏi gì.

---

## 2. Máy không được ngủ

```
Settings → System → Power  →  Screen and sleep
    Khi cắm điện, tắt màn hình sau:   15 phút   (tắt màn hình thì được)
    Khi cắm điện, cho máy ngủ sau:    Never     (ngủ thì KHÔNG được)
```

Tắt màn hình không sao — tiến trình vẫn chạy. **Ngủ (sleep) thì dừng hết.**

**Kiểm chứng:** để máy yên 30 phút rồi xem nhật ký, phải có các dòng poll liên tục không đứt.

---

## 3. BIOS — tự bật lại sau khi mất điện

Vào BIOS/UEFI, tìm mục tên đại loại **Restore on AC Power Loss** / **AC Back** / **After Power
Failure**, đặt thành **Power On** (mặc định thường là *Stay Off*).

Không có bước này thì cả chuỗi tự đăng nhập + tự chạy app đều vô dụng khi mất điện — mà mất điện
lại là chuyện hay gặp nhất ở quán.

**Kiểm chứng:** rút phích điện máy (không phải nút nguồn), cắm lại → máy phải tự lên.

---

## 4. Giờ cập nhật Windows

```
Settings → Windows Update → Advanced options → Active hours
```

Đặt trùng giờ mở cửa của quán. Windows sẽ không tự khởi động lại trong khoảng đó. Ngoài giờ đó
nó vẫn có thể restart — nhưng bước 1 và 3 đã lo phần quay lại rồi.

---

## 5. Cài công cụ

Có hai dạng. Bước 0 quyết định dùng dạng nào.

**Dạng thư mục — dùng cái này** (`npm run portable` → `release/portable/`)

1. Chép cả thư mục sang máy quán, đặt ở chỗ **tài khoản đó ghi được** — ví dụ
   `C:\TheoDoiDonGrab`. Đừng để trong `Program Files`
2. Chạy `Tao loi tat ra desktop.cmd` trong thư mục đó — nó tạo lối tắt kèm icon riêng

**Dạng file cài đặt** (`npm run dist` → `TheoDoiDonGrab-Setup-x.y.z.exe`)

Chỉ dùng được khi bước 0 cho kết quả `TAT`, **và** phải dựng trên máy cũng có Smart App Control
tắt. Đổi lại thì có Start menu và trình gỡ cài đặt.

> Vì sao không được để trong `Program Files`: thư mục `data/` (bộ nhớ chống trùng, nhật ký, JSON
> thô của đơn) nằm cạnh file chạy. `Program Files` chỉ đọc với tài khoản thường, nên sẽ không ghi
> được. App có lưới dự phòng tự chuyển sang thư mục dữ liệu người dùng, nhưng tốt nhất là đừng
> rơi vào cảnh đó.

---

## 6. Điền cấu hình

Trong thư mục vừa cài, cạnh file `.exe`:

**a. Đổi tên `.env.example` thành `.env`**, rồi mở bằng Notepad điền:

```ini
CCMANY_API_URL=...        # endpoint nhận đơn
CCMANY_API_KEY=...        # khoá thật
DRY_RUN=true              # GIỮ true cho tới khi nghiệm thu xong
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

> Thiếu `CCMANY_API_URL` hoặc `CCMANY_API_KEY` thì app **tự bật chế độ chạy khô**, kể cả khi
> `DRY_RUN=false`. Chốt an toàn này cố ý: không bao giờ để xảy ra cảnh tưởng đang gửi thật mà
> thực ra đang bắn vào hư không, hoặc ngược lại.

> Mẹo: mở app rồi bấm **Mở file cấu hình** — app tự tạo `.env` từ mẫu và mở Notepad luôn. Bỏ được
> khâu đi tìm thư mục trong `AppData` và khâu đổi tên file, chỗ Notepad hay lưu thành `.env.txt`.

**b. Mã quán Grab thì KHÔNG phải điền.** App tự đọc từ tab Grab — xem bước 7.

**Kiểm chứng:** mở app → dashboard hiện đúng chế độ gửi và trạng thái Telegram vừa điền.

---

## 7. Đăng nhập Grab lần đầu

Mở app. Lần đầu nó hiện khung **"Chưa chọn quán"**:

1. Bấm **Mở Grab để chọn quán**
2. Đăng nhập bằng tài khoản merchant của quán
3. Bấm vào quán của bạn — Grab đưa tới trang đơn hàng của quán đó

App đọc mã quán thẳng từ địa chỉ trang đó (`/order/<mã>/preparing`) rồi hiện ra để xác nhận.
Bấm **Dùng quán này** → app khởi động lại và bắt đầu theo dõi.

> Không ai phải gõ tay chuỗi 16 ký tự. Đó là chỗ sai nhiều nhất khi cài.

Phiên đăng nhập nằm ở `%APPDATA%\grab-order-watcher\Partitions\grab`, tồn tại qua các lần tắt mở.

**Kiểm chứng:** tắt hẳn app (chuột phải biểu tượng khay → *Thoát*), mở lại → **không** hỏi đăng
nhập lại. Khởi động lại máy → vẫn còn phiên.

---

## 8. Chạy khô vài ngày

Để `DRY_RUN=true`, dùng Telegram để theo dõi. Trong thời gian này cần thấy đủ:

- [ ] Một đơn **có topping** — đối chiếu `data/dry-run/*.json` với màn hình Grab, **khớp từng đồng**
- [ ] Một đơn khách **huỷ** — công cụ vẫn gửi (đúng thiết kế), và không gửi lại
- [ ] Nhịp tim Telegram đều đặn 30 phút một lần
- [ ] Qua ít nhất một đêm, sáng ra vẫn chạy

---

## 9. Bật gửi thật

Đổi `DRY_RUN=false` trong `.env`, mở lại app. Dashboard phải hiện **"GỬI THẬT lên ccmany"**
thay vì "CHẠY KHÔ".

Bảng nghiệm thu ở Task 11 của kế hoạch. Mục quan trọng nhất và hay bị quên: **trên web Grab,
những đơn công cụ chưa mở vẫn phải còn dấu "chưa đọc"** — đó là bằng chứng công cụ không lỡ
gọi `/orders/mark` và xoá dấu của nhân viên.

---

## 10. Kiểm tra lần cuối: rút phích điện

Đây là phép thử gộp tất cả các bước trên.

1. Rút phích điện máy (rút thật, không phải Shut down)
2. Cắm lại
3. **Không chạm vào bàn phím chuột**

Trong vòng 2 phút phải có: máy tự lên → tự vào desktop → biểu tượng chấm xanh ở khay hệ thống →
Telegram báo đã khởi động. Không cần ai gõ gì cả.

Nếu thiếu bất kỳ mắt xích nào — BIOS, mật khẩu Windows, `AUTO_START` — thì phép thử này sẽ trượt
và bạn biết ngay là trượt ở đâu.

---

## Gỡ ra khỏi máy

Ba đường vào, dùng cái nào cũng ra cùng một kết quả:

- Mở app → kéo xuống cuối bảng điều khiển → **Gỡ cài đặt khỏi máy này**
- **Settings → Apps → Installed apps → "Theo dõi đơn Grab" → Uninstall** — chỗ người dùng
  Windows theo phản xạ đi tìm
- Hoặc bấm đúp **`Go cai dat.cmd`** trong thư mục cài — dùng khi app không mở lên được nữa

Cả ba đều hỏi một câu trước khi làm: **có giữ lại phiên đăng nhập Grab không.**

| | Giữ lại (mặc định) | Không giữ |
|---|---|---|
| Thư mục cài, lối tắt, mục tự chạy cùng Windows | xoá | xoá |
| `%APPDATA%\grab-order-watcher` — cấu hình + phiên đăng nhập Grab | **giữ** | xoá |
| Cài lại lần sau | mở lên là chạy | phải đăng nhập Grab và chọn quán lại |

> **Đừng xoá thư mục cài bằng tay.** Làm thế sẽ bỏ sót hai khoá registry: mục tự chạy cùng
> Windows, và mục trong Settings. Từ đó mỗi lần bật máy Windows lại đi gọi một file không
> còn tồn tại, và trong Settings vẫn còn một mục ma mà bấm Uninstall thì không có gì xảy ra
> — cũng không có cách nào dọn nó từ giao diện Settings.

App tự ghi mục Settings mỗi lần khởi động (`HKCU\...\Uninstall\TheoDoiDonGrab`, không cần
quyền quản trị). Cố ý ghi lại mỗi lần: chép thư mục app sang chỗ khác thì đường dẫn cũ thành
rác, ghi đè mỗi lần thì nó tự sửa.

<details>
<summary>Vì sao app không tự xoá được chính nó</summary>

Windows khoá file `.exe` đang chạy và các DLL đã nạp. Xoá thư mục cài từ bên trong app thì
xoá được gần hết rồi kẹt lại đúng file thực thi — để lại một bản cài không chạy được mà vẫn
chiếm chỗ, và người dùng không hiểu chuyện gì vừa xảy ra.

Nên cái nút trong app chỉ làm ba việc: hỏi, đẩy `Go cai dat.cmd` ra `%TEMP%` (ra ngoài thư mục
sắp bị xoá), chạy nó rồi thoát. Script tự đợi tiến trình app chết hẳn — tối đa 10 giây, quá
thì tắt cứng — rồi mới bắt đầu xoá. Cùng lý do đó, script cũng tự chép mình sang `%TEMP%` khi
người dùng bấm đúp vào nó từ trong thư mục cài: `cmd.exe` giữ handle lên chính file `.cmd`
đang chạy.

Trước mọi lệnh xoá, script kiểm tra thư mục được chỉ định có chứa
`resources\app\out\main\main.js` không. Không có thì dừng, không xoá gì cả. Đó là hàng rào
duy nhất giữa một lệnh `rmdir /s /q` và một thư mục người dùng không hề muốn mất.

</details>

---

## Việc thường ngày

Bình thường **không phải làm gì cả**. Chỉ hai trường hợp cần người:

| Telegram báo | Việc cần làm |
|---|---|
| `MAT PHIEN GRAB - can dang nhap lai` | Mở app → *Mở trang Grab* → đăng nhập → *Ẩn đi* |
| `khong gui duoc sau 5 lan` | Đơn đó không lên được ccmany — vào Grab xem tay, rồi báo lại để sửa |

Muốn xem app đang làm gì: chuột phải biểu tượng khay → *Xem nhật ký*.
