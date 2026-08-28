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
  /** Goi khi cua so Grab an di, de dua nguoi dung ve bang dieu khien. */
  onHidden?: () => void;
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
      this.hide();
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

  /**
   * Mo lai cua so neu no da bi huy vi bat cu ly do gi.
   *
   * Khong co luoi nay thi mot lan cua so bi huy la cong cu chet han: moi loi
   * goi API bao "chua san sang" va khong co gi mo lai no. Da tung xay ra
   * that: mot nut chen vao trang Grab goi window.close(), va event
   * .preventDefault() trong su kien 'close' KHONG chan duoc — cua so van bi
   * huy. Nut do da bo, nhung luoi nay thi giu.
   */
  async ensureOpen(): Promise<boolean> {
    if (this.runner()) return false;
    this.options.logger.warn('Cua so Grab da bi huy - dang mo lai');
    this.window = null;
    await this.open();
    return true;
  }

  /** Hien cua so ra de nguoi dung dang nhap bang tay. */
  async show(): Promise<void> {
    const window = await this.open();
    window.show();
    window.focus();
  }

  hide(): void {
    this.window?.hide();
    this.options.onHidden?.();
  }

  /**
   * webContents de GrabClient chay fetch trong do. null khi cua so chua san
   * sang hoac da bi huy — client se bao loi ro rang thay vi sap.
   */
  runner(): Electron.WebContents | null {
    if (!this.window || this.window.isDestroyed()) return null;
    return this.window.webContents;
  }


  /**
   * Ep Chromium ghi cookie xuong dia ngay.
   *
   * Chromium giu cookie trong bo nho va chi ghi xuong theo chu ky hoac khi
   * thoat sach. Neu tien trinh bi giet cung — mat dien, Windows Update ep tat,
   * ai do End Task — thi phan chua kip ghi se mat, va lan chay sau nguoi dung
   * bi da ra trang dang nhap ma khong hieu vi sao.
   *
   * (Da dam phai trong lua chay thu Task 8: giet cung vai lan lien tiep thi
   * phien Grab bien mat.)
   */
  async luuPhien(): Promise<void> {
    try {
      await session.fromPartition(PARTITION).flushStorageData();
      this.options.logger.debug('Da ghi phien xuong dia');
    } catch (err) {
      this.options.logger.warn('Khong ghi duoc phien xuong dia', err);
    }
  }

  /** URL hien tai — dung de doan xem con phien hay da bi da ve trang dang nhap. */
  currentUrl(): string | null {
    if (!this.window || this.window.isDestroyed()) return null;
    return this.window.webContents.getURL();
  }

  /**
   * Trang da tai ve tren mien merchant.grab.com hay chua.
   *
   * CO Y KHONG goi day la "da dang nhap".
   *
   * Khi mat phien, Grab CO chuyen huong sang trang dang nhap — nhung khong
   * chuyen ngay. Trang tai xong truoc, roi JS moi kiem tra phien va chuyen
   * huong sau do. Doc URL ngay sau loadURL() thi van thay /order/{mexID}/
   * preparing va tuong la con phien: bao xanh trong khi thuc te da mat.
   * (Da dam phai dung loi nay o lan chay thu dau tien cua Task 6.)
   *
   * Suy ra trang thai dang nhap tu URL nghia la dua vao mot cuoc dua thoi
   * gian. Cach dang tin duy nhat la goi that mot endpoint va xem co 401
   * khong — GrabClient lam viec do.
   */
  pageLoaded(): boolean {
    const url = this.currentUrl();
    return url !== null && url.includes('merchant.grab.com');
  }

  /**
   * Tai lai trang va CHO tai xong.
   *
   * Phai cho: nguoi goi (watchdog, tai lai dinh ky) deu kiem tra ket noi ngay
   * sau do, ma goi fetch vao mot trang dang chuyen huong thi that bai — se bao
   * "mat phien" trong khi that ra chi la goi qua som.
   *
   * Co tran thoi gian de mot trang khong bao gio tai xong (mat mang giua chung)
   * khong treo luon dong ho goi no.
   */
  async reload(timeoutMs = 30_000): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed()) return;

    await new Promise<void>((resolve) => {
      let xong = false;
      const ketThuc = (): void => {
        if (xong) return;
        xong = true;
        clearTimeout(hen);
        window.webContents.off('did-stop-loading', ketThuc);
        resolve();
      };
      const hen = setTimeout(() => {
        this.options.logger.warn(`Trang Grab chua tai xong sau ${timeoutMs / 1000}s - di tiep`);
        ketThuc();
      }, timeoutMs);

      window.webContents.once('did-stop-loading', ketThuc);
      window.webContents.reload();
    });
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
