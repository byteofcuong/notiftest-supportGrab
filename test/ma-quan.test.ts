import { describe, expect, it } from 'vitest';
import { GrabWindow } from '../src/main/grab-window.js';

/**
 * Boc ma quan tu URL, de nguoi cai khong phai go tay mot chuoi 16 ky tu vo
 * nghia — cho hay sai nhat trong toan bo phan cai dat.
 *
 * Ham nay thuan tuy nen test duoc ma khong can Electron.
 */
describe('GrabWindow.macQuanTuUrl', () => {
  const MA = '5-C7XUNYEVEADYN2';

  it('lay duoc tu trang don hang', () => {
    expect(GrabWindow.macQuanTuUrl(`https://merchant.grab.com/order/${MA}/preparing`)).toBe(MA);
  });

  it('lay duoc o cac tab khac cua cung quan', () => {
    for (const duoi of ['history', 'preparing', 'completed', '']) {
      expect(GrabWindow.macQuanTuUrl(`https://merchant.grab.com/order/${MA}/${duoi}`)).toBe(MA);
    }
  });

  it('bo qua tham so va neo phia sau', () => {
    expect(GrabWindow.macQuanTuUrl(`https://merchant.grab.com/order/${MA}?tab=1#x`)).toBe(MA);
  });

  // `/order/` con co nhung duong khac. Nhan nham mot tu tieng Anh thanh ma quan
  // thi app se poll mot quan khong ton tai va bao loi kho hieu.
  it('khong nhan nham nhung duong /order/ khac', () => {
    for (const xau of ['new', 'list', 'settings', 'abc', '12345']) {
      expect(GrabWindow.macQuanTuUrl(`https://merchant.grab.com/order/${xau}/preparing`)).toBeNull();
    }
  });

  it('khong lay tu trang khac cua Grab', () => {
    expect(GrabWindow.macQuanTuUrl('https://merchant.grab.com/portal')).toBeNull();
    expect(GrabWindow.macQuanTuUrl('https://merchant.grab.com/profile/logout')).toBeNull();
  });

  // Trang dang nhap nam o mien khac. Neu no lo co duong /order/... thi cung
  // khong duoc tin.
  it('chi tin mien merchant.grab.com', () => {
    expect(GrabWindow.macQuanTuUrl(`https://weblogin.grab.com/order/${MA}/preparing`)).toBeNull();
    expect(GrabWindow.macQuanTuUrl(`https://ke-gian.example.com/order/${MA}/preparing`)).toBeNull();
  });

  it('URL hong hoac rong thi tra ve null, khong nem loi', () => {
    expect(GrabWindow.macQuanTuUrl(null)).toBeNull();
    expect(GrabWindow.macQuanTuUrl(undefined)).toBeNull();
    expect(GrabWindow.macQuanTuUrl('')).toBeNull();
    expect(GrabWindow.macQuanTuUrl('khong phai url')).toBeNull();
    expect(GrabWindow.macQuanTuUrl('chrome-error://chromewebdata/')).toBeNull();
  });
});
