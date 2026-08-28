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
