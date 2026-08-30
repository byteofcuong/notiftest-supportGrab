import { describe, expect, it } from 'vitest';
import { KHOA_GO_CAI_DAT, noiDungRegGoCaiDat } from '../src/main/registry.js';
import { GO_CAI_DAT, KHOA_GO_CAI_DAT as KHOA_TRONG_SCRIPT } from '../scripts/lib/noi-dung.mjs';

/**
 * Muc trong Settings -> Apps la thu DE HONG MA KHONG AI THAY: khoa registry
 * ghi sai thi Windows van nhan, van liet ke app ra, chi la bam Uninstall thi
 * khong co gi xay ra. Khong co thong bao loi nao o bat ky dau.
 */

const MAU = {
  tenHienThi: 'Notiftest-Grab',
  phienBan: '1.2.3',
  thuMucCai: 'C:\\Users\\Nguyen Van A\\NotiftestGrab',
  trinhGoCaiDat: 'C:\\Users\\Nguyen Van A\\NotiftestGrab\\uninstall.cmd',
  icon: 'C:\\Users\\Nguyen Van A\\NotiftestGrab\\icon.ico',
};

describe('noiDungRegGoCaiDat', () => {
  it('nhan doi dau gach nguoc trong moi duong dan', () => {
    const reg = noiDungRegGoCaiDat(MAU);
    expect(reg).toContain('"InstallLocation"="C:\\\\Users\\\\Nguyen Van A\\\\NotiftestGrab"');
    expect(reg).toContain(
      '"DisplayIcon"="C:\\\\Users\\\\Nguyen Van A\\\\NotiftestGrab\\\\icon.ico"',
    );
    // Duong dan don (chua nhan doi) trong file .reg la loi cu phap — hoac
    // `reg import` tu choi, hoac te hon la ghi vao mot duong dan khac.
    expect(reg).not.toMatch(/"InstallLocation"="C:\\[^\\]/);
  });

  /**
   * CreateProcess — thu Windows dung de chay UninstallString — khong chay duoc
   * file .cmd truc tiep, no can mot trinh thong dich. Tro thang vao .cmd thi
   * bam Uninstall trong Settings bao mot loi mo ho khong noi vi sao.
   */
  it('goi trinh go cai dat qua cmd.exe chu khong tro thang vao .cmd', () => {
    const reg = noiDungRegGoCaiDat(MAU);
    const dong = reg.split('\r\n').find((d) => d.startsWith('"UninstallString"'))!;
    expect(dong).toContain('cmd.exe');
    expect(dong.indexOf('cmd.exe')).toBeLessThan(dong.indexOf('uninstall.cmd'));
  });

  it('boc duong dan co dau cach trong dau ngoac kep da thoat', () => {
    const dong = noiDungRegGoCaiDat(MAU)
      .split('\r\n')
      .find((d) => d.startsWith('"UninstallString"'))!;
    // Dau ngoac kep boc duong dan phai la \" trong file .reg. Thieu dau thoat
    // thi chuoi dut giua chung ngay o cho co dau cach.
    expect(dong).toContain('\\"');
    expect(dong).toContain('Nguyen Van A');
  });

  it('la file .reg hop le va an hai nut Sua chua / Cai lai', () => {
    const reg = noiDungRegGoCaiDat(MAU);
    expect(reg.startsWith('Windows Registry Editor Version 5.00')).toBe(true);
    expect(reg).toContain('[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows');
    expect(reg).toContain('"NoModify"=dword:00000001');
    expect(reg).toContain('"NoRepair"=dword:00000001');
    // reg import doi dong ket thuc kieu Windows.
    expect(reg).toContain('\r\n');
  });

  it('giu nguyen ten hien thi', () => {
    expect(noiDungRegGoCaiDat(MAU)).toContain('"DisplayName"="Notiftest-Grab"');
  });

  // Ten hien thi hien khong co dau, nhung file .reg van phai ghi UTF-16LE. Ghi
  // UTF-8 thi hom nao them mot chu co dau vao ten se ra ky tu la trong Settings
  // — va khong ai nghi den viec do khi sua mot chuoi hien thi.
  it('chiu duoc dau tieng Viet trong ten hien thi', () => {
    const reg = noiDungRegGoCaiDat({ ...MAU, tenHienThi: 'Notiftest-Grab — theo dõi đơn' });
    expect(reg).toContain('"DisplayName"="Notiftest-Grab — theo dõi đơn"');
  });
});

describe('khoa registry dung chung', () => {
  // Hai ben viet doc lap nhau: app ghi khoa (TypeScript), trinh go xoa khoa
  // (batch sinh tu .mjs). Lech mot ky tu thi go cai dat xong van con mot muc
  // ma trong Settings ma khong cach nao don duoc.
  it('app ghi va trinh go xoa dung mot khoa', () => {
    expect(KHOA_TRONG_SCRIPT).toBe(KHOA_GO_CAI_DAT);
  });

  it('trinh go cai dat that su xoa khoa do', () => {
    expect(GO_CAI_DAT).toContain(`set "KHOAGO=${KHOA_GO_CAI_DAT}"`);
    expect(GO_CAI_DAT).toContain('reg delete "%KHOAGO%" /f');
  });

  it('khoa nam trong HKCU — khong doi quyen quan tri de cai hay go', () => {
    expect(KHOA_GO_CAI_DAT.startsWith('HKCU\\')).toBe(true);
    expect(noiDungRegGoCaiDat(MAU)).not.toContain('HKEY_LOCAL_MACHINE');
  });
});
