/**
 * Gui tin sang Telegram: don da xu ly, va canh bao khi co su co.
 *
 * Doi chieu tien le: notiftest `network/TelegramOrderUploader.kt`.
 *
 * KHONG dung `parse_mode`. Ten mon va topping cua quan chua dau `*`, `_`, `(`,
 * `)`, emoji — Telegram se tu choi ca tin nhan voi HTTP 400 neu bat Markdown.
 * Ben notiftest da dam phai va ghi ro trong comment; khong dam lai.
 *
 * Telegram la kenh phu: hong thi ghi log roi di tiep, TUYET DOI khong duoc lam
 * hong luong gui don.
 */

import { formatVnd } from './money.js';
import type { CcmanyPayload } from './types.js';
import type { TelegramConfig } from './config.js';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface TelegramOptions {
  config: TelegramConfig | null;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 1000;
/** Telegram cat tin nhan o 4096 ky tu. */
const MAX_MESSAGE_LENGTH = 4000;

export class TelegramNotifier {
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TelegramOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get enabled(): boolean {
    return this.options.config !== null;
  }

  /** Bao mot don vua duoc xu ly. */
  async sendOrder(payload: CcmanyPayload, note?: string): Promise<boolean> {
    return this.send(formatOrder(payload, note));
  }

  /** Canh bao su co: mat phien, ccmany chet, poll dung... */
  async sendAlert(text: string): Promise<boolean> {
    return this.send(`⚠️ ${text}`);
  }

  /**
   * Tra ve true/false chu KHONG nem loi. Goi ham nay khong bao gio duoc lam
   * hong luong gui don.
   */
  async send(text: string): Promise<boolean> {
    const config = this.options.config;
    if (!config) return false;

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: config.chatId,
      text: text.slice(0, MAX_MESSAGE_LENGTH),
      // Khong parse_mode — xem chu thich dau file.
      disable_web_page_preview: true,
    });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) return true;
      } catch {
        // nuot: Telegram hong khong duoc lam hong viec chinh
      }
      if (attempt < this.maxAttempts) await this.sleep(RETRY_BACKOFF_MS);
    }
    return false;
  }
}

/** Tin nhan cho nguoi doc, khong phai JSON. */
export function formatOrder(payload: CcmanyPayload, note?: string): string {
  const lines: string[] = [];

  lines.push(`🧾 ${payload.order_code} · ${payload.store_name}`);
  if (note) lines.push(note);
  lines.push(`Luc ${payload.created_at}`);
  if (payload.customer.name) lines.push(`Khach: ${payload.customer.name}`);
  lines.push('');

  for (const item of payload.items) {
    lines.push(`${item.quantity}x ${item.name} — ${formatVnd(item.price)}`);
    for (const modifier of item.modifiers) {
      const price = modifier.price > 0 ? ` (+${formatVnd(modifier.price)})` : '';
      lines.push(`     • ${modifier.name}${price}`);
    }
    if (item.note) lines.push(`     ghi chu: ${item.note}`);
  }

  lines.push('');
  if (payload.subtotal !== null) lines.push(`Tam tinh: ${formatVnd(payload.subtotal)}`);
  if (payload.discount > 0) lines.push(`Giam: ${formatVnd(payload.discount)}`);
  if (payload.tax > 0) lines.push(`Thue: ${formatVnd(payload.tax)}`);
  if (payload.total !== null) lines.push(`TONG CONG: ${formatVnd(payload.total)}`);

  return lines.join('\n');
}
