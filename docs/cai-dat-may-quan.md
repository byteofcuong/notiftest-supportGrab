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

**b. Sửa `config/stores.json`**: điền đúng `grabMerchantID` của quán, `ccmanyStoreID`, và tên quán.

**Kiểm chứng:** mở app → dashboard phải hiện đúng tên quán và mã quán.

---

## 7. Đăng nhập Grab lần đầu

Mở app → bấm **Mở trang Grab / Đăng nhập** → đăng nhập bằng tài khoản merchant của quán.
Xong thì bấm **Ẩn đi**.

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

## Việc thường ngày

Bình thường **không phải làm gì cả**. Chỉ hai trường hợp cần người:

| Telegram báo | Việc cần làm |
|---|---|
| `MAT PHIEN GRAB - can dang nhap lai` | Mở app → *Mở trang Grab* → đăng nhập → *Ẩn đi* |
| `khong gui duoc sau 5 lan` | Đơn đó không lên được ccmany — vào Grab xem tay, rồi báo lại để sửa |

Muốn xem app đang làm gì: chuột phải biểu tượng khay → *Xem nhật ký*.
