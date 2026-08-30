/**
 * Dang ky app vao Settings -> Apps -> Installed apps cua Windows.
 *
 * Do la CHO DAU TIEN nguoi dung Windows di tim khi muon go mot phan mem. Khong
 * co mat o do thi cong cu nay trong nhu mot thu muc la ai do chep vao may, va
 * cach go duy nhat la doc huong dan — ma tren may quan thi khong ai doc.
 *
 * Ghi vao HKCU chu khong phai HKLM: khong can quyen quan tri, va dung voi thuc
 * te la ban cai nay chi thuoc ve mot tai khoan Windows.
 *
 * Lam bang mot file .reg roi `reg import` chu khong phai chuoi `reg add`:
 * duong dan cai co the co dau cach va dau ngoac kep, ma ghep chung vao mot dong
 * lenh la mo ra dung cai lop loi da lam mat thoi gian o trinh go cai dat. File
 * .reg thi minh kiem soat duoc tung ky tu tu Node.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Khoa registry. PHAI trung voi dong `reg delete` trong GO_CAI_DAT
 * (scripts/lib/noi-dung.mjs) — lech nhau thi go cai dat xong van con mot muc ma
 * trong Settings, bam vao thi chay mot file da bi xoa.
 *
 * Co test ghim hai ben khop nhau.
 */
export const KHOA_GO_CAI_DAT =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TheoDoiDonGrab';

export interface ThongTinGoCaiDat {
  tenHienThi: string;
  phienBan: string;
  thuMucCai: string;
  /** Duong dan day du toi "Go cai dat.cmd" trong thu muc cai. */
  trinhGoCaiDat: string;
  /** Duong dan icon hien canh ten trong Settings. */
  icon: string;
}

/**
 * Trong mot chuoi cua file .reg, dau `\` va dau `"` deu phai nhan doi/thoat.
 * Bo qua buoc nay thi `C:\Users\...` bien thanh mot chuoi escape vo nghia va
 * `reg import` hoac bao loi, hoac — te hon — ghi vao mot duong dan sai.
 */
function thoat(giaTri: string): string {
  return giaTri.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Sinh noi dung file .reg. Tach rieng ra vi day la cho duy nhat co the sai ma
 * van chay tron tru: mot duong dan thoat hong thi Windows van nhan khoa, chi la
 * nut Go cai dat trong Settings bam vao khong lam gi.
 */
export function noiDungRegGoCaiDat(tt: ThongTinGoCaiDat): string {
  // UninstallString phai goi qua cmd.exe: Windows chay gia tri nay bang
  // CreateProcess, ma CreateProcess KHONG chay duoc file .cmd truc tiep — no
  // can mot trinh thong dich. Tro thang vao .cmd thi bam Go cai dat trong
  // Settings se bao loi mo hoi ma khong noi vi sao.
  const lenhGo = `"${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\cmd.exe" /c "${tt.trinhGoCaiDat}"`;

  return [
    'Windows Registry Editor Version 5.00',
    '',
    `[${KHOA_GO_CAI_DAT.replace('HKCU', 'HKEY_CURRENT_USER')}]`,
    `"DisplayName"="${thoat(tt.tenHienThi)}"`,
    `"DisplayVersion"="${thoat(tt.phienBan)}"`,
    `"Publisher"="${thoat(tt.tenHienThi)}"`,
    `"InstallLocation"="${thoat(tt.thuMucCai)}"`,
    `"DisplayIcon"="${thoat(tt.icon)}"`,
    `"UninstallString"="${thoat(lenhGo)}"`,
    // Khong co gi de sua chua hay cai lai, nen an hai nut do di.
    '"NoModify"=dword:00000001',
    '"NoRepair"=dword:00000001',
    '',
  ].join('\r\n');
}

/**
 * Ghi khoa vao registry. Chay moi lan khoi dong, va co y nhu vay: nguoi dung co
 * the chep thu muc app sang cho khac, luc do duong dan cu trong Settings tro
 * thanh rac. Ghi de moi lan thi no tu sua.
 *
 * Loi o day khong duoc lam hong viec khoi dong: khong dang ky duoc thi app van
 * theo doi don binh thuong, chi la thieu mot muc trong Settings.
 */
export function dangKyGoCaiDat(tt: ThongTinGoCaiDat, ghiLoi: (thong: string, err: unknown) => void): void {
  try {
    const file = join(tmpdir(), 'dang-ky-theo-doi-don-grab.reg');
    // UTF-16LE co BOM la dinh dang goc cua file .reg. Ghi UTF-8 thi dau tieng
    // Viet trong ten hien thi se ra ky tu la trong Settings.
    writeFileSync(file, `\ufeff${noiDungRegGoCaiDat(tt)}`, 'utf16le');

    const con = spawn('reg.exe', ['import', file], { detached: true, stdio: 'ignore', windowsHide: true });
    con.on('error', (err) => ghiLoi('Khong dang ky duoc vao Settings cua Windows', err));
    con.unref();
  } catch (err) {
    ghiLoi('Khong dang ky duoc vao Settings cua Windows', err);
  }
}
