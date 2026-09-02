/**
 * Soan noi dung nhip tim.
 *
 * Nhip tim la BANG CHUNG DUY NHAT rang cong cu con song, gui 30 phut mot lan
 * ve Telegram. Tren may quan khong ai mo bang dieu khien ra xem; neu tin nay
 * sai hoac kho hieu thi khong con duong nao khac de biet.
 *
 * Tach khoi resilience.ts vi day thuan tuy la viec soan chu — khong dong ho,
 * khong mang, khong Electron — nen test duoc het cac canh: 0 quan, 1 quan,
 * 14 quan, mat phien, tam dung, va canh xau nhat la vai quan hong lan lon giua
 * dam dang chay.
 */

import type { PollerState } from './poller.js';

export interface QuanNhipTim {
  ten: string;
  state: PollerState;
  soDonHomNay: number;
  lastError: string | null;
}

export interface DauVaoNhipTim {
  quan: QuanNhipTim[];
  /** Theo lan goi API that gan nhat, doc lap voi trang thai poller. */
  phien: 'song' | 'mat' | 'chua-ro';
  dryRun: boolean;
  /** Poll thanh cong gan nhat trong tat ca cac quan, dang ISO. */
  pollGanNhat: string | null;
}

/**
 * Liet ke nhieu nhat bay nhieu quan hong.
 *
 * Mat mang thi ca 14 quan cung hong mot luc, va mot tin Telegram liet ke ca 14
 * dong kem thong bao loi thi bi cat giua chung tren dien thoai. Bay dong dau la
 * du de biet "hong dien rong" hay "hong mot quan".
 */
const TOI_DA_LIET_KE = 7;

function moTaTrangThai(state: PollerState, dryRun: boolean): string {
  switch (state) {
    case 'mat-phien':
      return 'MAT PHIEN GRAB - can dang nhap lai tren may quan';
    case 'dang-chay':
      return dryRun ? 'dang theo doi (CHAY KHO)' : 'dang theo doi';
    case 'dung':
      return 'DA TAM DUNG - khong theo doi don nao';
    default:
      return `TRANG THAI: ${state}`;
  }
}

/**
 * Tra ve cac dong da san sang noi lai bang '\n'.
 *
 * Dong dau LUON la cau tom tat — do la thu nguoi dung doc trong thong bao day
 * len man hinh khoa ma khong mo tin ra.
 */
export function noiDungNhipTim(dauVao: DauVaoNhipTim): string[] {
  const { quan, phien, dryRun, pollGanNhat } = dauVao;

  if (quan.length === 0) {
    return ['CHUA CHON QUAN NAO - cong cu dang chay nhung khong theo doi gi'];
  }

  const dangChay = quan.filter((q) => q.state === 'dang-chay');
  const matPhien = quan.filter((q) => q.state === 'mat-phien');
  const tamDung = quan.filter((q) => q.state === 'dung');
  const loi = quan.filter((q) => q.state === 'loi');
  const tongDon = quan.reduce((t, q) => t + q.soDonHomNay, 0);

  const dong: string[] = [];

  /**
   * Mot quan thi giu nguyen cau chu thoi mot quan.
   *
   * "1/1 quan dang theo doi" doc rat ky quai, va phan lon may quan van chi
   * chay mot quan — khong co ly do bat ho doc cau danh cho 14 quan.
   */
  if (quan.length === 1) {
    const q = quan[0]!;
    const trangThai =
      phien === 'mat' ? moTaTrangThai('mat-phien', dryRun) : moTaTrangThai(q.state, dryRun);
    dong.push(`${q.ten} - ${trangThai}`);
  } else {
    // Mat phien la chuyen cua CA PHIEN, khong phai cua tung quan: mot cua so,
    // mot bo cookie. Nen no de len dau, truoc moi con so khac.
    if (phien === 'mat' || matPhien.length > 0) {
      dong.push(`MAT PHIEN GRAB - can dang nhap lai tren may quan (${quan.length} quan)`);
    } else if (dangChay.length === 0) {
      dong.push(`DA TAM DUNG TAT CA - khong theo doi don nao (${quan.length} quan)`);
    } else {
      const kho = dryRun ? ' (CHAY KHO)' : '';
      dong.push(`${dangChay.length}/${quan.length} quan dang theo doi${kho}`);
    }
  }

  dong.push(`Don hom nay: ${tongDon}`);
  dong.push(`Poll gan nhat: ${gioVN(pollGanNhat)}`);

  // Quan co van de phai duoc GOI TEN. Khong co doan nay thi "12/14 quan dang
  // theo doi" bao dung mot dieu vo dung: co hai quan hong, khong biet quan nao.
  const coVanDe = [...loi, ...tamDung];
  if (quan.length > 1 && coVanDe.length > 0) {
    dong.push(`Quan co van de (${coVanDe.length}):`);
    for (const q of coVanDe.slice(0, TOI_DA_LIET_KE)) {
      const vi = q.state === 'dung' ? 'tam dung' : (q.lastError ?? 'loi');
      dong.push(`  - ${q.ten}: ${vi}`);
    }
    if (coVanDe.length > TOI_DA_LIET_KE) {
      dong.push(`  ... va ${coVanDe.length - TOI_DA_LIET_KE} quan nua`);
    }
  } else if (quan.length === 1 && quan[0]!.lastError) {
    dong.push(`Loi gan nhat: ${quan[0]!.lastError}`);
  }

  return dong;
}

/** Dong tom tat ngan de ghi vao nhat ky — khong can ca tin Telegram. */
export function tomTatNhipTim(dauVao: DauVaoNhipTim): string {
  return noiDungNhipTim(dauVao)[0] ?? '';
}

function gioVN(isoText: string | null): string {
  if (!isoText) return 'chua co';
  return new Date(isoText).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
