import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorePoller } from '../src/core/poller.js';
import { OrderCache } from '../src/core/cache.js';
import { GrabClient } from '../src/grab/client.js';
import { CcmanyUploader } from '../src/core/uploader.js';
import { TelegramNotifier } from '../src/core/telegram.js';
import { Logger } from '../src/core/log.js';
import { loadConfig } from '../src/core/config.js';
import { treKhoiDauMs } from '../src/core/tong-hop.js';
import type { StoreConfig } from '../src/core/types.js';

/**
 * NHIP POLL: neo vao luoi, va lui khi bi chan.
 *
 * Ca hai deu la sua loi DO DUOC, khong phai suy doan. Ngay 02/09/2026, 14 quan
 * chay 14 phut voi DEV_GHI_MANG:
 *
 *   - 401 lan HTTP 429, va so lan TANG DAN theo thoi gian
 *   - do lech pha luc khoi dong bi tan: 05:24 con cach deu 0,3-0,7s, den 05:38
 *     thi 7 lan goi don vao 0,5 giay
 *
 * Hai chuyen do noi voi nhau: cong "now + nhip" sau moi luot lam moi quan troi
 * theo thoi gian xu ly cua chinh no, chung dam vao nhau, dinh vot len, Grab
 * chan — va vi 429 roi vao nhanh loi chung nen phan ung la goi tiep y nguyen
 * nhip do.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'poller-nhip-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const STORE: StoreConfig = {
  grabMerchantID: '5-AAA',
  ccmanyStoreID: '5-AAA',
  storeName: 'Quan Test',
  enabled: true,
};

const T0 = Date.parse('2026-09-02T10:00:00.000Z');

/**
 * Poller that voi dong ho va hen gio gia, va mot client tra ve ma HTTP tuy y.
 *
 * `maTraVe` doi duoc giua cac luot, de dung canh "bi chan roi duoc go".
 */
function dung(options: {
  khoiDauTreMs?: number;
  nhipMs?: number;
  nhipDongCuaMs?: number;
  maTraVe?: () => number;
  quanDangMo?: boolean;
} = {}) {
  const gio = { hienTai: T0 };
  const hen: number[] = [];

  const executeJavaScript = vi.fn(async (code: string) => {
    const ma = options.maTraVe?.() ?? 200;
    if (code.includes('open-status')) {
      return {
        status: 200,
        ok: true,
        body: JSON.stringify({ isOpen: options.quanDangMo ?? true }),
      };
    }
    if (ma !== 200) return { status: ma, ok: false, body: '{}' };
    return { status: 200, ok: true, body: JSON.stringify({ orders: [] }) };
  });

  const config = {
    ...loadConfig({ CCMANY_API_URL: 'https://x/y', CCMANY_API_KEY: 'K' }, root),
    pollIntervalMs: options.nhipMs ?? 5000,
    pollIntervalClosedMs: options.nhipDongCuaMs ?? 30_000,
  };

  const poller = new StorePoller({
    store: STORE,
    config,
    client: new GrabClient({ getRunner: () => ({ executeJavaScript }) }),
    cache: new OrderCache(STORE.ccmanyStoreID, {
      dir: join(config.dataDir, 'cache'),
      now: () => gio.hienTai,
    }),
    uploader: new CcmanyUploader({
      url: config.ccmany.url,
      apiKey: config.ccmany.apiKey,
      dryRun: true,
      dataDir: config.dataDir,
      sleep: async () => {},
      now: () => gio.hienTai,
    }),
    telegram: new TelegramNotifier({ config: null, sleep: async () => {} }),
    logger: new Logger({ level: 'error' }),
    now: () => gio.hienTai,
    khoiDauTreMs: options.khoiDauTreMs,
    setTimer: ((_fn: () => void, ms: number) => {
      hen.push(ms);
      return hen.length as unknown as NodeJS.Timeout;
    }) as (fn: () => void, ms: number) => NodeJS.Timeout,
    clearTimer: () => {},
  });

  /** Chay mot luot roi tra ve so ms duoc hen cho luot ke tiep. */
  async function motLuot(): Promise<number> {
    await poller.tick();
    // loop() moi la cho dat hen gio; goi tay cho tuong duong.
    const truoc = hen.length;
    (poller as unknown as { loop: () => Promise<void> }).loop = async () => {};
    poller['timer'] = null;
    // Dung lai dung cong thuc loop() dung, qua duong rieng de khong chay tick lan hai.
    const delay = (poller as unknown as { nextDelayMs: () => number }).nextDelayMs();
    hen.push(delay);
    expect(hen.length).toBe(truoc + 1);
    return delay;
  }

  return { poller, gio, hen, motLuot, executeJavaScript };
}

/**
 * Neo nhip vao luoi co dinh theo pha rieng cua quan.
 *
 * Cong "now + nhip" thi moi luot cham lam quan troi them chung ay; sau vai phut
 * cac quan dam vao nhau. Neo luoi thi quan luon ban o cac moc ≡ pha (mod nhip).
 */
describe('neo nhip vao luoi', () => {
  it('luot cham khong lam troi pha: van ve dung moc luoi ke tiep', async () => {
    const t = dung({ khoiDauTreMs: 0, nhipMs: 5000 });
    // Luot nay ton 1,2 giay.
    t.gio.hienTai = T0 + 1200;
    const delay = await t.motLuot();
    // Neo luoi: moc ke tiep la T0+5000, tuc con 3800ms.
    expect(delay).toBe(3800);
  });

  it('cong dan thi troi, neo luoi thi khong — chay 20 luot van dung pha', async () => {
    const t = dung({ khoiDauTreMs: 1667, nhipMs: 5000 });
    let luc = T0;
    for (let i = 0; i < 20; i++) {
      // Moi luot ton mot khoang khac nhau, dung nhu ngoai doi.
      t.gio.hienTai = luc + 100 + ((i * 137) % 900);
      const delay = await t.motLuot();
      luc = t.gio.hienTai + delay;
      // Moc ban ra LUON dong du theo pha, du luot vua roi ton bao lau.
      expect((luc - T0 - 1667) % 5000, `luot ${i}`).toBe(0);
    }
  });

  /**
   * Hai quan pha khac nhau phai giu nguyen khoang cach mai mai — do chinh la
   * thu bi mat trong lan do 02/09.
   */
  it('hai quan khac pha giu nguyen khoang cach sau nhieu luot', async () => {
    const a = dung({ khoiDauTreMs: 0, nhipMs: 5000 });
    const b = dung({ khoiDauTreMs: 1667, nhipMs: 5000 });
    let lucA = T0;
    let lucB = T0;

    for (let i = 0; i < 15; i++) {
      // Quan A xu ly nhanh, quan B cham hon — kieu lech dan toi don cuc.
      a.gio.hienTai = lucA + 50;
      lucA = a.gio.hienTai + (await a.motLuot());
      b.gio.hienTai = lucB + 900;
      lucB = b.gio.hienTai + (await b.motLuot());
    }

    // Khoang cach van dung 1667ms, khong tan di.
    // Chuan hoa modulo: `%` cua JS giu dau am khi lucB roi vao truoc lucA.
    const lech = (((lucB - lucA) % 5000) + 5000) % 5000;
    expect(lech).toBe(1667);
  });

  it('luot ton dung mot nhip thi di toi o sau, khong tra 0', async () => {
    const t = dung({ khoiDauTreMs: 0, nhipMs: 5000 });
    t.gio.hienTai = T0 + 5000;
    expect(await t.motLuot()).toBe(5000);
  });

  // Luot ton HON mot nhip: bo o vua lo, khong don lai nhieu luot mot luc.
  it('luot ton hon mot nhip thi bo o do, khong don lai', async () => {
    const t = dung({ khoiDauTreMs: 0, nhipMs: 5000 });
    t.gio.hienTai = T0 + 7300;
    expect(await t.motLuot()).toBe(2700);
  });

  it('pha lon hon nhip van quy ve dung o trong nhip', async () => {
    const t = dung({ khoiDauTreMs: 7000, nhipMs: 5000 });
    t.gio.hienTai = T0;
    // 7000 mod 5000 = 2000.
    expect(await t.motLuot()).toBe(2000);
  });

  it('quan dong cua chuyen sang nhip cham nhung van neo luoi', async () => {
    const t = dung({ khoiDauTreMs: 0, nhipMs: 5000, nhipDongCuaMs: 30_000, quanDangMo: false });
    t.gio.hienTai = T0 + 4000;
    expect(await t.motLuot()).toBe(26_000);
  });

  // 14 quan rai deu: khong hai quan nao trung moc, va deu nam trong mot nhip.
  it('14 quan rai deu cho ra 14 moc doi mot khac nhau', () => {
    const moc = Array.from({ length: 14 }, (_, i) => treKhoiDauMs(i, 14, 5000));
    expect(new Set(moc).size).toBe(14);
    expect(Math.max(...moc)).toBeLessThan(5000);
  });
});

/**
 * Lui khi Grab tra 429.
 *
 * Truoc khi co, 429 roi vao nhanh loi chung -> state 'loi' -> nhip sau van goi
 * lai sau dung 5 giay. Tuc la bi chan vi goi qua nhieu, va phan ung la goi tiep
 * y nguyen nhip do.
 */
describe('lui khi bi chan (429)', () => {
  it('bi chan mot lan thi lui xa hon mot nhip thuong', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 429 });
    const delay = await t.motLuot();
    expect(delay).toBeGreaterThan(5000);
  });

  it('bi chan lien tiep thi lui ngay cang xa', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 429 });
    const d1 = await t.motLuot();
    t.gio.hienTai += d1;
    const d2 = await t.motLuot();
    t.gio.hienTai += d2;
    const d3 = await t.motLuot();

    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });

  /**
   * Lui vo han thi mot dot chan ngan cung lam quan im het buoi. Phai co tran.
   */
  it('lui co tran, khong tang mai', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 429 });
    let d = 0;
    for (let i = 0; i < 30; i++) {
      d = await t.motLuot();
      t.gio.hienTai += d;
    }
    expect(d).toBeLessThanOrEqual(120_000);
  });

  /**
   * Qua duoc mot luot la Grab da thoi chan: phai ve nhip thuong NGAY, khong
   * giu lui. Giu lui sau khi da thong la tu lam cham don cua minh.
   */
  it('qua duoc mot luot thi ve ngay nhip thuong', async () => {
    const ma = { hienTai: 429 };
    const t = dung({ khoiDauTreMs: 0, nhipMs: 5000, maTraVe: () => ma.hienTai });

    const luiLan1 = await t.motLuot();
    expect(luiLan1).toBeGreaterThan(5000);

    ma.hienTai = 200;
    t.gio.hienTai = T0 + 20_000;
    const sauKhiThong = await t.motLuot();
    expect(sauKhiThong).toBeLessThanOrEqual(5000);
  });

  it('thong roi bi chan lai thi lui tu dau, khong noi tiep lan truoc', async () => {
    const ma = { hienTai: 429 };
    const t = dung({ nhipMs: 5000, maTraVe: () => ma.hienTai });

    await t.motLuot();
    t.gio.hienTai += 20_000;
    const d2 = await t.motLuot();
    t.gio.hienTai += d2;

    ma.hienTai = 200;
    t.gio.hienTai += 1000;
    await t.motLuot();

    ma.hienTai = 429;
    t.gio.hienTai += 1000;
    const luiMoi = await t.motLuot();
    // Lui lai tu bac dau, khong phai noi tiep bac cao cua dot truoc.
    expect(luiMoi).toBe(10_000);
  });

  /**
   * BI CHAN KHONG PHAI HONG. Dat state='loi' se lam watchdog dem nguoc toi luc
   * tai lai trang — mot viec vua vo ich (tai lai khong go duoc chan) vua them
   * tai dung luc dang phai bot tai.
   */
  it('bi chan KHONG chuyen trang thai sang loi', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 429 });
    await t.motLuot();
    expect(t.poller.stats.state).not.toBe('loi');
  });

  it('bi chan van noi ro ly do tren giao dien', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 429 });
    await t.motLuot();
    expect(t.poller.stats.lastError).toContain('429');
  });

  // Loi khac 429 (vd 500) van phai vao nhanh loi cu, khong duoc lui im lang.
  it('loi khac 429 van vao trang thai loi nhu cu', async () => {
    const t = dung({ nhipMs: 5000, maTraVe: () => 500 });
    const delay = await t.motLuot();
    expect(t.poller.stats.state).toBe('loi');
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
