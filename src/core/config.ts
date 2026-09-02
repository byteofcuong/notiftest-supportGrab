/**
 * Doc cau hinh tu .env va config/stores.json.
 *
 * Dung `process.loadEnvFile` co san cua Node (>= 20.12) thay vi them phu thuoc
 * dotenv — mot goi it hon la mot goi it phai theo doi.
 *
 * CHOT AN TOAN quan trong nhat o day: thieu URL hoac kho a API ccmany thi TU BAT
 * che do chay kho. Khong bao gio de xay ra canh app tuong dang gui that ma thuc
 * ra dang ban vao hu khong, hoac nguoc lai — ban vao that khi nguoi dung tuong
 * la dang thu.
 */

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { StoreConfig, StoresFile } from './types.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface AppConfig {
  ccmany: { url: string; apiKey: string };
  /**
   * CCMANY_STORE_ID trong .env — DI SAN cua thoi mot quan. null khi khong dat.
   *
   * Thoi mot quan, day la o NGUOI dien, vi mot ma ccmany la du. Nhieu quan thi
   * mot gia tri khong the dung cho tat ca: `ccmanyStoreID` vua la `store_id`
   * gui ccmany, VUA LA TEN FILE CACHE (`src/core/cache.ts`). Cho 14 quan cung
   * mot ma nghia la 14 poller cung ghi de len `data/cache/STORE1.json`, va tap
   * don da gui cua quan nay bi quan kia xoa — gui trung hoac mat don, am tham.
   *
   * Nen tu Task 3 ma quan mac dinh la `grabMerchantID` (von da duy nhat), con
   * gia tri nay CHI con tac dung khi dung MOT quan, de ban cai cu khong doi
   * `store_id` lan ten file cache sau khi cap nhat. Xem `loadStores()`.
   */
  ccmanyStoreID: string | null;
  /** true = chi ghi payload ra dia, KHONG cham mang. */
  dryRun: boolean;
  /** Ly do dang o che do kho, de hien thi cho nguoi dung. null neu gui that. */
  dryRunReason: string | null;
  telegram: TelegramConfig | null;

  pollIntervalMs: number;
  pollIntervalClosedMs: number;
  orderLookbackMinutes: number;
  maxOrderAttempts: number;
  pageReloadMinutes: number;
  watchdogMinutes: number;
  heartbeatMinutes: number;
  rawRetentionDays: number;
  orderNumberWithDate: boolean;
  /** Tu chay cung Windows. Chi co tac dung khi da dong goi thanh .exe. */
  autoStart: boolean;
  /** Chu dong ngat mang de thu tu phuc hoi. CHI dung khi phat trien. */
  devChaos: boolean;
  /** Thu goi API quan nay bang ma quan kia. Chi dung luc khao sat, xem thu-cheo.ts. */
  devThuCheo: boolean;
  /** Ghi lai moi loi goi API ma trang Grab tu goi. Chi dung luc khao sat. */
  devGhiMang: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** Goc cho data/cache, data/raw, data/dry-run. */
  dataDir: string;
  /** Canh bao ve cau hinh, de hien len giao dien / log. */
  warnings: string[];
}

/** Nhip poll toi thieu. Thap hon nua loi khong dang ke ma rui ro thi tang. */
const MIN_POLL_INTERVAL_MS = 3000;

export function loadEnvFile(path: string): void {
  boDauBOM(path);
  try {
    process.loadEnvFile(path);
  } catch {
    // Khong co .env cung chay duoc — moi thu deu co mac dinh, va chot an toan
    // se tu bat che do kho vi thieu kho a API.
  }
}

/**
 * Xoa dau BOM o dau file cau hinh.
 *
 * Nhieu cong cu tren Windows — Notepad ban cu, `Set-Content -Encoding utf8` cua
 * PowerShell 5.1 — chen ba byte BOM vao dau file UTF-8. Hau qua khac nhau tuy
 * file, va ca hai deu kho lan ra:
 *
 *   stores.json  ->  JSON.parse tu choi: "Unexpected token '﻿'"
 *   .env         ->  TE HON: bo doc cua Node coi kho a dau tien la
 *                    "﻿CCMANY_API_URL", tuc la thieu URL ma KHONG bao loi
 *                    gi ca — app am tham chay o che do kho.
 *
 * Nen doc, thay co BOM thi ghi lai khong BOM. Sua han o dia chu khong chi bo
 * qua luc doc: lan sau con nguoi hay cong cu khac mo file cung khoi vap.
 */
function boDauBOM(path: string): void {
  try {
    const noiDung = readFileSync(path, 'utf8');
    if (!noiDung.startsWith('﻿')) return;
    writeFileSync(path, noiDung.slice(1), 'utf8');
  } catch {
    // Khong doc/ghi duoc thi de nguyen; cho goi se bao loi cua no.
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = process.cwd()): AppConfig {
  const warnings: string[] = [];

  const url = (env.CCMANY_API_URL ?? '').trim();
  const apiKey = (env.CCMANY_API_KEY ?? '').trim();

  // Chua cau hinh xong thi khong duoc phep gui that, du DRY_RUN=false.
  let dryRun = readBool(env.DRY_RUN, true);
  let dryRunReason: string | null = dryRun ? 'DRY_RUN=true trong .env' : null;
  if (!url || !apiKey) {
    if (!dryRun) {
      warnings.push('Thieu CCMANY_API_URL hoac CCMANY_API_KEY — tu bat che do chay kho');
    }
    dryRun = true;
    dryRunReason = 'chua cau hinh CCMANY_API_URL / CCMANY_API_KEY';
  }

  const botToken = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID ?? '').trim();
  if ((botToken && !chatId) || (!botToken && chatId)) {
    warnings.push('Telegram chi cau hinh mot nua (thieu token hoac chat id) — bo qua Telegram');
  }
  const telegram = botToken && chatId ? { botToken, chatId } : null;

  const pollIntervalMs = readInt(env.POLL_INTERVAL_MS, 5000);
  if (pollIntervalMs < MIN_POLL_INTERVAL_MS) {
    warnings.push(`POLL_INTERVAL_MS=${pollIntervalMs} qua thap, nang len ${MIN_POLL_INTERVAL_MS}`);
  }

  return {
    ccmany: { url, apiKey },
    ccmanyStoreID: (env.CCMANY_STORE_ID ?? '').trim() || null,
    dryRun,
    dryRunReason,
    telegram,
    pollIntervalMs: Math.max(pollIntervalMs, MIN_POLL_INTERVAL_MS),
    pollIntervalClosedMs: readInt(env.POLL_INTERVAL_CLOSED_MS, 30_000),
    orderLookbackMinutes: readInt(env.ORDER_LOOKBACK_MINUTES, 15),
    maxOrderAttempts: readInt(env.MAX_ORDER_ATTEMPTS, 5),
    pageReloadMinutes: readInt(env.PAGE_RELOAD_MINUTES, 60),
    watchdogMinutes: readInt(env.WATCHDOG_MINUTES, 3),
    heartbeatMinutes: readInt(env.HEARTBEAT_MINUTES, 30),
    rawRetentionDays: readInt(env.RAW_RETENTION_DAYS, 14),
    orderNumberWithDate: readBool(env.ORDER_NUMBER_WITH_DATE, false),
    autoStart: readBool(env.AUTO_START, true),
    devChaos: readBool(env.DEV_CHAOS, false),
    devThuCheo: readBool(env.DEV_THU_CHEO, false),
    devGhiMang: readBool(env.DEV_GHI_MANG, false),
    logLevel: readLogLevel(env.LOG_LEVEL),
    dataDir: resolve(root, 'data'),
    warnings,
  };
}

/** Hai file cau hinh, duong dan tuong doi so voi goc. */
const FILE_CAU_HINH = ['.env', join('config', 'stores.json')] as const;

export interface ViTriCauHinh {
  /** File .env se doc. null khi ca hai noi deu khong co. */
  envFile: string | null;
  /** Thu muc chua config/stores.json se doc. */
  storesRoot: string;
  /** Viec da lam, de ghi vao nhat ky. */
  ghiChu: string[];
}

/**
 * Quyet dinh doc cau hinh o dau, va gieo no sang thu muc du lieu nguoi dung.
 *
 * ═══ VAN DE ═══
 *
 * Cau hinh (.env co kho a API, config/stores.json co ma quan) von nam CANH file
 * thuc thi. Ma cap nhat app la chep de nguyen ca thu muc — tuc la lan cap nhat
 * dau tien se XOA SACH cau hinh. Nhan vien mo len thay "CHAY KHO", khong ai
 * hieu vi sao, va cong cu im lang khong gui don nao nua.
 *
 * ═══ CACH XU LY ═══
 *
 * Giu mot ban o `%APPDATA%\grab-order-watcher\` — cho do khong bi dung toi khi
 * thay thu muc app.
 *
 *   co file canh .exe  ->  chep sang thu muc nguoi dung roi doc ban do
 *   khong co           ->  doc ban da luu o thu muc nguoi dung
 *   khong co ca hai    ->  khong co cau hinh (app tu bat che do chay kho)
 *
 * File nam canh .exe LUON THANG. Do la cai nguoi dung nhin thay va vua dat vao,
 * nen no phai co tac dung — "cai minh vua bo vao thi thang" la quy tac duy nhat
 * khong lam ai bat ngo.
 *
 * NGOAI LE: `config/stores.json` di kem ban cai la file RONG (ma quan do app tu
 * nhan dien, khong ai go tay). De no "thang" thi moi lan mo app se ghi de len
 * quan nguoi dung vua chon, va ho mat quan sau dung mot lan khoi dong lai. Nen
 * ban rong thi bo qua, khong gieo, khong thang.
 */
export function chuanBiCauHinh(thuMucApp: string, thuMucNguoiDung: string): ViTriCauHinh {
  const ghiChu: string[] = [];

  for (const rel of FILE_CAU_HINH) {
    const nguon = join(thuMucApp, rel);
    const dich = join(thuMucNguoiDung, rel);
    if (!laFile(nguon)) continue;
    if (!coNoiDung(rel, nguon)) continue;
    if (resolve(nguon) === resolve(dich)) continue;
    try {
      mkdirSync(dirname(dich), { recursive: true });
      copyFileSync(nguon, dich);
      ghiChu.push(`Da chep ${rel} sang ${thuMucNguoiDung} de cap nhat app khong lam mat`);
    } catch (err) {
      ghiChu.push(`Khong chep duoc ${rel} sang thu muc du lieu: ${(err as Error).message}`);
    }
  }

  const envNguoiDung = join(thuMucNguoiDung, '.env');
  const envApp = join(thuMucApp, '.env');
  let envFile: string | null = null;
  if (laFile(envNguoiDung)) envFile = envNguoiDung;
  else if (laFile(envApp)) envFile = envApp;

  const storesNguoiDung = join(thuMucNguoiDung, 'config', 'stores.json');
  const storesRoot = laFile(storesNguoiDung) ? thuMucNguoiDung : thuMucApp;


  return { envFile, storesRoot, ghiChu };
}

/**
 * File co du lieu that hay chi la vo rong di kem ban cai.
 *
 * Chi xet `config/stores.json`: ban di kem luon co mang `stores` voi ma quan
 * rong. Cac file khac (`.env`) thi nguoi dung tu dien nen co mat la co y nghia.
 */
function coNoiDung(rel: string, duongDan: string): boolean {
  if (!rel.endsWith('stores.json')) return true;
  try {
    const parsed = JSON.parse(
      readFileSync(duongDan, 'utf8').replace(/^﻿/, ''),
    ) as StoresFile;
    return (parsed.stores ?? []).some((s) => Boolean(s.grabMerchantID?.trim()));
  } catch {
    // Hong thi coi nhu khong co gi de gieo; loadStores se bao loi ro rang sau.
    return false;
  }
}

/**
 * CO File that su, khong phai chi "co gi do o duong dan nay".
 *
 * `existsSync` tra ve true cho ca thu muc. Neu o dich lo co mot THU MUC ten
 * `.env` — vi dun mot lan chep hong truoc do — thi coi no la cau hinh se dan
 * toi loi doc file kho hieu o tan cho khac. Da bi test bat dung loi nay.
 */
function laFile(duongDan: string): boolean {
  try {
    return statSync(duongDan).isFile();
  } catch {
    return false;
  }
}

/**
 * Chon thu muc ghi duoc cho data/.
 *
 * Ban dong goi mac dinh cai vao thu muc rieng cua nguoi dung nen ghi duoc.
 * Nhung neu ai do cai vao `C:\Program Files` thi thu muc do CHI DOC voi tai
 * khoan thuong — va cai kieu hong do la kieu te nhat: Logger nuot loi ghi file,
 * cache khong luu duoc, nen cong cu van chay ma khong de lai dau vet gi, va moi
 * lan khoi dong lai la gui trung toan bo don trong cua so 15 phut.
 *
 * Nen: thu ghi that mot file, khong duoc thi lui ve thu muc du lieu nguoi dung.
 */
export function chonThuMucGhiDuoc(
  uuTien: string,
  duPhong: string,
): { dir: string; canhBao: string | null } {
  if (ghiDuoc(uuTien)) return { dir: uuTien, canhBao: null };
  if (ghiDuoc(duPhong)) {
    return {
      dir: duPhong,
      canhBao: `Khong ghi duoc vao ${uuTien} - chuyen du lieu sang ${duPhong}`,
    };
  }
  // Ca hai deu hong thi van tra ve cho uu tien: de loi noi ra o dung cho thay
  // vi am tham dung mot duong dan khac cung khong ghi duoc.
  return { dir: uuTien, canhBao: `KHONG ghi duoc vao ${uuTien} lan ${duPhong}` };
}

function ghiDuoc(dir: string): boolean {
  const thu = join(dir, '.thu-ghi');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(thu, 'x', 'utf8');
    rmSync(thu, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Mot quan nguoi dung vua tick trong bang chon. */
export interface QuanDaChon {
  grabMerchantID: string;
  /** Ten that lay tu Grab. Thieu thi loadStores() hien ma quan thay cho ten. */
  storeName?: string;
}

/**
 * Ghi danh sach quan nguoi dung vua chon.
 *
 * Ghi de nguyen file: tu day tro di file nay do APP ghi chu khong phai nguoi
 * sua tay. Nguoi chi dong toi .env.
 *
 * KHONG ghi `ccmanyStoreID`: de trong thi `loadStores()` dien bang chinh
 * `grabMerchantID`. Ghi san o day se dong cung mot gia tri vao dia, va quy tac
 * "ma ccmany = ma quan Grab" sau nay muon doi thi phai sua file thay vi sua mot
 * cho trong ma nguon.
 *
 * Ghi qua file tam roi doi ten: mat dien giua chung se de lai mot stores.json
 * cut duoi, va tac hai dung bang mat sach lua chon — app mo len bao "chua chon
 * quan" va ngung nhan don cua ca 14 quan.
 */
export function luuDanhSachQuan(root: string, quan: QuanDaChon[]): void {
  const stores: StoreConfig[] = [];
  const daCo = new Set<string>();
  for (const q of quan) {
    const ma = q?.grabMerchantID?.trim();
    if (!ma || daCo.has(ma)) continue;
    daCo.add(ma);
    stores.push({
      grabMerchantID: ma,
      ccmanyStoreID: '',
      storeName: q.storeName?.trim() || '',
      enabled: true,
    });
  }

  // Danh sach rong la "khong theo doi quan nao" — gan nhu chac chan la loi goi
  // chu khong phai y nguoi dung. Nem de cho goi bao duoc, con hon ghi de len
  // lua chon dang chay bang mot file rong.
  if (stores.length === 0) {
    throw new Error('Danh sach quan rong — khong ghi de len lua chon dang co');
  }

  const thuMuc = join(root, 'config');
  mkdirSync(thuMuc, { recursive: true });
  const dich = join(thuMuc, 'stores.json');
  const tam = `${dich}.tmp`;
  writeFileSync(tam, `${JSON.stringify({ stores } satisfies StoresFile, null, 2)}\n`, 'utf8');
  renameSync(tam, dich);
}

/**
 * Doc config/stores.json.
 *
 * Tra ve mang RONG khi chua nhan dien duoc quan nao — do la trang thai binh
 * thuong cua lan chay dau, khong phai loi. App se hien "chua chon quan" thay vi
 * sap. Chi nem loi khi file that su hong.
 */
export function loadStores(
  root = process.cwd(),
  macDinh?: { ccmanyStoreID: string | null },
): StoreConfig[] {
  const path = join(root, 'config', 'stores.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Khong doc duoc ${path} — can it nhat mot quan de chay`);
  }

  let parsed: StoresFile;
  try {
    // Bo BOM neu co — xem boDauBOM() de biet vi sao no hay xuat hien.
    parsed = JSON.parse(raw.replace(/^﻿/, '')) as StoresFile;
  } catch (err) {
    throw new Error(`${path} khong phai JSON hop le: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed.stores)) {
    throw new Error(`${path} phai co mang "stores"`);
  }

  const dung = parsed.stores
    .filter((store) => store.enabled !== false)
    // Chua co ma quan = chua thiet lap xong. Bo qua, khong nem loi.
    .filter((store) => Boolean(store.grabMerchantID?.trim()));

  /**
   * CCMANY_STORE_ID chi duoc phep ap khi dung MOT quan.
   *
   * Mot ma cho nhieu quan la hong nang: `ccmanyStoreID` vua di vao payload
   * `store_id`, vua la ten file cache — 14 quan chung mot ten file thi tap don
   * da gui cua nhau bi ghi de. Con voi dung mot quan thi ap vao la giu nguyen
   * hanh vi ban cu sau khi cap nhat, khong doi `store_id` ma ccmany dang thay.
   */
  const diSan = dung.length === 1 ? macDinh?.ccmanyStoreID?.trim() : undefined;

  return dung.map((store) => ({
    ...store,
    grabMerchantID: store.grabMerchantID.trim(),
    // Hai truong nay chi de hien thi va de danh dau don ben ccmany. Thieu thi
    // lay mac dinh, khong chan app chay — chan o day nghia la mot o trong
    // trong file text lam ca cong cu ngung nhan don.
    ccmanyStoreID: store.ccmanyStoreID?.trim() || diSan || store.grabMerchantID.trim(),
    storeName: store.storeName?.trim() || store.grabMerchantID.trim(),
  }));
}

// ── Doc gia tri ──────────────────────────────────────────────────────────────

function readBool(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function readInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim());
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function readLogLevel(raw: string | undefined): AppConfig['logLevel'] {
  const value = raw?.trim().toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}
