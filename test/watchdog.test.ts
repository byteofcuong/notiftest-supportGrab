import { describe, expect, it } from 'vitest';
import { quyetDinhWatchdog, type DauVaoWatchdog } from '../src/core/watchdog.js';

const PHUT = 60_000;
const T0 = Date.parse('2026-08-28T10:00:00Z');

function dauVao(patch: Partial<DauVaoWatchdog> = {}): DauVaoWatchdog {
  return {
    state: 'dang-chay',
    lastPollAt: T0,
    batDauLuc: T0 - 60 * PHUT,
    canThiepLanCuoi: null,
    now: T0,
    nguongMs: 3 * PHUT,
    ...patch,
  };
}

describe('quyetDinhWatchdog', () => {
  it('poll vua thanh cong thi khong dung toi', () => {
    expect(quyetDinhWatchdog(dauVao({ now: T0 + 10_000 }))).toBe('khong-lam-gi');
  });

  it('van con trong nguong thi cho tiep', () => {
    expect(quyetDinhWatchdog(dauVao({ now: T0 + 2.9 * PHUT }))).toBe('khong-lam-gi');
  });

  it('qua nguong thi tai lai trang', () => {
    expect(quyetDinhWatchdog(dauVao({ now: T0 + 3 * PHUT }))).toBe('tai-lai-trang');
  });

  it('nguoi dung tam dung thi im lang, du bao lau', () => {
    expect(quyetDinhWatchdog(dauVao({ state: 'dung', now: T0 + 10 * PHUT }))).toBe('khong-lam-gi');
  });

  it('mat phien thi khong tai lai — tai lai khong cuu duoc, phai co nguoi dang nhap', () => {
    expect(quyetDinhWatchdog(dauVao({ state: 'mat-phien', now: T0 + 60 * PHUT }))).toBe(
      'khong-lam-gi',
    );
  });

  it('trang thai loi van duoc cuu: do chinh la luc can watchdog nhat', () => {
    expect(quyetDinhWatchdog(dauVao({ state: 'loi', now: T0 + 5 * PHUT }))).toBe('tai-lai-trang');
  });

  // Day la loi de mac nhat: app vua bat, chua kip poll lan nao, lastPollAt con
  // null — neu tinh la "vo cung cu" thi cu khoi dong xong la bi da mot cai.
  it('chua tung poll lan nao thi tinh tuoi tu luc bat dau, khong ket toi ngay', () => {
    const vuaBatDau = dauVao({ lastPollAt: null, batDauLuc: T0, now: T0 + 30_000 });
    expect(quyetDinhWatchdog(vuaBatDau)).toBe('khong-lam-gi');
  });

  it('chua tung poll va da qua nguong tu luc bat dau thi van tai lai', () => {
    const treo = dauVao({ lastPollAt: null, batDauLuc: T0, now: T0 + 4 * PHUT });
    expect(quyetDinhWatchdog(treo)).toBe('tai-lai-trang');
  });

  // Tai lai trang mat vai giay; trong khoang do van chua co luot poll nao thanh
  // cong, nen neu khong nho lan can thiep truoc thi se da lien tuc moi 30 giay.
  it('vua can thiep xong thi cho het mot nguong roi moi can thiep tiep', () => {
    const vuaCanThiep = dauVao({
      now: T0 + 4 * PHUT,
      canThiepLanCuoi: T0 + 3 * PHUT,
    });
    expect(quyetDinhWatchdog(vuaCanThiep)).toBe('khong-lam-gi');
  });

  it('can thiep truoc do khong an thua thi lan hai duoc phep', () => {
    const vanTreo = dauVao({
      now: T0 + 7 * PHUT,
      canThiepLanCuoi: T0 + 3 * PHUT,
    });
    expect(quyetDinhWatchdog(vanTreo)).toBe('tai-lai-trang');
  });

  it('nguong 0 la tat han watchdog', () => {
    expect(quyetDinhWatchdog(dauVao({ nguongMs: 0, now: T0 + 100 * PHUT }))).toBe('khong-lam-gi');
  });
});
