import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quanCoTheChon } from '../src/grab/quan.js';

/**
 * Bang chon quan la cua ngo duy nhat de mot quan duoc theo doi. Quan nao khong
 * hien o day thi khong ai tick duoc, va hong theo kieu im lang: app chay binh
 * thuong, chi la quan do khong bao gio len don.
 *
 * Nen phan lon test o duoi khong kiem "loc dung" ma kiem "KHONG GIAU NHAM".
 */

const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'store-search.json'), 'utf8'),
) as unknown;

describe('quanCoTheChon — fixture', () => {
  it('doc du quan va lay dung ten that', () => {
    const ds = quanCoTheChon(FIXTURE);
    expect(ds).toHaveLength(4);
    expect(ds.map((q) => q.tenHienThi)).toEqual([
      'Quán Test An Hải',
      'Quán Test Bến Thành',
      'Quán Test Đống Đa',
      'Quán Test Đã Đóng',
    ]);
    expect(ds[0]?.merchantID).toBe('5-C6MMQQ2VCJ7XLT');
    expect(ds[0]?.city).toBe('Da Nang');
  });

  /**
   * Quan da ngung xep sau CHU KHONG BIEN MAT. Neu ai do doi thanh `.filter()`
   * cho gon thi test nay do, kem theo ly do o ngay tren.
   */
  it('quan da ngung bi ha co nhung van con trong danh sach', () => {
    const ds = quanCoTheChon(FIXTURE);
    const daDong = ds.find((q) => q.merchantID === '5-C5KKPP1VBH6WKS');
    expect(daDong).toBeDefined();
    expect(daDong?.dangHoatDong).toBe(false);
    // ...va bi day xuong cuoi, du ten no khong phai cuoi bang chu cai.
    expect(ds.at(-1)).toBe(daDong);
    expect(ds.slice(0, 3).every((q) => q.dangHoatDong)).toBe(true);
  });
});

describe('quanCoTheChon — doc status', () => {
  function mot(status: unknown) {
    return quanCoTheChon({ merchants: [{ merchantID: '5-A', merchantName: 'A', status }] })[0];
  }

  it('status la khong ro thi VAN coi la dang hoat dong', () => {
    // Ta chi do duoc endpoint nay mot lan, tren mot tai khoan. Gap chuoi la ma
    // ha co xuong la tu giau mat quan dang ban.
    expect(mot('SOMETHING_NEW')?.dangHoatDong).toBe(true);
    expect(mot(undefined)?.dangHoatDong).toBe(true);
    expect(mot(null)?.dangHoatDong).toBe(true);
    expect(mot('')?.dangHoatDong).toBe(true);
    expect(mot(3)?.dangHoatDong).toBe(true);
  });

  /**
   * "Dong cua" khac "da ngung kinh doanh". Quan nghi trua, quan chua toi gio mo
   * -> chieu no van ban. Ha co mot quan nhu the la mat don ca buoi.
   */
  it('CLOSED khong bi coi la da ngung', () => {
    expect(mot('CLOSED')?.dangHoatDong).toBe(true);
    expect(mot('TEMPORARILY_CLOSED')?.dangHoatDong).toBe(true);
  });

  it('chi cac trang thai ngung han moi bi ha co', () => {
    for (const s of ['INACTIVE', 'DELETED', 'SUSPENDED', 'TERMINATED', 'DISABLED']) {
      expect(mot(s)?.dangHoatDong, s).toBe(false);
      expect(mot(s.toLowerCase())?.dangHoatDong, s).toBe(false);
      expect(mot(` ${s} `)?.dangHoatDong, s).toBe(false);
    }
  });
});

describe('quanCoTheChon — phan hoi khong nhu y', () => {
  /**
   * Nem loi o day se lam chet nut "Chon quan", va do la duong duy nhat de cai
   * dat. Sai hinh dang thi tra rong de giao dien con bao duoc "khong doc duoc
   * danh sach", con nem thi nguoi dung nhin man hinh trang.
   */
  it('hinh dang la thi tra mang rong chu khong nem', () => {
    for (const xau of [null, undefined, 'chuoi', 42, [], {}, { merchants: null }, { merchants: {} }]) {
      expect(() => quanCoTheChon(xau)).not.toThrow();
      expect(quanCoTheChon(xau)).toEqual([]);
    }
  });

  it('bo qua ban ghi rac ma van giu cac ban ghi lanh ben canh', () => {
    const ds = quanCoTheChon({
      merchants: [
        null,
        'chuoi',
        {},
        { merchantID: '' },
        { merchantID: '   ' },
        { merchantID: '5-OK', merchantName: 'Quan That' },
      ],
    });
    expect(ds).toHaveLength(1);
    expect(ds[0]?.merchantID).toBe('5-OK');
  });

  it('thieu ten thi hien ma quan chu khong hien dong trong', () => {
    const ds = quanCoTheChon({ merchants: [{ merchantID: '5-KHONG-TEN' }, { merchantID: '5-X', merchantName: '  ' }] });
    expect(ds.map((q) => q.tenHienThi).sort()).toEqual(['5-KHONG-TEN', '5-X']);
    expect(ds.every((q) => q.city === null && q.status === null)).toBe(true);
  });

  // limit=100 nghia la nhom qua 100 quan phai phan trang; ghep hai trang de
  // sinh ban ghi trung. Trung ma quan ma lot ra se thanh hai poller cung quan.
  it('trung ma quan thi chi con mot dong', () => {
    const ds = quanCoTheChon({
      merchants: [
        { merchantID: '5-A', merchantName: 'Ten Dau' },
        { merchantID: '5-A', merchantName: 'Ten Sau' },
      ],
    });
    expect(ds).toHaveLength(1);
    expect(ds[0]?.tenHienThi).toBe('Ten Dau');
  });
});

describe('quanCoTheChon — thu tu hien thi', () => {
  function ten(...ds: string[]) {
    return quanCoTheChon({
      merchants: ds.map((t, i) => ({ merchantID: `5-${i}`, merchantName: t })),
    }).map((q) => q.tenHienThi);
  }

  // So sanh chuoi bang `<` se nem het chu co dau xuong cuoi, va bang chon 14
  // quan ten tieng Viet se trong nhu bi xao.
  it('xep theo bang chu cai tieng Viet, khong phai theo ma don vi ma', () => {
    expect(ten('Đống Đa', 'Dong Da', 'An Nam')).toEqual(['An Nam', 'Dong Da', 'Đống Đa']);
  });

  it('so trong ten xep theo gia tri, khong theo chu so dau', () => {
    expect(ten('Quan 10', 'Quan 2', 'Quan 1')).toEqual(['Quan 1', 'Quan 2', 'Quan 10']);
  });
});
