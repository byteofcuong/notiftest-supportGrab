# Đóng gói và chuyển sang máy quán

Tài liệu này dành cho **người dựng** (máy có mã nguồn). Người cài trên máy quán chỉ cần đọc
file `DOC FILE NAY TRUOC.txt` nằm sẵn trong thư mục đã dựng, và
[cai-dat-may-quan.md](cai-dat-may-quan.md) nếu muốn máy tự chạy lại sau khi mất điện.

---

## Đính chính một hiểu nhầm hay gặp

**Không có file `.exe` đơn lẻ để tải về rồi chạy.**

Cái dựng ra là một **thư mục 366 MB, 118 file**. Trong đó `Notiftest-Grab.exe` chiếm 233 MB —
nó chính là Chromium, và nó **không chạy được một mình**: thiếu các file `.dll` cùng thư mục
`resources/` nằm cạnh thì bấm vào không lên gì cả.

Nên chuyển máy nghĩa là **chép cả thư mục**, không phải chép mỗi file `.exe`.

---

## 1. Dựng

Hai cách, cùng một kết quả:

| Cách | Dùng khi |
|---|---|
| `npm run portable` | **Cổng chính.** `package.json` là nguồn sự thật, ai biết Node cũng gõ được |
| Bấm đôi `build.cmd` | Muốn một phát ăn ngay, và có kiểm tra trước khi đóng gói |

Viết bằng `.cmd` chứ không phải `.ps1` vì **Windows không cho bấm đôi vào `.ps1`** — nó mở Notepad,
để người ta không lỡ chạy script tải trên mạng về.

`build.cmd` làm 5 việc:

```
[1/5] Kiểm tra Node.js
[2/5] Cài thư viện (chỉ lần đầu)
[3/5] Kiểm tra mã nguồn — typecheck + toàn bộ test
[4/5] Đóng gói thành release/portable/
[5/5] Tạo lối tắt ra desktop
      → hỏi có nén thành .zip không
```

**Bước 3 cố ý đặt trước bước 4.** Test hỏng thì nó dừng, không đóng gói. Mang một bản hỏng ra
quán rồi mới phát hiện thì mất cả buổi, mà lúc đó không có ai ở đó để sửa.

Muốn chạy từng phần thì vẫn còn các lệnh riêng:

```powershell
npm run typecheck
npm test
npm run portable     # ra release/portable/
```

**Bước 4 xoá sạch `release/portable` rồi dựng lại từ đầu.** Nên bản dựng ra luôn giống hệt nhau
và luôn sạch: không `.env`, không `data/`, không sót gì của lần trước. Đưa cho ai cũng được.

### Cấu hình nằm ở đâu

Bản dựng sạch là tốt, nhưng nó đẻ ra một vấn đề: **cập nhật app = chép đè cả thư mục**, mà `.env`
với `config/stores.json` lại nằm trong đó. Lần cập nhật đầu tiên sẽ xoá sạch cấu hình — nhân viên
mở lên thấy "CHẠY KHÔ", không ai hiểu vì sao, và công cụ im lặng không gửi đơn nào nữa.

Nên app **tự giữ một bản ở `%APPDATA%\grab-order-watcher\`**:

```
có file cạnh .exe   →  chép sang thư mục người dùng rồi đọc bản đó
không có            →  đọc bản đã lưu ở thư mục người dùng
không có cả hai     →  không có cấu hình, app tự bật chế độ chạy khô
```

**File nằm cạnh `.exe` luôn thắng.** Đó là cái người ta nhìn thấy và vừa đặt vào, nên nó phải có
tác dụng — "cái mình vừa bỏ vào thì thắng" là quy tắc duy nhất không làm ai bất ngờ.

Đã kiểm chứng bằng cách dựng lại thư mục app từ đầu, đúng như một lần cập nhật, rồi chạy: app
không còn `.env` cạnh `.exe` nhưng vẫn đọc được bản đã lưu và chạy bình thường.

## 2. Nén thư mục nào?

**`release\portable`** — đúng một thư mục đó, không phải `release`, không phải cả dự án.

Nén **nội dung bên trong** nó, để giải nén ra là thấy `Notiftest-Grab.exe` ngay, không phải
lồng thêm một tầng thư mục nữa.

`build.cmd` hỏi ở cuối và làm đúng như vậy. Muốn làm tay:

```powershell
Compress-Archive -Path "release\portable\*" -DestinationPath "release\NotiftestGrab.zip" -Force
```

Còn khoảng 150 MB. Chép qua USB, hoặc đẩy lên Drive rồi tải về máy quán — cách nào cũng được,
đây chỉ là một thư mục bình thường.

> ⚠️ **Nén ngay sau khi đóng gói.** Lúc đó thư mục còn sạch. Nếu bạn đã *chạy thử app từ chính
> thư mục đó* rồi mới nén thì hai thứ sẽ đi theo file zip:
>
> - `.env` — khoá API ccmany và token bot Telegram
> - `data\` — nhật ký, bộ nhớ chống trùng, và JSON thô của đơn **có tên với số điện thoại khách**
>
> Riêng `data\cache\` còn gây một lỗi âm thầm: nó ghi những đơn *đã gửi rồi*. Mang sang máy quán
> thì đúng những đơn đó sẽ không bao giờ được gửi nữa. Nếu lỡ nén sau khi chạy thử, xoá `data\`
> và `.env` đi rồi nén lại.
>
> File zip do `build.cmd` tạo đã được kiểm: 119 mục, **không có `.env`, không có `data/`**.

## 3. Trên máy quán

Giải nén ra chỗ **ghi được** — ví dụ `C:\NotiftestGrab`. **Đừng để trong `Program Files`**:
thư mục `data/` (nhật ký, bộ nhớ chống trùng, JSON thô của đơn) nằm cạnh file chạy, mà
`Program Files` chỉ đọc với tài khoản thường.

Rồi làm theo `DOC FILE NAY TRUOC.txt`: đổi `.env.example` thành `.env`, sửa `config/stores.json`,
chạy `create-shortcut.cmd`, mở app, đăng nhập Grab.

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
Đã sửa bằng cách truyền `name` tường minh, và kiểm chứng khoá giờ là `Notiftest-Grab`.

### Khi nào thì nên ký số

Khi phát cho **nhiều quán, nhiều máy**, hoặc đưa file cho người khác tải về. Lúc đó chứng chỉ ký
số giải quyết luôn cả cảnh báo SmartScreen mà máy tắt Smart App Control vẫn gặp.

Với một quán một máy thì không cần. Và nhớ: **khả năng cao máy quán không bật Smart App Control**
— nó chỉ tự bật trên máy Windows 11 cài mới hoàn toàn, máy nâng cấp từ Windows 10 thì luôn tắt.
Lệnh kiểm tra ở bước 0 của [cai-dat-may-quan.md](cai-dat-may-quan.md).

---

## Vì sao vitest bị ghim ở bản 3

Smart App Control **cũng chặn cả bộ chạy test**, không riêng gì bản đóng gói.

vitest 4 dùng rolldown, mà rolldown nạp một file native `.node`. Một hôm đẹp trời nó bị chặn:

```
ERR_DLOPEN_FAILED: An Application Control policy has blocked this file
```

Test đang chạy tốt hôm trước, hôm sau mở máy lên là hỏng, **không ai sửa gì cả** — Smart App
Control tự đánh giá lại. Đã thử ba đường:

| Cách | Kết quả |
|---|---|
| Cài bản WASM `@rolldown/binding-wasm32-wasi` | Nạp được, nhưng không phân giải nổi file cấu hình |
| Đổi đường dẫn sang ổ ảo không có dấu cách (`subst`) | Vẫn hỏng — không phải do dấu cách |
| **Hạ vitest về bản 3** (dùng esbuild) | ✅ toàn bộ test chạy lại bình thường |

Nên **đừng nâng vitest lên 4** nếu máy dựng còn bật Smart App Control. Đây không phải chuyện
sở thích phiên bản — nó là ràng buộc của môi trường.

## Đã kiểm chứng những gì

Trên máy dựng, với Smart App Control **đang bật**:

- Dựng lại từ thư mục rỗng bằng `npm run portable` — chạy trọn, không lỗi
- Chạy `Notiftest-Grab.exe` — **không bị chặn**
- Đọc đúng `.env` và `config/stores.json` nằm cạnh `.exe`
- Giữ được phiên Grab (`Kiem tra Grab OK`), poller chạy
- `--tu-chay` → tiến trình sống, không hiện cửa sổ, vào thẳng khay
- `create-shortcut.cmd` → lối tắt đúng target, đúng icon
- Khoá tự-chạy ghi đúng tên `Notiftest-Grab`
- `build.cmd` chạy trọn 5 bước, thoát mã 0, tạo đúng lối tắt, nén ra zip sạch
- Và nó **đã thật sự chặn một lần**: khi bộ chạy test hỏng, nó dừng ở bước 3 thay vì đóng gói

**Chưa kiểm chứng:** bản NSIS (không dựng được trên máy này), và toàn bộ chuỗi tự khởi động sau
khi mất điện trên máy quán thật — đó là bước 10 của [cai-dat-may-quan.md](cai-dat-may-quan.md).
