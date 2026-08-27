/**
 * Cua so giu phien Grab.
 *
 * Vai tro DUY NHAT cua cua so nay la giu cookie dang nhap. Toan bo logic (poll,
 * loc, bien doi, gui) nam o tien trinh chinh. Trang web khong tu lam gi cho
 * minh — minh chi muon phien cua no.
 *
 * Mac dinh AN. Chi hien ra khi can dang nhap, hoac khi nguoi dung bam
 * "Mo trang Grab".
 */

import { BrowserWindow, session, app } from 'electron';
import type { Logger } from '../core/log.js';

/** Phien rieng, luu xuong dia trong userData/Partitions/grab. */
const PARTITION = 'persist:grab';

const ORDERS_URL = (merchantID: string) =>
  `https://merchant.grab.com/order/${merchantID}/preparing`;

export interface GrabWindowOptions {
  merchantID: string;
  logger: Logger;
}

export class GrabWindow {
  private window: BrowserWindow | null = null;
  private quitting = false;

  constructor(private readonly options: GrabWindowOptions) {}

  /**
   * Bo chuoi nhan dang Electron khoi user-agent.
   *
   * UA mac dinh cua Electron co dang:
   *   ... grab-order-watcher/0.1.0 Chrome/140.0.0.0 Electron/44.0.0 Safari/537.36
   * Hai chuoi "<ten app>/<phien ban>" va "Electron/<phien ban>" khong trinh
   * duyet that nao co. Bo di thi con lai dung UA Chrome binh thuong, va van giu
   * NGUYEN phien ban Chrome that — khong bia so.
   */
  static plainUserAgent(raw: string, appName: string): string {
    return raw
      .replace(new RegExp(`\\s*${escapeRegExp(appName)}/[\\d.]+`), '')
      .replace(/\s*Electron\/[\d.]+/, '')
      .trim();
  }

  /** Goi MOT LAN truoc khi tao cua so. */
  static applyUserAgent(logger: Logger): void {
    const before = app.userAgentFallback;
    const after = GrabWindow.plainUserAgent(before, app.getName());
    app.userAgentFallback = after;

    logger.info('User-agent', { truoc: before, sau: after });
    if (/Electron\//i.test(after)) {
      logger.warn('User-agent VAN con chuoi Electron — Grab co the xu ly khac di');
    }
  }

  async open(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: 1280,
      height: 860,
      show: false, // an cho toi khi can
      title: 'Grab Merchant',
      webPreferences: {
        partition: PARTITION,
        // Chromium bop co hen gio cua tab chay nen xuong ~1 lan/phut. Vong lap
        // poll nam o Node nen khong bi anh huong, nhung tat o day cho chac —
        // trang van phai chay binh thuong de giu phien.
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Nguoi dung dong cua so thi chi AN di, khong huy — huy la mat luon cho
    // chay fetch, va lan sau phai tao lai tu dau.
    window.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      window.hide();
    });

    window.webContents.on('did-finish-load', () => {
      this.options.logger.debug('Trang Grab tai xong', { url: window.webContents.getURL() });
    });

    window.webContents.on('did-fail-load', (_e, code, description, url) => {
      // -3 la ERR_ABORTED, xay ra binh thuong khi trang tu chuyen huong.
      if (code === -3) return;
      this.options.logger.warn('Tai trang Grab that bai', { code, description, url });
    });

    this.window = window;
    await window.loadURL(ORDERS_URL(this.options.merchantID));
    return window;
  }

  /** Hien cua so ra de nguoi dung dang nhap bang tay. */
  async show(): Promise<void> {
    const window = await this.open();
    window.show();
    window.focus();
  }

  hide(): void {
    this.window?.hide();
  }

  /** URL hien tai — dung de doan xem con phien hay da bi da ve trang dang nhap. */
  currentUrl(): string | null {
    if (!this.window || this.window.isDestroyed()) return null;
    return this.window.webContents.getURL();
  }

  /**
   * Trang da tai ve tren mien merchant.grab.com hay chua.
   *
   * CO Y KHONG goi day la "da dang nhap". Da thu voi phien hoan toan trong:
   * URL van dung nguyen o /order/{mexID}/preparing, khong he chuyen huong —
   * Grab la SPA nen no ve man hinh dang nhap ma khong doi URL. Suy ra trang
   * thai dang nhap tu URL la SAI, va sai theo huong nguy hiem nhat: bao xanh
   * trong khi thuc te khong co phien.
   *
   * Cach duy nhat dang tin la goi that mot endpoint va xem co 401 khong —
   * lam o Task 7.
   */
  pageLoaded(): boolean {
    const url = this.currentUrl();
    return url !== null && url.includes('merchant.grab.com');
  }

  async reload(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.reload();
  }

  /** Duong dan tren dia noi cookie phien duoc luu. */
  static partitionPath(): string {
    return session.fromPartition(PARTITION).getStoragePath() ?? '(khong xac dinh)';
  }

  /** Cho phep dong that su khi app thoat. */
  allowClose(): void {
    this.quitting = true;
  }

  destroy(): void {
    this.allowClose();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
