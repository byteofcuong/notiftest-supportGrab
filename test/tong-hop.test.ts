import { describe, expect, it } from 'vitest';
import { gopTrangThai, treKhoiDauMs } from '../src/core/tong-hop.js';
import type { TrangThaiQuan } from '../src/core/tong-hop.js';
import type { PollerState, PollerStats } from '../src/core/poller.js';

/**
 * Khay co mot cham mau, bang dieu khien co mot dong trang thai — nhung tu Task
 * 4 thi phia sau chung la 14 poller. Cach gop quyet dinh nguoi dung CO BIET hay
 * KHONG BIET rang mot quan dang hong.
 *
 * Nen phan lon test o day kiem dung mot dieu: cai xau khong duoc chim di giua
 * dam dong dang chay tot.
 */

function stats(vao: Partial<PollerStats> = {}): PollerStats {
  return {
    state: 'dang-chay',
    lastPollAt: '2026-09-02T03:00:00.000Z',
    lastError: null,
    quanDangMo: true,
    soDonHomNay: 0,
    donGanNhat: null,
    ...vao,
  };
}

function quan(ten: string, vao: Partial<PollerStats> = {}): TrangThaiQuan {
  return {
    merchantID: `5-${ten}`,
    ccmanyStoreID: `5-${ten}`,
    storeName: ten,
    stats: stats(vao),
  };
}

describe('gopTrangThai — trang thai chung', () => {
  it('chua chon quan nao thi tra null', () => {
    expect(gopTrangThai([])).toBeNull();
  });

  it('tat ca chay tot thi la dang-chay', () => {
    expect(gopTrangThai([quan('A'), quan('B'), quan('C')])?.state).toBe('dang-chay');
  });

  /**
   * Ca test quan trong nhat cua file nay. 13 quan xanh khong duoc phep nhuom
   * xanh not quan thu 14 dang mat phien — cham khay se bao "moi thu on" dung
   * luc co viec phai lam.
   */
  it('MOT quan mat phien trong 14 quan van keo ca cham khay sang mat-phien', () => {
    const ds = [
      ...Array.from({ length: 13 }, (_, i) => quan(`OK${i}`)),
      quan('HONG', { state: 'mat-phien' }),
    ];
    expect(gopTrangThai(ds)?.state).toBe('mat-phien');
  });

  it('mat phien nang hon loi, loi nang hon dang chay', () => {
    const bac: [PollerState, PollerState, PollerState][] = [
      ['dang-chay', 'loi', 'loi'],
      ['dang-chay', 'mat-phien', 'mat-phien'],
      ['loi', 'mat-phien', 'mat-phien'],
    ];
    for (const [a, b, mongDoi] of bac) {
      expect(gopTrangThai([quan('A', { state: a }), quan('B', { state: b })])?.state, `${a}+${b}`).toBe(
        mongDoi,
      );
      // Thu tu khong duoc anh huong ket qua.
      expect(gopTrangThai([quan('B', { state: b }), quan('A', { state: a })])?.state).toBe(mongDoi);
    }
  });

  /**
   * `dung` la Y MUON cua nguoi dung, khong phai su co — nen no khong nam trong
   * thang nang dan. Con MOT quan chay thi cong cu van dang lam viec, va nut
   * phai la "Tam dung" chu khong phai "Tiep tuc".
   */
  it('mot quan dung mot quan chay thi KHONG phai dung', () => {
    expect(gopTrangThai([quan('A', { state: 'dung' }), quan('B')])?.state).toBe('dang-chay');
  });

  it('chi khi TAT CA cung dung moi la dung', () => {
    const ds = [quan('A', { state: 'dung' }), quan('B', { state: 'dung' })];
    expect(gopTrangThai(ds)?.state).toBe('dung');
  });

  // Quan dang tam dung khong duoc keo trang thai chung xau di — no khong hong,
  // no chi dang nghi.
  it('quan dang dung khong lam ban trang thai cua nhung quan dang chay', () => {
    const ds = [quan('A', { state: 'dung', lastError: 'loi cu' }), quan('B')];
    const gop = gopTrangThai(ds);
    expect(gop?.state).toBe('dang-chay');
    expect(gop?.lastError).toBeNull();
  });
});

describe('gopTrangThai — moc poll', () => {
  /**
   * Lay moc CU NHAT chu khong phai moi nhat. Moi nhat se giau mat quan dang
   * ket: 13 quan chay tot lam dong "poll luc 14:03" luon tuoi, du quan thu 14
   * dung im tu 13:20.
   */
  it('lay moc poll cu nhat, khong phai moi nhat', () => {
    const ds = [
      quan('A', { lastPollAt: '2026-09-02T03:00:00.000Z' }),
      quan('KET', { lastPollAt: '2026-09-02T02:20:00.000Z' }),
      quan('C', { lastPollAt: '2026-09-02T03:00:05.000Z' }),
    ];
    expect(gopTrangThai(ds)?.lastPollAt).toBe('2026-09-02T02:20:00.000Z');
  });

  it('quan chua poll lan nao thi bo qua, khong lam trong ca dong', () => {
    const ds = [quan('MOI', { lastPollAt: null }), quan('B', { lastPollAt: '2026-09-02T03:00:00.000Z' })];
    expect(gopTrangThai(ds)?.lastPollAt).toBe('2026-09-02T03:00:00.000Z');
  });

  it('chua quan nao poll xong thi noi that la chua co', () => {
    expect(gopTrangThai([quan('A', { lastPollAt: null })])?.lastPollAt).toBeNull();
  });

  // Quan dang tam dung giu moc cu tu doi nao — de no vao se lam dong trang thai
  // gia di ma khong quan nao that su ket.
  it('bo qua quan dang dung khi tinh moc poll', () => {
    const ds = [
      quan('DUNG', { state: 'dung', lastPollAt: '2026-09-01T00:00:00.000Z' }),
      quan('CHAY', { lastPollAt: '2026-09-02T03:00:00.000Z' }),
    ];
    expect(gopTrangThai(ds)?.lastPollAt).toBe('2026-09-02T03:00:00.000Z');
  });
});

describe('gopTrangThai — con so va thong bao', () => {
  it('cong don don hom nay cua moi quan', () => {
    const ds = [quan('A', { soDonHomNay: 3 }), quan('B', { soDonHomNay: 7 }), quan('C')];
    expect(gopTrangThai(ds)?.soDonHomNay).toBe(10);
  });

  // Tam dung khong xoa di nhung don da gui truoc do trong ngay.
  it('don cua quan dang tam dung van duoc cong', () => {
    const ds = [quan('A', { state: 'dung', soDonHomNay: 5 }), quan('B', { soDonHomNay: 2 })];
    expect(gopTrangThai(ds)?.soDonHomNay).toBe(7);
  });

  it('don gan nhat la don moi nhat trong tat ca cac quan', () => {
    const ds = [
      quan('A', { donGanNhat: { orderCode: 'GF-1', total: 1000, at: '2026-09-02T02:00:00.000Z' } }),
      quan('B', { donGanNhat: { orderCode: 'GF-2', total: 2000, at: '2026-09-02T03:30:00.000Z' } }),
      quan('C', { donGanNhat: null }),
    ];
    expect(gopTrangThai(ds)?.donGanNhat?.orderCode).toBe('GF-2');
  });

  // "Loi gan nhat: HTTP 500" ma khong biet quan nao thi phai mo nhat ky ra do.
  it('loi cua nhieu quan phai kem ten quan', () => {
    const ds = [quan('A'), quan('Quan Ben Thanh', { state: 'loi', lastError: 'HTTP 500' })];
    expect(gopTrangThai(ds)?.lastError).toBe('Quan Ben Thanh: HTTP 500');
  });

  // Mot quan thi kem ten chi lam dai dong — nguoi dung biet thua la quan nao.
  it('mot quan thi giu nguyen cau loi nhu cu', () => {
    expect(gopTrangThai([quan('A', { state: 'loi', lastError: 'HTTP 500' })])?.lastError).toBe(
      'HTTP 500',
    );
  });
});

describe('gopTrangThai — quan dang mo', () => {
  /**
   * CO quan nao mo, chu khong phai TAT CA deu mo. Con mot quan mo la con don co
   * the ve; bao "quan dong cua" luc do la sai, va neu ai do dua vao day de gian
   * nhip poll thi don cua quan dang mo se ve cham.
   */
  it('mot quan mo trong nhieu quan dong thi van tinh la co quan mo', () => {
    const ds = [quan('A', { quanDangMo: false }), quan('B', { quanDangMo: false }), quan('C', { quanDangMo: true })];
    expect(gopTrangThai(ds)?.quanDangMo).toBe(true);
  });

  it('tat ca deu dong thi la dong', () => {
    const ds = [quan('A', { quanDangMo: false }), quan('B', { quanDangMo: false })];
    expect(gopTrangThai(ds)?.quanDangMo).toBe(false);
  });

  it('chua quan nao tra loi thi la chua ro', () => {
    expect(gopTrangThai([quan('A', { quanDangMo: null })])?.quanDangMo).toBeNull();
  });
});

/**
 * Khong rai thi 14 quan cung ban `orders-pagination` trong cung mot phan nghin
 * giay, cu 5 giay mot lan — dung cai hinh dang ma phia server hay chan.
 */
describe('treKhoiDauMs', () => {
  it('mot quan thi khong tre', () => {
    expect(treKhoiDauMs(0, 1, 5000)).toBe(0);
  });

  it('quan dau tien luon chay ngay', () => {
    expect(treKhoiDauMs(0, 14, 5000)).toBe(0);
  });

  it('14 quan trong nhip 5 giay thi cach deu nhau', () => {
    const tre = Array.from({ length: 14 }, (_, i) => treKhoiDauMs(i, 14, 5000));
    expect(tre[0]).toBe(0);
    expect(tre[13]).toBeLessThan(5000);
    // Khoang cach giua hai quan lien tiep deu nhau (sai so lam tron 1ms).
    const buoc = tre.slice(1).map((t, i) => t - tre[i]!);
    for (const b of buoc) expect(Math.abs(b - 5000 / 14)).toBeLessThanOrEqual(1);
  });

  // Tre bang hoac vuot mot nhip la quan do bi bo mat mot luot poll ngay tu dau.
  it('khong quan nao bi tre qua mot nhip', () => {
    for (const soQuan of [2, 5, 14, 30]) {
      for (let i = 0; i < soQuan; i++) {
        expect(treKhoiDauMs(i, soQuan, 5000), `${i}/${soQuan}`).toBeLessThan(5000);
      }
    }
  });
});
