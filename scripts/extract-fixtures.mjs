// Trich response JSON that tu cac file HAR ra test/fixtures/, co AN DANH.
//
// Chay:  npm run fixtures
//
// LUU Y ve nguon: example/har/*.har da bi gitignore vi chua ten + so dien thoai
// khach that. Nhung test/fixtures/*.json thi DUOC COMMIT — nen script nay phai
// thay moi truong PII bang du lieu gia truoc khi ghi. Day la dung cach notiftest
// lam voi cac dump uiautomator cua no ("customer name / phone / address
// anonymised" — app/src/test/resources/dump_xsm8420.xml).
//
// Vi HAR khong co trong repo, mot ban clone moi se KHONG chay lai duoc script
// nay. Do la binh thuong: fixture da nam san trong repo, test khong can HAR.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HAR_DIR = join(ROOT, 'example', 'har');
const OUT_DIR = join(ROOT, 'test', 'fixtures');

// ── An danh ──────────────────────────────────────────────────────────────────
// Gia tri co dinh (khong ngau nhien) de test co the khang dinh thang vao chung
// va de chay lai script khong tao ra diff vo nghia.
const FAKE_EATER = {
  ID: 100000001,
  name: 'Khach Test',
  mobileNumber: '+84 9000 0000 0',
};

function anonymise(node) {
  if (Array.isArray(node)) return node.map(anonymise);
  if (node === null || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'eater' && value && typeof value === 'object') {
      // Giu nguyen moi truong khac cua eater (vd `comment` — ghi chu don, la
      // du lieu test co ich va khong dinh danh ai).
      out[key] = { ...anonymise(value), ...pickExisting(value, FAKE_EATER) };
    } else {
      out[key] = anonymise(value);
    }
  }
  return out;
}

/** Chi ghi de nhung khoa that su co mat, de khong bia them truong moi. */
function pickExisting(original, replacements) {
  const out = {};
  for (const [key, value] of Object.entries(replacements)) {
    if (key in original) out[key] = value;
  }
  return out;
}

// ── Doc HAR ──────────────────────────────────────────────────────────────────
function loadHar(name) {
  return JSON.parse(readFileSync(join(HAR_DIR, name), 'utf8'));
}

function bodyOf(entry) {
  const content = entry.response.content;
  const text =
    content.encoding === 'base64'
      ? Buffer.from(content.text, 'base64').toString('utf8')
      : content.text;
  return JSON.parse(text);
}

/** Tim entry dau tien khop, va NEM LOI neu khong thay — khong im lang bo qua. */
function findEntry(har, harName, predicate, description) {
  const entry = har.log.entries.find(
    (e) => e.request.method === 'GET' && predicate(e),
  );
  if (!entry) {
    throw new Error(`Khong tim thay ${description} trong ${harName}`);
  }
  return entry;
}

const isList = (e) => e.request.url.includes('PageType=PreparingV2');
const isDetail = (e) => e.request.url.includes('/food/merchant/v3/orders/');
const isOpenStatus = (e) => e.request.url.includes('/food/merchant/v3/open-status');

// ── Trich ────────────────────────────────────────────────────────────────────
const har1 = loadHar('1.har');
const har2 = loadHar('2.har');

const fixtures = {
  // Danh sach co 1 don, khong topping.
  'list-gf666.json': bodyOf(
    findEntry(har1, '1.har', (e) => isList(e) && e.response.content.size > 2000,
      'danh sach PreparingV2 co don'),
  ),
  // Chi tiet GF-666: 3 mon, tong 141.000, khong topping, khong khuyen mai theo mon.
  'detail-gf666.json': bodyOf(findEntry(har1, '1.har', isDetail, 'chi tiet don')),

  // Danh sach co 1 don.
  'list-gf547.json': bodyOf(
    findEntry(har2, '2.har', (e) => isList(e) && e.response.content.size > 2000,
      'danh sach PreparingV2 co don'),
  ),
  // Chi tiet GF-547: 5 mon, 2 mon CO TOPPING, tong 121.000. Fixture quan trong nhat.
  'detail-gf547.json': bodyOf(findEntry(har2, '2.har', isDetail, 'chi tiet don')),

  // Danh sach rong — pollInterval 300 (Grab giai nhip khi khong co don).
  'list-empty.json': bodyOf(
    findEntry(har1, '1.har', (e) => isList(e) && e.response.content.size < 200,
      'danh sach PreparingV2 rong'),
  ),
  // Trang thai quan: dang mo cua.
  'open-status.json': bodyOf(findEntry(har1, '1.har', isOpenStatus, 'open-status')),
};

// ── Ghi ra ───────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const PII_PATTERN = /Nguy|0364|9125/i; // dau vet cua du lieu that trong hai HAR nay

for (const [name, raw] of Object.entries(fixtures)) {
  const clean = anonymise(raw);
  const json = JSON.stringify(clean, null, 2) + '\n';

  // Chot an toan: khong bao gio ghi ra file con dau vet PII that.
  if (PII_PATTERN.test(json)) {
    throw new Error(`${name} van con du lieu that sau khi an danh — dung lai`);
  }

  writeFileSync(join(OUT_DIR, name), json, 'utf8');
  console.log(`  ${name.padEnd(22)} ${json.length.toString().padStart(7)} bytes`);
}

console.log(`\nDa ghi ${Object.keys(fixtures).length} fixture vao test/fixtures/`);
