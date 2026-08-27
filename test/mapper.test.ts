import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapOrder, toVnDateTime } from '../src/core/mapper.js';
import type { StoreConfig } from '../src/core/types.js';
import type { GrabOrderDetailResponse } from '../src/grab/types.js';

/**
 * Test chay tren RESPONSE THAT cua Grab (da an danh) — cung tinh than voi
 * OrderParserRealDumpTest cua notiftest: ghim ca duong ong bien doi vao du lieu
 * that, chu khong phai vao mot object tu bia ra cho khop voi code.
 */

const STORE: StoreConfig = {
  grabMerchantID: '5-C7XUNYEVEADYN2',
  ccmanyStoreID: 'STORE1',
  storeName: 'Quan Test',
  enabled: true,
};

function fixture(name: string): GrabOrderDetailResponse {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as GrabOrderDetailResponse;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── GF-666: 3 mon, khong topping ─────────────────────────────────────────────

describe('GF-666 — don don gian, khong topping', () => {
  const { payload, warnings } = mapOrder(fixture('detail-gf666.json'), STORE);

  it('khong co canh bao nao', () => {
    expect(warnings).toEqual([]);
  });

  it('order_number la ma DAI, order_code moi la so ngan', () => {
    expect(payload.order_number).toBe('001740450298-C8D2EXU3RGMHE2');
    expect(payload.order_code).toBe('GF-666');
  });

  it('doi moc UTC sang gio Viet Nam', () => {
    // 2026-08-27T10:07:20Z + 7h = 17:07 ngay 27/08
    expect(payload.created_at).toBe('27/08/2026 - 17:07');
  });

  it('gan danh tinh quan tu config', () => {
    expect(payload.store_id).toBe('STORE1');
    expect(payload.store_name).toBe('Quan Test');
  });

  it('tien khop voi hoa don', () => {
    expect(payload.subtotal).toBe(141000);
    expect(payload.total).toBe(141000);
    expect(payload.tax).toBe(0);
  });

  it('KHONG map khuyen mai vao discount', () => {
    // fare.promotionDisplay cua don nay la "2.000" — tien Grab bu cho khach,
    // khong tru vao tien quan. Map vao day la pha quan he
    // total = subtotal - discount - tax ma ccmany dua vao.
    expect(payload.discount).toBe(0);
  });

  it('tong gia mon bang subtotal', () => {
    const sum = payload.items.reduce((acc, item) => acc + item.price, 0);
    expect(sum).toBe(payload.subtotal);
  });

  it('doc dung 3 mon, khong mon nao co topping', () => {
    expect(payload.items).toHaveLength(3);
    expect(payload.items.every((item) => item.modifiers.length === 0)).toBe(true);
  });

  it('mon so luong 2 lay TONG DONG chu khong phai don gia', () => {
    // "Combo Kem Song Vi" — priceDisplay "100.000" (tong dong),
    // priceFloat 50000 (don gia). Lay nham priceFloat la sai mot nua tien.
    const combo = payload.items[1]!;
    expect(combo.quantity).toBe(2);
    expect(combo.price).toBe(100000);
  });

  it('khong co tai xe thi gui object rong, KHONG phai null', () => {
    // API ccmany tu choi JSON null o truong driver.
    expect(payload.driver).toEqual({ name: '', phone: '' });
  });
});

// ── GF-547: co topping — fixture quan trong nhat ─────────────────────────────

describe('GF-547 — don co topping', () => {
  const { payload, warnings } = mapOrder(fixture('detail-gf547.json'), STORE);

  it('khong co canh bao nao', () => {
    expect(warnings).toEqual([]);
  });

  it('doi moc UTC sang gio Viet Nam', () => {
    expect(payload.created_at).toBe('28/08/2026 - 11:24');
  });

  it('tong gia mon bang subtotal (121.000)', () => {
    const sum = payload.items.reduce((acc, item) => acc + item.price, 0);
    expect(sum).toBe(121000);
    expect(payload.subtotal).toBe(121000);
    expect(payload.total).toBe(121000);
  });

  it('gia mon DA gom topping: 19.000 + 4.000 + 3.000 = 26.000', () => {
    const sting = payload.items[2]!;
    expect(sting.name).toBe('Sting Đỏ');
    expect(sting.price).toBe(26000);
    expect(sting.modifiers).toEqual([
      { name: 'option3', price: 4000, quantity: 1 },
      { name: 'option2', price: 3000, quantity: 1 },
    ]);
    // Chot: gia mon = gia goc + tong topping
    const toppings = sting.modifiers.reduce((acc, m) => acc + m.price, 0);
    expect(sting.price).toBe(19000 + toppings);
  });

  it('trai phang mang topping hai tang', () => {
    // Grab tra ve modifierGroups[] -> modifiers[]; ccmany chi nhan mot tang.
    const sting2 = payload.items[3]!;
    expect(sting2.modifiers.map((m) => m.name)).toEqual(['option2', 'option1']);
    expect(sting2.price).toBe(24000);
  });

  it('hai mon TRUNG TEN khac topping phai la hai dong rieng', () => {
    const stings = payload.items.filter((item) => item.name === 'Sting Đỏ');
    expect(stings).toHaveLength(2);
    expect(stings[0]!.price).not.toBe(stings[1]!.price);
  });

  it('KHONG dien original_price tu originalItemPriceDisplay', () => {
    // originalItemPriceDisplay = 19.000 la gia CHUA cong topping, khac han
    // nghia "gia gach ngang khi co khuyen mai" ma ccmany mong doi.
    expect(payload.items.every((item) => item.original_price === null)).toBe(true);
  });

  it('giu ghi chu rieng cua tung mon', () => {
    expect(payload.items[0]!.note).toBe('note: test note kem quế dâu');
    expect(payload.items[2]!.note).toBe('note: chọn option 3 và option 2');
    expect(payload.items[1]!.note).toBe('');
  });
});

// ── Cac chot canh bao ────────────────────────────────────────────────────────

describe('chot kiem tra so lieu', () => {
  it('canh bao khi total lech khoi subtotal - discount - tax', () => {
    const broken = clone(fixture('detail-gf547.json'));
    broken.order!.fare!.taxDisplay = '10.000';
    const { warnings } = mapOrder(broken, STORE);
    expect(warnings.some((w) => w.includes('total'))).toBe(true);
  });

  it('canh bao khi tong gia mon lech khoi subtotal', () => {
    const broken = clone(fixture('detail-gf547.json'));
    broken.order!.itemInfo!.items!.pop();
    const { warnings } = mapOrder(broken, STORE);
    expect(warnings.some((w) => w.includes('Tong gia mon'))).toBe(true);
  });

  it('canh bao khi don da co tai xe — cau truc chua tung kiem chung', () => {
    const withDriver = clone(fixture('detail-gf547.json'));
    withDriver.order!.driver = { name: 'Tai Xe Test', phone: '+84900000000' };
    const { payload, warnings } = mapOrder(withDriver, STORE);
    expect(payload.driver).toEqual({ name: 'Tai Xe Test', phone: '+84900000000' });
    expect(warnings.some((w) => w.includes('tai xe'))).toBe(true);
  });
});

// ── Hong to, khong hong am tham ──────────────────────────────────────────────

describe('nem loi khi du lieu khong dung duoc', () => {
  it('thieu orderID', () => {
    const broken = clone(fixture('detail-gf547.json'));
    delete broken.order!.orderID;
    expect(() => mapOrder(broken, STORE)).toThrowError(/orderID/);
  });

  it('gia mon doi dinh dang (dau phay) — KHONG duoc doan bua', () => {
    const broken = clone(fixture('detail-gf547.json'));
    broken.order!.itemInfo!.items![0]!.fare!.priceDisplay = '5,000';
    expect(() => mapOrder(broken, STORE)).toThrowError(/priceDisplay/);
  });

  it('don khong co mon nao', () => {
    const broken = clone(fixture('detail-gf547.json'));
    broken.order!.itemInfo!.items = [];
    expect(() => mapOrder(broken, STORE)).toThrowError(/mon/);
  });

  it('moc thoi gian sai dinh dang', () => {
    const broken = clone(fixture('detail-gf547.json'));
    broken.order!.times!.createdAt = 'hom qua';
    expect(() => mapOrder(broken, STORE)).toThrowError(/thoi gian/);
  });
});

// ── Truong tien vang mat thi chi canh bao, khong nem ─────────────────────────

describe('phan biet "vang mat" voi "sai dinh dang"', () => {
  it('truong tien vang mat -> null + canh bao, van gui duoc', () => {
    const partial = clone(fixture('detail-gf547.json'));
    delete partial.order!.fare!.totalDisplay;
    const { payload, warnings } = mapOrder(partial, STORE);
    expect(payload.total).toBeNull();
    expect(warnings.some((w) => w.includes('totalDisplay'))).toBe(true);
  });
});

// ── Co ORDER_NUMBER_WITH_DATE ────────────────────────────────────────────────

describe('co order_number kem ngay', () => {
  it('tat (mac dinh) -> dung orderID', () => {
    const { payload } = mapOrder(fixture('detail-gf547.json'), STORE);
    expect(payload.order_number).toBe('001500221566-C8D2VEDVCY5WSA');
  });

  it('bat -> "GF-547-28082026", van duy nhat ma de doc', () => {
    const { payload } = mapOrder(fixture('detail-gf547.json'), STORE, {
      orderNumberWithDate: true,
    });
    expect(payload.order_number).toBe('GF-547-28082026');
    expect(payload.order_code).toBe('GF-547');
  });
});

// ── Doi mui gio ──────────────────────────────────────────────────────────────

describe('toVnDateTime', () => {
  it('cong dung 7 tieng', () => {
    expect(toVnDateTime('2026-08-28T04:24:32Z')).toBe('28/08/2026 - 11:24');
  });

  it('sang som UTC phai nhay sang ngay hom sau o Viet Nam', () => {
    expect(toVnDateTime('2026-08-27T18:30:00Z')).toBe('28/08/2026 - 01:30');
  });

  it('khong phu thuoc mui gio cua may chay test', () => {
    // Cong thang offset roi doc bang getUTC*, nen ket qua giong nhau du may o
    // dau. Neu ai do doi sang toLocaleString thi test nay se do tren may khac.
    const before = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(toVnDateTime('2026-08-28T04:24:32Z')).toBe('28/08/2026 - 11:24');
      process.env.TZ = 'Asia/Tokyo';
      expect(toVnDateTime('2026-08-28T04:24:32Z')).toBe('28/08/2026 - 11:24');
    } finally {
      process.env.TZ = before;
    }
  });
});
