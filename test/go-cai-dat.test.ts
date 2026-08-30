import { describe, expect, it } from 'vitest';
import { GO_CAI_DAT, TEN_APP, TEN_DU_LIEU } from '../scripts/lib/noi-dung.mjs';

/**
 * Trinh go cai dat la doan ma DUY NHAT trong du an nay chay `rmdir /s /q` len
 * mot thu muc lay tu bien. Khong co cach nao chay thu no ma khong that su xoa
 * mot cai gi do, nen thay vao do ta ghim lay hinh dang cua no: rao an toan phai
 * dung TRUOC lenh xoa, va phai xoa dung nam thu da hua, khong hon.
 *
 * Cung tinh than voi test chan `/orders/mark` ben grab client: khong chung minh
 * duoc no chay dung, nhung chan duoc viec ai do go mat cai chot.
 */

const RAO = 'if not exist "%APPDIR%\\resources\\app\\out\\main\\main.js"';
const XOA_THU_MUC_APP = 'rmdir /s /q "%APPDIR%"';

describe('GO_CAI_DAT', () => {
  it('kiem tra dung thu muc ban cai TRUOC khi xoa no', () => {
    const viTriRao = GO_CAI_DAT.indexOf(RAO);
    const viTriXoa = GO_CAI_DAT.indexOf(XOA_THU_MUC_APP);

    expect(viTriRao, 'mat rao an toan nhan dang thu muc cai').toBeGreaterThan(-1);
    expect(viTriXoa).toBeGreaterThan(-1);
    // Rao dat sau lenh xoa thi coi nhu khong co rao.
    expect(viTriRao).toBeLessThan(viTriXoa);
  });

  it('rao khong dat thi thoat han, khong chay tiep xuong phan xoa', () => {
    const giua = GO_CAI_DAT.slice(GO_CAI_DAT.indexOf(RAO), GO_CAI_DAT.indexOf(XOA_THU_MUC_APP));
    expect(giua).toMatch(/exit \/b 1/);
  });

  /**
   * Ca tinh nang nay sinh ra tu mot cau hoi: "go di nhung giu lai dang nhap
   * Grab duoc khong". Thu muc du lieu chi duoc dung toi khi cau tra loi la
   * KHONG — mot lenh xoa nam ngoai nhanh do la mot loi hua bi pha.
   */
  it('chi xoa cau hinh + phien dang nhap khi nguoi dung chon "xoa"', () => {
    const dongXoa = GO_CAI_DAT.split('\n').filter(
      (d) => d.includes('THUMUCDL') && d.includes('rmdir'),
    );
    expect(dongXoa).toHaveLength(1);
    expect(dongXoa[0]).toContain('if defined APPDATA');

    const truocDo = GO_CAI_DAT.slice(0, GO_CAI_DAT.indexOf(dongXoa[0]!));
    expect(truocDo).toMatch(/if \/i "%DULIEU%"=="xoa"/);
  });

  it('mac dinh cua che do tu hoi la GIU lai du lieu', () => {
    // choice /c CK  ->  C (giu) la 1, K (xoa) la 2. Dao thu tu hai lua chon nay
    // thi script van chay tron tru ma lam nguoc han y nguoi dung.
    expect(GO_CAI_DAT).toContain('choice /c CK');
    expect(GO_CAI_DAT).toContain('if errorlevel 2 (set "DULIEU=xoa") else (set "DULIEU=giu")');
  });

  it('go het bon dau vet ma ban cai de lai tren may', () => {
    expect(GO_CAI_DAT, 'muc tu chay cung Windows').toContain(
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "%TENAPP%" /f',
    );
    expect(GO_CAI_DAT, 'loi tat ngoai desktop').toContain('"%DESKTOP%\\%TENAPP%.lnk"');
    expect(GO_CAI_DAT, 'thu muc cai').toContain(XOA_THU_MUC_APP);
    expect(GO_CAI_DAT, 'file Electron 150 MB con sot trong %TEMP%').toContain(
      'del /f /q "%ZIPTAM%"',
    );
  });

  it('cac ten dung chung khop voi phan con lai cua app', () => {
    expect(GO_CAI_DAT).toContain(`set "TENAPP=${TEN_APP}"`);
    // Sai ten thu muc du lieu thi nhanh "xoa het" se im lang khong xoa gi:
    // nguoi dung tuong da sach may, ma phien dang nhap Grab van nam nguyen do.
    expect(GO_CAI_DAT).toContain(`set "THUMUCDL=%APPDATA%\\${TEN_DU_LIEU}"`);
  });

  // Chay tu trong thu muc sap bi xoa thi cmd.exe giu handle len chinh no, va
  // rmdir se hong giua chung — de lai mot ban cai vo hieu ma van chiem cho.
  it('tu chep sang %TEMP% roi moi xoa, va tu xoa minh o dong cuoi', () => {
    expect(GO_CAI_DAT).toContain('copy /y "%~f0" "%BANSAO%"');
    expect(GO_CAI_DAT).toContain('set "BANSAO=%TEMP%');
    expect(GO_CAI_DAT.trimEnd().endsWith('(goto) 2>nul & del /f /q "%~f0"')).toBe(true);
  });

  // `timeout` bao loi khi stdin bi chuyen huong — ma app goi script nay voi
  // stdio 'ignore', tuc la dung canh do. `ping` thi khong quan tam.
  it('khong dung `timeout` de cho — app goi no khong co stdin', () => {
    expect(GO_CAI_DAT).not.toMatch(/^\s*timeout /m);
  });
});
