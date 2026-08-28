/**
 * Sinh build/icon.ico tu code, khong dung file anh nguon.
 *
 * Vi sao ve bang code: mot file .ico nhi phan nam trong repo thi khong ai doc
 * duoc, khong ai sua duoc, va khong ai biet no tu dau ra. Ve bang code thi doi
 * mau hay doi hinh chi la sua vai dong roi chay lai.
 *
 * Hinh: hinh vuong bo goc mau xanh Grab, ben trong la con mat trang — cong cu
 * nay "theo doi" don, va con mat con doc duoc o co 16px, khac voi chu.
 *
 *   node scripts/make-icon.mjs
 */

import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const XANH = [0x00, 0xb1, 0x4f];
const TRANG = [0xff, 0xff, 0xff];
/** Cac co Windows thuc su dung: khay, thanh tac vu, cua so, Explorer. */
const CAC_CO = [16, 32, 48, 64, 128, 256];

// ── PNG ──────────────────────────────────────────────────────────────────────

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

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
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

// ── Hinh ─────────────────────────────────────────────────────────────────────

/** Hinh vuong bo goc: khoang cach am nghia la nam trong hinh. */
function trongVuongBoGoc(x, y, size, banKinhGoc) {
  const dx = Math.max(Math.abs(x - size / 2) - (size / 2 - banKinhGoc), 0);
  const dy = Math.max(Math.abs(y - size / 2) - (size / 2 - banKinhGoc), 0);
  return Math.hypot(dx, dy) - banKinhGoc;
}

/**
 * Con mat: phan giao cua hai duong tron, mot o tren mot o duoi.
 *
 * Cach nay cho ra hinh hanh nhan co dau nhon hai ben, giong mat that hon la
 * mot hinh elip — va o co 16px thi cai dau nhon do la thu giup nhan ra no.
 */
function trongMat(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;
  const lech = size * 0.28;
  const tren = Math.hypot(x - cx, y - (cy + lech)) - r;
  const duoi = Math.hypot(x - cx, y - (cy - lech)) - r;
  return Math.max(tren, duoi);
}

function trongConNguoi(x, y, size) {
  return Math.hypot(x - size / 2, y - size / 2) - size * 0.135;
}

/** Lay mau 4x4 moi diem de vien khong bi rang cua. */
function toMau(x, y, size) {
  const MAU = 4;
  let trongNen = 0;
  let trongTrang = 0;

  for (let sy = 0; sy < MAU; sy++) {
    for (let sx = 0; sx < MAU; sx++) {
      const px = x + (sx + 0.5) / MAU;
      const py = y + (sy + 0.5) / MAU;
      if (trongVuongBoGoc(px, py, size, size * 0.22) <= 0) trongNen += 1;
      // Trang = long trang mat, TRU di con nguoi.
      if (trongMat(px, py, size) <= 0 && trongConNguoi(px, py, size) > 0) trongTrang += 1;
    }
  }

  const tong = MAU * MAU;
  const alpha = Math.round((trongNen / tong) * 255);
  if (alpha === 0) return [0, 0, 0, 0];

  const tiLeTrang = trongTrang / tong;
  const mau = [0, 1, 2].map((i) => Math.round(XANH[i] * (1 - tiLeTrang) + TRANG[i] * tiLeTrang));
  return [mau[0], mau[1], mau[2], alpha];
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
const thuMuc = join(goc, 'build');
mkdirSync(thuMuc, { recursive: true });

const cacAnh = CAC_CO.map((size) => ({ size, data: png(size, toMau) }));
const duongDan = join(thuMuc, 'icon.ico');
writeFileSync(duongDan, ico(cacAnh));

console.log(`da tao ${duongDan}`);
for (const { size, data } of cacAnh) console.log(`  ${size}x${size}: ${data.length} byte`);
