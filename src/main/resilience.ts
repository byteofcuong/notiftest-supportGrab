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
import { quyetDinhWatchdogNhieuQuan } from '../core/watchdog.js';
import { noiDungNhipTim, tomTatNhipTim } from '../core/nhip-tim.js';
import type { DauVaoNhipTim } from '../core/nhip-tim.js';
import type { AppConfig } from '../core/config.js';
import type { Logger } from '../core/log.js';
import type { StorePoller } from '../core/poller.js';
import type { TelegramNotifier } from '../core/telegram.js';
import type { GrabWindow } from './grab-window.js';

/** Nhip canh cua so. Doc lap voi nhip poll — day la dong ho canh dong ho kia. */
const NHIP_CANH_MS = 30_000;
/** Nhip don rac. Khong can day hon: file chi cu di theo ngay. */
const NHIP_DON_RAC_MS = 6 * 3600_000;
/** Hoan reload lai bao lau khi poller dang giua chung mot don. */
const HOAN_RELOAD_MS = 60_000;

export interface ResilienceDeps {
  config: AppConfig;
  logger: Logger;
  grabWindow: GrabWindow;
  /**
   * TAT CA cac poller, khong phai mot.
   *
   * Ba trong bon dong ho o day la viec TOAN CUC, vi chi co MOT cua so Grab:
   * mo lai cua so, tai lai trang, nhip tim, don rac. Chi rieng watchdog moi
   * xet theo tung quan — va ke ca no cung chi duoc ha MOT lenh tai lai.
   *
   * Neu lam N bo Resilience thi mot lan mang chap se sinh 14 lenh tai lai
   * trang chong len nhau va 14 tin Telegram, trong khi chi co dung mot trang
   * de tai lai.
   */
  pollers: StorePoller[];
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
  /** Hen gio lap lai. Tach ra de test dieu khien duoc thoi gian. */
  datLapLai?: (fn: () => void, ms: number) => NodeJS.Timeout;
  xoaLapLai?: (timer: NodeJS.Timeout) => void;
  /** Hen gio mot lan, dung cho viec hoan tai lai khi dang xu ly don. */
  datMotLan?: (fn: () => void, ms: number) => void;
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
  private readonly datLapLai: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly xoaLapLai: (timer: NodeJS.Timeout) => void;
  private readonly datMotLan: (fn: () => void, ms: number) => void;

  private batDauLuc = 0;
  private lanTaiLaiCuoi: number | null = null;
  private canThiepLanCuoi: number | null = null;
  private soLanCanThiep = 0;
  private soLanMoLaiCuaSo = 0;
  /** So lan lien tiep phai sua trang loi, de khong ghi log day man hinh. */
  private soLanSuaTrangLienTiep = 0;

  constructor(private readonly deps: ResilienceDeps) {
    this.now = deps.now ?? Date.now;
    this.datLapLai = deps.datLapLai ?? ((fn, ms) => setInterval(fn, ms));
    this.xoaLapLai = deps.xoaLapLai ?? ((t) => clearInterval(t));
    this.datMotLan = deps.datMotLan ?? ((fn, ms) => void setTimeout(fn, ms));
  }

  start(): void {
    const { config, logger } = this.deps;
    this.batDauLuc = this.now();

    this.timers.push(this.datLapLai(() => void this.canhCuaSo(), NHIP_CANH_MS));

    if (config.pageReloadMinutes > 0) {
      this.timers.push(
        this.datLapLai(() => void this.taiLaiDinhKy(), config.pageReloadMinutes * 60_000),
      );
    }
    if (config.heartbeatMinutes > 0) {
      this.timers.push(this.datLapLai(() => this.nhipTim(), config.heartbeatMinutes * 60_000));
    }

    // Don ngay luc khoi dong: may quan co the vua tat may vai tuan, va lan chay
    // dau tien sau do la luc rac da don nhieu nhat.
    this.donRac();
    this.timers.push(this.datLapLai(() => this.donRac(), NHIP_DON_RAC_MS));

    logger.info('Da bat cac lop bao ve', {
      canhCuaSoGiay: NHIP_CANH_MS / 1000,
      watchdogPhut: config.watchdogMinutes,
      taiLaiPhut: config.pageReloadMinutes,
      nhipTimPhut: config.heartbeatMinutes,
      giuJsonThoNgay: config.rawRetentionDays,
      soQuanCanh: this.deps.pollers.length,
    });
  }

  stop(): void {
    for (const timer of this.timers) this.xoaLapLai(timer);
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
    const { grabWindow, logger, config } = this.deps;

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
    //    Quet TAT CA cac quan, nhung chi ha MOT lenh tai lai: co dung mot
    //    trang de tai lai, va mot lan tai lai cuu duoc moi quan cung luc.
    const { quyetDinh, quanDungIm } = quyetDinhWatchdogNhieuQuan({
      quan: this.deps.pollers.map((p) => ({
        ten: p.store.storeName,
        state: p.stats.state,
        lastPollAt: p.lastPollAtMs,
      })),
      batDauLuc: this.batDauLuc,
      canThiepLanCuoi: this.canThiepLanCuoi,
      now: this.now(),
      nguongMs: config.watchdogMinutes * 60_000,
    });
    if (quyetDinh === 'khong-lam-gi') return;

    this.canThiepLanCuoi = this.now();
    this.soLanCanThiep += 1;
    logger.error(
      `WATCHDOG: ${quanDungIm.length}/${this.deps.pollers.length} quan khong poll duoc lan nao trong ${config.watchdogMinutes} phut - tai lai trang Grab`,
      { quanDungIm },
    );
    // MOT tin cho ca cum. Ban moi quan mot tin luc mang chap la 14 tin lien
    // tiep, va nguoi nhan se tat thong bao cua bot — tat luon ca canh bao that.
    void this.deps.telegram.sendAlert(
      `${moTaDanhSach(quanDungIm)}: poll dung im ${config.watchdogMinutes} phut, dang tu tai lai trang Grab`,
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
    const { telegram, logger } = this.deps;
    if (telegram.soTinChoGui === 0) return;

    // Moc MOI NHAT trong tat ca cac quan, khong phai cu nhat: cau hoi o day la
    // "mang da ve chua", va BAT KY luot poll nao thanh cong cung tra loi duoc.
    // (Cho hien thi thi nguoc lai — xem gopTrangThai(), lay moc cu nhat de
    // khong giau mat quan dang ket.)
    const moc = this.mocPollMoiNhat();
    if (moc === null || this.now() - moc > 60_000) return;

    const daGui = await telegram.guiBu();
    if (daGui > 0) logger.info(`Da gui bu ${daGui} canh bao ton lai tu luc mat mang`);
  }

  // ── 60 phut: tai lai cho nhe bo nho ────────────────────────────────────────

  private async taiLaiDinhKy(): Promise<void> {
    // BAT KY quan nao dang giua chung mot don la hoan. Reload huy moi fetch
    // dang chay trong trang, ke ca cua quan khac — mot cua so chung nghia la
    // mot lan tai lai lam gian doan tat ca. Don den cham vai phut con hon mot
    // don mat han.
    const dangBan = this.deps.pollers.filter((p) => p.dangBan);
    if (dangBan.length > 0) {
      this.deps.logger.info('Hoan tai lai trang: dang xu ly don', {
        quan: dangBan.map((p) => p.store.storeName),
      });
      this.datMotLan(() => void this.taiLaiDinhKy(), HOAN_RELOAD_MS);
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
    const dauVao = this.dauVaoNhipTim();

    // Ghi ca vao nhat ky: khi Telegram khong duoc cau hinh (hoac bot bi chan)
    // thi day la cho duy nhat con thay duoc nhip tim.
    this.deps.logger.info('Nhip tim', tomTatNhipTim(dauVao));
    void this.deps.telegram.sendAlert(noiDungNhipTim(dauVao).join('\n'));
  }

  /** Tach ra de test soan duoc noi dung ma khong phai cho het 30 phut. */
  private dauVaoNhipTim(): DauVaoNhipTim {
    return {
      quan: this.deps.pollers.map((p) => ({
        ten: p.store.storeName,
        state: p.stats.state,
        soDonHomNay: p.stats.soDonHomNay,
        lastError: p.stats.lastError,
      })),
      phien: this.deps.trangThaiPhien(),
      dryRun: this.deps.config.dryRun,
      pollGanNhat: iso(this.mocPollMoiNhat()),
    };
  }

  /** Luot poll thanh cong gan day nhat trong tat ca cac quan. null neu chua co. */
  private mocPollMoiNhat(): number | null {
    let moi: number | null = null;
    for (const p of this.deps.pollers) {
      const m = p.lastPollAtMs;
      if (m !== null && (moi === null || m > moi)) moi = m;
    }
    return moi;
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

/**
 * Liet ke ten quan cho mot dong canh bao, cat bot khi qua dai.
 *
 * Mat mang thi ca 14 quan cung dung im, va mot dong Telegram dai 14 ten se bi
 * cat giua chung tren dien thoai — dung cho quan trong nhat lai bien mat.
 */
function moTaDanhSach(ten: string[]): string {
  if (ten.length === 0) return 'Khong quan nao';
  if (ten.length <= 3) return ten.join(', ');
  return `${ten.slice(0, 3).join(', ')} va ${ten.length - 3} quan nua`;
}
