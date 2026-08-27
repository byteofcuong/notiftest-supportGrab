import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrderCache } from '../src/core/cache.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cache-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const T0 = Date.parse('2026-08-28T10:00:00Z');
const at = (minutesFromT0: number) => new Date(T0 + minutesFromT0 * 60_000).toISOString();
const clock = (minutesFromT0 = 0) => () => T0 + minutesFromT0 * 60_000;

describe('lop 1 — tap orderID da gui', () => {
  it('ghi nhan roi nho', () => {
    const cache = new OrderCache('STORE1', { dir, now: clock() });
    expect(cache.has('A')).toBe(false);
    cache.markSent('A');
    expect(cache.has('A')).toBe(true);
  });

  it('nap lai duoc sau khi khoi dong lai', () => {
    new OrderCache('STORE1', { dir, now: clock() }).markSent('A');

    const reloaded = new OrderCache('STORE1', { dir, now: clock() });
    expect(reloaded.has('A')).toBe(true);
    expect(reloaded.coldStart).toBe(false);
  });

  it('day don cu nhat ra khi vuot tran', () => {
    const cache = new OrderCache('STORE1', { dir, maxEntries: 3, now: clock() });
    for (const id of ['A', 'B', 'C', 'D']) cache.markSent(id);

    expect(cache.size).toBe(3);
    expect(cache.has('A')).toBe(false); // cu nhat, bi day ra
    expect(cache.has('D')).toBe(true);
  });

  it('hai quan khong dam chan nhau', () => {
    new OrderCache('STORE1', { dir, now: clock() }).markSent('CHUNG');

    const store2 = new OrderCache('STORE2', { dir, now: clock() });
    expect(store2.has('CHUNG')).toBe(false); // cung orderID nhung khac quan
    store2.markSent('CHUNG');

    expect(readdirSync(dir).sort()).toEqual(['STORE1.json', 'STORE2.json']);
    // Quan 1 khong bi anh huong boi viec quan 2 ghi cung ma don do
    expect(new OrderCache('STORE1', { dir, now: clock() }).size).toBe(1);
  });

  it('chua gui gi thi chua ghi file — cache rong khong co gia tri', () => {
    new OrderCache('STORE1', { dir, now: clock() });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('ghi nhan hai lan khong tao ban ghi trung', () => {
    const cache = new OrderCache('STORE1', { dir, now: clock() });
    cache.markSent('A');
    cache.markSent('A');
    expect(cache.size).toBe(1);
  });
});

describe('lop 2 — cua so thoi gian khi KHOI DONG LANH', () => {
  it('bo qua don cu hon cua so, kem ly do', () => {
    const cache = new OrderCache('STORE1', { dir, lookbackMinutes: 15, now: clock() });
    expect(cache.coldStart).toBe(true);

    const decision = cache.decide('CU', at(-20));
    expect(decision.send).toBe(false);
    if (!decision.send) expect(decision.reason).toBe('cu-hon-cua-so');
  });

  it('van nhan don nam trong cua so', () => {
    const cache = new OrderCache('STORE1', { dir, lookbackMinutes: 15, now: clock() });
    expect(cache.decide('MOI', at(-5)).send).toBe(true);
  });

  it('van nhan don den SAU khi khoi dong', () => {
    // Moc san chot mot lan luc khoi dong, nen don moi ve sau luon lot.
    const cache = new OrderCache('STORE1', { dir, lookbackMinutes: 15, now: clock() });
    expect(cache.decide('RAT-MOI', at(120)).send).toBe(true);
  });

  it('mat file cache -> chi gui lai don trong cua so, khong gui ca tab', () => {
    const warm = new OrderCache('STORE1', { dir, now: clock() });
    warm.markSent('DON-CU');

    rmSync(join(dir, 'STORE1.json'));

    const cold = new OrderCache('STORE1', { dir, lookbackMinutes: 15, now: clock() });
    expect(cold.coldStart).toBe(true);
    expect(cold.decide('DON-CU', at(-60)).send).toBe(false); // cu -> bo qua
    expect(cold.decide('DON-VUA', at(-3)).send).toBe(true); // moi -> van gui
  });

  it('thieu createdAt luc khoi dong lanh thi chon GUI', () => {
    // Gui trung con cuu duoc (ccmany dedup theo order_number); mat don thi khong.
    const cache = new OrderCache('STORE1', { dir, now: clock() });
    expect(cache.decide('KHONG-RO', undefined).send).toBe(true);
    expect(cache.decide('SAI-DINH-DANG', 'hom qua').send).toBe(true);
  });
});

describe('lop 2 KHONG duoc ap dung khi cache con nguyen', () => {
  it('don dat truoc (createdAt cu hang gio) van duoc gui', () => {
    // Day la ly do lop 2 chi chay khi khoi dong lanh. Don dat truoc nam o tab
    // Upcoming rat lau roi moi nhay sang PreparingV2 — luc do createdAt da cu.
    // Neu loc theo thoi gian ca khi cache con nguyen thi don do bi nuot.
    new OrderCache('STORE1', { dir, now: clock() }).markSent('KHOI-DONG');

    const warm = new OrderCache('STORE1', { dir, lookbackMinutes: 15, now: clock() });
    expect(warm.coldStart).toBe(false);
    expect(warm.decide('DON-DAT-TRUOC', at(-300)).send).toBe(true);
  });

  it('don da gui van bi chan boi lop 1', () => {
    const first = new OrderCache('STORE1', { dir, now: clock() });
    first.markSent('DA-GUI');

    const warm = new OrderCache('STORE1', { dir, now: clock() });
    const decision = warm.decide('DA-GUI', at(0));
    expect(decision.send).toBe(false);
    if (!decision.send) expect(decision.reason).toBe('da-gui');
  });
});

describe('ben bi voi file dia', () => {
  it('file hong -> coi nhu khoi dong lanh, khong lam chet tien trinh', () => {
    writeFileSync(join(dir, 'STORE1.json'), '{"orderIDs": [1,2,3', 'utf8');

    const cache = new OrderCache('STORE1', { dir, now: clock() });
    expect(cache.coldStart).toBe(true);
    expect(cache.size).toBe(0);
  });

  it('file dung JSON nhung sai cau truc -> cung coi la khoi dong lanh', () => {
    writeFileSync(join(dir, 'STORE1.json'), '{"khong":"phai cache"}', 'utf8');
    expect(new OrderCache('STORE1', { dir, now: clock() }).coldStart).toBe(true);
  });

  it('ghi nguyen tu — khong de lai file .tmp', () => {
    const cache = new OrderCache('STORE1', { dir, now: clock() });
    cache.markSent('A');
    expect(existsSync(join(dir, 'STORE1.json.tmp'))).toBe(false);
    expect(readdirSync(dir)).toEqual(['STORE1.json']);
  });

  it('file ghi ra doc duoc va co du thong tin', () => {
    new OrderCache('STORE1', { dir, now: clock() }).markSent('A');
    const data = JSON.parse(readFileSync(join(dir, 'STORE1.json'), 'utf8'));
    expect(data).toMatchObject({ version: 1, storeId: 'STORE1', orderIDs: ['A'] });
  });

  it('ma quan co ky tu duong dan khong thoat ra ngoai thu muc', () => {
    new OrderCache('../../hiem', { dir, now: clock() }).markSent('A');
    expect(readdirSync(dir)).toEqual(['______hiem.json']);
  });
});
