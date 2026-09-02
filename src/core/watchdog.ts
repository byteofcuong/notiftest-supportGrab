/**
 * Quyet dinh khi nao can can thiep vao cua so Grab.
 *
 * Tach rieng khoi phan hen gio va khoi Electron de test duoc bang bang tinh
 * huong — day la doan de sai nhat cua Task 10: canh sai thi hoac khong bao gio
 * cuu duoc, hoac cu vai phut lai da cua so mot cai trong luc no dang chay tot.
 */

import type { PollerState } from './poller.js';

export type QuyetDinhWatchdog = 'khong-lam-gi' | 'tai-lai-trang';

export interface DauVaoWatchdog {
  state: PollerState;
  /** Moc poll thanh cong gan nhat, ms. null = chua co lan nao. */
  lastPollAt: number | null;
  /** Luc bat dau theo doi, de khong ket toi khi app vua chay duoc 5 giay. */
  batDauLuc: number;
  /** Lan can thiep gan nhat, de khong da lien tiep. */
  canThiepLanCuoi: number | null;
  now: number;
  nguongMs: number;
}

/**
 * CO Y khong nhin URL cua trang.
 *
 * Da quan sat duoc: Grab tu nhay sang /profile/logout roi trang dang nhap roi
 * quay lai trong khoang hai giay va chay tiep binh thuong. Watchdog canh URL se
 * da cua so dung luc no dang tu phuc hoi, va con lam mat luon phien vua duoc
 * khoi phuc. Moc dang tin duy nhat la "lan cuoi GOI API THAT ma thanh cong".
 */
export function quyetDinhWatchdog(dauVao: DauVaoWatchdog): QuyetDinhWatchdog {
  const { state, lastPollAt, batDauLuc, canThiepLanCuoi, now, nguongMs } = dauVao;

  if (nguongMs <= 0) return 'khong-lam-gi';

  // Nguoi dung tu tam dung thi im lang la dung.
  if (state === 'dung') return 'khong-lam-gi';

  // Mat phien thi tai lai trang khong cuu duoc gi — phai co nguoi dang nhap.
  // Poller van poll deu 30s/lan nen se tu song lai ngay khi dang nhap xong.
  if (state === 'mat-phien') return 'khong-lam-gi';

  // Chua tung poll thanh cong: tinh tuoi tu luc bat dau theo doi. Khong co
  // nhanh nay thi app vua khoi dong xong da bi da mot cai.
  const moc = lastPollAt ?? batDauLuc;
  if (now - moc < nguongMs) return 'khong-lam-gi';

  // Da can thiep gan day roi thi cho tai lai xong da. Tai lai trang Grab mat
  // vai giay, va trong luc do van chua co luot poll thanh cong nao.
  if (canThiepLanCuoi !== null && now - canThiepLanCuoi < nguongMs) return 'khong-lam-gi';

  return 'tai-lai-trang';
}

// ── Nhieu quan ───────────────────────────────────────────────────────────────

export interface QuanTheoDoi {
  /** Ten de ghi nhat ky va bao Telegram. */
  ten: string;
  state: PollerState;
  lastPollAt: number | null;
}

export interface DauVaoWatchdogNhieuQuan {
  quan: QuanTheoDoi[];
  batDauLuc: number;
  canThiepLanCuoi: number | null;
  now: number;
  nguongMs: number;
}

export interface KetQuaWatchdogNhieuQuan {
  quyetDinh: QuyetDinhWatchdog;
  /**
   * Ten cac quan dang dung im. Chi co nghia khi quyet dinh la tai-lai-trang.
   *
   * Can no de cau bao noi duoc "quan nao dang ket" — voi 14 quan thi mot dong
   * "poll dung im 3 phut" khong kem ten la khong dung duoc vao viec gi.
   */
  quanDungIm: string[];
}

/**
 * N poller, MOT cua so, nen nhieu nhat MOT lan tai lai.
 *
 * Day la khac biet quan trong nhat cua Task 5 so voi cach lam ngay tho. Neu moi
 * quan mot bo canh rieng thi mot lan mang chap se sinh ra 14 lenh tai lai trang
 * chong len nhau va 14 tin Telegram — trong khi chi co DUNG MOT trang de tai
 * lai. Bo canh nay quet het cac quan, roi ha lenh mot lan.
 *
 * Quan dang `dung` (nguoi dung tam dung) va `mat-phien` (phai co nguoi dang
 * nhap, tai lai khong cuu duoc) khong bao gio la ly do tai lai — quy tac do do
 * quyetDinhWatchdog() giu, o day chi lap lai cho tung quan.
 */
export function quyetDinhWatchdogNhieuQuan(
  dauVao: DauVaoWatchdogNhieuQuan,
): KetQuaWatchdogNhieuQuan {
  const { quan, batDauLuc, canThiepLanCuoi, now, nguongMs } = dauVao;

  const dungIm = quan.filter(
    (q) =>
      quyetDinhWatchdog({
        state: q.state,
        lastPollAt: q.lastPollAt,
        batDauLuc,
        // CO Y truyen null: chot chong da lien tiep duoc ap MOT LAN cho ca cum
        // o duoi, chu khong phai tung quan mot. Ap o day thi ket qua van dung,
        // nhung `quanDungIm` se rong ngay sau mot lan tai lai va cau bao mat
        // ten quan — dung luc nguoi doc can no nhat.
        canThiepLanCuoi: null,
        now,
        nguongMs,
      }) === 'tai-lai-trang',
  );

  if (dungIm.length === 0) return { quyetDinh: 'khong-lam-gi', quanDungIm: [] };

  // Vua tai lai xong thi cho het mot nguong. Tai lai mat vai giay, va trong
  // khoang do chua quan nao kip poll thanh cong — khong cho thi se da cua so
  // lien tuc moi 30 giay.
  if (canThiepLanCuoi !== null && now - canThiepLanCuoi < nguongMs) {
    return { quyetDinh: 'khong-lam-gi', quanDungIm: dungIm.map((q) => q.ten) };
  }

  return { quyetDinh: 'tai-lai-trang', quanDungIm: dungIm.map((q) => q.ten) };
}
