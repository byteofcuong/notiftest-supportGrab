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
 *
 * ═══ HANG CHO GUI MUON ═══
 * Su co dang lo nhat cua cong cu nay la MAT MANG. Ma canh bao ve mat mang thi
 * lai phai gui qua mang. Khong co hang cho thi dung luc can bao nhat la luc
 * chac chan bao khong toi — da dam phai trong lua thu Task 10: rut mang, khong
 * co mot tin Telegram nao ca, va sau khi mang ve cung khong co not.
 *
 * Nen: gui hong thi giu lai, khi mang ve thi gui bu, co ghi ro gio phat sinh.
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
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 1000;
/** Telegram cat tin nhan o 4096 ky tu. */
const MAX_MESSAGE_LENGTH = 4000;
/**
 * Tran hang cho gui muon.
 *
 * Co tran vi mot lan mat mang ca dem se sinh ra hang tram canh bao, ma gui bu
 * ca tram tin luc 7 gio sang thi khong ai doc — chi lam nguoi ta tat bot di.
 * Giu nhung tin CU NHAT: cai dau tien moi la cai noi ro su co bat dau luc nao.
 */
const MAX_HANG_CHO = 20;

export class TelegramNotifier {
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  /** Tin gui hong, cho mang ve de gui bu. */
  private hangCho: { text: string; luc: number }[] = [];
  /** So tin da bi bo vi hang cho day, de noi that trong tin gui bu. */
  private soTinDaBo = 0;
  private dangGuiBu = false;

  constructor(private readonly options: TelegramOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? Date.now;
  }

  /** So tin dang nam cho gui bu. Hien len giao dien. */
  get soTinChoGui(): number {
    return this.hangCho.length;
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
    if (!this.options.config) return false;
    const ok = await this.guiThat(text);
    if (!ok) this.xepHang(text);
    return ok;
  }

  /**
   * Gui bu nhung tin da hong.
   *
   * Goi khi CO CO SO tin la mang da ve (mot luot poll vua thanh cong). Goi bua
   * trong luc van mat mang thi moi tin ton toi 20 giay cho het thoi gian cho,
   * va hang cho chi dai them.
   *
   * Gap loi thi DUNG NGAY, giu nguyen phan con lai: van con mat mang that.
   */
  async guiBu(): Promise<number> {
    if (!this.options.config || this.hangCho.length === 0 || this.dangGuiBu) return 0;

    this.dangGuiBu = true;
    let daGui = 0;
    try {
      if (this.soTinDaBo > 0) {
        const bo = this.soTinDaBo;
        this.soTinDaBo = 0;
        if (!(await this.guiThat(`⚠️ Da bo ${bo} canh bao vi hang cho day`))) {
          this.soTinDaBo = bo;
          return 0;
        }
      }
      while (this.hangCho.length > 0) {
        const tin = this.hangCho[0]!;
        if (!(await this.guiThat(`(gui muon, phat sinh luc ${gioVN(tin.luc)})
${tin.text}`))) {
          break;
        }
        this.hangCho.shift();
        daGui += 1;
      }
    } finally {
      this.dangGuiBu = false;
    }
    return daGui;
  }

  private xepHang(text: string): void {
    if (this.hangCho.length >= MAX_HANG_CHO) {
      // Day thi bo tin MOI, giu tin cu: tin dau tien moi noi duoc su co bat dau
      // luc nao, con tin thu 50 chi lap lai dieu da biet.
      this.soTinDaBo += 1;
      return;
    }
    this.hangCho.push({ text, luc: this.now() });
  }

  private async guiThat(text: string): Promise<boolean> {
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

function gioVN(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
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
