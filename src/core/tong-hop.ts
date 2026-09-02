/**
 * Gop trang thai cua N poller thanh mot cai nhin duy nhat.
 *
 * Khay chi co MOT cham mau, va bang dieu khien co MOT dong trang thai. Voi 14
 * quan thi phai co cho quyet dinh "vay tom lai dang the nao", va cho do phai la
 * ham thuan — chu khong phai vai bieu thuc ?. rai rac trong main.ts, noi khong
 * ai test duoc va cung khong ai doc lai.
 *
 * NGUYEN TAC: gop theo huong XAU NHAT THANG.
 *
 * Mot quan mat phien trong 14 quan ma cham khay van xanh thi cham do vo dung —
 * no chi bao "moi thu on" dung luc co viec phai lam. Bao dong nham thi nguoi
 * dung mo bang dieu khien ra xem; bo sot thi khong ai biet gi ca.
 */

import type { PollerState, PollerStats } from './poller.js';

/** Mot quan kem trang thai poller cua no. */
export interface TrangThaiQuan {
  merchantID: string;
  ccmanyStoreID: string;
  storeName: string;
  stats: PollerStats;
}

/**
 * Rai lech pha diem khoi dau cua tung poller.
 *
 * Khong rai thi 14 quan cung ban `orders-pagination` trong cung mot phan nghin
 * giay, cu 5 giay mot lan — dung cai hinh dang ma phia server hay chan. Rai deu
 * ra bien no thanh mot dong deu ~3 req/s.
 *
 * Tre nay CHI ap cho nhip dau. Tu nhip hai tro di moi poller tu chay theo chuoi
 * setTimeout cua no, va do lech sinh ra o day duoc giu nguyen.
 */
export function treKhoiDauMs(chiSo: number, soQuan: number, nhipMs: number): number {
  if (soQuan <= 1 || chiSo <= 0) return 0;
  return Math.round((chiSo % soQuan) * (nhipMs / soQuan));
}

/**
 * Trang thai nao "xau" hon.
 *
 * `dung` khong nam trong thang nay: no la y muon cua nguoi dung, khong phai su
 * co. Xem gopTrangThai() de biet no duoc xu ly rieng the nao.
 */
const NANG_DAN: PollerState[] = ['dang-chay', 'loi', 'mat-phien'];

function xauHon(a: PollerState, b: PollerState): PollerState {
  return NANG_DAN.indexOf(a) >= NANG_DAN.indexOf(b) ? a : b;
}

/**
 * N quan -> mot PollerStats de khay va bang dieu khien dung nhu truoc.
 *
 * Tra null khi khong co quan nao — giao dien hieu la "chua chon quan".
 */
export function gopTrangThai(quan: TrangThaiQuan[]): PollerStats | null {
  if (quan.length === 0) return null;

  // TAT CA dung moi la dung. Con mot quan chay thi cong cu van dang lam viec,
  // va nut phai la "Tam dung" chu khong phai "Tiep tuc".
  const dangSong = quan.filter((q) => q.stats.state !== 'dung');
  if (dangSong.length === 0) {
    return {
      state: 'dung',
      lastPollAt: mocCuNhat(quan),
      lastError: null,
      quanDangMo: null,
      soDonHomNay: tongDon(quan),
      donGanNhat: donMoiNhat(quan),
    };
  }

  let state: PollerState = 'dang-chay';
  for (const q of dangSong) state = xauHon(state, q.stats.state);

  return {
    state,
    lastPollAt: mocCuNhat(dangSong),
    lastError: loiDauTien(dangSong, quan.length > 1),
    quanDangMo: coQuanNaoMo(dangSong),
    // Tong tren TAT CA quan, ke ca quan dang tam dung: don da gui hom nay thi
    // van la don da gui, tam dung khong xoa no di.
    soDonHomNay: tongDon(quan),
    donGanNhat: donMoiNhat(quan),
  };
}

/**
 * Moc poll CU NHAT, khong phai moi nhat.
 *
 * Moi nhat se giau mat quan dang ket: 13 quan chay tot la dong "poll luc
 * 14:03" luon tuoi, du quan thu 14 dung im tu 13:20. Cu nhat thi dong do gia
 * di trong thay va nguoi dung mo ra xem.
 */
function mocCuNhat(quan: TrangThaiQuan[]): string | null {
  const moc = quan.map((q) => q.stats.lastPollAt).filter((t): t is string => t !== null);
  // Chua quan nao poll xong (vua khoi dong, con dang rai lech pha) thi noi that
  // la chua co, khong bia ra mot moc nao.
  return moc.length === 0 ? null : moc.reduce((a, b) => (a < b ? a : b));
}

/** Kem ten quan khi co nhieu quan, khong thi khong ai biet loi cua quan nao. */
function loiDauTien(quan: TrangThaiQuan[], kemTen: boolean): string | null {
  const hong = quan.find((q) => q.stats.lastError !== null);
  if (!hong) return null;
  return kemTen ? `${hong.storeName}: ${hong.stats.lastError}` : hong.stats.lastError;
}

/**
 * CO quan nao dang mo khong — chu khong phai "tat ca deu mo".
 *
 * Con mot quan mo la con don co the ve, va nhip poll phai giu nguyen thay vi
 * gian ra. null khi chua quan nao tra loi.
 */
function coQuanNaoMo(quan: TrangThaiQuan[]): boolean | null {
  const biet = quan.map((q) => q.stats.quanDangMo).filter((v): v is boolean => v !== null);
  return biet.length === 0 ? null : biet.some(Boolean);
}

function tongDon(quan: TrangThaiQuan[]): number {
  return quan.reduce((tong, q) => tong + q.stats.soDonHomNay, 0);
}

function donMoiNhat(quan: TrangThaiQuan[]): PollerStats['donGanNhat'] {
  let moi: PollerStats['donGanNhat'] = null;
  for (const q of quan) {
    const d = q.stats.donGanNhat;
    // So sanh chuoi ISO truc tiep: cung dinh dang, cung mui gio Z, nen thu tu
    // tu dien trung voi thu tu thoi gian.
    if (d && (moi === null || d.at > moi.at)) moi = d;
  }
  return moi;
}

// ── Hien thi: khay va bang dieu khien ────────────────────────────────────────

export type MauDen = 'xanh' | 'vang' | 'do';

export interface NhanKhay {
  mau: MauDen;
  /** Doan chu sau dau gach trong tooltip khay. */
  chu: string;
  /** Con quan nao dang chay khong — quyet dinh chu cua muc menu Tam dung. */
  dangTheoDoi: boolean;
}

/**
 * Mot cham mau cho N quan.
 *
 * Cham khay la thu duy nhat nguoi dung nhin thay khi khong mo gi ca, nen no
 * phai theo quy tac XAU NHAT THANG. Xanh chi duoc phep sang khi TAT CA cac quan
 * deu dang theo doi — 12/14 quan chay ma van xanh la bao "moi thu on" dung luc
 * co hai quan khong len don.
 */
export function nhanKhay(quan: TrangThaiQuan[], matPhien: boolean): NhanKhay {
  const dangChay = quan.filter((q) => q.stats.state === 'dang-chay').length;
  const dangTheoDoi = dangChay > 0;

  // Mat phien la chuyen cua CA cua so (mot bo cookie), nen no thang moi thu.
  if (matPhien || quan.some((q) => q.stats.state === 'mat-phien')) {
    return { mau: 'do', chu: 'MẤT PHIÊN, cần đăng nhập lại', dangTheoDoi };
  }
  if (quan.length === 0) {
    return { mau: 'vang', chu: 'chưa chọn quán', dangTheoDoi: false };
  }
  if (dangChay === quan.length) {
    return {
      mau: 'xanh',
      // Mot quan thi giu nguyen cau chu cu, khong hien phan so ky quai "1/1".
      chu: quan.length === 1 ? 'đang theo dõi' : `đang theo dõi ${quan.length} quán`,
      dangTheoDoi: true,
    };
  }
  if (dangChay > 0) {
    return { mau: 'vang', chu: `${dangChay}/${quan.length} quán đang theo dõi`, dangTheoDoi: true };
  }
  // Khong quan nao chay: dang thu lai, hay dang tam dung.
  const coLoi = quan.some((q) => q.stats.state === 'loi');
  return { mau: 'vang', chu: coLoi ? 'đang thử lại' : 'chưa theo dõi', dangTheoDoi: false };
}

/** Mot dong quan trong bang dieu khien, da san sang ve. */
export interface DongBang {
  merchantID: string;
  ten: string;
  mau: MauDen;
  /** Cau mo ta ngan: don hom nay, moc poll, hoac ly do dang hong. */
  chu: string;
}

/**
 * N quan -> N dong de ve.
 *
 * Giu nguyen thu tu trong config/stores.json: nguoi dung vua tick theo thu tu
 * do o bang chon, va mot bang tu doi cho moi lan lam moi (vd xep quan hong len
 * dau) se lam ho bam nham dong.
 */
export function dongBangDieuKhien(quan: TrangThaiQuan[]): DongBang[] {
  return quan.map((q) => {
    const s = q.stats;
    const mau: MauDen =
      s.state === 'mat-phien' ? 'do' : s.state === 'dang-chay' ? 'xanh' : 'vang';

    let chu: string;
    if (s.state === 'mat-phien') chu = 'mất phiên — cần đăng nhập lại';
    else if (s.state === 'dung') chu = 'tạm dừng';
    else if (s.state === 'loi') chu = `lỗi: ${s.lastError ?? 'không rõ'}`;
    else {
      const dong = [`${s.soDonHomNay} đơn hôm nay`];
      // Quan dong cua van poll deu, chi gian nhip — noi ro de khong ai tuong
      // no dang hong.
      if (s.quanDangMo === false) dong.push('quán đóng cửa');
      dong.push(`poll ${gioVN(s.lastPollAt)}`);
      chu = dong.join(' · ');
    }

    return { merchantID: q.merchantID, ten: q.storeName, mau, chu };
  });
}

function gioVN(isoText: string | null): string {
  if (!isoText) return 'chưa có';
  return new Date(isoText).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
