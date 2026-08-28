import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorePoller } from '../src/core/poller.js';
import { OrderCache } from '../src/core/cache.js';
import { GrabClient, SessionExpiredError } from '../src/grab/client.js';
import { CcmanyUploader } from '../src/core/uploader.js';
import { TelegramNotifier } from '../src/core/telegram.js';
import { Logger } from '../src/core/log.js';
import { loadConfig } from '../src/core/config.js';
import type { StoreConfig } from '../src/core/types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'poller-test-'));
  dongHo.gioHienTai = T0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const STORE: StoreConfig = {
  grabMerchantID: '5-C7XUNYEVEADYN2',
  ccmanyStoreID: 'STORE1',
  storeName: 'Quan Test',
  enabled: true,
};

// Dat sat sau createdAt cua don trong fixture (2026-08-28T04:24:32Z), de don do
// nam trong cua so thoi gian cua lop 2 — dung nhu mot don vua ve that.
const T0 = Date.parse('2026-08-28T04:30:00Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

/**
 * Dung mot poller that voi client gia. Client duoc gia o TANG ScriptRunner —
 * tuc la van di qua toan bo GrabClient that (dung URL, doc JSON, anh xa loi),
 * chi thay moi cho chay fetch trong trang.
 */
/** Dong ho dich duoc, de do "da hong bao lau". */
const dongHo = { gioHienTai: T0 };

function build(options: {
  list?: unknown;
  detail?: unknown;
  listError?: Error;
  /** Loi thay doi duoc giua cac nhip — de dung canh hong roi phuc hoi. */
  listErrorHienTai?: () => Error | null;
  detailError?: Error;
  uploadOk?: boolean;
  dryRun?: boolean;
  maxOrderAttempts?: number;
}) {
  const list = options.list ?? fixture('list-gf547.json');
  const detail = options.detail ?? fixture('detail-gf547.json');

  const executeJavaScript = vi.fn(async (code: string) => {
    if (code.includes('open-status')) {
      return { status: 200, ok: true, body: JSON.stringify(fixture('open-status.json')) };
    }
    if (code.includes('orders-pagination')) {
      const loiDong = options.listErrorHienTai?.();
      if (loiDong) throw loiDong;
      if (options.listError) throw options.listError;
      return { status: 200, ok: true, body: JSON.stringify(list) };
    }
    if (options.detailError) throw options.detailError;
    return { status: 200, ok: true, body: JSON.stringify(detail) };
  });

  const client = new GrabClient({ getRunner: () => ({ executeJavaScript }) });

  const cache = new OrderCache(STORE.ccmanyStoreID, {
    dir: join(root, 'cache'),
    lookbackMinutes: 15,
    now: () => T0,
  });

  const config = {
    ...loadConfig({ CCMANY_API_URL: 'https://x/y', CCMANY_API_KEY: 'K', DRY_RUN: 'true' }, root),
    maxOrderAttempts: options.maxOrderAttempts ?? 5,
  };

  const uploadFetch = vi.fn(async () =>
    options.uploadOk === false ? new Response('loi', { status: 500 }) : new Response('{}'),
  );
  const uploader = new CcmanyUploader({
    url: config.ccmany.url,
    apiKey: config.ccmany.apiKey,
    dryRun: options.dryRun ?? false,
    dataDir: config.dataDir,
    fetchImpl: uploadFetch as never,
    sleep: async () => {},
    now: () => T0,
  });

  const telegramFetch = vi.fn(async () => new Response('{}'));
  const telegram = new TelegramNotifier({
    config: { botToken: 'T', chatId: '1' },
    fetchImpl: telegramFetch as never,
    sleep: async () => {},
  });

  const poller = new StorePoller({
    store: STORE,
    config,
    client,
    cache,
    uploader,
    telegram,
    logger: new Logger({ level: 'error' }),
    now: () => dongHo.gioHienTai,
  });

  return { poller, cache, executeJavaScript, uploadFetch, telegramFetch, config, dongHo, telegram };
}

// ── Luong chinh ──────────────────────────────────────────────────────────────

describe('luong chinh: thay don moi -> gui -> ghi cache', () => {
  it('gui don moi va ghi nhan vao cache', async () => {
    const { poller, cache, uploadFetch } = build({});
    await poller.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(1);
    expect(cache.has('001500221566-C8D2VEDVCY5WSA')).toBe(true);
    expect(poller.stats.soDonHomNay).toBe(1);
    expect(poller.stats.donGanNhat?.orderCode).toBe('GF-547');
  });

  it('gui dung payload da bien doi', async () => {
    const { poller, uploadFetch } = build({});
    await poller.tick();

    const payload = JSON.parse((uploadFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(payload.order_code).toBe('GF-547');
    expect(payload.total).toBe(121000);
    expect(payload.items).toHaveLength(5);
  });

  it('luu JSON tho TRUOC khi bien doi', async () => {
    const { poller, config } = build({});
    await poller.tick();

    const file = join(config.dataDir, 'raw', '001500221566-C8D2VEDVCY5WSA.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).order.displayID).toBe('GF-547');
  });

  it('bao Telegram khi gui xong', async () => {
    const { poller, telegramFetch } = build({});
    await poller.tick();

    const text = JSON.parse((telegramFetch.mock.calls[0]![1] as RequestInit).body as string).text;
    expect(text).toContain('GF-547');
  });
});

// ── Khong gui trung ──────────────────────────────────────────────────────────

describe('khong gui trung', () => {
  it('nhip thu hai KHONG gui lai, va khong ca goi chi tiet', async () => {
    // Don nam li trong tab cho toi khi nhan vien xu ly, nen moi nhip deu nhin
    // thay lai. Cache la thu duy nhat chan gui trung.
    const { poller, uploadFetch, executeJavaScript } = build({});
    await poller.tick();
    const goiSauNhipDau = executeJavaScript.mock.calls.length;

    await poller.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(1);
    // Nhip hai chi goi danh sach, khong goi chi tiet nua.
    expect(executeJavaScript.mock.calls.length).toBe(goiSauNhipDau + 1);
  });
});

// ── Gui hong ─────────────────────────────────────────────────────────────────

describe('gui hong', () => {
  it('KHONG ghi cache khi gui that bai -> nhip sau thu lai', async () => {
    const { poller, cache, uploadFetch } = build({ uploadOk: false });

    await poller.tick();
    expect(cache.has('001500221566-C8D2VEDVCY5WSA')).toBe(false);

    await poller.tick();
    expect(uploadFetch.mock.calls.length).toBeGreaterThan(3); // da thu lai
  });

  it('bo cuoc sau MAX_ORDER_ATTEMPTS va bao MOT lan', async () => {
    const { poller, telegramFetch } = build({ uploadOk: false, maxOrderAttempts: 2 });

    await poller.tick();
    await poller.tick();
    const sauKhiBoCuoc = telegramFetch.mock.calls.length;
    await poller.tick();
    await poller.tick();

    // Khong bao them lan nao nua sau khi da bo cuoc.
    expect(telegramFetch.mock.calls.length).toBe(sauKhiBoCuoc);
    const canhbao = telegramFetch.mock.calls
      .map((c) => JSON.parse((c[1] as RequestInit).body as string).text)
      .filter((t: string) => t.includes('khong gui duoc'));
    expect(canhbao).toHaveLength(1);
  });

  it('loi cua mot don KHONG lam chet vong lap', async () => {
    const { poller } = build({ detailError: new Error('mang chap chon') });
    await expect(poller.tick()).resolves.toBeUndefined();
    expect(poller.stats.state).not.toBe('dung');
  });
});

// ── Mat phien ────────────────────────────────────────────────────────────────

describe('mat phien', () => {
  function buildExpired() {
    const executeJavaScript = vi.fn(async () => ({ status: 401, ok: false, body: '' }));
    const client = new GrabClient({ getRunner: () => ({ executeJavaScript }) });
    const telegramFetch = vi.fn(async () => new Response('{}'));
    const config = loadConfig({ CCMANY_API_URL: 'https://x/y', CCMANY_API_KEY: 'K' }, root);

    const poller = new StorePoller({
      store: STORE,
      config,
      client,
      cache: new OrderCache(STORE.ccmanyStoreID, { dir: join(root, 'cache'), now: () => T0 }),
      uploader: new CcmanyUploader({
        url: 'https://x/y',
        apiKey: 'K',
        dryRun: true,
        dataDir: config.dataDir,
      }),
      telegram: new TelegramNotifier({
        config: { botToken: 'T', chatId: '1' },
        fetchImpl: telegramFetch as never,
        sleep: async () => {},
      }),
      logger: new Logger({ level: 'error' }),
      now: () => T0,
    });
    return { poller, telegramFetch };
  }

  it('401 -> trang thai mat-phien', async () => {
    const { poller } = buildExpired();
    await poller.tick();
    expect(poller.stats.state).toBe('mat-phien');
  });

  it('chi bao Telegram MOT lan, khong spam moi nhip', async () => {
    const { poller, telegramFetch } = buildExpired();
    for (let i = 0; i < 5; i++) await poller.tick();

    const baoMatPhien = telegramFetch.mock.calls
      .map((c) => JSON.parse((c[1] as RequestInit).body as string).text)
      .filter((t: string) => t.includes('mat phien'));
    expect(baoMatPhien).toHaveLength(1);
  });
});

// ── Cua so thoi gian khi khoi dong lanh ──────────────────────────────────────

describe('khoi dong lanh', () => {
  it('bo qua don cu hon cua so, khong goi chi tiet', async () => {
    const list = fixture('list-gf547.json') as { orders: { times: { createdAt: string } }[] };
    list.orders[0]!.times.createdAt = at(-120); // 2 tieng truoc

    const { poller, uploadFetch } = build({ list });
    await poller.tick();

    expect(uploadFetch).not.toHaveBeenCalled();
  });

  it('van nhan don trong cua so', async () => {
    const list = fixture('list-gf547.json') as { orders: { times: { createdAt: string } }[] };
    list.orders[0]!.times.createdAt = at(-5);

    const { poller, uploadFetch } = build({ list });
    await poller.tick();

    expect(uploadFetch).toHaveBeenCalledTimes(1);
  });
});

// ── Danh sach rong ───────────────────────────────────────────────────────────

describe('danh sach rong', () => {
  it('khong lam gi ca, khong loi', async () => {
    const { poller, uploadFetch } = build({ list: fixture('list-empty.json') });
    await poller.tick();

    expect(uploadFetch).not.toHaveBeenCalled();
    expect(poller.stats.state).toBe('dang-chay');
    expect(poller.stats.lastPollAt).not.toBeNull();
  });
});

// ── Che do chay kho ──────────────────────────────────────────────────────────

describe('che do chay kho', () => {
  it('ghi ra dia, khong goi ccmany, VAN ghi cache', async () => {
    const { poller, cache, uploadFetch } = build({ dryRun: true });
    await poller.tick();

    expect(uploadFetch).not.toHaveBeenCalled();
    expect(cache.has('001500221566-C8D2VEDVCY5WSA')).toBe(true);
  });
});

/**
 * Phuc hoi phai on ao ngang voi hong.
 *
 * O muc log `info`, luot poll thanh cong khong ghi gi ca — chi luot hong moi
 * ghi. Nen doc log KHONG phan biet duoc "da chay lai roi" voi "van hong, chi la
 * thoi khong ghi nua". Da dam phai dung cho nay khi thu rut mang o Task 10: log
 * dung o dong hong cuoi cung va khong ai doan duoc ket cuc.
 */
describe('bao khi phuc hoi', () => {
  function tinNhan(fetchMock: { mock: { calls: unknown[][] } }): string[] {
    return fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).text as string,
    );
  }

  it('mat mang roi ket noi lai thi bao mot tin', async () => {
    let loi: Error | null = new TypeError('fetch failed');
    const { poller, telegramFetch } = build({ listErrorHienTai: () => loi });

    await poller.tick();
    expect(poller.stats.state).toBe('loi');
    expect(tinNhan(telegramFetch).some((t) => t.includes('tro lai'))).toBe(false);

    // Bon phut sau, mang ve.
    dongHo.gioHienTai = T0 + 4 * 60_000;
    loi = null;
    await poller.tick();

    expect(poller.stats.state).toBe('dang-chay');
    const bao = tinNhan(telegramFetch).find((t) => t.includes('Da ket noi lai duoc'));
    expect(bao).toBeDefined();
    expect(bao).toContain('4 phut');
  });

  it('mat phien roi dang nhap lai thi bao dung cau khac', async () => {
    let loi: Error | null = new SessionExpiredError(401);
    const { poller, telegramFetch } = build({ listErrorHienTai: () => loi });

    await poller.tick();
    expect(poller.stats.state).toBe('mat-phien');

    dongHo.gioHienTai = T0 + 30_000;
    loi = null;
    await poller.tick();

    expect(poller.stats.state).toBe('dang-chay');
    expect(tinNhan(telegramFetch).some((t) => t.includes('Da co phien Grab tro lai'))).toBe(true);
  });

  it('chay binh thuong lien tuc thi KHONG bao phuc hoi', async () => {
    const { poller, telegramFetch } = build({ listErrorHienTai: () => null });
    await poller.tick();
    await poller.tick();
    expect(tinNhan(telegramFetch).some((t) => t.includes('tro lai'))).toBe(false);
  });

  it('van dang hong thi khong bao phuc hoi som', async () => {
    const { poller, telegramFetch } = build({
      listErrorHienTai: () => new TypeError('fetch failed'),
    });
    await poller.tick();
    await poller.tick();
    await poller.tick();
    expect(tinNhan(telegramFetch).some((t) => t.includes('tro lai'))).toBe(false);
  });
});
