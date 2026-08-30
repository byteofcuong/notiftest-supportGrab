/**
 * Sinh MOT file cai dat duy nhat: release/install.cmd
 *
 * ═══ VI SAO LA .cmd CHU KHONG PHAI .exe ═══
 *
 * Thu ma nguoi ta muon la mot file .exe, bam doi, cai, chay — nhu moi app tren
 * thi truong. Cai do can CHUNG CHI KY SO, va do chinh la thu moi app tren thi
 * truong deu co. Khong co chu ky thi Smart App Control chan thang, vi no xet
 * danh tieng theo hash cua tung file thuc thi, ma file minh vua dung ra thi
 * chua ai tung thay.
 *
 * File .cmd thi khac: no la KICH BAN, khong phai file thuc thi. Thu that su
 * chay la cmd.exe, curl.exe, tar.exe, certutil.exe, powershell.exe — nam trong
 * System32, Microsoft ky — cong voi chinh electron.exe ban phat hanh chinh
 * thuc. KHONG co file thuc thi moi nao duoc sinh ra, nen khong co gi de chan.
 *
 * ═══ VI SAO PHAI TAI ELECTRON VE ═══
 *
 *     Phan cua minh :   ~205 KB
 *     Electron      :   ~150 MB (ban nen)
 *
 * Nhung 150 MB do ai cung tai duoc tu trang phat hanh chinh thuc, va chinh vi
 * hang trieu may da tai ma Microsoft biet no lanh. Nhet no vao file cai dat
 * duoi dang base64 thi ra mot file ~200 MB, cham va vo nghia. Tai ve dung chuan
 * hon: cai gi la cua minh thi nhung kem, cai gi la cua nguoi thi lay tu nguon.
 *
 * DOI LAI: can mang luc cai. Khong phai rang buoc that — cong cu nay khong co
 * mang thi cung khong lam duoc gi.
 *
 *   node scripts/make-installer.mjs
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELECTRON_SHA256,
  ELECTRON_URL,
  ELECTRON_VERSION,
  chiAscii,
  GO_CAI_DAT,
  HUONG_DAN,
  TAO_LOI_TAT,
  TEN_APP,
  TEN_THU_MUC,
} from './lib/noi-dung.mjs';

/** tar cua Windows. Goi thang duong dan de khong vo tinh dung tar cua Git. */
const TAR = 'C:\\Windows\\System32\\tar.exe';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const phienBan = JSON.parse(readFileSync(join(goc, 'package.json'), 'utf8')).version;
const thuMucRelease = join(goc, 'release');
const tam = join(thuMucRelease, '.tam-installer');

try {
  statSync(join(goc, 'out', 'main', 'main.js'));
} catch {
  console.error('Khong thay out/main/main.js — chay "npm run build" truoc');
  process.exit(1);
}

// ── 1. Dung phan cua minh, dung layout ma no se nam trong thu muc da cai ─────
rmSync(tam, { recursive: true, force: true });
const thuMucApp = join(tam, 'resources', 'app');
mkdirSync(thuMucApp, { recursive: true });
cpSync(join(goc, 'out'), join(thuMucApp, 'out'), { recursive: true });
writeFileSync(
  join(thuMucApp, 'package.json'),
  `${JSON.stringify({ name: 'grab-order-watcher', version: phienBan, main: 'out/main/main.js' }, null, 2)}\n`,
  'utf8',
);

mkdirSync(join(tam, 'config'), { recursive: true });
cpSync(join(goc, 'config', 'stores.json'), join(tam, 'config', 'stores.json'));
cpSync(join(goc, '.env.example'), join(tam, '.env.example'));
cpSync(join(goc, 'build', 'icon.ico'), join(tam, 'icon.ico'));
writeFileSync(join(tam, 'DOC FILE NAY TRUOC.txt'), HUONG_DAN, 'utf8');
writeFileSync(join(tam, 'create-shortcut.cmd'), chiAscii(TAO_LOI_TAT, 'create-shortcut.cmd'), 'latin1');
writeFileSync(join(tam, 'uninstall.cmd'), chiAscii(GO_CAI_DAT, 'uninstall.cmd'), 'latin1');

// ── 2. Nen lai bang tar.gz ───────────────────────────────────────────────────
// Dung tar chu khong phai zip vi ca hai dau — luc tao va luc giai — deu dung
// dung mot cong cu co san cua Windows, khong phu thuoc thu vien nao.
const tgz = join(thuMucRelease, 'payload.tgz');
rmSync(tgz, { force: true });
execFileSync(TAR, ['-czf', tgz, '-C', tam, '.'], { stdio: 'inherit' });

const base64 = readFileSync(tgz).toString('base64');
const dongBase64 = base64.match(/.{1,120}/g) ?? [];

// ── 3. Sinh file cai dat ─────────────────────────────────────────────────────
const kichThuoc = (statSync(tgz).size / 1024).toFixed(0);
const script = KICH_BAN({ phienBan })
  .replace(/\r?\n/g, '\r\n')
  .concat('\r\n', dongBase64.join('\r\n'), '\r\n');

const dich = join(thuMucRelease, 'install.cmd');
writeFileSync(dich, chiAscii(script, 'install.cmd'), 'latin1');

rmSync(tgz, { force: true });
rmSync(tam, { recursive: true, force: true });

console.log(`da tao ${dich}`);
console.log(`  phan cua minh : ${kichThuoc} KB (nhung san trong file)`);
console.log(`  Electron      : tai luc cai tu trang phat hanh chinh thuc`);
console.log(`  tong          : ${(statSync(dich).size / 1024).toFixed(0)} KB`);

// ─────────────────────────────────────────────────────────────────────────────

function KICH_BAN({ phienBan: v }) {
  return `@echo off
rem ===========================================================================
rem  CAI DAT - ${TEN_APP}  v${v}
rem
rem  Mot file duy nhat. Bam doi la cai.
rem
rem  File nay CHUA phan ma nguon cua cong cu (nhung o cuoi file, dang base64),
rem  va TAI Electron ${ELECTRON_VERSION} tu trang phat hanh chinh thuc luc cai.
rem  Co doi chieu SHA-256 truoc khi giai nen: tai mot file thuc thi 150 MB tu
rem  Internet ve roi chay ma khong kiem tra la mot lo hong that.
rem ===========================================================================
setlocal EnableExtensions
title Cai dat ${TEN_APP}

set "TEN_APP=${TEN_APP}"
set "NGUON=${ELECTRON_URL}"
set "SHA_MONG_DOI=${ELECTRON_SHA256}"
set "SELF=%~f0"
set "DICH=%LOCALAPPDATA%\\${TEN_THU_MUC}"
set "ZIP=%TEMP%\\electron-${ELECTRON_VERSION}-win32-x64.zip"
set "TGZ=%TEMP%\\grab-order-watcher-payload.tgz"

echo.
echo  ================================================
echo   CAI DAT - ${TEN_APP}
echo  ================================================
echo.

rem --- Kiem tra may co du dieu kien khong -----------------------------------
rem Kiem TRUOC khi tai 150 MB. Thieu mot thu roi moi hong o giua chung thi vua
rem ton bang thong vua de lai mot thu muc do dang.
where curl.exe >nul 2>&1
if errorlevel 1 goto :thieu_cong_cu
where tar.exe >nul 2>&1
if errorlevel 1 goto :thieu_cong_cu
if /i not "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  if /i not "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    if /i not "%PROCESSOR_ARCHITECTURE%"=="ARM64" goto :sai_kien_truc
    echo  Luu y: may ARM64, se chay ban x64 qua lop gia lap cua Windows.
    echo.
  )
)

echo  Se cai vao : %DICH%
echo  Can mang de tai Electron (khoang 150 MB), chi lan dau.
echo.
choice /c YN /n /m "  Tiep tuc? (Y/N) "
if errorlevel 2 goto :huy

rem --- [1/5] Tai Electron ----------------------------------------------------
echo.
echo  [1/5] Tai Electron... (150 MB, tuy mang co the vai phut)
if exist "%ZIP%" (
  echo        da co san trong thu muc tam, dung lai
) else (
  curl -L --fail --progress-bar -o "%ZIP%" "%NGUON%"
  if errorlevel 1 (
    echo.
    echo  TAI THAT BAI. Kiem tra ket noi mang roi chay lai.
    goto :loi
  )
)

rem --- [2/5] Doi chieu SHA-256 ----------------------------------------------
echo  [2/5] Doi chieu SHA-256...
set "SHA_THAT="
for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "%ZIP%" SHA256') do (
  if not defined SHA_THAT set "SHA_THAT=%%h"
)
set "SHA_THAT=%SHA_THAT: =%"
if /i not "%SHA_THAT%"=="%SHA_MONG_DOI%" (
  echo.
  echo  SHA-256 KHONG KHOP - file tai ve khong dung ban chinh thuc.
  echo    mong doi : %SHA_MONG_DOI%
  echo    that su  : %SHA_THAT%
  echo  Da xoa file do. Khong cai tiep.
  del /q "%ZIP%" >nul 2>&1
  goto :loi
)
echo        khop

rem --- [3/5] Giai nen --------------------------------------------------------
rem
rem PHAI dong app truoc khi giai nen. Windows khoa file .exe va cac DLL da nap
rem cua tien trinh dang chay, nen tar se bao "Can't unlink already-existing
rem object: Permission denied" cho tung file mot roi bo cuoc, de lai mot thu
rem muc NUA CU NUA MOI, tinh trang te hon la khong cai gi ca.
rem
rem Da dam phai khi cai de len ban dang chay.
tasklist /fi "imagename eq %TEN_APP%.exe" 2>nul | find /i "%TEN_APP%.exe" >nul
if not errorlevel 1 (
  echo  [3/5] Dong ban dang chay truoc da...
  taskkill /f /im "%TEN_APP%.exe" >nul 2>&1
  rem Doi Windows tha khoa file. Giet tien trinh xong khong co nghia la handle
  rem duoc tha ngay.
  ping -n 5 127.0.0.1 >nul
)

echo  [3/5] Giai nen vao %DICH% ...
if not exist "%DICH%" mkdir "%DICH%" >nul 2>&1
tar -xf "%ZIP%" -C "%DICH%"
if errorlevel 1 (
  echo.
  echo  GIAI NEN THAT BAI.
  echo  Neu thay "Permission denied": con mot tien trinh dang giu file trong
  echo    %DICH%
  echo  Khoi dong lai may roi chay lai file nay.
  goto :loi
)

rem Doi ten file thuc thi. CHEP chu khong sua, nen hash giu nguyen, do la ly do
rem no khong bi Smart App Control chan.
if exist "%DICH%\\electron.exe" (
  copy /y "%DICH%\\electron.exe" "%DICH%\\%TEN_APP%.exe" >nul
  del /q "%DICH%\\electron.exe" >nul 2>&1
)
rem Electron chay man hinh gioi thieu cua no khi khong tim thay app cua minh.
del /q "%DICH%\\resources\\default_app.asar" >nul 2>&1

rem --- [4/5] Bung phan ma nguon nhung trong file nay -------------------------
rem
rem Xoa het .cmd cu truoc da. Tat ca .cmd trong thu muc nay deu do payload sinh
rem ra, nen xoa di la an toan - va can thiet: giai nen chi GHI DE, khong xoa
rem file da bien mat khoi payload. Doi ten mot script (vi du "Go cai dat.cmd"
rem thanh "uninstall.cmd") ma khong xoa thi ban cu nam lai vinh vien, va no la
rem mot trinh go cai dat NHAM TEN: bam vao la xoa thu muc app nhung de lai muc
rem tu chay va muc Settings tro vao hu khong.
del /q "%DICH%\*.cmd" >nul 2>&1

echo  [4/5] Cai dat cong cu...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=Get-Content -LiteralPath $env:SELF -Encoding Ascii;" ^
  "$i=[array]::IndexOf($d,':::PAYLOAD:::');" ^
  "if($i -lt 0){exit 1};" ^
  "[IO.File]::WriteAllBytes($env:TGZ,[Convert]::FromBase64String(-join $d[($i+1)..($d.Count-1)]))"
if errorlevel 1 (
  echo  KHONG BUNG DUOC phan ma nguon.
  goto :loi
)
tar -xzf "%TGZ%" -C "%DICH%"
if errorlevel 1 (
  echo  KHONG GIAI NEN DUOC phan ma nguon.
  goto :loi
)
del /q "%TGZ%" >nul 2>&1
echo        xong

rem --- [5/5] Loi tat ---------------------------------------------------------
echo  [5/5] Tao loi tat ngoai desktop...
call "%DICH%\\create-shortcut.cmd" /nopause >nul 2>&1
if errorlevel 1 (
  echo        khong tao duoc - tu mo %DICH% de chay
) else (
  echo        xong
)

echo.
echo  ================================================
echo   DA CAI XONG
echo  ================================================
echo.
echo  Thu muc : %DICH%
echo  Loi tat : ngoai man hinh desktop
echo.
echo  CON MAY BUOC NUA truoc khi dung that:
echo    1. Bam loi tat ngoai desktop de mo app
echo    2. Bam "Mo file cau hinh" - app tu tao .env va mo Notepad,
echo       dien kho a ccmany vao roi luu lai
echo    3. Bam "Mo Grab de chon quan" - dang nhap roi bam vao quan cua ban.
echo       MA QUAN APP TU DOC, khong phai go tay chuoi nao ca.
echo  Chi tiet trong "DOC FILE NAY TRUOC.txt" o thu muc do.
echo.
choice /c YN /n /m "  Mo thu muc do bay gio? (Y/N) "
if errorlevel 2 goto :xong
explorer "%DICH%"

:xong
echo.
pause
exit /b 0

:huy
echo.
echo  Da huy, chua cai gi ca.
pause
exit /b 0

:thieu_cong_cu
echo.
echo  MAY NAY THIEU curl hoac tar.
echo.
echo  Hai cong cu do co san tu Windows 10 phien ban 1803 tro di. May dang
echo  chay ban Windows cu hon nen khong dung duoc file cai nay.
echo.
echo  Cach khac: xin ban dong goi dang THU MUC (khong can tai gi), giai nen
echo  ra roi chay "create-shortcut.cmd" ben trong.
pause
exit /b 1

:sai_kien_truc
echo.
echo  MAY NAY KHONG PHAI WINDOWS 64-BIT (%PROCESSOR_ARCHITECTURE%).
echo  Cong cu chi co ban 64-bit.
pause
exit /b 1

:loi
echo.
echo  ================================================
echo   DUNG LAI - CHUA CAI XONG
echo  ================================================
echo.
pause
exit /b 1

rem ===========================================================================
rem  Duoi day la phan ma nguon cua cong cu, nen bang tar.gz roi ma hoa base64.
rem  cmd.exe khong bao gio doc toi day vi da "exit /b" o tren.
rem ===========================================================================
:::PAYLOAD:::`;
}
