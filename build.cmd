@echo off
setlocal
cd /d "%~dp0"
title Dong goi Notiftest-Grab

echo.
echo  ================================================
echo   DONG GOI - NOTIFTEST-GRAB
echo  ================================================
echo.

rem --- [1/5] Node.js ---------------------------------------------------------
echo  [1/5] Kiem tra Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  KHONG TIM THAY Node.js.
  echo  Tai va cai tai https://nodejs.org  roi chay lai file nay.
  goto :ket_thuc_loi
)
for /f "tokens=*" %%v in ('node --version') do echo        Node %%v

rem --- [2/5] Thu vien --------------------------------------------------------
echo  [2/5] Kiem tra thu vien...
if exist "node_modules\electron\dist\electron.exe" (
  echo        da co san
) else (
  echo        chua co - dang cai, lan dau se lau vai phut...
  call npm install
  if errorlevel 1 goto :ket_thuc_loi
)

rem --- [3/5] Kiem tra ma nguon ----------------------------------------------
rem Nuot ca stdout lan stderr: vitest in ra vai dong ERROR la KET QUA MONG DOI
rem cua chinh cac test ve mat phien, hien len day chi lam nguoi doc tuong la
rem hong. Chi ma thoat moi la cau tra loi that.
echo  [3/5] Kiem tra ma nguon...
call npm run typecheck >nul 2>&1
if errorlevel 1 (
  echo.
  echo  MA NGUON CO LOI KIEU DU LIEU. Chay "npm run typecheck" de xem chi tiet.
  goto :ket_thuc_loi
)
echo        kieu du lieu: OK
call npm test >nul 2>&1
if errorlevel 1 (
  echo.
  echo  CO TEST KHONG QUA. Chay "npm test" de xem chi tiet.
  echo  KHONG dong goi khi test dang hong.
  goto :ket_thuc_loi
)
echo        test: OK

rem --- [4/5] Dong goi --------------------------------------------------------
echo  [4/5] Dong goi thanh thu muc... (khoang mot phut)
call npm run portable >nul 2>&1
if errorlevel 1 (
  echo.
  echo  DONG GOI THAT BAI. Chay "npm run portable" de xem chi tiet.
  goto :ket_thuc_loi
)
echo        release\portable

rem --- [5/5] Mot file cai dat -----------------------------------------------
echo  [5/5] Dong goi thanh MOT file cai dat...
call node scripts\make-installer.mjs >nul 2>&1
if errorlevel 1 (
  echo.
  echo  KHONG TAO DUOC FILE CAI DAT. Chay "npm run installer" de xem chi tiet.
  goto :ket_thuc_loi
)
echo        release\install.cmd

rem --- KHONG tao loi tat o day -----------------------------------------------
rem
rem Truoc day buoc nay tu tao mot loi tat ngoai desktop tro vao release\portable.
rem Da bo, vi ba ly do, tat ca deu da xay ra that:
rem
rem   1. release\portable bi XOA SACH moi lan build lai (make-portable.mjs), nen
rem      loi tat do hong ngay khi ban xoa thu muc ma khong build lai — Windows
rem      hoi "khong tim thay, xoa loi tat nay?" va nguoi dung mat duong vao app.
rem   2. Loi tat nay TRUNG TEN voi loi tat cua ban da cai. Chay build.cmd la ghi
rem      de len no, va tu do bam icon ngoai desktop se mo ban trong releaserem      chu khong phai ban da cai.
rem   3. Chay ban trong release\ len thi no ghi de luon muc tu chay cung Windows
rem      va muc trong Settings, tro ca hai vao mot thu muc san sang bi xoa.
rem
rem Dung build.cmd la de DONG GOI, khong phai de cai len may nay. Muon cai that
rem thi chay release\install.cmd.

echo.
echo  ================================================
echo   XONG
echo  ================================================
echo.
echo  Loi tat da co ngoai man hinh desktop - bam vao la chay duoc ngay.
echo.
echo  ------------------------------------------------
echo   GUI SANG MAY QUAN - CHON MOT TRONG HAI:
echo.
echo   1. MOT FILE  (de nhat, can mang luc cai)
echo        release\install.cmd                  ~185 KB
echo      Gui moi file nay. Ben do bam doi la tu cai, tu tao loi tat.
echo      No tu tai Electron tu trang phat hanh chinh thuc.
echo.
echo   2. CA THU MUC  (khong can mang luc cai)
echo        release\portable                     ~366 MB
echo      Nen lai, giai nen o may kia, chay "create-shortcut.cmd".
echo.
echo   Ca hai deu can doi .env.example thanh .env va dien kho a.
echo  ------------------------------------------------
echo.

rem --- Nen lai de chep sang may khac ----------------------------------------
rem Nen NGAY SAU khi dong goi thi thu muc con sach: chua co .env that, chua co
rem data\ (nhat ky, bo nho chong trung, JSON tho co ten va SDT khach). Nen lai
rem sau khi da chay thu app tu thu muc do thi hai thu do se di theo file zip.
choice /c YN /n /m "  Nen thanh .zip de chep sang may quan? (Y/N) "
if errorlevel 2 goto :mo_thu_muc

echo.
echo  Dang nen... (khoang mot phut)
powershell -NoProfile -Command "Compress-Archive -Path 'release\portable\*' -DestinationPath 'release\NotiftestGrab.zip' -Force"
if errorlevel 1 (
  echo  Nen that bai.
) else (
  echo  Da nen: release\NotiftestGrab.zip
)
echo.

:mo_thu_muc
explorer "%CD%\release"
goto :ket_thuc

:ket_thuc_loi
echo.
echo  ================================================
echo   DUNG LAI - CHUA DONG GOI
echo  ================================================
echo.
pause
exit /b 1

:ket_thuc
pause
exit /b 0
