# Đóng gói và chuyển sang máy quán

Tài liệu này dành cho **người dựng** (máy có mã nguồn). Người cài trên máy quán chỉ cần đọc
file `DOC FILE NAY TRUOC.txt` nằm sẵn trong thư mục đã dựng, và
[cai-dat-may-quan.md](cai-dat-may-quan.md) nếu muốn máy tự chạy lại sau khi mất điện.

---

## Đính chính một hiểu nhầm hay gặp

**Không có file `.exe` đơn lẻ để tải về rồi chạy.**

Cái dựng ra là một **thư mục 366 MB, 118 file**. Trong đó `Theo doi don Grab.exe` chiếm 233 MB —
nó chính là Chromium, và nó **không chạy được một mình**: thiếu các file `.dll` cùng thư mục
`resources/` nằm cạnh thì bấm vào không lên gì cả.

Nên chuyển máy nghĩa là **chép cả thư mục**, không phải chép mỗi file `.exe`.

---

## 1. Dựng

```powershell
npm install       # chỉ lần đầu
npm run portable
```

Ra `release/portable/`. Lệnh này gộp bốn việc: biên dịch TypeScript, chép giao diện sang `out/`,
vẽ lại icon, rồi lắp thư mục.

Kiểm tra nhanh trước khi chuyển đi:

```powershell
npm run typecheck
npm test
```

## 2. Nén lại cho dễ chuyển

```powershell
Compress-Archive -Path "release\portable\*" -DestinationPath "release\TheoDoiDonGrab.zip" -Force
```

Còn khoảng 150 MB. Chép qua USB, hoặc đẩy lên Drive rồi tải về máy quán — cách nào cũng được,
đây chỉ là một thư mục bình thường.

## 3. Trên máy quán

Giải nén ra chỗ **ghi được** — ví dụ `C:\TheoDoiDonGrab`. **Đừng để trong `Program Files`**:
thư mục `data/` (nhật ký, bộ nhớ chống trùng, JSON thô của đơn) nằm cạnh file chạy, mà
`Program Files` chỉ đọc với tài khoản thường.

Rồi làm theo `DOC FILE NAY TRUOC.txt`: đổi `.env.example` thành `.env`, sửa `config/stores.json`,
chạy `Tao loi tat ra desktop.cmd`, mở app, đăng nhập Grab.

---

## Vì sao lại là thư mục chứ không phải file cài đặt

Có sẵn cấu hình dựng file cài đặt (`npm run dist` → NSIS). **Nhưng nó chỉ dùng được trên máy
tắt Smart App Control** — cả lúc dựng lẫn lúc chạy.

Đo trên máy thật, Smart App Control đang bật:

| File | SHA-256 | Chạy được? |
|---|---|---|
| `electron.exe` bản phát hành chính thức | `1DC2D12E…` | ✅ |
| Bản do electron-builder dựng | `F6717AA3…` | ❌ |
| Bản chép nguyên xi, **đổi tên** | `1DC2D12E…` | ✅ |

Cả ba **đều không ký số**. Nên Smart App Control ở đây không xét chữ ký, cũng không xét tên file
— nó xét **danh tiếng của từng file theo hash**. `electron.exe` bản chính thức đã được hàng triệu
máy tải nên Microsoft biết là lành. electron-builder thì sửa vào ruột file để nhét icon và thông
tin phiên bản, ra một file chưa ai từng thấy → chặn. Cái uninstaller mà NSIS tự sinh ra rồi chạy
cũng vậy, nên **dựng file cài đặt cũng hỏng**, không chỉ chạy nó.

Dòng thứ ba là lối thoát: **đổi tên không đổi hash**. `scripts/make-portable.mjs` chép nguyên xi
file thực thi rồi chỉ đổi tên.

**Đây không phải mẹo lách.** Mình chạy đúng file `electron.exe` chính thức, không sửa một byte,
với app đặt ở `resources/app/` — chính là cách Electron vốn được thiết kế để chạy.

### Cái giá phải trả

| Mất gì | Bù lại bằng gì |
|---|---|
| `.exe` không có icon riêng | Lối tắt ngoài desktop mang icon riêng; icon ở khay cũng của mình |
| `.exe` không có thông tin phiên bản | Không ai xem, và log ghi phiên bản mỗi lần khởi động |
| Không có Start menu, không có trình gỡ cài đặt | Gỡ = xoá thư mục. Với một máy thì đủ |

Có một cái bẫy thật đã mắc và đã vá: đăng ký tự-chạy-cùng-Windows lấy tên khoá từ tên nhúng
trong `.exe` — mà bản này giữ nguyên xi `electron.exe` nên tên đó là "Electron", ra khoá
`electron.app.Electron`. **Bất kỳ app Electron portable nào khác cũng ghi đè lên đúng khoá ấy.**
Đã sửa bằng cách truyền `name` tường minh, và kiểm chứng khoá giờ là `Theo doi don Grab`.

### Khi nào thì nên ký số

Khi phát cho **nhiều quán, nhiều máy**, hoặc đưa file cho người khác tải về. Lúc đó chứng chỉ ký
số giải quyết luôn cả cảnh báo SmartScreen mà máy tắt Smart App Control vẫn gặp.

Với một quán một máy thì không cần. Và nhớ: **khả năng cao máy quán không bật Smart App Control**
— nó chỉ tự bật trên máy Windows 11 cài mới hoàn toàn, máy nâng cấp từ Windows 10 thì luôn tắt.
Lệnh kiểm tra ở bước 0 của [cai-dat-may-quan.md](cai-dat-may-quan.md).

---

## Đã kiểm chứng những gì

Trên máy dựng, với Smart App Control **đang bật**:

- Dựng lại từ thư mục rỗng bằng `npm run portable` — chạy trọn, không lỗi
- Chạy `Theo doi don Grab.exe` — **không bị chặn**
- Đọc đúng `.env` và `config/stores.json` nằm cạnh `.exe`
- Giữ được phiên Grab (`Kiem tra Grab OK`), poller chạy
- `--tu-chay` → tiến trình sống, không hiện cửa sổ, vào thẳng khay
- `Tao loi tat ra desktop.cmd` → lối tắt đúng target, đúng icon
- Khoá tự-chạy ghi đúng tên `Theo doi don Grab`

**Chưa kiểm chứng:** bản NSIS (không dựng được trên máy này), và toàn bộ chuỗi tự khởi động sau
khi mất điện trên máy quán thật — đó là bước 10 của [cai-dat-may-quan.md](cai-dat-may-quan.md).
