import { describe, expect, it } from 'vitest';
import { GrabWindow } from '../src/main/grab-window.js';

/**
 * `plainUserAgent` la ham thuan tuy nen test duoc ma khong can chay Electron.
 *
 * Vi sao dang test: UA mac dinh cua Electron co chuoi "Electron/44.0.0" va ten
 * app — khong trinh duyet that nao co. De nguyen thi Grab co the xu ly khac di
 * (hoac chan), ma minh se khong hieu tai sao.
 */

const ELECTRON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'grab-order-watcher/0.1.0 Chrome/140.0.7339.185 Electron/44.0.0 Safari/537.36';

describe('plainUserAgent', () => {
  const cleaned = GrabWindow.plainUserAgent(ELECTRON_UA, 'grab-order-watcher');

  it('bo chuoi Electron', () => {
    expect(cleaned).not.toMatch(/Electron/i);
  });

  it('bo ten app', () => {
    expect(cleaned).not.toContain('grab-order-watcher');
  });

  it('GIU NGUYEN phien ban Chrome that — khong bia so', () => {
    expect(cleaned).toContain('Chrome/140.0.7339.185');
  });

  it('ra dung UA Chrome binh thuong', () => {
    expect(cleaned).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/140.0.7339.185 Safari/537.36',
    );
  });

  it('ten app co ky tu dac biet khong lam hong bieu thuc', () => {
    const ua = 'Mozilla/5.0 my.app+v2/1.0 Chrome/140.0.0.0 Electron/44.0.0 Safari/537.36';
    expect(GrabWindow.plainUserAgent(ua, 'my.app+v2')).toBe(
      'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    );
  });

  it('chay hai lan khong lam hong them', () => {
    expect(GrabWindow.plainUserAgent(cleaned, 'grab-order-watcher')).toBe(cleaned);
  });
});
