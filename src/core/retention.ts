/**
 * Don rac tren dia.
 *
 * Moi don deu de lai mot file JSON tho (~15 KB). Mot quan ban 200 don/ngay,
 * chay lien tuc mot nam, la hon mot GB nam im tren o C cua may quan — va khong
 * ai vao do don. Ho so cua don ba thang truoc thi khong con dung de sua mapper
 * nua, nen giu lai chi ton cho.
 *
 * Cach ghi: xoa theo *thoi diem sua file*, khong theo ten file. Ten file la
 * orderID, khong chua ngay thang, nen khong suy ra tuoi tu ten duoc.
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface KetQuaDonDep {
  daXoa: number;
  loi: number;
}

/**
 * Xoa file cu hon `soNgay` trong `thuMuc`.
 *
 * `soNgay = 0` nghia la xoa het (dung de kiem chung nhanh khi thu). Am hoac
 * khong phai so thi coi nhu TAT — khong xoa gi ca, vi mot cau hinh sai khong
 * duoc phep bien thanh lenh xoa sach.
 */
export function donDepFileCu(
  thuMuc: string,
  soNgay: number,
  now: () => number = Date.now,
): KetQuaDonDep {
  const ketQua: KetQuaDonDep = { daXoa: 0, loi: 0 };
  if (!Number.isFinite(soNgay) || soNgay < 0) return ketQua;

  const nguong = now() - soNgay * 86_400_000;

  let ten: string[];
  try {
    ten = readdirSync(thuMuc);
  } catch {
    // Thu muc chua ton tai (chua co don nao) — khong phai loi.
    return ketQua;
  }

  for (const item of ten) {
    const duongDan = join(thuMuc, item);
    try {
      const stat = statSync(duongDan);
      if (!stat.isFile() || stat.mtimeMs >= nguong) continue;
      unlinkSync(duongDan);
      ketQua.daXoa += 1;
    } catch {
      // File dang bi khoa hoac vua bi xoa boi ai khac. Bo qua, lan sau don tiep.
      ketQua.loi += 1;
    }
  }

  return ketQua;
}
