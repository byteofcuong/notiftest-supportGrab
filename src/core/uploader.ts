/**
 * Gui don len API ccmany.
 *
 * Doi chieu tien le: notiftest `network/OrderApiUploader.kt`. Hai bai hoc bat
 * buoc mang sang:
 *  1. TIMEOUT la bat buoc. Thieu no thi mot ket noi treo se chan ca hang doi
 *     xu ly don — im lang, khong loi, khong ai biet.
 *  2. Thu lai co gian cach, khong thu lien tuc.
 *
 * Mot cho lam KHAC notiftest, co chu y: **khong thu lai voi loi 4xx**. Ben do
 * thu lai moi loi; nhung 400/401/403/422 la loi phia minh — payload sai, kho a
 * sai — thu them ba lan chi ton 4,5 giay va lam ban log, khong bao gio thanh
 * cong. Chi thu lai voi loi mang, timeout, 5xx va 429.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CcmanyPayload } from './types.js';

export interface UploadResult {
  ok: boolean;
  /** So lan thuc su goi mang. 0 khi chay kho. */
  attempts: number;
  /** Da ghi ra dia thay vi gui that. */
  dryRun: boolean;
  /** Duong dan file khi chay kho. */
  file?: string;
  error?: string;
  /** false khi loi thuoc loai khong bao gio thu lai duoc (vd payload sai). */
  retryable?: boolean;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface UploaderOptions {
  url: string;
  apiKey: string;
  dryRun: boolean;
  dataDir: string;
  maxAttempts?: number;
  timeoutMs?: number;
  /** Cho test tiem fetch gia va bo qua cho doi. */
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 1500;

export class CcmanyUploader {
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: UploaderOptions) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
  }

  async upload(payload: CcmanyPayload): Promise<UploadResult> {
    if (this.options.dryRun) return this.writeDryRun(payload);

    const body = JSON.stringify(payload);
    let last: UploadResult | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const result = await this.post(body, attempt);
      if (result.ok) return result;

      last = result;
      if (result.retryable === false) return result; // vo ich, dung ngay
      if (attempt < this.maxAttempts) await this.sleep(RETRY_BACKOFF_MS * attempt);
    }

    return last ?? { ok: false, attempts: 0, dryRun: false, error: 'khong thu lan nao' };
  }

  private async post(body: string, attempt: number): Promise<UploadResult> {
    try {
      const response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.options.apiKey,
        },
        body,
        // Khong co timeout thi mot ket noi treo chan ca hang doi mai mai.
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) return { ok: true, attempts: attempt, dryRun: false };

      const text = await safeText(response);
      return {
        ok: false,
        attempts: attempt,
        dryRun: false,
        error: `HTTP ${response.status}: ${text}`,
        retryable: isRetryableStatus(response.status),
      };
    } catch (err) {
      // Loi mang / timeout / DNS — deu dang thu lai.
      return {
        ok: false,
        attempts: attempt,
        dryRun: false,
        error: (err as Error).message,
        retryable: true,
      };
    }
  }

  /**
   * Che do chay kho: ghi payload ra dia, KHONG goi mang lan nao. Dung cho toi
   * khi doi chieu xong payload voi man hinh Grab.
   */
  private writeDryRun(payload: CcmanyPayload): UploadResult {
    const dir = join(this.options.dataDir, 'dry-run');
    mkdirSync(dir, { recursive: true });

    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${stamp}-${safeName(payload.order_code)}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');

    return { ok: true, attempts: 0, dryRun: true, file };
  }
}

/**
 * 4xx (tru 408 va 429) la loi cua minh — payload sai hoac kho a sai. Thu lai
 * khong bao gio thanh cong, chi ton thoi gian va lam ban log.
 */
function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '(khong doc duoc than phan hoi)';
  }
}

function safeName(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]/g, '_') || 'khong-ro';
}
