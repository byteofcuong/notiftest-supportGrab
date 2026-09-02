/**
 * Quyet dinh cho bang chon quan.
 *
 * Giao dien (`src/renderer/app.js`) la JavaScript thuan, khong bien dich, nen
 * khong test duoc neu khong keo them jsdom. Nen moi QUYET DINH nam o day —
 * ma quan nao dung de goi API, dong nao duoc tick san, cau nao hien khi hong —
 * con giao dien chi con viec ve ra nhung gi nhan duoc.
 *
 * Doi lai: file nay phai tra ve du moi thu de ve, ke ca cau chu.
 */

import { quanCoTheChon } from '../grab/quan.js';
import { SessionExpiredError } from '../grab/client.js';
import type { QuanCoTheChon } from '../grab/quan.js';

/** Mot dong trong bang chon quan, da san sang ve. */
export interface DongChonQuan {
  merchantID: string;
  tenHienThi: string;
  city: string | null;
  daTick: boolean;
  /** Nhan phu hien canh ten. null khi quan binh thuong. */
  nhan: string | null;
}

export interface KetQuaDanhSachQuan {
  ok: boolean;
  quan: DongChonQuan[];
  /** Cau noi cho nguoi dung. null khi moi thu binh thuong. */
  thongBao: string | null;
  /** Giao dien nen day nguoi dung sang nut "Mo trang Grab / Dang nhap". */
  canDangNhap: boolean;
}

/**
 * Ma quan dung lam header cho loi goi danh sach nhom.
 *
 * UU TIEN MA DOC TU TRANG dang mo, khong phai ma trong cau hinh. Ly do la mot
 * cai bay da dam phai that trong lua khao sat: ma quan KHONG thuoc tai khoan
 * dang dang nhap tra ve 400, khong phai 401. Cau hinh con tro vao quan cua tai
 * khoan cu thi moi loi goi deu 400 va bang chon se khong bao gio mo duoc — ma
 * do lai dung la luc nguoi dung can no nhat de chon lai quan.
 *
 * Ma doc tu trang thi chac chan thuoc tai khoan dang dang nhap, vi Grab vua ve
 * ra trang do.
 */
export function maQuanDeGoiApi(
  daChon: readonly string[],
  maPhatHien: string | null,
): string | null {
  const tuTrang = maPhatHien?.trim();
  if (tuTrang) return tuTrang;
  for (const ma of daChon) {
    const s = ma?.trim();
    if (s) return s;
  }
  return null;
}

/**
 * Ghep danh sach Grab tra ve voi nhung quan dang duoc theo doi.
 *
 * CHOT QUAN TRONG: quan dang duoc theo doi ma KHONG con trong danh sach Grab
 * van phai hien ra, van tick san, kem nhan giai thich.
 *
 * Bo no di thi bang chon se thieu mot dong, nguoi dung bam Luu, va quan do bien
 * mat khoi cau hinh ma khong ai thay minh vua mat gi. Quan bi doi chu so huu,
 * bi Grab go khoi nhom, hay chi don gian la mot loi goi tra ve thieu — deu ra
 * cung mot ket cuc do.
 */
export function ghepLuaChon(
  quanGrab: readonly QuanCoTheChon[],
  daChon: readonly string[],
): DongChonQuan[] {
  const tick = new Set(daChon.map((m) => m?.trim()).filter((m): m is string => Boolean(m)));
  const coTrongNhom = new Set(quanGrab.map((q) => q.merchantID));

  const dong: DongChonQuan[] = quanGrab.map((q) => ({
    merchantID: q.merchantID,
    tenHienThi: q.tenHienThi,
    city: q.city,
    daTick: tick.has(q.merchantID),
    nhan: q.dangHoatDong ? null : 'đã ngừng hoạt động',
  }));

  // Quan mo coi xuong cuoi: chung la ngoai le can chu y, khong phai thu nguoi
  // dung quet mat qua hang ngay.
  for (const ma of tick) {
    if (coTrongNhom.has(ma)) continue;
    dong.push({
      merchantID: ma,
      tenHienThi: ma,
      city: null,
      daTick: true,
      nhan: 'đang theo dõi nhưng không thấy trong nhóm',
    });
  }

  return dong;
}

/** Doc phan hoi Grab thanh bang chon. */
export function ketQuaDanhSach(
  phanHoi: unknown,
  daChon: readonly string[],
): KetQuaDanhSachQuan {
  const quan = ghepLuaChon(quanCoTheChon(phanHoi), daChon);
  if (quan.length === 0) {
    return {
      ok: true,
      quan,
      // Doc duoc phan hoi ma khong co quan nao la chuyen la — noi ro thay vi de
      // nguoi dung nhin mot bang trong khong hieu dang cho gi.
      thongBao: 'Grab không trả về quán nào cho tài khoản này.',
      canDangNhap: false,
    };
  }
  return { ok: true, quan, thongBao: null, canDangNhap: false };
}

/**
 * Chua co ma quan nao de goi API — lan chay dau, cua so con o trang danh sach
 * tat ca cua hang chu chua vao quan nao.
 */
export function chuaCoMaQuan(): KetQuaDanhSachQuan {
  return {
    ok: false,
    quan: [],
    thongBao:
      'Chưa mở được trang quán nào. Bấm "Mở trang Grab / Đăng nhập", ' +
      'đăng nhập rồi bấm vào một quán bất kỳ, sau đó thử lại.',
    canDangNhap: true,
  };
}

/** Loi khi goi API danh sach quan, dich sang cau nguoi dung hieu duoc. */
export function ketQuaLoi(err: unknown): KetQuaDanhSachQuan {
  if (err instanceof SessionExpiredError) {
    return {
      ok: false,
      quan: [],
      thongBao: 'Phiên Grab đã hết hạn. Bấm "Mở trang Grab / Đăng nhập" rồi thử lại.',
      canDangNhap: true,
    };
  }
  return {
    ok: false,
    quan: [],
    thongBao: `Không lấy được danh sách quán: ${(err as Error)?.message ?? 'lỗi không rõ'}`,
    canDangNhap: false,
  };
}
