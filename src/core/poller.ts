/**
 * Vong lap theo doi don cua MOT quan.
 *
 * Moi nhip: lay danh sach -> loc ra don chua tung gap -> lay chi tiet -> luu
 * JSON tho -> bien doi -> gui ccmany -> ghi cache.
 *
 * Ba nguyen tac khong duoc pha:
 *
 *  1. **Ghi cache SAU khi gui thanh cong.** Ghi truoc ma POST hong thi don do
 *     vinh vien khong bao gio duoc gui lai.
 *  2. **Loi cua mot don khong duoc lam chet vong lap.** Mot don du lieu la
 *     khong duoc keo theo ca quan ngung hoat dong.
 *  3. **Hen gio nam o Node, khong nam trong trang.** Chromium bop co
 *     setTimeout cua tab chay nen xuong ~1 lan/phut.
 *
 * Dung chuoi setTimeout chu khong phai setInterval: mot nhip cham khong duoc
 * phep chong len nhip sau.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GrabClient, SessionExpiredError } from '../grab/client.js';
import { mapOrder } from './mapper.js';
import type { OrderCache } from './cache.js';
import type { CcmanyUploader } from './uploader.js';
import type { TelegramNotifier } from './telegram.js';
import type { Logger } from './log.js';
import type { AppConfig } from './config.js';
import type { StoreConfig } from './types.js';

export type PollerState = 'dung' | 'dang-chay' | 'mat-phien' | 'loi';

export interface PollerStats {
  state: PollerState;
  /** Luot poll thanh cong gan nhat. Watchdog o Task 10 dua vao moc nay. */
  lastPollAt: string | null;
  lastError: string | null;
  quanDangMo: boolean | null;
  soDonHomNay: number;
  donGanNhat: { orderCode: string; total: number | null; at: string } | null;
}

export interface PollerDeps {
  store: StoreConfig;
  config: AppConfig;
  client: GrabClient;
  cache: OrderCache;
  uploader: CcmanyUploader;
  telegram: TelegramNotifier;
  logger: Logger;
  /**
   * Hoan nhip DAU TIEN lai bay nhieu ms. Mac dinh 0 — poll ngay khi start().
   *
   * De 14 quan khong ban `orders-pagination` cung mot khoanh khac, cu 5 giay
   * mot lan. Do lech tao ra o nhip dau duoc giu nguyen ve sau, vi tu do moi
   * poller tu noi chuoi setTimeout cua rieng no.
   *
   * De o day chu khong phai o cho goi start(): nguoi dung bam Tam dung roi bam
   * Tiep tuc se lam ca 14 poller khoi dong lai cung luc, va do lech rai duoc
   * luc khoi dong mat sach.
   */
  khoiDauTreMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

/** Chi hoi trang thai mo/dong nhieu nhat mot lan moi ngan nay. */
const OPEN_STATUS_TTL_MS = 60_000;

export class StorePoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private state: PollerState = 'dung';

  private lastPollAt: number | null = null;
  private lastError: string | null = null;
  private quanDangMo: boolean | null = null;
  private openStatusCheckedAt = 0;

  private donHomNay = new Map<string, number>();
  private donGanNhat: PollerStats['donGanNhat'] = null;

  /** Luc bat dau gap su co, de noi duoc "da hong bao lau" khi phuc hoi. */
  private hongTu: number | null = null;

  /** Dang lay chi tiet / gui mot don. Task 10 dua vao day de hoan reload trang. */
  private dangXuLyDon = false;

  /** So lan da thu moi don loi, de bo cuoc sau MAX_ORDER_ATTEMPTS. */
  private attempts = new Map<string, number>();
  /** Nhung don da bo cuoc — khong thu lai, khong bao lai. */
  private daBoCuoc = new Set<string>();

  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (timer: NodeJS.Timeout) => void;

  constructor(private readonly deps: PollerDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.state = 'dang-chay';
    this.deps.logger.info(`[${this.deps.store.ccmanyStoreID}] Bat dau theo doi`, {
      quan: this.deps.store.grabMerchantID,
      nhip: this.deps.config.pollIntervalMs,
      khoiDongLanh: this.deps.cache.coldStart,
    });
    if (this.deps.cache.coldStart) {
      this.deps.logger.warn(
        `[${this.deps.store.ccmanyStoreID}] Khoi dong lanh - chi nhan don trong ${this.deps.config.orderLookbackMinutes} phut gan nhat`,
      );
    }
    const tre = this.deps.khoiDauTreMs ?? 0;
    if (tre > 0) this.timer = this.setTimer(() => void this.loop(), tre);
    else void this.loop();
  }

  stop(): void {
    this.running = false;
    this.state = 'dung';
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /**
   * Dang o giua chung viec xu ly mot don.
   *
   * Reload trang Grab lam huy moi fetch dang chay trong do, nen phai hoan lai
   * khi co dai. Mot don den cham vai phut con hon mot don mat han.
   */
  get dangBan(): boolean {
    return this.dangXuLyDon;
  }

  /**
   * Quan ma poller nay theo doi.
   *
   * De cho nao cam mot danh sach poller (Resilience, khay) lay duoc ten quan ma
   * khong phai giu them mot mang StoreConfig song song — hai mang song song la
   * hai mang se lech nhau.
   */
  get store(): StoreConfig {
    return this.deps.store;
  }

  /** Moc poll thanh cong gan nhat, ms. Watchdog dua vao day. */
  get lastPollAtMs(): number | null {
    return this.lastPollAt;
  }

  get stats(): PollerStats {
    return {
      state: this.state,
      lastPollAt: this.lastPollAt === null ? null : new Date(this.lastPollAt).toISOString(),
      lastError: this.lastError,
      quanDangMo: this.quanDangMo,
      soDonHomNay: this.donHomNay.get(this.dayKey()) ?? 0,
      donGanNhat: this.donGanNhat,
    };
  }

  private async loop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.tick();
    } catch (err) {
      // Chot cuoi: khong loi nao duoc thoat ra khoi vong lap.
      this.lastError = (err as Error).message;
      this.deps.logger.error(`[${this.deps.store.ccmanyStoreID}] Loi ngoai du kien`, err);
    }

    if (!this.running) return;
    this.timer = this.setTimer(() => void this.loop(), this.nextDelayMs());
  }

  /** Mot nhip. Tach rieng de test goi truc tiep, khong phai cho hen gio. */
  async tick(): Promise<void> {
    const { store, client, logger } = this.deps;

    try {
      await this.refreshOpenStatus();
      const list = await client.listPreparing(store.grabMerchantID);
      const truocDo = this.state;
      this.lastPollAt = this.now();
      this.state = 'dang-chay';
      this.lastError = null;
      if (truocDo === 'loi' || truocDo === 'mat-phien') this.baoPhucHoi(truocDo);

      const orders = list.orders ?? [];
      // Muc debug: nhip thanh cong ma khong co don thi khong ghi gi ca, nen khi
      // can xac minh "poller con song khong" thi bat LOG_LEVEL=debug.
      logger.debug(`[${store.ccmanyStoreID}] nhip poll OK - ${orders.length} don trong tab`);

      this.dangXuLyDon = true;
      try {
        for (const summary of orders) {
          if (!summary.orderID) continue;
          await this.xuLyDon(summary.orderID, summary.times?.createdAt ?? null, summary.displayID);
        }
      } finally {
        this.dangXuLyDon = false;
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await this.baoMatPhien(err);
        return;
      }
      if (this.state !== 'loi') this.hongTu = this.now();
      this.state = 'loi';
      this.lastError = (err as Error).message;
      logger.warn(`[${store.ccmanyStoreID}] Poll that bai`, err);
    }
  }

  // ── Mot don ────────────────────────────────────────────────────────────────

  private async xuLyDon(
    orderID: string,
    createdAt: string | null,
    displayID: string | undefined,
  ): Promise<void> {
    const { store, cache, client, uploader, telegram, logger, config } = this.deps;
    const nhan = `[${store.ccmanyStoreID}] ${displayID ?? orderID}`;

    if (this.daBoCuoc.has(orderID)) return;

    const decision = cache.decide(orderID, createdAt);
    if (!decision.send) {
      // 'da-gui' xay ra moi luot poll cho moi don con nam trong tab, nen chi
      // ghi o muc debug. 'cu-hon-cua-so' thi hiem va dang de y.
      if (decision.reason === 'cu-hon-cua-so') {
        logger.info(`${nhan} bo qua: ${decision.detail}`);
      } else {
        logger.debug(`${nhan} da gui roi`);
      }
      return;
    }

    logger.info(`${nhan} DON MOI - dang lay chi tiet`);

    try {
      const detail = await client.orderDetail(store.grabMerchantID, orderID);

      // Luu JSON tho TRUOC khi bien doi: Grab doi API thi day la thu duy nhat
      // con lai de sua mapper.
      this.luuJsonTho(orderID, detail);

      const { payload, warnings } = mapOrder(detail, store, {
        orderNumberWithDate: config.orderNumberWithDate,
      });

      for (const warning of warnings) {
        logger.warn(`${nhan} ${warning}`);
        void telegram.sendAlert(`${nhan}: ${warning}`);
      }

      const result = await uploader.upload(payload);
      if (!result.ok) {
        this.ghiNhanThatBai(orderID, nhan, result.error ?? 'khong ro');
        return;
      }

      // CHI ghi cache sau khi gui thanh cong.
      cache.markSent(orderID);
      this.attempts.delete(orderID);
      this.ghiNhanThanhCong(payload.order_code, payload.total);

      logger.info(
        `${nhan} DA GUI${result.dryRun ? ' (chay kho)' : ''}`,
        result.dryRun ? result.file : `${result.attempts} lan thu`,
      );
      void telegram.sendOrder(payload, result.dryRun ? '(chay kho - chua gui ccmany)' : undefined);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await this.baoMatPhien(err);
        return;
      }
      this.ghiNhanThatBai(orderID, nhan, (err as Error).message);
    }
  }

  private ghiNhanThatBai(orderID: string, nhan: string, error: string): void {
    const { logger, telegram, config } = this.deps;
    const soLan = (this.attempts.get(orderID) ?? 0) + 1;
    this.attempts.set(orderID, soLan);
    this.lastError = error;

    if (soLan >= config.maxOrderAttempts) {
      // Bo cuoc de mot don hong vinh vien khong lam nghen hang doi. Bao MOT lan.
      this.daBoCuoc.add(orderID);
      logger.error(`${nhan} BO CUOC sau ${soLan} lan: ${error}`);
      void telegram.sendAlert(`${nhan} khong gui duoc sau ${soLan} lan: ${error}`);
    } else {
      // Khong ghi cache -> luot poll sau se thu lai.
      logger.warn(`${nhan} that bai lan ${soLan}/${config.maxOrderAttempts}: ${error}`);
    }
  }

  private ghiNhanThanhCong(orderCode: string, total: number | null): void {
    const key = this.dayKey();
    this.donHomNay.set(key, (this.donHomNay.get(key) ?? 0) + 1);
    this.donGanNhat = { orderCode, total, at: new Date(this.now()).toISOString() };
  }

  private luuJsonTho(orderID: string, detail: unknown): void {
    try {
      const dir = join(this.deps.config.dataDir, 'raw');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${orderID.replace(/[^A-Za-z0-9_-]/g, '_')}.json`),
        JSON.stringify(detail, null, 2),
        'utf8',
      );
    } catch (err) {
      // Khong ghi duoc JSON tho thi van gui don. Mat tai lieu de sua sau con
      // hon mat don.
      this.deps.logger.warn('Khong luu duoc JSON tho', err);
    }
  }

  // ── Trang thai ─────────────────────────────────────────────────────────────

  private async baoMatPhien(err: SessionExpiredError): Promise<void> {
    const { store, logger, telegram } = this.deps;
    if (this.state !== 'mat-phien') {
      // Chi bao MOT lan cho moi lan mat phien, khong spam moi 5 giay.
      logger.error(`[${store.ccmanyStoreID}] MAT PHIEN GRAB - can dang nhap lai`, err);
      void telegram.sendAlert(`${store.storeName}: mat phien Grab, can dang nhap lai tren may quan`);
    }
    if (this.state !== 'mat-phien') this.hongTu = this.now();
    this.state = 'mat-phien';
    this.lastError = err.message;
  }

  /**
   * Phuc hoi phai on ao ngang voi hong.
   *
   * O muc log `info`, mot luot poll thanh cong khong ghi gi ca — chi luot hong
   * moi ghi. Nghia la doc log KHONG phan biet duoc "da chay lai roi" voi "van
   * dang hong, chi la thoi khong ghi nua". Da dam phai dung cho nay khi thu rut
   * mang o Task 10: log dung o dong hong cuoi cung, va khong ai doan duoc ket
   * cuc. Nen moi lan tro lai binh thuong deu phai co MOT dong ro rang.
   */
  private baoPhucHoi(truocDo: PollerState): void {
    const { store, logger, telegram } = this.deps;
    const bao = truocDo === 'mat-phien' ? 'Da co phien Grab tro lai' : 'Da ket noi lai duoc';
    const lau = this.hongTu === null ? '' : ` sau ${moTaKhoang(this.now() - this.hongTu)}`;
    this.hongTu = null;

    logger.info(`[${store.ccmanyStoreID}] DA PHUC HOI - ${bao}${lau}`);
    void telegram.sendAlert(`${store.storeName}: ${bao}${lau}, dang theo doi don binh thuong`);
  }

  private async refreshOpenStatus(): Promise<void> {
    if (this.now() - this.openStatusCheckedAt < OPEN_STATUS_TTL_MS) return;
    const status = await this.deps.client.openStatus(this.deps.store.grabMerchantID);
    this.quanDangMo = status.isOpen === true;
    this.openStatusCheckedAt = this.now();
  }

  /**
   * Quan dong cua thi khong the co don moi, nen gian nhip ra. Mat phien cung
   * gian ra — cho toi khi nguoi dung dang nhap lai thi poll day cung vo ich.
   */
  private nextDelayMs(): number {
    const { pollIntervalMs, pollIntervalClosedMs } = this.deps.config;
    if (this.state === 'mat-phien') return Math.max(pollIntervalClosedMs, 30_000);
    if (this.quanDangMo === false) return pollIntervalClosedMs;
    return pollIntervalMs;
  }

  private dayKey(): string {
    // Theo gio Viet Nam, de "hom nay" trung voi ngay lam viec cua quan.
    return new Date(this.now() + 7 * 3600_000).toISOString().slice(0, 10);
  }
}

/** Khoang thoi gian cho nguoi doc: "45 giay", "3 phut", "2 gio 10 phut". */
function moTaKhoang(ms: number): string {
  const giay = Math.round(ms / 1000);
  if (giay < 90) return `${giay} giay`;
  const phut = Math.round(giay / 60);
  if (phut < 90) return `${phut} phut`;
  const gio = Math.floor(phut / 60);
  return `${gio} gio ${phut % 60} phut`;
}
