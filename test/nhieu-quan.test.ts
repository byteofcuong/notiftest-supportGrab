import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
 * N quan chay qua MOT cua so Grab (Task 4).
 *
 * File nay lap lai dung cach main.ts lap rap — mot GrabClient dung chung, moi
 * quan mot OrderCache — de bat ba kieu hong ma test tung poller rieng le khong
 * bao gio thay:
 *
 *   1. Poller cua quan A goi API bang ma quan B (lay nham bien trong vong lap).
 *   2. Hai quan dung chung mot file cache -> tap don da gui cua nhau bi ghi de,
 *      va hau qua la gui trung hoac MAT DON, khong mot dong loi nao.
 *   3. Loi cua mot quan keo chet vong lap cua quan khac.
 *
 * Ca ba deu la kieu hong im lang: app van chay, cham khay van xanh.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nhieu-quan-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const T0 = Date.parse('2026-08-28T04:30:00Z');

/** Ba quan, mang ma quan that su khac nhau — do la thu duoc kiem o day. */
const QUAN: StoreConfig[] = [
  { grabMerchantID: '5-AAAAAA', ccmanyStoreID: '5-AAAAAA', storeName: 'Quan A', enabled: true },
  { grabMerchantID: '5-BBBBBB', ccmanyStoreID: '5-BBBBBB', storeName: 'Quan B', enabled: true },
  { grabMerchantID: '5-CCCCCC', ccmanyStoreID: '5-CCCCCC', storeName: 'Quan C', enabled: true },
];

/** Don rieng cua tung quan, de biet don nao ve tu dau. */
function donCua(ma: string) {
  return {
    orders: [
      {
        orderID: `ORDER-${ma}`,
        displayID: `GF-${ma}`,
        times: { createdAt: new Date(T0 - 60_000).toISOString() },
      },
    ],
  };
}

function chiTietCua(ma: string) {
  return {
    order: {
      orderID: `ORDER-${ma}`,
      displayID: `GF-${ma}`,
      times: { createdAt: new Date(T0 - 60_000).toISOString() },
      itemInfo: { count: 1, items: [{ name: 'Mon', quantity: 1, fare: { priceDisplay: '10.000' } }] },
      fare: { subTotalDisplay: '10.000', totalDisplay: '10.000' },
    },
  };
}

/**
 * Lap rap giong main.ts: MOT client cho tat ca, cache rieng tung quan.
 *
 * `quanHong` cho phep dung canh mot quan hong ma nhung quan kia van phai chay.
 */
function lapRap(options: { quanHong?: string; nhipMs?: number } = {}) {
  /** Moi loi goi API kem ma quan doc duoc tu chinh cau lenh fetch. */
  const daGoi: { ma: string; loai: string }[] = [];

  const executeJavaScript = vi.fn(async (code: string) => {
    // Ma quan nam trong URL/header cua doan fetch ma GrabClient sinh ra. Doc
    // nguoc lai tu day la cach duy nhat biet chac quan nao vua duoc goi.
    const ma = QUAN.map((q) => q.grabMerchantID).find((m) => code.includes(m)) ?? '?';
    const loai = code.includes('open-status')
      ? 'open-status'
      : code.includes('orders-pagination')
        ? 'list'
        : 'detail';
    daGoi.push({ ma, loai });

    if (options.quanHong && ma === options.quanHong) throw new Error('Failed to fetch');

    if (loai === 'open-status') return { status: 200, ok: true, body: JSON.stringify({ isOpen: true }) };
    if (loai === 'list') return { status: 200, ok: true, body: JSON.stringify(donCua(ma)) };
    return { status: 200, ok: true, body: JSON.stringify(chiTietCua(ma)) };
  });

  // MOT client duy nhat, dung chung — day la ket luan cua §7.1.
  const client = new GrabClient({ getRunner: () => ({ executeJavaScript }) });

  const config = {
    ...loadConfig({ CCMANY_API_URL: 'https://x/y', CCMANY_API_KEY: 'K' }, root),
    pollIntervalMs: options.nhipMs ?? 5000,
  };

  const uploadFetch = vi.fn(async () => new Response('{}'));
  const uploader = new CcmanyUploader({
    url: config.ccmany.url,
    apiKey: config.ccmany.apiKey,
    dryRun: false,
    dataDir: config.dataDir,
    fetchImpl: uploadFetch as never,
    sleep: async () => {},
    now: () => T0,
  });
  const telegram = new TelegramNotifier({
    config: null,
    fetchImpl: (async () => new Response('{}')) as never,
    sleep: async () => {},
  });

  const hen: { ms: number }[] = [];
  const pollers = new Map<string, StorePoller>();
  for (const [i, s] of QUAN.entries()) {
    pollers.set(
      s.grabMerchantID,
      new StorePoller({
        store: s,
        config,
        client,
        cache: new OrderCache(s.ccmanyStoreID, {
          dir: join(config.dataDir, 'cache'),
          lookbackMinutes: 15,
          now: () => T0,
        }),
        uploader,
        telegram,
        logger: new Logger({ level: 'error' }),
        now: () => T0,
        khoiDauTreMs: treKhoiDauMs(i, QUAN.length, config.pollIntervalMs),
        setTimer: ((fn: () => void, ms: number) => {
          hen.push({ ms });
          return hen.length as unknown as NodeJS.Timeout;
        }) as (fn: () => void, ms: number) => NodeJS.Timeout,
        clearTimer: () => {},
      }),
    );
  }

  return { pollers, daGoi, uploadFetch, config, hen };
}

describe('N poller qua mot cua so dung chung', () => {
  /**
   * Ca test quan trong nhat. Mot bien lay nham trong vong lap lap rap la ca ba
   * poller cung goi API bang ma quan cua quan dau tien — va trieu chung ben
   * ngoai chi la "hai quan kia khong bao gio len don".
   */
  it('moi poller goi API bang DUNG ma quan cua no', async () => {
    const { pollers, daGoi } = lapRap();
    for (const p of pollers.values()) await p.tick();

    for (const q of QUAN) {
      const cuaQuanNay = daGoi.filter((g) => g.ma === q.grabMerchantID);
      expect(cuaQuanNay.map((g) => g.loai), q.storeName).toEqual([
        'open-status',
        'list',
        'detail',
      ]);
    }
    expect(daGoi.some((g) => g.ma === '?')).toBe(false);
  });

  /**
   * Cache tach theo `ccmanyStoreID`, va ten file lay tu do. Chung file thi tap
   * don da gui cua quan nay bi quan kia ghi de.
   */
  it('moi quan mot file cache rieng', async () => {
    const { pollers, config } = lapRap();
    for (const p of pollers.values()) await p.tick();

    const tep = readdirSync(join(config.dataDir, 'cache')).sort();
    expect(tep).toEqual(['5-AAAAAA.json', '5-BBBBBB.json', '5-CCCCCC.json']);

    // Va moi file chi chua don CUA QUAN DO.
    for (const q of QUAN) {
      const noiDung = JSON.parse(
        readFileSync(join(config.dataDir, 'cache', `${q.ccmanyStoreID}.json`), 'utf8'),
      ) as { orderIDs: string[] };
      expect(noiDung.orderIDs).toEqual([`ORDER-${q.grabMerchantID}`]);
    }
  });

  it('gui du don cua ca ba quan, khong trung khong sot', async () => {
    const { pollers, uploadFetch } = lapRap();
    for (const p of pollers.values()) await p.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(3);
    const daGui = uploadFetch.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string) as { store_id: string },
    );
    expect(daGui.map((d) => d.store_id).sort()).toEqual(['5-AAAAAA', '5-BBBBBB', '5-CCCCCC']);
  });

  it('nhip thu hai khong gui lai don nao cua quan nao', async () => {
    const { pollers, uploadFetch } = lapRap();
    for (const p of pollers.values()) await p.tick();
    for (const p of pollers.values()) await p.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(3);
  });

  /**
   * Nguyen tac 3 cua poller, mo rong sang canh nhieu quan: mot quan hong khong
   * duoc keo theo quan khac. Trong thuc te la mot quan bi Grab tra 400 vi ma
   * quan sai — hai quan kia van phai ban hang binh thuong.
   */
  it('mot quan hong thi hai quan kia van gui duoc don', async () => {
    const { pollers, uploadFetch } = lapRap({ quanHong: '5-BBBBBB' });
    for (const p of pollers.values()) await p.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(2);
    expect(pollers.get('5-BBBBBB')!.stats.state).toBe('loi');
    expect(pollers.get('5-AAAAAA')!.stats.state).toBe('dang-chay');
    expect(pollers.get('5-CCCCCC')!.stats.state).toBe('dang-chay');
  });

  // Ba quan khoi dong cach deu nhau trong mot nhip, khong don cuc.
  it('ba quan khoi dong lech pha deu nhau', () => {
    const { pollers, hen } = lapRap({ nhipMs: 3000 });
    for (const p of pollers.values()) p.start();

    // Quan dau chay ngay (khong hen), hai quan sau moi quan mot hen.
    expect(hen.map((h) => h.ms)).toEqual([1000, 2000]);
  });
});
