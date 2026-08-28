/**
 * Cac lop bao ve nam NGOAI vong lap lay don.
 *
 * Vong lap poll tu no chi biet mot viec: goi API, xu ly don. No khong biet cua
 * so Grab da bi huy, khong biet tab da ngoi mo ba ngay va phinh bo nho, khong
 * biet chinh no da dung im tu nua tieng truoc. Bon dong ho o day lam nhung viec
 * do — moi cai doc lap, mot cai chet khong keo theo cai khac.
 *
 *   30 giay   canh cua so   cua so bi huy thi mo lai · trang loi thi tai lai ·
 *                           poll dung im qua lau thi tai lai · gui bu Telegram
 *   60 phut   tai lai trang chong Chromium phinh bo nho khi mo lien tuc nhieu ngay
 *   30 phut   nhip tim      mot dong Telegram de biet cong cu con song
 *    6 gio    don rac       xoa JSON tho qua han
 *
 * Tat ca deu la setInterval trong Node, khong phai trong trang — Chromium bop
 * co hen gio cua tab chay nen xuong con ~1 lan/phut.
 */

import { join } from 'node:path';
import { donDepFileCu } from '../core/retention.js';
import { quyetDinhWatchdog } from '../core/watchdog.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/log.js';
import type { StorePoller } from '../core/poller.js';
import type { TelegramNotifier } from '../core/telegram.js';
import type { StoreConfig } from '../core/types.js';
import type { GrabWindow } from './grab-window.js';

/** Nhip canh cua so. Doc lap voi nhip poll — day la dong ho canh dong ho kia. */
const NHIP_CANH_MS = 30_000;
/** Nhip don rac. Khong can day hon: file chi cu di theo ngay. */
const NHIP_DON_RAC_MS = 6 * 3600_000;
/** Hoan reload lai bao lau khi poller dang giua chung mot don. */
const HOAN_RELOAD_MS = 60_000;

export interface ResilienceDeps {
  config: AppConfig;
  store: StoreConfig;
  logger: Logger;
  grabWindow: GrabWindow;
  poller: StorePoller;
  telegram: TelegramNotifier;
  /** Goi lai API that de xac nhan phien con song. */
  probe: () => Promise<void>;
  /**
   * Phien Grab con song khong, theo lan goi API that gan nhat.
   *
   * Nhip tim khong duoc phep chi nhin poller: poller chua tung chay thi trang
   * thai cua no la 'dung' — dung nhu luc nguoi dung tu tam dung. Hai chuyen
   * hoan toan khac nhau, ma viec can lam thi chi mot trong hai co.
   */
  trangThaiPhien: () => 'song' | 'mat' | 'chua-ro';
  now?: () => number;
}

export interface ResilienceStats {
  lanTaiLaiCuoi: string | null;
  lanCanThiepCuoi: string | null;
  soLanCanThiep: number;
  soLanMoLaiCuaSo: number;
}

export class Resilience {
  private timers: NodeJS.Timeout[] = [];
  private readonly now: () => number;

  private batDauLuc = 0;
  private lanTaiLaiCuoi: number | null = null;
  private canThiepLanCuoi: number | null = null;
  private soLanCanThiep = 0;
  private soLanMoLaiCuaSo = 0;
  /** So lan lien tiep phai sua trang loi, de khong ghi log day man hinh. */
  private soLanSuaTrangLienTiep = 0;

  constructor(private readonly deps: ResilienceDeps) {
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    const { config, logger } = this.deps;
    this.batDauLuc = this.now();

    this.timers.push(setInterval(() => void this.canhCuaSo(), NHIP_CANH_MS));

    if (config.pageReloadMinutes > 0) {
      this.timers.push(
        setInterval(() => void this.taiLaiDinhKy(), config.pageReloadMinutes * 60_000),
      );
    }
    if (config.heartbeatMinutes > 0) {
      this.timers.push(setInterval(() => this.nhipTim(), config.heartbeatMinutes * 60_000));
    }

    // Don ngay luc khoi dong: may quan co the vua tat may vai tuan, va lan chay
    // dau tien sau do la luc rac da don nhieu nhat.
    this.donRac();
    this.timers.push(setInterval(() => this.donRac(), NHIP_DON_RAC_MS));

    logger.info('Da bat cac lop bao ve', {
      canhCuaSoGiay: NHIP_CANH_MS / 1000,
      watchdogPhut: config.watchdogMinutes,
      taiLaiPhut: config.pageReloadMinutes,
      nhipTimPhut: config.heartbeatMinutes,
      giuJsonThoNgay: config.rawRetentionDays,
    });
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  get stats(): ResilienceStats {
    return {
      lanTaiLaiCuoi: iso(this.lanTaiLaiCuoi),
      lanCanThiepCuoi: iso(this.canThiepLanCuoi),
      soLanCanThiep: this.soLanCanThiep,
      soLanMoLaiCuaSo: this.soLanMoLaiCuaSo,
    };
  }

  // ── 30 giay: cua so con song khong, va poll co dung im khong ────────────────

  private async canhCuaSo(): Promise<void> {
    const { grabWindow, poller, logger, config } = this.deps;

    // 1. Cua so bi huy thi mo lai. Thieu buoc nay thi mot lan cua so mat la moi
    //    loi goi API bao "chua san sang" mai mai.
    const daMoLai = await grabWindow.ensureOpen();
    if (daMoLai) {
      this.soLanMoLaiCuaSo += 1;
      await this.deps.probe();
      return; // vua mo lai xong thi chua co gi de canh nua
    }

    // 2. Trang dang la trang loi cua Chromium: fetch tu do khong bao gio thanh
    //    cong nua, ke ca khi mang da ve. Phai tai lai. Thu MOI 30 GIAY chu
    //    khong doi watchdog 3 phut — luc mang vua ve, moi giay cho la mot giay
    //    don co the roi.
    if (grabWindow.trangDangHong()) {
      this.soLanSuaTrangLienTiep += 1;
      // Mat mang dai thi day se lap lai hang tram lan; chi ghi to lan dau.
      const ghi = this.soLanSuaTrangLienTiep === 1 ? logger.warn : logger.debug;
      ghi.call(logger, 'Trang Grab dang la trang loi - tai lai', {
        lanThu: this.soLanSuaTrangLienTiep,
      });
      await this.taiLai('trang loi');
      return;
    }
    this.soLanSuaTrangLienTiep = 0;

    // 3. Mang dang chay: tranh thu gui bu nhung canh bao da hong luc mat mang.
    //    Mot luot poll vua thanh cong la bang chung du chac rang mang da ve.
    void this.guiBuTelegram();

    // 4. Cua so con day nhung poll dung im — trang co the da treo hoac mat
    //    ket noi ngam. Tai lai la thu duy nhat lam duoc ma khong can nguoi.
    const quyetDinh = quyetDinhWatchdog({
      state: poller.stats.state,
      lastPollAt: poller.lastPollAtMs,
      batDauLuc: this.batDauLuc,
      canThiepLanCuoi: this.canThiepLanCuoi,
      now: this.now(),
      nguongMs: config.watchdogMinutes * 60_000,
    });
    if (quyetDinh === 'khong-lam-gi') return;

    this.canThiepLanCuoi = this.now();
    this.soLanCanThiep += 1;
    logger.error(
      `WATCHDOG: khong co luot poll thanh cong nao trong ${config.watchdogMinutes} phut - tai lai trang Grab`,
      { lanPollCuoi: iso(poller.lastPollAtMs) },
    );
    void this.deps.telegram.sendAlert(
      `${this.deps.store.storeName}: poll dung im ${config.watchdogMinutes} phut, dang tu tai lai trang Grab`,
    );

    await this.taiLai('watchdog');
  }

  /**
   * Gui bu canh bao da hong.
   *
   * Chi goi khi vua co mot luot poll thanh cong trong vong 60 giay. Goi bua
   * trong luc van mat mang thi moi tin ton toi 20 giay cho hoai cong.
   */
  private async guiBuTelegram(): Promise<void> {
    const { telegram, poller, logger } = this.deps;
    if (telegram.soTinChoGui === 0) return;

    const moc = poller.lastPollAtMs;
    if (moc === null || this.now() - moc > 60_000) return;

    const daGui = await telegram.guiBu();
    if (daGui > 0) logger.info(`Da gui bu ${daGui} canh bao ton lai tu luc mat mang`);
  }

  // ── 60 phut: tai lai cho nhe bo nho ────────────────────────────────────────

  private async taiLaiDinhKy(): Promise<void> {
    if (this.deps.poller.dangBan) {
      // Reload huy moi fetch dang chay trong trang. Dang gui do don thi doi.
      this.deps.logger.info('Hoan tai lai trang: dang xu ly don');
      setTimeout(() => void this.taiLaiDinhKy(), HOAN_RELOAD_MS);
      return;
    }
    await this.taiLai('dinh ky');
  }

  private async taiLai(lyDo: string): Promise<void> {
    const { grabWindow, logger } = this.deps;
    logger.info(`Tai lai trang Grab (${lyDo})`);
    try {
      await grabWindow.reload();
      this.lanTaiLaiCuoi = this.now();
      // Tai lai xong thi goi API that de biet phien co qua duoc khong. Khong co
      // buoc nay thi mot lan tai lai lam mat phien se im lang toi khi co don.
      await this.deps.probe();
    } catch (err) {
      logger.warn('Tai lai trang that bai', err);
    }
  }

  // ── 30 phut: mot dong de biet con song ─────────────────────────────────────

  private nhipTim(): void {
    const { poller, store, config, telegram } = this.deps;
    const stats = poller.stats;

    const phien = this.deps.trangThaiPhien();
    const trangThai =
      phien === 'mat' || stats.state === 'mat-phien'
        ? 'MAT PHIEN GRAB - can dang nhap lai tren may quan'
        : stats.state === 'dang-chay'
          ? config.dryRun
            ? 'dang theo doi (CHAY KHO)'
            : 'dang theo doi'
          : stats.state === 'dung'
            ? 'DA TAM DUNG - khong theo doi don nao'
            : `TRANG THAI: ${stats.state}`;

    const dong = [
      `${store.storeName} - ${trangThai}`,
      `Don hom nay: ${stats.soDonHomNay}`,
      `Poll gan nhat: ${gioVN(stats.lastPollAt)}`,
    ];
    if (stats.lastError) dong.push(`Loi gan nhat: ${stats.lastError}`);

    // Ghi ca vao nhat ky: khi Telegram khong duoc cau hinh (hoac bot bi chan)
    // thi day la cho duy nhat con thay duoc nhip tim.
    this.deps.logger.info('Nhip tim', trangThai);
    void telegram.sendAlert(dong.join('\n'));
  }

  // ── 6 gio: don JSON tho qua han ────────────────────────────────────────────

  private donRac(): void {
    const { config, logger } = this.deps;
    const ketQua = donDepFileCu(join(config.dataDir, 'raw'), config.rawRetentionDays, this.now);
    if (ketQua.daXoa > 0 || ketQua.loi > 0) {
      logger.info('Da don JSON tho qua han', {
        daXoa: ketQua.daXoa,
        loi: ketQua.loi,
        giuNgay: config.rawRetentionDays,
      });
    }
  }
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function gioVN(isoText: string | null): string {
  if (!isoText) return 'chua co';
  return new Date(isoText).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
