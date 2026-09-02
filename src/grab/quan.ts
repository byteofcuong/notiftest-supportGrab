/**
 * Doc phan hoi cua endpoint danh sach quan thanh bang chon quan.
 *
 * Ham thuan, khong mang, khong Electron — de test duoc ma khong can tai khoan
 * Grab, va de bang chon o Task 6 chi con viec ve.
 *
 * NGUYEN TAC O DAY: KHONG BAO GIO GIAU MOT QUAN CO THAT.
 *
 * Hai kieu sai lech khong he can nhau:
 *
 *   - Hien thua mot quan da ngung -> nguoi cai nhin thay, khong tick, het chuyen.
 *   - Giau mat mot quan dang ban   -> khong ai tick duoc, quan do chay ca ngay
 *                                     khong len don nao, va khong co thong bao
 *                                     nao noi vi sao.
 *
 * Nen loc theo `status` o day chi ha co `dangHoatDong` xuong de bang chon xep
 * sau va bo tick san, chu TUYET DOI khong vut ban ghi di. Gia tri `status` la
 * chuoi cua Grab, ta moi do duoc mot lan tren mot tai khoan; doan sai tap gia
 * tri do ma lai vut ban ghi thi hong theo dung kieu thu hai.
 */

import type { GrabGroupStore, GrabStoreSearchResponse } from './types.js';

/** Mot dong trong bang chon quan. */
export interface QuanCoTheChon {
  /** Ma quan Grab — vua la khoa, vua la thu gui lam `store_id` cho ccmany. */
  merchantID: string;
  /** Ten that de hien; roi ve ma quan neu Grab khong tra ten. */
  tenHienThi: string;
  city: string | null;
  /** Nguyen van chuoi Grab tra ve, de hien khi quan bi ha co. null neu khong co. */
  status: string | null;
  /** false CHI khi Grab noi ro quan da ngung. Khong ro thi coi la dang chay. */
  dangHoatDong: boolean;
}

/**
 * Nhung `status` chac chan la "quan nay da ngung hoat dong".
 *
 * CO Y KHONG CO "CLOSED": mot quan dang dong cua ngoai gio ban VAN la quan phai
 * theo doi — mai no mo lai. Ha co no xuong vi dang nghi trua la dung cai bay
 * "giau mat quan dang ban" noi o dau file.
 */
const DA_NGUNG = new Set(['INACTIVE', 'DELETED', 'SUSPENDED', 'TERMINATED', 'DISABLED']);

function chuoiGon(gt: unknown): string | null {
  if (typeof gt !== 'string') return null;
  const s = gt.trim();
  return s === '' ? null : s;
}

function docMotQuan(quan: GrabGroupStore): QuanCoTheChon | null {
  const merchantID = chuoiGon(quan?.merchantID);
  // Khong co ma quan thi khong goi API duoc — ban ghi nay vo dung, khong phai
  // bi loc bo. Day la truong hop duy nhat duoc phep bo.
  if (merchantID === null) return null;

  const status = chuoiGon(quan.status);
  return {
    merchantID,
    tenHienThi: chuoiGon(quan.merchantName) ?? merchantID,
    city: chuoiGon(quan.city),
    status,
    dangHoatDong: status === null || !DA_NGUNG.has(status.toUpperCase()),
  };
}

/**
 * Phan hoi -> danh sach da san sang hien len bang chon.
 *
 * Phan hoi la thu cua nguoi khac: sai hinh dang thi tra mang rong chu khong nem.
 * Nem o day se lam chet ca nut "Chon quan" va nguoi cai khong con duong nao
 * khac de chon quan.
 *
 * Xep quan dang chay len truoc, roi theo ten. So sanh bang collator tieng Viet
 * chu khong phai `<`: bang chu cai Viet xep D truoc D-gach ("Dong Da" truoc
 * "Dong Ba"), con so sanh ma don vi ma thi nem het chu co dau xuong duoi cung.
 * `numeric` de "Quan 2" dung truoc "Quan 10" thay vi sau.
 */
export function quanCoTheChon(phanHoi: unknown): QuanCoTheChon[] {
  const ds = (phanHoi as GrabStoreSearchResponse | null | undefined)?.merchants;
  if (!Array.isArray(ds)) return [];

  const theoMa = new Map<string, QuanCoTheChon>();
  for (const tho of ds) {
    if (tho === null || typeof tho !== 'object') continue;
    const quan = docMotQuan(tho as GrabGroupStore);
    // Trung ma quan thi giu ban ghi dau. Chua gap, nhung `limit=100` co the
    // phai phan trang khi nhom qua 100 quan, va ghep trang de sinh trung.
    if (quan !== null && !theoMa.has(quan.merchantID)) theoMa.set(quan.merchantID, quan);
  }

  const sanh = new Intl.Collator('vi', { numeric: true });
  return [...theoMa.values()].sort((a, b) => {
    if (a.dangHoatDong !== b.dangHoatDong) return a.dangHoatDong ? -1 : 1;
    return sanh.compare(a.tenHienThi, b.tenHienThi);
  });
}
