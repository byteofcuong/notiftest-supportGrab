// Doc nhat ky DEV_GHI_MANG roi in bao cao tai (Task 8).
//
//   npm run do-tai                             # doc data/logs/app.log
//   npm run do-tai -- duong/dan/khac.log
//   npm run do-tai -- --bo-dau=60              # bo qua 60 giay dau
//
// `--bo-dau` co gan nhu luc nao cung nen dung: trang Grab ban vai chuc request
// trong hai giay dau khi tai lan dau, va cai dinh do che mat dinh that cua nhip
// poll. Bo mot phut dau la do dung phan chay on dinh.
//
// Chay TRUOC khi tat DEV_GHI_MANG, hoac bat cu luc nao sau do — no chi doc
// file, khong dung toi app dang chay.
//
// Doc `out/core/do-tai.js` chu khong phai file .ts: script nay chay bang Node
// thuan, khong qua tsc. Nen phai `npm run build:ts` truoc.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baoCaoTai, docNhatKy, inBaoCao } from '../out/core/do-tai.js';

const GOC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const thamSo = process.argv.slice(2);
const boDauGiay = Number(thamSo.find((t) => t.startsWith('--bo-dau='))?.split('=')[1] ?? 0);
const duongDan = thamSo.find((t) => !t.startsWith('--')) ?? join(GOC, 'data', 'logs', 'app.log');

if (!existsSync(duongDan)) {
  console.error(`Khong thay nhat ky: ${duongDan}`);
  console.error('Ban dong goi ghi nhat ky canh .exe, vd:');
  console.error('  npm run do-tai -- "%LOCALAPPDATA%\\NotiftestGrab\\data\\logs\\app.log"');
  process.exit(1);
}

let goi = docNhatKy(readFileSync(duongDan, 'utf8'));
if (boDauGiay > 0 && goi.length > 0) {
  const tu = goi[0].luc + boDauGiay * 1000;
  goi = goi.filter((g) => g.luc >= tu);
}
const bc = baoCaoTai(goi);

console.log(`Nhat ky: ${duongDan}`);
if (boDauGiay > 0) console.log(`Da bo ${boDauGiay}s dau (giai doan tai trang).`);
console.log('');
console.log(inBaoCao(bc));

// Ma thoat khac 0 khi co 429: de sau nay cam vao mot buoc kiem tu dong duoc.
if (bc.maLoi.some((m) => m.status === 429)) process.exit(2);
