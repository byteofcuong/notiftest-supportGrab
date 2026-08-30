/**
 * Sinh build/icon.ico tu assets/logo.png — dung logo cua notiftest.
 *
 * Truoc day file nay VE icon bang code, voi ly do "khong giu anh nhi phan trong
 * repo". Ly do do khong con dung nua: cong cu Windows va app Android la mot san
 * pham, phai mang cung mot logo, ma logo do la mot file anh co san chu khong
 * phai thu ve lai duoc bang vai dong ham toan.
 *
 * Nguon:  notiftest/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png  (192x192)
 * Doi logo thi chep de len assets/logo.png roi chay lai script nay.
 *
 * Van khong dung thu vien ngoai: PNG nguon la RGBA 8-bit khong xen ke, dinh
 * dang de giai ma nhat, va zlib thi Node co san.
 *
 *   node scripts/make-icon.mjs
 */

import zlib from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cac co Windows thuc su dung: khay, thanh tac vu, cua so, Explorer. */
const CAC_CO = [16, 32, 48, 64, 128, 256];

/**
 * Ban kinh bo goc, tinh theo ti le canh.
 *
 * assets/logo.png la mot THE VUONG DAC — do alpha o ca vien deu ~150, ruot 255,
 * khong he bo goc. Tren dien thoai no van trong tron vi Android tu ap mat na
 * luc hien thi; Windows thi khong lam vay, nen bo qua buoc nay la ra mot o vuong
 * kem giua cac icon bo goc khac tren thanh tac vu.
 */
const BAN_KINH_GOC = 0.22;

// ── Doc PNG ──────────────────────────────────────────────────────────────────

/** Bo loc theo dong cua PNG. Xem muc 9 cua dac ta PNG. */
function boLoc(loai, dong, truoc, bpp) {
  for (let i = 0; i < dong.length; i++) {
    const a = i >= bpp ? dong[i - bpp] : 0; // trai
    const b = truoc[i]; // tren
    const c = i >= bpp ? truoc[i - bpp] : 0; // cheo tren-trai
    switch (loai) {
      case 0:
        break;
      case 1:
        dong[i] = (dong[i] + a) & 0xff;
        break;
      case 2:
        dong[i] = (dong[i] + b) & 0xff;
        break;
      case 3:
        dong[i] = (dong[i] + ((a + b) >> 1)) & 0xff;
        break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        dong[i] = (dong[i] + pred) & 0xff;
        break;
      }
      default:
        throw new Error(`Bo loc PNG la: ${loai}`);
    }
  }
}

/**
 * Giai ma PNG RGBA 8-bit khong xen ke. Co y KHONG lam tong quat: nhan dung mot
 * dinh dang roi bao loi ro rang, hon la doan mo ho voi cac dinh dang khac.
 */
function docPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('assets/logo.png khong phai file PNG');
  const rong = buf.readUInt32BE(16);
  const cao = buf.readUInt32BE(20);
  const sauBit = buf[24];
  const loaiMau = buf[25];
  const xenKe = buf[28];
  if (sauBit !== 8 || loaiMau !== 6 || xenKe !== 0) {
    throw new Error(
      `Chi doc duoc PNG RGBA 8-bit khong xen ke; file nay: sau=${sauBit} loai=${loaiMau} xenke=${xenKe}`,
    );
  }

  const cacIdat = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const loai = buf.toString('ascii', o + 4, o + 8);
    if (loai === 'IDAT') cacIdat.push(buf.subarray(o + 8, o + 8 + len));
    if (loai === 'IEND') break;
    o += 12 + len;
  }

  const tho = zlib.inflateSync(Buffer.concat(cacIdat));
  const bpp = 4;
  const buocDong = rong * bpp;
  const diem = Buffer.alloc(cao * buocDong);
  let truoc = Buffer.alloc(buocDong);
  for (let y = 0; y < cao; y++) {
    const nguon = 1 + y * (buocDong + 1);
    const dong = Buffer.from(tho.subarray(nguon, nguon + buocDong));
    boLoc(tho[nguon - 1], dong, truoc, bpp);
    dong.copy(diem, y * buocDong);
    truoc = dong;
  }
  return { rong, cao, diem };
}

// ── Doi co ───────────────────────────────────────────────────────────────────

/**
 * Doi co anh, co NHAN TRUOC ALPHA.
 *
 * Bo buoc nhan truoc thi cac diem trong suot o goc bo tron van dong gop mau cua
 * chung (thuong la den) vao trung binh, va vien logo se co mot quang toi mo —
 * chi thay ro o co 16px, dung cai co ma nguoi dung nhin nhieu nhat.
 *
 * Thu nho thi lay trung binh theo dien tich (chong rang cua); phong to thi noi
 * suy song tuyen (khoi vo o vuong).
 */
function doiCo(anh, dich) {
  const { rong, cao, diem } = anh;
  const ra = Buffer.alloc(dich * dich * 4);
  const tiLe = rong / dich;
  const thuNho = dich < rong;

  for (let y = 0; y < dich; y++) {
    for (let x = 0; x < dich; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (thuNho) {
        const x0 = Math.floor(x * tiLe);
        const x1 = Math.min(Math.ceil((x + 1) * tiLe), rong);
        const y0 = Math.floor(y * tiLe);
        const y1 = Math.min(Math.ceil((y + 1) * tiLe), cao);
        let n = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const i = (sy * rong + sx) * 4;
            const al = diem[i + 3] / 255;
            r += diem[i] * al;
            g += diem[i + 1] * al;
            b += diem[i + 2] * al;
            a += diem[i + 3];
            n += 1;
          }
        }
        r /= n;
        g /= n;
        b /= n;
        a /= n;
      } else {
        const fx = (x + 0.5) * tiLe - 0.5;
        const fy = (y + 0.5) * tiLe - 0.5;
        const x0 = Math.max(Math.floor(fx), 0);
        const y0 = Math.max(Math.floor(fy), 0);
        const x1 = Math.min(x0 + 1, rong - 1);
        const y1 = Math.min(y0 + 1, cao - 1);
        const tx = Math.min(Math.max(fx - x0, 0), 1);
        const ty = Math.min(Math.max(fy - y0, 0), 1);
        for (const [sx, sy, w] of [
          [x0, y0, (1 - tx) * (1 - ty)],
          [x1, y0, tx * (1 - ty)],
          [x0, y1, (1 - tx) * ty],
          [x1, y1, tx * ty],
        ]) {
          const i = (sy * rong + sx) * 4;
          const al = diem[i + 3] / 255;
          r += diem[i] * al * w;
          g += diem[i + 1] * al * w;
          b += diem[i + 2] * al * w;
          a += diem[i + 3] * w;
        }
      }

      // Bo nhan truoc de tra ve RGBA thuong.
      const i = (y * dich + x) * 4;
      const al = a / 255;
      ra[i] = al > 0 ? Math.min(Math.round(r / al), 255) : 0;
      ra[i + 1] = al > 0 ? Math.min(Math.round(g / al), 255) : 0;
      ra[i + 2] = al > 0 ? Math.min(Math.round(b / al), 255) : 0;
      ra[i + 3] = Math.round(a);
    }
  }
  return ra;
}

// ── Mat na bo goc ────────────────────────────────────────────────────────────

/** Khoang cach am nghia la nam trong hinh vuong bo goc. */
function khoangCachToiVien(x, y, size, r) {
  const dx = Math.max(Math.abs(x - size / 2) - (size / 2 - r), 0);
  const dy = Math.max(Math.abs(y - size / 2) - (size / 2 - r), 0);
  return Math.hypot(dx, dy) - r;
}

/**
 * Do phu 0..1 cua tung diem. Lay mau 4x4 de duong cong o goc khong bi rang cua
 * — o co 16px thi mot buoc nhay mot diem la thay ro.
 */
function matNaBoGoc(size) {
  const MAU = 4;
  const r = size * BAN_KINH_GOC;
  const na = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let trong = 0;
      for (let sy = 0; sy < MAU; sy++) {
        for (let sx = 0; sx < MAU; sx++) {
          const px = x + (sx + 0.5) / MAU;
          const py = y + (sy + 0.5) / MAU;
          if (khoangCachToiVien(px, py, size, r) <= 0) trong += 1;
        }
      }
      na[y * size + x] = trong / (MAU * MAU);
    }
  }
  return na;
}

/**
 * THAY alpha bang mat na, khong phai nhan vao.
 *
 * Nhan vao thi cai vien ~150 cua anh nguon con nguyen, va vien icon se co mot
 * quang mo nhat quanh ca bon canh. Anh nguon la the dac nen mau RGB o moi diem
 * deu dung; hinh dang cua icon do mat na quyet dinh, khong phai do alpha cua
 * file nguon.
 */
function apMatNaBoGoc(rgba, size) {
  const na = matNaBoGoc(size);
  for (let i = 0; i < size * size; i++) rgba[i * 4 + 3] = Math.round(na[i] * 255);
  return rgba;
}

// ── Ghi PNG ──────────────────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const thanPhan = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(thanPhan));
  return Buffer.concat([len, thanPhan, crc]);
}

function ghiPng(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    rgba.copy(raw, p, y * size * 4, (y + 1) * size * 4);
    p += size * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bit moi kenh
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO ──────────────────────────────────────────────────────────────────────

/**
 * Bo anh PNG vao mot file .ico.
 *
 * Windows tu Vista tro di chap nhan PNG nhung nguyen trong .ico, khong bat buoc
 * phai la bitmap tho — nen khong can viet ma hoa BMP + mat na AND.
 */
function ico(cacAnh) {
  const soAnh = cacAnh.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // du tru
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(soAnh, 4);

  const muc = [];
  let offset = 6 + soAnh * 16;
  for (const { size, data } of cacAnh) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 nghia la 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // so mau trong bang mau
    e[3] = 0; // du tru
    e.writeUInt16LE(1, 4); // so mat phang mau
    e.writeUInt16LE(32, 6); // bit moi diem
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    muc.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...muc, ...cacAnh.map((a) => a.data)]);
}

// ── Chay ─────────────────────────────────────────────────────────────────────

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const nguon = join(goc, 'assets', 'logo.png');
const logo = docPng(readFileSync(nguon));

const thuMuc = join(goc, 'build');
mkdirSync(thuMuc, { recursive: true });

// Cat goc SAU khi doi co, khong phai truoc: lam o anh 192px roi thu nho thi
// duong cong bi lay mau lai lan hai va nhoe ra o cac co nho.
const cacAnh = CAC_CO.map((size) => ({
  size,
  data: ghiPng(size, apMatNaBoGoc(doiCo(logo, size), size)),
}));
const duongDan = join(thuMuc, 'icon.ico');
writeFileSync(duongDan, ico(cacAnh));

console.log(`da tao ${duongDan}  (nguon: assets/logo.png ${logo.rong}x${logo.cao})`);
for (const { size, data } of cacAnh) console.log(`  ${size}x${size}: ${data.length} byte`);
