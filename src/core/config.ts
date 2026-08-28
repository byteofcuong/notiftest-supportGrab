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

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StoreConfig, StoresFile } from './types.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface AppConfig {
  ccmany: { url: string; apiKey: string };
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
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** Goc cho data/cache, data/raw, data/dry-run. */
  dataDir: string;
  /** Canh bao ve cau hinh, de hien len giao dien / log. */
  warnings: string[];
}

/** Nhip poll toi thieu. Thap hon nua loi khong dang ke ma rui ro thi tang. */
const MIN_POLL_INTERVAL_MS = 3000;

export function loadEnvFile(path: string): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // Khong co .env cung chay duoc — moi thu deu co mac dinh, va chot an toan
    // se tu bat che do kho vi thieu kho a API.
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
    logLevel: readLogLevel(env.LOG_LEVEL),
    dataDir: resolve(root, 'data'),
    warnings,
  };
}

/** Doc config/stores.json. Nem loi neu hong — khong co quan thi khong chay duoc. */
export function loadStores(root = process.cwd()): StoreConfig[] {
  const path = join(root, 'config', 'stores.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Khong doc duoc ${path} — can it nhat mot quan de chay`);
  }

  let parsed: StoresFile;
  try {
    parsed = JSON.parse(raw) as StoresFile;
  } catch (err) {
    throw new Error(`${path} khong phai JSON hop le: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed.stores)) {
    throw new Error(`${path} phai co mang "stores"`);
  }

  const stores = parsed.stores.filter((store) => store.enabled !== false);
  for (const [index, store] of stores.entries()) {
    for (const field of ['grabMerchantID', 'ccmanyStoreID', 'storeName'] as const) {
      if (!store[field]?.trim()) {
        throw new Error(`stores[${index}] thieu "${field}"`);
      }
    }
  }

  if (stores.length === 0) {
    throw new Error(`${path} khong co quan nao dang bat`);
  }
  return stores;
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
