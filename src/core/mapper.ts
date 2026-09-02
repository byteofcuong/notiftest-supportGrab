/**
 * Doi chi tiet don Grab sang payload ccmany.
 *
 * Moi quyet dinh o day deu co can cu trong docs/grab-api-findings.md §6 — sua
 * gi thi sua ca hai cho, dung sua len mot minh file nay.
 *
 * Triet ly xu ly loi, chia lam ba muc:
 *  - NEM LOI  khi thieu thu khong the thieu (khong co orderID, gia mon khong doc
 *             duoc). Don do vao hang doi loi kem JSON tho, khong gui gi ca.
 *  - NEM LOI  khi mot truong CO MAT nhung sai dinh dang — nghia la Grab da doi
 *             API. Hong to, de con biet ma sua.
 *  - CANH BAO khi truong vang mat that su, hoac khi so lieu khong khop nhau.
 *             Van gui, nhung ghi log + Telegram de nguoi doi chieu.
 */

import { parseVnd, parseVndOrThrow } from './money.js';
import type { CcmanyItem, CcmanyModifier, CcmanyPayload, StoreConfig } from './types.js';
import type { GrabModifierGroup, GrabOrder, GrabOrderDetailResponse } from '../grab/types.js';

export interface MapOptions {
  /**
   * ORDER_NUMBER_WITH_DATE. Mac dinh false: order_number = orderID (ma dai,
   * duy nhat tuyet doi). Bat len: order_number = "GF-547-28082026" — de doc hon
   * cho nhan vien, van duy nhat. Chi bat neu ccmany yeu cau.
   */
  orderNumberWithDate?: boolean;
}

export interface MapResult {
  payload: CcmanyPayload;
  /** Nhung cho dang ngo. Rong nghia la moi thu khop. */
  warnings: string[];
}

const MINUTE = 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * MINUTE;

export function mapOrder(
  response: GrabOrderDetailResponse,
  store: StoreConfig,
  options: MapOptions = {},
): MapResult {
  const order = response?.order;
  if (!order) throw new Error('Response khong co truong `order`');

  const warnings: string[] = [];

  const orderID = requireString(order.orderID, 'order.orderID');
  const displayID = requireString(order.displayID, 'order.displayID');

  const createdAt = mapCreatedAt(order, warnings);
  const items = mapItems(order, warnings);
  const money = mapMoney(order, warnings);

  checkTotals(money, items, warnings);
  doiChieuGiamGia(order, money, warnings);
  noteUnknownShapes(order, warnings);

  const payload: CcmanyPayload = {
    store_id: store.ccmanyStoreID,
    store_name: store.storeName,

    // order_number la truong DINH DANH cua ccmany (bang chung: ShopeeOrderParser
    // dat ma dai duy nhat vao orderNumber, ma ngan vao orderCode). displayID cua
    // Grab la 3 chu so gan nhu ngau nhien — GF-666 hom 27/08 roi GF-547 hom
    // 28/08, tuc GIAM qua ngay, nen chac chan se dung nhau. Xem §6.2.
    order_number: options.orderNumberWithDate
      ? `${displayID}-${vnDateSuffix(order.times?.createdAt)}`
      : orderID,
    order_code: displayID,

    created_at: createdAt,
    customer: { name: order.eater?.name ?? '' },

    // Khong co tai xe thi phai gui OBJECT RONG. API tu choi JSON null o day.
    driver: {
      name: order.driver?.name ?? '',
      phone: order.driver?.phone ?? order.driver?.mobileNumber ?? '',
    },

    items,
    subtotal: money.subtotal,
    /**
     * Giam gia do QUAN dat cho mon — tru THAT vao tien quan.
     *
     * KHONG phai `fare.promotionDisplay`: do la tien Grab bu cho khach va
     * khong dung toi tien quan. Don GF-806 chung minh hai thu khac han nhau —
     * promotionDisplay = 16.000 trong khi tien quan chi giam 13.800.
     *
     * Truoc 02/09/2026 cho nay bi dong cung bang 0, vi hai don mau dau tien
     * deu khong co giam gia mon nao. Hau qua: `subtotal - discount` khong ra
     * `total`, va hoa don ben ccmany khong cong duoc. Xem §6.1.
     */
    discount: money.discount,
    tax: money.tax,
    total: money.total,
  };

  return { payload, warnings };
}

// ── Mon ──────────────────────────────────────────────────────────────────────

function mapItems(order: GrabOrder, warnings: string[]): CcmanyItem[] {
  const rawItems = order.itemInfo?.items;
  if (!rawItems || rawItems.length === 0) {
    throw new Error('Don khong co mon nao — coi nhu doc hong, khong gui');
  }

  const items: CcmanyItem[] = [];
  for (const [index, raw] of rawItems.entries()) {
    const name = requireString(raw.name, `items[${index}].name`);
    const quantity = raw.quantity ?? 1;

    // priceDisplay la TONG DONG va DA gom topping (19.000 + 4.000 + 3.000 =
    // 26.000). Tuyet doi khong dung priceFloat — do la DON GIA.
    const price = parseVndOrThrow(raw.fare?.priceDisplay, `items[${index}].fare.priceDisplay`);

    // `discountInfo` khong doc vao `price`: `priceDisplay` la gia TRUOC giam,
    // va muc giam duoc gom lai o `fare.totalDiscountAmountDisplay` cua ca don.
    // Doc ca hai cho vao mot dong tien la tru giam gia hai lan.
    //
    // Chi cong lai de doi chieu — xem checkTotals().

    items.push({
      name,
      quantity,
      price,
      // De trong co y: originalItemPriceDisplay la gia CHUA cong topping, khac
      // han nghia "gia gach ngang khi co khuyen mai" ma ccmany mong doi. Xem §4.
      original_price: null,
      note: raw.comment ?? '',
      modifiers: mapModifiers(raw.modifierGroups, name, warnings),
    });
  }
  return items;
}

function mapModifiers(
  groups: GrabModifierGroup[] | null | undefined,
  itemName: string,
  warnings: string[],
): CcmanyModifier[] {
  if (!groups || groups.length === 0) return [];

  // modifierGroups la mang HAI TANG (nhom -> cac tuy chon); ccmany chi nhan mot
  // tang, nen trai phang. Ten nhom ("test") bi bo — no la nhan noi bo cua thuc
  // don, khong phai thu khach chon.
  const flat: CcmanyModifier[] = [];
  for (const group of groups) {
    for (const modifier of group.modifiers ?? []) {
      const name = modifier.modifierName?.trim();
      if (!name) {
        warnings.push(`Mon "${itemName}" co topping khong ten — bo qua`);
        continue;
      }
      flat.push({
        name,
        // Gui gia THAT. ccmany chi luu chu khong tu cong lai, nen khong co rui
        // ro tinh dup, ma giu duoc thong tin gia tung topping.
        price: parseVnd(modifier.priceDisplay) ?? 0,
        quantity: modifier.quantity ?? 1,
      });
    }
  }
  return flat;
}

// ── Tien ─────────────────────────────────────────────────────────────────────

interface Money {
  subtotal: number | null;
  discount: number;
  tax: number;
  total: number | null;
}

function mapMoney(order: GrabOrder, warnings: string[]): Money {
  return {
    subtotal: optionalMoney(order.fare?.subTotalDisplay, 'fare.subTotalDisplay', warnings),
    // Chuoi rong = don khong duoc giam gi ca, va do la truong hop THUONG GAP
    // nhat — khong canh bao. Chi canh bao khi co gia tri ma doc khong ra.
    discount: tienCoTheRong(order.fare?.totalDiscountAmountDisplay, 'fare.totalDiscountAmountDisplay'),
    tax: optionalMoney(order.fare?.taxDisplay, 'fare.taxDisplay', warnings) ?? 0,
    // Dong "Tong cong" tren giao dien Grab. Doc thang thay vi tu tinh, de quan
    // nao co thue khac 0 thi van dung ma khong phai doan cong thuc. Xem §6.1.
    total: optionalMoney(order.fare?.totalDisplay, 'fare.totalDisplay', warnings),
  };
}

/**
 * Truong tien ma VANG MAT LA BINH THUONG.
 *
 * Khac `optionalMoney`: khong canh bao khi rong. Dung cho nhung truong ma
 * "khong co" la truong hop thuong gap — vd `totalDiscountAmountDisplay` rong
 * o moi don khong duoc giam gia, tuc la phan lon cac don.
 *
 * Van NEM LOI khi co gia tri ma doc khong ra: do la dau hieu Grab doi dinh
 * dang tien, va doan mu se cho ra so tien sai.
 */
function tienCoTheRong(raw: string | undefined, field: string): number {
  if (raw == null || raw.trim() === '') return 0;
  return parseVndOrThrow(raw, field);
}

/**
 * Truong tien khong bat buoc. Phan biet hai tinh huong khac han nhau:
 *  - vang mat / chuoi rong  -> null, chi canh bao (ccmany chap nhan null)
 *  - CO mat nhung sai dang  -> NEM LOI, vi nghia la Grab da doi dinh dang tien
 */
function optionalMoney(raw: string | undefined, field: string, warnings: string[]): number | null {
  if (raw == null || raw.trim() === '') {
    warnings.push(`Thieu ${field}`);
    return null;
  }
  return parseVndOrThrow(raw, field);
}

/**
 * Tong giam gia tung mon phai bang muc giam cua ca don.
 *
 * Hai cho khac nhau trong JSON cung mo ta mot chuyen: `discountInfo` cua tung
 * mon, va `fare.totalDiscountAmountDisplay` cua ca don. Da kiem tren don GF-497
 * (5.000 = 5.000) va GF-806 (8.800 + 5.000 = 13.800).
 *
 * Lech nghia la co mot loai giam gia chua hieu het — vd giam gia cap DON chu
 * khong phai cap mon. Luc do phai xem JSON tho truoc khi tin con so.
 */
function doiChieuGiamGia(order: GrabOrder, money: Money, warnings: string[]): void {
  let tongMon = 0;
  for (const mon of order.itemInfo?.items ?? []) {
    for (const g of mon.discountInfo ?? []) {
      const raw = g?.itemDiscountPriceDisplay;
      if (raw == null || raw.trim() === '') continue;
      tongMon += parseVndOrThrow(raw, 'discountInfo[].itemDiscountPriceDisplay');
    }
  }
  if (tongMon !== money.discount) {
    warnings.push(
      `Tong giam gia tung mon (${tongMon}) khac muc giam cua don (${money.discount}) — ` +
        'co the co loai giam gia chua hieu, xem JSON tho',
    );
  }
}

function checkTotals(money: Money, items: CcmanyItem[], warnings: string[]): void {
  // Chot 1: tong cac dong mon phai bang subtotal. Neu lech thi hoac doc sot mon,
  // hoac hieu sai y nghia priceDisplay.
  if (money.subtotal !== null) {
    const sum = items.reduce((acc, item) => acc + item.price, 0);
    if (sum !== money.subtotal) {
      warnings.push(`Tong gia mon (${sum}) khac subtotal (${money.subtotal})`);
    }
  }

  // Chot 2: quan he total = subtotal - discount + tax.
  //
  // CHOT NAY DA CUU MOT LAN THAT (02/09/2026): no keu len o don GF-497 va
  // GF-806 vi luc do `discount` con bi dong cung bang 0. Khong co no thi hai
  // don sai tien da di thang sang ccmany ma khong ai biet.
  //
  // Ca bon don mau deu co tax = 0 nen phan `+ tax` VAN chua duoc kiem chung —
  // chot nay ton tai chinh de don co thue dau tien tu lo ra.
  if (money.subtotal !== null && money.total !== null) {
    const expected = money.subtotal - money.discount + money.tax;
    if (money.total !== expected) {
      warnings.push(
        `total (${money.total}) khac subtotal - discount + tax (${expected}) — kiem tra lai cach hieu truong tien`,
      );
    }
  }
}

// ── Thoi gian ────────────────────────────────────────────────────────────────

function mapCreatedAt(order: GrabOrder, warnings: string[]): string {
  const raw = order.times?.createdAt;
  if (!raw) {
    warnings.push('Thieu times.createdAt');
    return '';
  }
  return toVnDateTime(raw);
}

/** "2026-08-28T04:24:32Z" -> "28/08/2026 - 11:24" (UTC+7). */
export function toVnDateTime(iso: string): string {
  const vn = toVnDate(iso);
  return (
    `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}` +
    ` - ${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`
  );
}

/** "2026-08-28T04:24:32Z" -> "28082026", dung cho cach dat order_number co ngay. */
function vnDateSuffix(iso: string | null | undefined): string {
  if (!iso) return 'khongro';
  const vn = toVnDate(iso);
  return `${pad(vn.getUTCDate())}${pad(vn.getUTCMonth() + 1)}${vn.getUTCFullYear()}`;
}

/**
 * Doi moc UTC sang gio Viet Nam bang cach CONG THANG 7 tieng roi doc bang cac
 * ham getUTC*. Co y khong dung Intl/timezone cua may: ket qua phai giong nhau
 * du may chay o mui gio nao, va Viet Nam khong co gio mua he.
 */
function toVnDate(iso: string): Date {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Khong doc duoc moc thoi gian: ${JSON.stringify(iso)}`);
  }
  return new Date(ms + VN_OFFSET_MS);
}

const pad = (n: number): string => String(n).padStart(2, '0');

// ── Linh tinh ────────────────────────────────────────────────────────────────

function noteUnknownShapes(order: GrabOrder, warnings: string[]): void {
  // Ca hai don mau deu co driver: null. Lan dau gap mot don DA gan tai xe, can
  // biet ngay de doi chieu JSON tho va bo sung fixture — vi hien gio ta chi
  // DOAN rang cac truong ten la `name`/`phone`.
  if (order.driver != null) {
    const keys = Object.keys(order.driver).join(', ');
    warnings.push(`Don co tai xe (cau truc chua tung kiem chung, cac khoa: ${keys}) — luu JSON tho`);
  }
}

// ── Tien ich ─────────────────────────────────────────────────────────────────

function requireString(value: string | undefined | null, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Thieu truong bat buoc "${field}"`);
  return trimmed;
}
