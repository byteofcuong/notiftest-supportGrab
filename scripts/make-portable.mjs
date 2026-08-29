/**
 * Dong goi ma KHONG dung toi mot byte nao cua file thuc thi.
 *
 * ═══ VI SAO CAN CACH NAY ═══
 *
 * Windows 11 co Smart App Control. Da do tren may that: no chan theo DANH TIENG
 * CUA TUNG FILE, tinh theo hash — khong phai theo chu ky so, cung khong phai
 * theo ten file. Bang chung:
 *
 *   electron.exe goc          1DC2D12E...   chay duoc
 *   ban electron-builder      F6717AA3...   BI CHAN
 *   ban chep nguyen xi, doi ten  1DC2D12E...   chay duoc
 *
 * Ca hai file deu KHONG ky so. Khac biet duy nhat: electron.exe ban phat hanh
 * chinh thuc da duoc hang trieu may tai nen Microsoft biet no lanh; con
 * electron-builder thi sua vao ruot file (nhet icon, thong tin phien ban, chuoi
 * kiem tra asar) nen ra mot file chua ai tung thay.
 *
 * Script nay chep nguyen xi, chi doi ten — hash khong doi, nen khong bi chan.
 *
 * ═══ DANH DOI ═══
 *
 * File .exe khong co icon rieng, khong co thong tin phien ban. Doi lai thi loi
 * tat (.lnk) tren desktop VAN mang icon cua minh — ma do moi la cho nguoi dung
 * that su nhin vao. Icon o khay he thong cung la cua minh (ve trong ma nguon).
 *
 *   node scripts/make-portable.mjs
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEN_APP = 'Theo doi don Grab';

const TAO_LOI_TAT = `@echo off
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
const HUONG_DAN = String.raw`THEO DOI DON GRAB
==================

Cong cu nay canh trang don hang Grab Merchant va day don moi sang ccmany.


LAM GI VOI THU MUC NAY
----------------------

1. Chep NGUYEN CA THU MUC sang may quan.
   Dat o cho ghi duoc, vi du C:\TheoDoiDonGrab
   KHONG dat trong C:\Program Files (thu muc do chi doc, app se khong ghi
   duoc nhat ky va bo nho chong trung).

   Luu y: file "Theo doi don Grab.exe" KHONG chay mot minh duoc. No can toan
   bo cac file .dll va thu muc resources/ nam canh no.

2. Doi ten file  .env.example  thanh  .env
   Mo bang Notepad, dien:
       CCMANY_API_URL      dia chi nhan don
       CCMANY_API_KEY      kho a API
       TELEGRAM_BOT_TOKEN  (tuy chon)
       TELEGRAM_CHAT_ID    (tuy chon)
   De nguyen DRY_RUN=true cho toi khi chay thu xong.

3. Mo file  config\stores.json  , dien ma quan va ten quan.

4. Chay  "Tao loi tat ra desktop.cmd"  de co bieu tuong ngoai man hinh.

5. Bam bieu tuong do de mo app. Lan dau phai bam "Mo trang Grab / Dang nhap"
   roi dang nhap tai khoan merchant cua quan.


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


CAI DAT DAY DU CHO MAY QUAN
---------------------------

Muon may tu chay lai sau khi mat dien hay sau khi Windows tu khoi dong lai,
xem file  docs/cai-dat-may-quan.md  trong ma nguon: co danh sach 10 buoc
(tai khoan Windows khong mat khau, tat che do ngu, cai dat BIOS...).
`;

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const phienBan = JSON.parse(readFileSync(join(goc, 'package.json'), 'utf8')).version;
const nguonElectron = join(goc, 'node_modules', 'electron', 'dist');
const dich = join(goc, 'release', 'portable');

if (!existsSync(join(nguonElectron, 'electron.exe'))) {
  console.error(`Khong thay ${join(nguonElectron, 'electron.exe')} — chay "npm install" truoc`);
  process.exit(1);
}
if (!existsSync(join(goc, 'out', 'main', 'main.js'))) {
  console.error('Khong thay out/main/main.js — chay "npm run build" truoc');
  process.exit(1);
}

rmSync(dich, { recursive: true, force: true });
mkdirSync(dich, { recursive: true });

// 1. Toan bo Electron, y nguyen.
for (const ten of readdirSync(nguonElectron)) {
  cpSync(join(nguonElectron, ten), join(dich, ten), { recursive: true });
}

// 2. Doi ten file thuc thi. Chep chu khong sua, nen hash giu nguyen.
cpSync(join(dich, 'electron.exe'), join(dich, `${TEN_APP}.exe`));
rmSync(join(dich, 'electron.exe'), { force: true });

// 3. App cua minh. Dat o resources/app/ chu khong nen thanh asar: khong can
//    them cong cu, va quan trong hon la khong dung toi co xac thuc asar.
const thuMucApp = join(dich, 'resources', 'app');
mkdirSync(thuMucApp, { recursive: true });
cpSync(join(goc, 'out'), join(thuMucApp, 'out'), { recursive: true });
writeFileSync(
  join(thuMucApp, 'package.json'),
  `${JSON.stringify({ name: 'grab-order-watcher', version: phienBan, main: 'out/main/main.js' }, null, 2)}\n`,
  'utf8',
);

// Electron chay app mac dinh (man hinh gioi thieu) khi khong tim thay app cua
// minh. Bo di cho chac — co no thi mot loi duong dan se hien ra thanh man hinh
// Electron thay vi bao loi.
rmSync(join(dich, 'resources', 'default_app.asar'), { force: true });

// 4. Cau hinh nam CANH file thuc thi de sua duoc sau khi cai (main.ts lay ROOT
//    tu duong dan .exe khi da dong goi).
mkdirSync(join(dich, 'config'), { recursive: true });
cpSync(join(goc, 'config', 'stores.json'), join(dich, 'config', 'stores.json'));
cpSync(join(goc, '.env.example'), join(dich, '.env.example'));
cpSync(join(goc, 'build', 'icon.ico'), join(dich, 'icon.ico'));

// 5. Huong dan dat ngay trong thu muc. Nguoi mo thu muc nay tren may quan co
//    the khong phai nguoi dung repo — ho can biet lam gi ma khong phai di tim.
writeFileSync(join(dich, 'DOC FILE NAY TRUOC.txt'), HUONG_DAN, 'utf8');

// 6. Loi tat: tao bang .lnk co icon rieng. Viet ra file .cmd de nguoi cai chay
//    tren may quan — khong tu chay o day, va khong doi quyen quan tri.
writeFileSync(join(dich, 'Tao loi tat ra desktop.cmd'), TAO_LOI_TAT, 'latin1');

console.log(`da dong goi: ${dich}`);
console.log(`  file chay: ${TEN_APP}.exe  (hash y het electron.exe goc)`);
console.log('  buoc tiep: doc "DOC FILE NAY TRUOC.txt" trong thu muc do');
