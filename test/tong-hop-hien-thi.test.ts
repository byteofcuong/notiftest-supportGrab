import { describe, expect, it } from 'vitest';
import { dongBangDieuKhien, nhanKhay } from '../src/core/tong-hop.js';
import type { TrangThaiQuan } from '../src/core/tong-hop.js';
import type { PollerStats } from '../src/core/poller.js';

/**
 * Phan HIEN THI cua nhieu quan: cham mau o khay, va bang tung quan.
 *
 * Tach khoi tong-hop.test.ts (phan gop so lieu) vi hai nhom tra loi hai cau
 * hoi khac nhau: mot ben la "tinh dung chua", ben nay la "nguoi dung CO NHIN
 * THAY khong". Cai thu hai moi la cai hong am tham.
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

/**
 * Cham mau o khay la thu DUY NHAT nguoi dung nhin thay khi khong mo gi ca.
 *
 * Sai o day khong bao gio lo ra: cham xanh trong khi hai quan dang hong thi
 * khong ai mo bang dieu khien ra xem, va het buoi ban moi phat hien.
 */
describe('nhanKhay', () => {
  it('chua chon quan nao thi vang', () => {
    expect(nhanKhay([], false)).toEqual({
      mau: 'vang',
      chu: 'chưa chọn quán',
      dangTheoDoi: false,
    });
  });

  it('mot quan chay tot thi xanh, giu nguyen cau chu cu', () => {
    expect(nhanKhay([quan('A')], false)).toEqual({
      mau: 'xanh',
      chu: 'đang theo dõi',
      dangTheoDoi: true,
    });
  });

  it('nhieu quan chay het thi xanh kem so luong', () => {
    const ds = Array.from({ length: 14 }, (_, i) => quan(`Q${i}`));
    expect(nhanKhay(ds, false)).toEqual({
      mau: 'xanh',
      chu: 'đang theo dõi 14 quán',
      dangTheoDoi: true,
    });
  });

  /**
   * CHOT QUAN TRONG NHAT. Xanh chi duoc sang khi TAT CA cung chay. 13/14 quan
   * chay ma cham van xanh la bao "moi thu on" dung luc mot quan khong len don —
   * va cham khay la thu duy nhat nguoi dung nhin.
   */
  it('MOT quan hong trong 14 quan la cham KHONG con xanh', () => {
    const ds = [
      ...Array.from({ length: 13 }, (_, i) => quan(`OK${i}`)),
      quan('HONG', { state: 'loi' }),
    ];
    const n = nhanKhay(ds, false);
    expect(n.mau).toBe('vang');
    expect(n.chu).toBe('13/14 quán đang theo dõi');
    expect(n.dangTheoDoi).toBe(true);
  });

  it('mot quan tam dung cung lam cham khong con xanh', () => {
    const ds = [quan('A'), quan('B', { state: 'dung' })];
    expect(nhanKhay(ds, false).chu).toBe('1/2 quán đang theo dõi');
  });

  // Mot bo cookie chung: mat phien la chuyen cua ca cum, va no thang moi thu.
  it('mot quan mat phien keo ca cham sang do', () => {
    const ds = [
      ...Array.from({ length: 13 }, (_, i) => quan(`OK${i}`)),
      quan('MAT', { state: 'mat-phien' }),
    ];
    expect(nhanKhay(ds, false).mau).toBe('do');
  });

  /**
   * `matPhien` doc tu lan GOI API THAT gan nhat, doc lap voi trang thai poller.
   * Poller co the con bao 'dang-chay' vi chua toi nhip ke tiep — luc do phai
   * tin lan goi that.
   */
  it('probe bao mat phien thi do, du moi poller deu dang chay', () => {
    const ds = [quan('A'), quan('B')];
    expect(nhanKhay(ds, true).mau).toBe('do');
    expect(nhanKhay(ds, true).chu).toContain('MẤT PHIÊN');
  });

  // Mat phien van giu dangTheoDoi dung: poller khong bi dung, no chi khong vao
  // duoc. Menu phai van hien "Tam dung" chu khong phai "Tiep tuc".
  it('mat phien khong lam menu doi thanh "Tiep tuc"', () => {
    expect(nhanKhay([quan('A')], true).dangTheoDoi).toBe(true);
    expect(nhanKhay([quan('A', { state: 'dung' })], true).dangTheoDoi).toBe(false);
  });

  it('tam dung het thi vang, va menu chuyen sang "Tiep tuc"', () => {
    const ds = [quan('A', { state: 'dung' }), quan('B', { state: 'dung' })];
    expect(nhanKhay(ds, false)).toEqual({
      mau: 'vang',
      chu: 'chưa theo dõi',
      dangTheoDoi: false,
    });
  });

  // Hong het khac tam dung het: mot cai can nguoi vao xem, cai kia thi khong.
  it('hong het thi bao dang thu lai, khong bao chua theo doi', () => {
    const ds = [quan('A', { state: 'loi' }), quan('B', { state: 'loi' })];
    expect(nhanKhay(ds, false).chu).toBe('đang thử lại');
  });

  it('thu tu quan khong doi ket qua', () => {
    const ds = [quan('A'), quan('B', { state: 'loi' }), quan('C')];
    expect(nhanKhay([...ds].reverse(), false)).toEqual(nhanKhay(ds, false));
  });
});

/**
 * Bang tung quan. Day la cho DUY NHAT tra loi duoc "quan nao dang hong" — dong
 * tom tat phia tren chi noi la co hong.
 */
describe('dongBangDieuKhien', () => {
  it('khong co quan nao thi khong co dong nao', () => {
    expect(dongBangDieuKhien([])).toEqual([]);
  });

  /**
   * Giu nguyen thu tu trong config/stores.json. Bang tu doi cho moi lan lam moi
   * (vd xep quan hong len dau) se lam nguoi dung doc nham dong — bang nay cap
   * nhat moi 3 giay.
   */
  it('giu nguyen thu tu, khong tu xep lai theo trang thai', () => {
    const ds = [quan('A'), quan('HONG', { state: 'loi' }), quan('C')];
    expect(dongBangDieuKhien(ds).map((d) => d.ten)).toEqual(['A', 'HONG', 'C']);
  });

  it('quan chay tot: xanh, kem so don va moc poll', () => {
    const d = dongBangDieuKhien([quan('A', { soDonHomNay: 7 })])[0]!;
    expect(d.mau).toBe('xanh');
    expect(d.chu).toContain('7 đơn hôm nay');
    // 03:00Z la 10:00 gio Viet Nam.
    expect(d.chu).toContain('poll 10:00');
  });

  // Quan dong cua van poll deu, chi gian nhip — phai noi ro de khong ai tuong
  // no dang hong roi di khoi dong lai app.
  it('quan dong cua van xanh nhung noi ro la dang dong', () => {
    const d = dongBangDieuKhien([quan('A', { quanDangMo: false })])[0]!;
    expect(d.mau).toBe('xanh');
    expect(d.chu).toContain('quán đóng cửa');
  });

  it('quan dang mo thi khong noi gi ve gio mo cua', () => {
    expect(dongBangDieuKhien([quan('A', { quanDangMo: true })])[0]!.chu).not.toContain('đóng cửa');
  });

  it('chua ro dong hay mo thi cung khong doan bua', () => {
    expect(dongBangDieuKhien([quan('A', { quanDangMo: null })])[0]!.chu).not.toContain('đóng cửa');
  });

  it('quan mat phien: do, kem viec phai lam', () => {
    const d = dongBangDieuKhien([quan('A', { state: 'mat-phien' })])[0]!;
    expect(d.mau).toBe('do');
    expect(d.chu).toContain('đăng nhập lại');
  });

  it('quan loi: vang, kem cau loi that', () => {
    const d = dongBangDieuKhien([quan('A', { state: 'loi', lastError: 'HTTP 500' })])[0]!;
    expect(d.mau).toBe('vang');
    expect(d.chu).toBe('lỗi: HTTP 500');
  });

  // Loi khong co cau mo ta van phai ra chu doc duoc, khong phai "undefined".
  it('quan loi khong co cau loi van ra chu doc duoc', () => {
    const d = dongBangDieuKhien([quan('A', { state: 'loi', lastError: null })])[0]!;
    expect(d.chu).toBe('lỗi: không rõ');
  });

  it('quan tam dung: vang, noi ro la tam dung chu khong phai hong', () => {
    const d = dongBangDieuKhien([quan('A', { state: 'dung' })])[0]!;
    expect(d.mau).toBe('vang');
    expect(d.chu).toBe('tạm dừng');
  });

  it('quan chua poll lan nao thi noi chua co, khong in ngay 1970', () => {
    const d = dongBangDieuKhien([quan('A', { lastPollAt: null })])[0]!;
    expect(d.chu).toContain('poll chưa có');
    expect(d.chu).not.toContain('1970');
  });

  // Ten quan la thu nguoi dung dung de nhan ra dong — mat dau la doc rat kho.
  it('giu nguyen ten tieng Viet co dau', () => {
    const q = quan('X');
    q.storeName = 'Quán Bến Thành';
    expect(dongBangDieuKhien([q])[0]!.ten).toBe('Quán Bến Thành');
  });

  // Ma quan la khoa de giao dien phan biet hai quan trung ten.
  it('kem ma quan de phan biet hai quan trung ten', () => {
    const a = quan('A');
    const b = quan('B');
    a.storeName = 'Trùng Tên';
    b.storeName = 'Trùng Tên';
    const ds = dongBangDieuKhien([a, b]);
    expect(ds).toHaveLength(2);
    expect(ds[0]!.merchantID).not.toBe(ds[1]!.merchantID);
  });

  it('14 quan ra dung 14 dong', () => {
    const ds = Array.from({ length: 14 }, (_, i) => quan(`Q${i}`));
    expect(dongBangDieuKhien(ds)).toHaveLength(14);
  });
});
