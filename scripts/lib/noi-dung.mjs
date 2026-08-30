/**
 * Van ban dung chung cho ca hai kieu dong goi (thu muc va file cai dat).
 *
 * De o mot cho vi hai script deu sinh ra cung nhung file nay. Tach ra hai ban
 * thi som muon cung lech, va cai lech se nam trong huong dan cho nguoi o quan
 * doc — cho te nhat de co mot cau sai.
 */

export const TEN_APP = 'Theo doi don Grab';

/** Ten thu muc cai mac dinh. Khong dau, khong dau cach, cho de go trong terminal. */
export const TEN_THU_MUC = 'TheoDoiDonGrab';

/**
 * Ten thu muc du lieu trong %APPDATA% — phai trung voi app.setName() o main.ts.
 *
 * Day la cho nam PHIEN DANG NHAP GRAB va cau hinh, tach khoi thu muc cai dat.
 * Chinh vi tach ma "go cai dat nhung giu lai dang nhap" moi lam duoc: xoa mot
 * cho, giu cho kia.
 */
export const TEN_DU_LIEU = 'grab-order-watcher';

/**
 * Khoa registry lam app hien ra trong Settings -> Apps -> Installed apps.
 *
 * PHAI trung voi KHOA_GO_CAI_DAT o src/main/registry.ts. App ghi khoa nay moi
 * lan khoi dong; trinh go cai dat xoa no. Lech nhau thi go xong Windows van
 * liet ke app trong Settings, bam Uninstall lai chay mot file da bi xoa — va
 * khong co cach nao don muc do tu giao dien Settings. Co test ghim hai ben.
 */
export const KHOA_GO_CAI_DAT =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TheoDoiDonGrab';

/** Phien ban Electron duoc ghim. Doi so nay thi PHAI doi ca SHA256 ben duoi. */
export const ELECTRON_VERSION = '44.0.0';

/**
 * SHA-256 cua electron-v44.0.0-win32-x64.zip tren trang phat hanh chinh thuc.
 *
 * Bat buoc phai doi chieu truoc khi giai nen: file cai dat tai mot file thuc
 * thi 150 MB tu Internet ve roi CHAY no. Khong kiem tra thi bat ky ai chen
 * duoc vao duong truyen deu chay duoc ma minh muon tren may quan.
 */
export const ELECTRON_SHA256 =
  'E61AA3BCEA8152BC0730ABD015E47C032D778A0EF10E2A1C78BA3C4EA47942F9';

export const ELECTRON_URL =
  `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}` +
  `/electron-v${ELECTRON_VERSION}-win32-x64.zip`;

/** Script tao loi tat, dat trong thu muc da cai de dung lai sau nay. */
export const TAO_LOI_TAT = `@echo off
rem Tao loi tat ra Desktop, mang icon rieng cua cong cu.
rem Tham so /nopause: bo buoc doi bam phim, de script khac goi duoc.
setlocal
set "THUMUC=%~dp0"
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\${TEN_APP}.lnk');" ^
  "$s.TargetPath='%THUMUC%${TEN_APP}.exe';" ^
  "$s.WorkingDirectory='%THUMUC%';" ^
  "$s.IconLocation='%THUMUC%icon.ico';" ^
  "$s.Description='Theo doi don Grab Merchant va day sang ccmany';" ^
  "$s.Save()"
echo Da tao loi tat ngoai Desktop.
if /i "%~1"=="/nopause" goto :eof
pause
`;

// String.raw chu khong phai template thuong: van ban nay day duong dan Windows.
// Trong template thuong, `C:\TheoDoiDonGrab` bi JS hieu la escape khong hop le
// va nuot mat dau `\`, ra `C:TheoDoiDonGrab` — mot huong dan sai ma van trong
// nhu that. (Da in ra file roi moi phat hien.)
export const HUONG_DAN = String.raw`THEO DOI DON GRAB
==================

Cong cu nay canh trang don hang Grab Merchant va day don moi sang ccmany.


CAN LAM GI
----------

1. Doi ten file  .env.example  thanh  .env
   Mo bang Notepad, dien:
       CCMANY_API_URL      dia chi nhan don
       CCMANY_API_KEY      kho a API
       TELEGRAM_BOT_TOKEN  (tuy chon)
       TELEGRAM_CHAT_ID    (tuy chon)
   De nguyen DRY_RUN=true cho toi khi chay thu xong.

   Meo: mo app roi bam "Mo file cau hinh" thi app tu tao .env va mo Notepad
   luon - khoi phai di tim thu muc va khoi phai doi ten file.

   MA QUAN GRAB THI KHONG PHAI DIEN. App tu doc no tu trang Grab, xem buoc 3.

2. Bam loi tat ngoai desktop de mo app.
   (Neu chua co loi tat: chay "Tao loi tat ra desktop.cmd" trong thu muc nay.)

3. Lan dau app hien khung "Chua chon quan":

       - Bam "Mo Grab de chon quan"
       - Dang nhap tai khoan merchant cua quan
       - Bam vao quan cua ban

   App doc ma quan thang tu dia chi trang do roi hien ra de xac nhan.
   Bam "Dung quan nay" - app khoi dong lai va bat dau theo doi.

   Cau hinh duoc luu o  %APPDATA%\grab-order-watcher\  nen lan cap nhat sau
   (chep de ca thu muc) khong lam mat.


DUNG HANG NGAY
--------------

App chay ngam, bieu tuong la mot cham tron o khay he thong (goc phai duoi,
co the phai bam mui ten ^ de thay).

   cham XANH   dang theo doi don
   cham VANG   chua theo doi, hoac dang thu lai
   cham DO     mat phien Grab - can dang nhap lai

Dong cua so bang nut X thi app VAN CHAY, chi thu xuong khay. Muon tat han
thi bam chuot phai vao cham mau roi chon Thoat.

Bam doi vao cham mau de mo lai bang dieu khien.


KHI CO VAN DE
-------------

Chuot phai vao cham mau -> Xem nhat ky.

Telegram bao "MAT PHIEN GRAB"  ->  mo app, bam "Mo trang Grab", dang nhap lai.
Telegram bao "khong gui duoc sau 5 lan"  ->  don do khong len duoc ccmany,
vao Grab xem tay roi bao lai de sua.


GO CAI DAT
----------

Ba cach, cach nao cung duoc:

   - Mo app -> keo xuong cuoi -> nut "Go cai dat khoi may nay"
   - Settings -> Apps -> Installed apps -> "Theo doi don Grab" -> Uninstall
   - Hoac bam doi vao  "Go cai dat.cmd"  trong thu muc nay
     (dung cach nay khi app khong mo len duoc nua)

Ca ba deu hoi truoc mot cau: CO GIU LAI phien dang nhap Grab va cau hinh khong.

   Giu lai   ->  cai lai lan sau la chay duoc ngay, khong phai dang nhap
                 Grab lai, khong phai chon quan lai.
   Khong     ->  xoa sach, may tro ve nhu chua tung cai.

Dung xoa thu muc nay bang tay: lam the se bo sot muc tu chay cung Windows va
muc trong Settings. Tu do moi lan bat may Windows lai di goi mot file khong
con ton tai, va trong Settings van con mot muc ma khong go duoc.


CAI DAT DAY DU CHO MAY QUAN
---------------------------

Muon may tu chay lai sau khi mat dien hay sau khi Windows tu khoi dong lai,
xem file  docs/cai-dat-may-quan.md  trong ma nguon: co danh sach 10 buoc
(tai khoan Windows khong mat khau, tat che do ngu, cai dat BIOS...).
`;

/**
 * Ghep san o day chu khong viet thang trong template ben duoi.
 *
 * Trong String.raw, mot dau `\` ngay truoc `${` lam JS hieu do la dau dollar
 * duoc escape, va `${...}` KHONG con la cho thay the nua — chuoi giu nguyen
 * mat chu `${TEN_DU_LIEU}`. Duong dan sai thi nhanh "xoa het du lieu" se im
 * lang khong xoa gi. (Test go-cai-dat bat duoc dung loi nay.)
 */
const THU_MUC_DU_LIEU_WIN = `%APPDATA%\\${TEN_DU_LIEU}`;

/**
 * Trinh go cai dat, dat ngay trong thu muc da cai.
 *
 * MOT file nay phuc vu ca ba duong vao:
 *
 *   1. Nguoi dung bam doi vao no trong thu muc app -> tu hoi roi lam
 *   2. Settings -> Apps -> Uninstall (khoa registry tro vao chinh no)
 *   3. App goi ra (nut "Go cai dat" o bang dieu khien) -> nhan tham so qua
 *      bien moi truong GOCAIDAT_DIR / GOCAIDAT_DULIEU
 *
 * Vi sao phai chep sang %TEMP% roi chay lai o do: cmd.exe giu handle len chinh
 * file .cmd dang chay, va len thu muc lam viec cua no. Chay tu trong thu muc
 * app thi khong the xoa chinh thu muc do — no se xoa duoc gan het roi bao "The
 * process cannot access the file", de lai mot ban cai vo hieu ma van chiem cho.
 *
 * Cung ly do do, app khong the tu xoa minh: file .exe dang chay bi Windows
 * khoa. Nen nut trong app cung chi lam mot viec — day script nay ra %TEMP%,
 * chay no, roi thoat.
 */
export const GO_CAI_DAT = String.raw`@echo off
rem ===========================================================================
rem  Go cai dat "${TEN_APP}"
rem
rem  Bam doi vao file nay de go. No se hoi truoc khi xoa bat cu thu gi.
rem ===========================================================================
setlocal EnableExtensions

set "TENAPP=${TEN_APP}"
set "THUMUCDL=${THU_MUC_DU_LIEU_WIN}"
set "ZIPTAM=%TEMP%\electron-${ELECTRON_VERSION}-win32-x64.zip"
set "BANSAO=%TEMP%\go-${TEN_THU_MUC}.cmd"
set "KHOAGO=${KHOA_GO_CAI_DAT}"

rem App goi ra thi truyen qua bien moi truong chu khong qua tham so dong lenh:
rem duong dan cai co the co dau cach, va quy tac dat dau ngoac cua lenh 'start'
rem thi khong giong ai. Bien moi truong khong dinh toi chuyen dat dau ngoac.
if defined GOCAIDAT_DIR set "APPDIR=%GOCAIDAT_DIR%"
if defined GOCAIDAT_DULIEU set "DULIEU=%GOCAIDAT_DULIEU%"
if defined APPDIR goto :lam

rem ---------------------------------------------------------------------------
rem  Che do tuong tac: nguoi dung tu bam vao file nay
rem ---------------------------------------------------------------------------
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"

echo.
echo  ===============================================================
echo    GO CAI DAT - %TENAPP%
echo  ===============================================================
echo.
echo    Se xoa:
echo      - Thu muc cai dat    %APPDIR%
echo      - Loi tat ngoai desktop
echo      - Muc tu chay cung Windows
echo.
echo    Rieng phien dang nhap Grab va cau hinh nam o cho khac:
echo      %THUMUCDL%
echo.
choice /c CK /n /m "    Giu lai phien dang nhap va cau hinh? [C=co / K=khong] "
if errorlevel 2 (set "DULIEU=xoa") else (set "DULIEU=giu")
echo.
if /i "%DULIEU%"=="giu" echo    ^> GIU LAI. Cai lai lan sau khong phai dang nhap Grab lai.
if /i "%DULIEU%"=="xoa" echo    ^> XOA LUON. Cai lai lan sau phai dang nhap Grab va chon quan lai.
echo.
choice /c YN /n /m "    Go cai dat bay gio? [Y/N] "
if errorlevel 2 (
  echo.
  echo    Da huy, khong xoa gi ca.
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

copy /y "%~f0" "%BANSAO%" >nul
set "GOCAIDAT_DIR=%APPDIR%"
set "GOCAIDAT_DULIEU=%DULIEU%"
start "" "%BANSAO%"
exit /b 0

rem ---------------------------------------------------------------------------
rem  Lam that
rem ---------------------------------------------------------------------------
:lam
title Go cai dat %TENAPP%

rem RAO AN TOAN — dung sua dong nay.
rem Ngay ben duoi la "rmdir /s /q %APPDIR%". Neu APPDIR tro nham cho (bien rong,
rem duong dan cu, ai do goi script voi tham so bay ba) thi do la mot lenh xoa
rem sach thu muc ma nguoi dung khong he yeu cau. File main.js chi ton tai trong
rem dung ban cai cua cong cu nay, nen lay no lam bang chung nhan dang.
if not exist "%APPDIR%\resources\app\out\main\main.js" (
  echo.
  echo  KHONG XOA GI CA.
  echo  Day khong phai thu muc cai cua %TENAPP%:
  echo      %APPDIR%
  echo.
  ping -n 11 127.0.0.1 >nul
  exit /b 1
)

echo.
echo  Dang go cai dat %TENAPP%...
echo.

rem [1] Doi app tu thoat — no dang ghi phien dang nhap xuong dia. Qua 10 giay
rem     ma chua xong thi tat cung, vi con tien trinh song la con khoa file .exe.
echo   [1/5] Dong app...
set /a n=0
:doi
tasklist /fi "imagename eq %TENAPP%.exe" 2>nul | find /i "%TENAPP%.exe" >nul
if errorlevel 1 goto :dadong
set /a n+=1
if %n%==10 taskkill /f /im "%TENAPP%.exe" >nul 2>&1
if %n% GEQ 20 goto :dadong
ping -n 2 127.0.0.1 >nul
goto :doi
:dadong

rem [2] Muc tu chay cung Windows. Bo sot cai nay thi moi lan bat may Windows
rem     lai di goi mot file da bi xoa — khong hai gi nhung ban, va khong ai
rem     tren may quan biet duong ma don.
echo   [2/5] Bo tu chay cung Windows va muc trong Settings...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "%TENAPP%" /f >nul 2>&1

rem Muc trong Settings -> Apps. Bo sot thi Windows van liet ke app o do, bam
rem Uninstall lai chay mot file da bi xoa — va khong co cach nao go cai muc do
rem ra tu giao dien Settings.
reg delete "%KHOAGO%" /f >nul 2>&1

echo   [3/5] Xoa loi tat ngoai desktop...
rem Doc duong dan Desktop tu registry chu khong doan la %USERPROFILE%\Desktop:
rem may co OneDrive thi Desktop da bi doi cho, va loi tat nam o cho moi.
set "DESKTOP="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop 2^>nul') do set "DESKTOP=%%b"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%DESKTOP%\%TENAPP%.lnk" del /f /q "%DESKTOP%\%TENAPP%.lnk" >nul 2>&1

rem [4] Thu muc app, va file Electron 150 MB ma trinh cai dat co y giu lai trong
rem     %TEMP% de lan cai sau khoi tai lai. Khong go thi no nam do mai.
echo   [4/5] Xoa thu muc cai dat...
rmdir /s /q "%APPDIR%" >nul 2>&1
if exist "%ZIPTAM%" del /f /q "%ZIPTAM%" >nul 2>&1

if /i "%DULIEU%"=="xoa" (
  echo   [5/5] Xoa cau hinh va phien dang nhap Grab...
  if defined APPDATA rmdir /s /q "%THUMUCDL%" >nul 2>&1
) else (
  echo   [5/5] GIU LAI cau hinh va phien dang nhap Grab:
  echo         %THUMUCDL%
)

echo.
if exist "%APPDIR%" (
  echo  ===============================================================
  echo   XOA CHUA HET - van con: %APPDIR%
  echo  ===============================================================
  echo  Thuong la vi con mot tien trinh dang giu file trong do.
  echo  Khoi dong lai may roi xoa thu muc do bang tay la xong.
) else (
  echo  ===============================================================
  echo   DA GO XONG
  echo  ===============================================================
)
echo.
ping -n 8 127.0.0.1 >nul

rem File nay dang nam o %TEMP% va dang duoc chinh cmd.exe doc do. Lenh (goto)
rem lam cmd nhay ra khoi script va tha handle, roi moi den luot del — cach duy
rem nhat de mot file .cmd tu xoa duoc chinh no.
(goto) 2>nul & del /f /q "%~f0"
`;
