import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Resilience } from '../src/main/resilience.js';
import { Logger } from '../src/core/log.js';
import { loadConfig } from '../src/core/config.js';
import type { AppConfig } from '../src/core/config.js';
import type { PollerState } from '../src/core/poller.js';
import type { StorePoller } from '../src/core/poller.js';
import type { TelegramNotifier } from '../src/core/telegram.js';
import type { GrabWindow } from '../src/main/grab-window.js';

/**
 * Cac lop bao ve, o canh NHIEU QUAN (Task 5).
 *
 * Truoc Task 5 file nay khong ton tai — Resilience chua he co test. Do la cho
 * nguy hiem nhat de bo trong: no la lop duy nhat tu cuu duoc khi khong co ai
 * ngoi canh may, va moi kieu hong cua no deu im lang. Hai kieu te nhat:
 *
 *   khong can thiep khi can  -> quan treo ca buoi, khong ai biet
 *   can thiep qua tay        -> 14 lenh tai lai trang chong len nhau, huy fetch
 *                               cua nhau, va 14 tin Telegram lien tiep khien
 *                               nguoi nhan tat thong bao cua bot
 *
 * Ca hai deu chi lo ra sau nhieu gio chay that, nen phai chan bang test.
 */

const PHUT = 60_000;
const T0 = Date.parse('2026-09-02T03:00:00Z');

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'resilience-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

interface QuanGia {
  ten: string;
  state: PollerState;
  lastPollAt: number | null;
  dangBan: boolean;
}

/**
 * Poller gia dung GETTER chu khong phai anh chup.
 *
 * Poller that tinh lai `stats` moi lan doc, va Resilience dua vao dieu do: no
 * doc lai trang thai o TUNG nhip. Neu gia bang gia tri tinh thi khong test duoc
 * cac canh dong nhat — quan dang ban roi ranh, quan ket roi poll lai duoc — ma
 * do moi la nhung canh Resilience sinh ra de xu ly.
 */
function pollerGia(q: QuanGia): StorePoller {
  return {
    store: { grabMerchantID: `5-${q.ten}`, ccmanyStoreID: `5-${q.ten}`, storeName: q.ten, enabled: true },
    get stats() {
      return {
        state: q.state,
        lastPollAt: q.lastPollAt === null ? null : new Date(q.lastPollAt).toISOString(),
        lastError: q.state === 'loi' ? 'HTTP 500' : null,
        quanDangMo: true,
        soDonHomNay: 0,
        donGanNhat: null,
      };
    },
    get lastPollAtMs() {
      return q.lastPollAt;
    },
    get dangBan() {
      return q.dangBan;
    },
  } as unknown as StorePoller;
}

function quan(ten: string, patch: Partial<QuanGia> = {}): QuanGia {
  return { ten, state: 'dang-chay', lastPollAt: T0, dangBan: false, ...patch };
}

/**
 * Dung Resilience voi dong ho va hen gio gia, de goi thang tung nhip thay vi
 * cho 30 giay / 60 phut that.
 */
function lapRap(options: {
  quan?: QuanGia[];
  now?: () => number;
  cuaSoBiHuy?: boolean;
  trangHong?: () => boolean;
  soTinChoGui?: number;
  phien?: 'song' | 'mat' | 'chua-ro';
  config?: Partial<AppConfig>;
} = {}) {
  const dsQuan = options.quan ?? [quan('A'), quan('B'), quan('C')];

  const ensureOpen = vi.fn(async () => options.cuaSoBiHuy === true);
  const reload = vi.fn(async () => {});
  const trangDangHong = vi.fn(() => options.trangHong?.() ?? false);
  const grabWindow = { ensureOpen, reload, trangDangHong } as unknown as GrabWindow;

  const sendAlert = vi.fn(async () => true);
  const guiBu = vi.fn(async () => options.soTinChoGui ?? 0);
  const telegram = {
    sendAlert,
    guiBu,
    get soTinChoGui() {
      return options.soTinChoGui ?? 0;
    },
  } as unknown as TelegramNotifier;

  const probe = vi.fn(async () => {});

  const config: AppConfig = {
    ...loadConfig({ CCMANY_API_URL: 'https://x/y', CCMANY_API_KEY: 'K' }, root),
    watchdogMinutes: 3,
    pageReloadMinutes: 60,
    heartbeatMinutes: 30,
    ...options.config,
  };

  /** Moi hen gio lap lai duoc giu lai de goi tay dung cai minh muon. */
  const lapLai: { fn: () => void; ms: number }[] = [];
  const motLan: { fn: () => void; ms: number }[] = [];
  const daXoa: NodeJS.Timeout[] = [];

  const resilience = new Resilience({
    config,
    logger: new Logger({ level: 'error' }),
    grabWindow,
    pollers: dsQuan.map(pollerGia),
    telegram,
    probe,
    trangThaiPhien: () => options.phien ?? 'song',
    now: options.now ?? (() => T0),
    datLapLai: (fn, ms) => {
      lapLai.push({ fn, ms });
      return lapLai.length as unknown as NodeJS.Timeout;
    },
    xoaLapLai: (t) => daXoa.push(t),
    datMotLan: (fn, ms) => motLan.push({ fn, ms }),
  });

  /** Goi nhip canh cua so (30 giay) mot lan. */
  const canhCuaSo = async () => {
    const nhip = lapLai.find((t) => t.ms === 30_000);
    await (nhip!.fn() as unknown as Promise<void>);
  };
  const taiLaiDinhKy = async () => {
    const nhip = lapLai.find((t) => t.ms === config.pageReloadMinutes * PHUT);
    await (nhip!.fn() as unknown as Promise<void>);
  };
  const nhipTim = () => {
    const nhip = lapLai.find((t) => t.ms === config.heartbeatMinutes * PHUT);
    nhip!.fn();
  };

  return {
    resilience,
    /** Sua truc tiep de doi trang thai quan giua cac nhip. */
    dsQuan,
    ensureOpen,
    reload,
    trangDangHong,
    sendAlert,
    guiBu,
    probe,
    lapLai,
    motLan,
    daXoa,
    config,
    canhCuaSo,
    taiLaiDinhKy,
    nhipTim,
  };
}

describe('start / stop', () => {
  it('bat du bon dong ho khi cau hinh day du', () => {
    const t = lapRap();
    t.resilience.start();
    expect(t.lapLai.map((x) => x.ms).sort((a, b) => a - b)).toEqual([
      30_000, // canh cua so
      30 * PHUT, // nhip tim
      60 * PHUT, // tai lai dinh ky
      6 * 3600_000, // don rac
    ]);
  });

  // Tat tai lai dinh ky bang PAGE_RELOAD_MINUTES=0 phai that su tat, khong duoc
  // bien thanh setInterval(0) — cai do se quay CPU 100%.
  it('tai lai dinh ky = 0 thi khong dat hen gio nao cho no', () => {
    const t = lapRap({ config: { pageReloadMinutes: 0 } });
    t.resilience.start();
    expect(t.lapLai.some((x) => x.ms === 0)).toBe(false);
    expect(t.lapLai).toHaveLength(3);
  });

  it('nhip tim = 0 thi khong dat hen gio nao cho no', () => {
    const t = lapRap({ config: { heartbeatMinutes: 0 } });
    t.resilience.start();
    expect(t.lapLai.some((x) => x.ms === 0)).toBe(false);
    expect(t.lapLai).toHaveLength(3);
  });

  it('stop() xoa het moi dong ho da dat', () => {
    const t = lapRap();
    t.resilience.start();
    const soDaDat = t.lapLai.length;
    t.resilience.stop();
    expect(t.daXoa).toHaveLength(soDaDat);
  });

  // Goi stop() hai lan (thoat roi before-quit chay lai) khong duoc xoa lung tung.
  it('stop() hai lan khong xoa gi them', () => {
    const t = lapRap();
    t.resilience.start();
    t.resilience.stop();
    const sau = t.daXoa.length;
    t.resilience.stop();
    expect(t.daXoa).toHaveLength(sau);
  });

  it('chua chay lan nao thi stats deu rong', () => {
    const t = lapRap();
    expect(t.resilience.stats).toEqual({
      lanTaiLaiCuoi: null,
      lanCanThiepCuoi: null,
      soLanCanThiep: 0,
      soLanMoLaiCuaSo: 0,
    });
  });
});

describe('canh cua so — cua so bi huy', () => {
  it('mo lai cua so xong thi goi lai API that de xac nhan phien', async () => {
    const t = lapRap({ cuaSoBiHuy: true });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.probe).toHaveBeenCalledTimes(1);
    expect(t.resilience.stats.soLanMoLaiCuaSo).toBe(1);
  });

  /**
   * Vua mo lai cua so xong thi chua co gi de canh nua — di tiep xuong watchdog
   * se tai lai mot trang vua duoc mo, va lam mat luon phien vua khoi phuc.
   */
  it('mo lai xong thi DUNG lai, khong chay tiep xuong watchdog', async () => {
    const t = lapRap({
      cuaSoBiHuy: true,
      quan: [quan('KET', { lastPollAt: T0 - 60 * PHUT })],
    });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).not.toHaveBeenCalled();
    expect(t.resilience.stats.soLanCanThiep).toBe(0);
  });
});

describe('canh cua so — trang loi', () => {
  it('trang dang la trang loi thi tai lai ngay, khong doi watchdog', async () => {
    const t = lapRap({ trangHong: () => true });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    // Tai lai vi trang loi KHONG phai la can thiep cua watchdog.
    expect(t.resilience.stats.soLanCanThiep).toBe(0);
    expect(t.resilience.stats.lanTaiLaiCuoi).not.toBeNull();
  });

  it('trang loi thi khong chay tiep xuong watchdog trong cung mot nhip', async () => {
    const t = lapRap({
      trangHong: () => true,
      quan: [quan('KET', { lastPollAt: T0 - 60 * PHUT })],
    });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.sendAlert).not.toHaveBeenCalled();
  });

  // Mat mang dai thi nhip nay lap lai hang tram lan; moi lan deu phai tai lai,
  // nhung khong duoc ghi to hang tram dong.
  it('mat mang keo dai thi van tai lai moi nhip', async () => {
    const t = lapRap({ trangHong: () => true });
    t.resilience.start();
    await t.canhCuaSo();
    await t.canhCuaSo();
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(3);
  });
});

describe('gui bu Telegram', () => {
  it('khong co tin ton thi khong goi guiBu', async () => {
    const t = lapRap({ soTinChoGui: 0 });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.guiBu).not.toHaveBeenCalled();
  });

  it('co tin ton va vua co luot poll thanh cong thi gui bu', async () => {
    const t = lapRap({ soTinChoGui: 3, quan: [quan('A', { lastPollAt: T0 - 10_000 })] });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.guiBu).toHaveBeenCalledTimes(1);
  });

  /**
   * Goi bua trong luc van mat mang thi moi tin ton toi 20 giay cho hoai cong,
   * va lam nghen ca hang doi.
   */
  it('luot poll cuoi da qua lau thi CHUA gui bu', async () => {
    const t = lapRap({ soTinChoGui: 3, quan: [quan('A', { lastPollAt: T0 - 5 * PHUT })] });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.guiBu).not.toHaveBeenCalled();
  });

  it('chua quan nao poll lan nao thi CHUA gui bu', async () => {
    const t = lapRap({ soTinChoGui: 3, quan: [quan('A', { lastPollAt: null })] });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.guiBu).not.toHaveBeenCalled();
  });

  /**
   * O day lay moc MOI NHAT trong cac quan, nguoc voi cho hien thi (lay cu nhat).
   * Cau hoi la "mang da ve chua", va BAT KY luot poll nao thanh cong cung tra
   * loi duoc — doi ca 14 quan cung tuoi thi tin ton se nam mai trong hang doi.
   */
  it('mot quan vua poll xong la du de gui bu, du 13 quan kia dang ket', async () => {
    const ds = [
      ...Array.from({ length: 13 }, (_, i) => quan(`KET${i}`, { lastPollAt: T0 - 30 * PHUT })),
      quan('TUOI', { lastPollAt: T0 - 5_000 }),
    ];
    const t = lapRap({ soTinChoGui: 2, quan: ds });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.guiBu).toHaveBeenCalledTimes(1);
  });
});

describe('watchdog nhieu quan', () => {
  it('moi quan deu khoe thi khong tai lai, khong bao gi', async () => {
    const t = lapRap();
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).not.toHaveBeenCalled();
    expect(t.sendAlert).not.toHaveBeenCalled();
  });

  it('mot quan ket giua nhung quan khoe thi tai lai', async () => {
    const t = lapRap({
      quan: [quan('A'), quan('KET', { lastPollAt: T0 - 10 * PHUT }), quan('C')],
    });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.resilience.stats.soLanCanThiep).toBe(1);
  });

  /**
   * TRUNG TAM CUA TASK 5. Mot cua so -> MOT lan tai lai va MOT tin Telegram,
   * du ca 14 quan cung ket.
   *
   * Neu lam moi quan mot bo Resilience thi con so o day se la 14 va 14: 14
   * lenh tai lai chong len nhau (moi lenh huy fetch cua lenh truoc) va 14 tin
   * lien tiep — du de nguoi nhan tat thong bao cua bot.
   */
  it('ca 14 quan cung ket van chi MOT lan tai lai va MOT tin Telegram', async () => {
    const ds = Array.from({ length: 14 }, (_, i) => quan(`Q${i}`, { lastPollAt: T0 - 10 * PHUT }));
    const t = lapRap({ quan: ds });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.sendAlert).toHaveBeenCalledTimes(1);
    expect(t.resilience.stats.soLanCanThiep).toBe(1);
  });

  // Tin bao phai goi ten quan, nhung khong duoc dai 14 dong — tin dai bi cat
  // giua chung tren dien thoai.
  it('tin bao goi ten quan va cat bot khi qua dai', async () => {
    const ds = Array.from({ length: 14 }, (_, i) => quan(`Q${i}`, { lastPollAt: T0 - 10 * PHUT }));
    const t = lapRap({ quan: ds });
    t.resilience.start();
    await t.canhCuaSo();

    const tin = t.sendAlert.mock.calls[0]![0] as string;
    expect(tin).toContain('Q0');
    expect(tin).toContain('va 11 quan nua');
    expect(tin).toContain('tai lai trang Grab');
  });

  it('it quan ket thi liet ke du ten, khong cat', async () => {
    const t = lapRap({
      quan: [quan('Ben Thanh', { lastPollAt: T0 - 10 * PHUT }), quan('Dong Da', { lastPollAt: T0 - 10 * PHUT }), quan('C')],
    });
    t.resilience.start();
    await t.canhCuaSo();

    const tin = t.sendAlert.mock.calls[0]![0] as string;
    expect(tin).toContain('Ben Thanh, Dong Da');
    expect(tin).not.toContain('quan nua');
  });

  it('nguoi dung tam dung het thi watchdog im lang', async () => {
    const ds = Array.from({ length: 3 }, (_, i) =>
      quan(`Q${i}`, { state: 'dung', lastPollAt: T0 - 60 * PHUT }),
    );
    const t = lapRap({ quan: ds });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).not.toHaveBeenCalled();
    expect(t.sendAlert).not.toHaveBeenCalled();
  });

  it('mat phien thi khong tai lai — phai co nguoi dang nhap', async () => {
    const ds = [quan('A', { state: 'mat-phien', lastPollAt: T0 - 60 * PHUT })];
    const t = lapRap({ quan: ds });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).not.toHaveBeenCalled();
  });

  /**
   * Chot chong da lien tiep, o canh nhieu quan: tai lai mat vai giay va trong
   * khoang do chua quan nao kip poll thanh cong, nen khong cho thi se da cua so
   * lien tuc moi 30 giay va khong quan nao poll duoc lan nao.
   */
  it('hai nhip lien tiep chi can thiep MOT lan', async () => {
    const gio = { hienTai: T0 };
    const ds = [quan('KET', { lastPollAt: T0 - 10 * PHUT })];
    const t = lapRap({ quan: ds, now: () => gio.hienTai });
    t.resilience.start();

    await t.canhCuaSo();
    gio.hienTai += 30_000;
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.sendAlert).toHaveBeenCalledTimes(1);
  });

  it('qua mot nguong ma van ket thi duoc can thiep lan hai', async () => {
    const gio = { hienTai: T0 };
    const ds = [quan('KET', { lastPollAt: T0 - 10 * PHUT })];
    const t = lapRap({ quan: ds, now: () => gio.hienTai });
    t.resilience.start();

    await t.canhCuaSo();
    gio.hienTai += 4 * PHUT;
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(2);
  });

  it('tai lai xong thi goi lai API that de biet phien co qua duoc khong', async () => {
    const t = lapRap({ quan: [quan('KET', { lastPollAt: T0 - 10 * PHUT })] });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.probe).toHaveBeenCalledTimes(1);
  });

  // Reload nem loi (cua so vua bi dong) khong duoc lam chet ca nhip canh —
  // nhip nay con phai chay tiep moi 30 giay trong nhieu ngay.
  it('tai lai nem loi thi nuot lai, nhip sau van chay', async () => {
    const t = lapRap({ quan: [quan('KET', { lastPollAt: T0 - 10 * PHUT })] });
    t.reload.mockRejectedValueOnce(new Error('cua so da dong'));
    t.resilience.start();

    await expect(t.canhCuaSo()).resolves.toBeUndefined();
    expect(t.resilience.stats.lanTaiLaiCuoi).toBeNull();
  });

  it('khong co quan nao thi khong tai lai gi', async () => {
    const t = lapRap({ quan: [] });
    t.resilience.start();
    await t.canhCuaSo();

    expect(t.reload).not.toHaveBeenCalled();
  });

  /**
   * Canh phuc hoi: tai lai trang xong, quan poll lai duoc, thi watchdog phai
   * IM. Khong co chot nay thi mot quan da song lai van bi da cua so mai — va
   * moi lan da la mot lan huy fetch dang chay cua 13 quan con lai.
   */
  it('quan poll lai duoc sau khi tai lai thi watchdog thoi can thiep', async () => {
    const gio = { hienTai: T0 };
    const t = lapRap({
      quan: [quan('KET', { lastPollAt: T0 - 10 * PHUT })],
      now: () => gio.hienTai,
    });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.reload).toHaveBeenCalledTimes(1);

    // Trang tai lai xong, quan poll thanh cong tro lai.
    gio.hienTai += 4 * PHUT;
    t.dsQuan[0]!.lastPollAt = gio.hienTai - 5_000;
    await t.canhCuaSo();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.resilience.stats.soLanCanThiep).toBe(1);
  });

  /**
   * Nguoc lai: quan mat phien roi nguoi dung dang nhap lai — luc do no chuyen
   * ve 'loi' hoac 'dang-chay' va watchdog moi duoc phep can thiep. Truoc do thi
   * khong, du no dung im ca tieng.
   */
  it('mat phien roi chuyen sang loi thi luc do moi duoc can thiep', async () => {
    const t = lapRap({ quan: [quan('A', { state: 'mat-phien', lastPollAt: T0 - 30 * PHUT })] });
    t.resilience.start();
    await t.canhCuaSo();
    expect(t.reload).not.toHaveBeenCalled();

    t.dsQuan[0]!.state = 'loi';
    await t.canhCuaSo();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });
});

describe('tai lai dinh ky', () => {
  it('khong quan nao ban thi tai lai luon', async () => {
    const t = lapRap();
    t.resilience.start();
    await t.taiLaiDinhKy();

    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.motLan).toHaveLength(0);
  });

  /**
   * Mot cua so chung nghia la mot lan tai lai lam gian doan TAT CA cac quan.
   * Nen chi can MOT quan dang giua chung mot don la phai hoan — don den cham
   * vai phut con hon mot don mat han.
   */
  it('MOT quan dang xu ly don la hoan ca lan tai lai', async () => {
    const t = lapRap({ quan: [quan('A'), quan('BAN', { dangBan: true }), quan('C')] });
    t.resilience.start();
    await t.taiLaiDinhKy();

    expect(t.reload).not.toHaveBeenCalled();
    expect(t.motLan).toHaveLength(1);
    expect(t.motLan[0]!.ms).toBe(60_000);
  });

  /**
   * Hoan roi PHAI thu lai. Neu lan hoan do lam mat luon viec tai lai dinh ky
   * thi Chromium ngoi mo lien tuc nhieu ngay khong bao gio duoc lam nhe bo nho
   * — dung cai ma dong ho 60 phut nay sinh ra de tranh.
   */
  it('hoan xong, quan xu ly don xong thi lan thu lai tai duoc', async () => {
    const t = lapRap({ quan: [quan('BAN', { dangBan: true })] });
    t.resilience.start();
    await t.taiLaiDinhKy();
    expect(t.reload).not.toHaveBeenCalled();

    // Don da xu ly xong; goi lai dung cai callback ma lan hoan vua hen.
    t.dsQuan[0]!.dangBan = false;
    await (t.motLan[0]!.fn() as unknown as Promise<void>);

    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  // Van con ban thi hoan tiep, khong duoc bo cuoc sau mot lan.
  it('van con ban thi hoan tiep lan nua', async () => {
    const t = lapRap({ quan: [quan('BAN', { dangBan: true })] });
    t.resilience.start();
    await t.taiLaiDinhKy();
    await (t.motLan[0]!.fn() as unknown as Promise<void>);

    expect(t.reload).not.toHaveBeenCalled();
    expect(t.motLan).toHaveLength(2);
  });

  it('khong co quan nao thi van tai lai duoc dinh ky', async () => {
    const t = lapRap({ quan: [] });
    t.resilience.start();
    await t.taiLaiDinhKy();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });
});

describe('nhip tim', () => {
  it('gui dung MOT tin cho ca cum quan', () => {
    const t = lapRap({ quan: [quan('A'), quan('B'), quan('C')] });
    t.resilience.start();
    t.nhipTim();

    expect(t.sendAlert).toHaveBeenCalledTimes(1);
    expect(t.sendAlert.mock.calls[0]![0] as string).toContain('3/3 quan dang theo doi');
  });

  it('bao dung so quan dang chay khi co quan hong', () => {
    const t = lapRap({
      quan: [quan('A'), quan('B', { state: 'loi' }), quan('C', { state: 'dung' })],
    });
    t.resilience.start();
    t.nhipTim();

    const tin = t.sendAlert.mock.calls[0]![0] as string;
    expect(tin).toContain('1/3 quan dang theo doi');
    expect(tin).toContain('Quan co van de (2):');
  });

  // Phien doc theo lan goi API that, khong theo trang thai poller — poller co
  // the con bao 'dang-chay' vi chua toi nhip ke tiep.
  it('phien mat thi nhip tim bao mat phien du poller van dang chay', () => {
    const t = lapRap({ phien: 'mat' });
    t.resilience.start();
    t.nhipTim();

    expect(t.sendAlert.mock.calls[0]![0] as string).toContain('MAT PHIEN GRAB');
  });

  it('chua chon quan nao thi van gui nhip tim, noi ro la chua chon', () => {
    const t = lapRap({ quan: [] });
    t.resilience.start();
    t.nhipTim();

    expect(t.sendAlert.mock.calls[0]![0] as string).toContain('CHUA CHON QUAN NAO');
  });
});
