import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapOrder } from '../src/core/mapper.js';
import type { GrabOrderDetailResponse } from '../src/grab/types.js';
import type { StoreConfig } from '../src/core/types.js';

/**
 * GIAM GIA CUA QUAN — sua loi tien do duoc ngay 02/09/2026.
 *
 * Truoc do `discount` bi dong cung bang 0, vi hai don mau dau tien deu khong co
 * giam gia mon nao. Gap don that co giam gia thi payload thanh vo ly:
 *
 *   GF-497   subtotal 65.000   discount 0   total 60.000
 *   GF-806   subtotal 110.000  discount 0   total 96.200
 *
 * `subtotal - discount` khong ra `total`, tuc la hoa don ben ccmany khong cong
 * duoc. Tien la cho sai dat nhat trong ca cong cu, nen nhom test nay soi ky.
 *
 * BA TRUONG DE LAN NHAU, va chon nham thi ra so tien khac:
 *
 *   promotionDisplay            Grab bu cho khach, KHONG dung toi tien quan
 *   totalDiscountAmountDisplay  quan tu giam, tru THAT vao tien quan  <- dung
 *   revampedSubtotalDisplay     subtotal SAU khi giam (= total khi thue = 0)
 */

const STORE: StoreConfig = {
  grabMerchantID: '5-AAA',
  ccmanyStoreID: '5-AAA',
  storeName: 'Quan Test',
  enabled: true,
};

function fixture(ten: string): GrabOrderDetailResponse {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', ten), 'utf8'),
  ) as GrabOrderDetailResponse;
}

describe('don co giam gia — GF-497 (giam so tien tren mot mon)', () => {
  const kq = mapOrder(fixture('detail-gf497-giam-gia.json'), STORE);

  it('doc dung ba con so tien', () => {
    expect(kq.payload.subtotal).toBe(65_000);
    expect(kq.payload.discount).toBe(5_000);
    expect(kq.payload.total).toBe(60_000);
  });

  /**
   * Chot quan trong nhat: hoa don phai CONG DUOC. Day dung la thu bi vo truoc
   * khi sua, va cung la thu ben ccmany se hien ra cho ke toan nhin.
   */
  it('subtotal - discount + tax = total', () => {
    const p = kq.payload;
    expect(p.subtotal! - p.discount + p.tax).toBe(p.total);
  });

  it('khong con canh bao nao', () => {
    expect(kq.warnings).toEqual([]);
  });

  /**
   * Gia mon giu nguyen gia TRUOC giam. Muc giam da nam o `discount` cua ca don;
   * tru them o day nua la tru giam gia HAI LAN.
   */
  it('gia mon van la gia truoc giam, da gom topping', () => {
    expect(kq.payload.items).toHaveLength(1);
    expect(kq.payload.items[0]!.price).toBe(65_000);
  });

  it('tong gia cac mon van bang subtotal', () => {
    const tong = kq.payload.items.reduce((s, m) => s + m.price, 0);
    expect(tong).toBe(kq.payload.subtotal);
  });

  it('topping van duoc doc rieng', () => {
    expect(kq.payload.items[0]!.modifiers).toEqual([
      { name: 'Chả mực (1 cái)', price: 10_000, quantity: 1 },
    ]);
  });
});

describe('don co giam gia — GF-806 (hai mon, mot giam tien mot giam phan tram)', () => {
  const kq = mapOrder(fixture('detail-gf806-giam-gia.json'), STORE);

  it('cong don giam gia cua ca hai mon', () => {
    // 8.800 (giam 16% cua 55.000) + 5.000 (giam so tien) = 13.800
    expect(kq.payload.discount).toBe(13_800);
  });

  it('doc dung ba con so tien', () => {
    expect(kq.payload.subtotal).toBe(110_000);
    expect(kq.payload.total).toBe(96_200);
  });

  it('subtotal - discount + tax = total', () => {
    const p = kq.payload;
    expect(p.subtotal! - p.discount + p.tax).toBe(p.total);
  });

  it('khong con canh bao nao', () => {
    expect(kq.warnings).toEqual([]);
  });

  /**
   * BANG CHUNG DUT DIEM rang `promotionDisplay` la truong KHAC.
   *
   * Don nay co promotionDisplay = 16.000 nhung tien quan chi giam 13.800. Lay
   * nham truong do thi don nay ra sai 2.200d, va khong chot nao bat duoc vi
   * "subtotal - 16.000" van la mot con so trong nhin hop ly.
   */
  it('KHONG lay promotionDisplay (16.000) lam muc giam', () => {
    expect(kq.payload.discount).not.toBe(16_000);
    expect(kq.payload.discount).toBe(13_800);
  });
});

describe('don KHONG co giam gia — hai fixture cu', () => {
  /**
   * `totalDiscountAmountDisplay` la chuoi RONG o ca hai don cu. Rong phai thanh
   * 0 va KHONG duoc canh bao — phan lon don khong co giam gia, canh bao o day
   * se bien nhat ky va Telegram thanh mot bien tin vo nghia.
   */
  for (const ten of ['detail-gf547.json', 'detail-gf666.json']) {
    it(`${ten}: discount = 0, khong canh bao`, () => {
      const kq = mapOrder(fixture(ten), STORE);
      expect(kq.payload.discount).toBe(0);
      expect(kq.warnings).toEqual([]);
    });
  }

  /**
   * Ca hai don cu deu co promotionDisplay khac 0 (5.000 va 2.000) ma total van
   * bang subtotal. Do la bang chung goc rang khuyen mai Grab khong dung toi
   * tien quan — giu test nay de ai do "sua cho nhat quan" thi biet ngay.
   */
  it('promotionDisplay khac 0 nhung khong duoc tru vao tien quan', () => {
    const kq = mapOrder(fixture('detail-gf547.json'), STORE);
    expect(kq.payload.subtotal).toBe(kq.payload.total);
    expect(kq.payload.discount).toBe(0);
  });
});

describe('cac canh la cua truong giam gia', () => {
  function donVoi(fare: Record<string, unknown>, items?: unknown[]): GrabOrderDetailResponse {
    return {
      order: {
        orderID: 'ORDER-1',
        displayID: 'GF-001',
        times: { createdAt: '2026-09-02T05:00:00Z' },
        itemInfo: {
          items: (items ?? [
            { name: 'Mon', quantity: 1, fare: { priceDisplay: '100.000' } },
          ]) as never,
        },
        fare: { subTotalDisplay: '100.000', totalDisplay: '100.000', taxDisplay: '0', ...fare },
      },
    } as GrabOrderDetailResponse;
  }

  it('thieu han truong giam gia thi coi la 0', () => {
    expect(mapOrder(donVoi({}), STORE).payload.discount).toBe(0);
  });

  it('chuoi rong thi coi la 0', () => {
    expect(mapOrder(donVoi({ totalDiscountAmountDisplay: '' }), STORE).payload.discount).toBe(0);
  });

  it('toan khoang trang cung coi la 0', () => {
    expect(mapOrder(donVoi({ totalDiscountAmountDisplay: '   ' }), STORE).payload.discount).toBe(0);
  });

  it('so 0 tuong minh van la 0', () => {
    expect(mapOrder(donVoi({ totalDiscountAmountDisplay: '0' }), STORE).payload.discount).toBe(0);
  });

  /**
   * CO gia tri ma doc khong ra thi phai NEM LOI, khong duoc lang le coi la 0.
   * Grab doi dinh dang tien ma ta van gui di se ra so tien sai, va sai im lang
   * la kieu sai te nhat trong ca cong cu nay.
   */
  it('gia tri sai dinh dang thi nem loi, khong am tham ve 0', () => {
    expect(() => mapOrder(donVoi({ totalDiscountAmountDisplay: 'nam nghin' }), STORE)).toThrow(
      /totalDiscountAmountDisplay/,
    );
  });

  it('doc dung dinh dang tien Viet co dau cham', () => {
    const kq = mapOrder(
      donVoi({ totalDiscountAmountDisplay: '1.234.000', totalDisplay: '100.000' }),
      STORE,
    );
    expect(kq.payload.discount).toBe(1_234_000);
  });
});

describe('chot doi chieu giam gia', () => {
  function donGiamGia(giamCaDon: string, giamTungMon: (string | null)[]): GrabOrderDetailResponse {
    return {
      order: {
        orderID: 'ORDER-1',
        displayID: 'GF-001',
        times: { createdAt: '2026-09-02T05:00:00Z' },
        itemInfo: {
          items: giamTungMon.map((g, i) => ({
            name: `Mon ${i}`,
            quantity: 1,
            fare: { priceDisplay: '50.000' },
            discountInfo: g === null ? null : [{ itemDiscountPriceDisplay: g }],
          })) as never,
        },
        fare: {
          subTotalDisplay: `${50 * giamTungMon.length}.000`,
          totalDisplay: '0',
          taxDisplay: '0',
          totalDiscountAmountDisplay: giamCaDon,
        },
      },
    } as GrabOrderDetailResponse;
  }

  it('tong giam tung mon khop voi giam ca don thi khong canh bao ve giam gia', () => {
    const kq = mapOrder(donGiamGia('13.800', ['8.800', '5.000']), STORE);
    expect(kq.warnings.filter((w) => w.includes('giam gia'))).toEqual([]);
  });

  /**
   * Lech nghia la co mot loai giam gia chua hieu het — vd giam gia cap DON chu
   * khong phai cap mon. Phai keu len truoc khi ai do tin con so.
   */
  it('lech thi canh bao, kem ca hai con so', () => {
    const kq = mapOrder(donGiamGia('20.000', ['8.800', '5.000']), STORE);
    const canhBao = kq.warnings.find((w) => w.includes('giam gia'));
    expect(canhBao).toBeDefined();
    expect(canhBao).toContain('13800');
    expect(canhBao).toContain('20000');
  });

  it('mon khong co discountInfo thi khong tinh vao tong', () => {
    const kq = mapOrder(donGiamGia('5.000', [null, '5.000']), STORE);
    expect(kq.warnings.filter((w) => w.includes('giam gia'))).toEqual([]);
  });

  it('discountInfo rong khong lam lech chot', () => {
    const kq = mapOrder(donGiamGia('0', [null, null]), STORE);
    expect(kq.warnings.filter((w) => w.includes('giam gia'))).toEqual([]);
  });

  // Mot mon co the mang nhieu muc giam cung luc.
  it('mot mon nhieu muc giam thi cong het', () => {
    const don = {
      order: {
        orderID: 'ORDER-1',
        displayID: 'GF-001',
        times: { createdAt: '2026-09-02T05:00:00Z' },
        itemInfo: {
          items: [
            {
              name: 'Mon',
              quantity: 1,
              fare: { priceDisplay: '50.000' },
              discountInfo: [
                { itemDiscountPriceDisplay: '3.000' },
                { itemDiscountPriceDisplay: '2.000' },
              ],
            },
          ],
        },
        fare: {
          subTotalDisplay: '50.000',
          totalDisplay: '45.000',
          taxDisplay: '0',
          totalDiscountAmountDisplay: '5.000',
        },
      },
    } as GrabOrderDetailResponse;
    expect(mapOrder(don, STORE).warnings).toEqual([]);
  });
});
