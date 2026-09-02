import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chuaCoMaQuan,
  ghepLuaChon,
  ketQuaDanhSach,
  ketQuaLoi,
  maQuanDeGoiApi,
} from '../src/main/chon-quan.js';
import { SessionExpiredError } from '../src/grab/client.js';
import type { QuanCoTheChon } from '../src/grab/quan.js';

/**
 * Bang chon quan la cua ngo DUY NHAT de mot quan duoc theo doi, va cung la cho
 * duy nhat de bo theo doi. Hai huong hong, khong huong nao co canh bao:
 *
 *   thieu mot dong  -> quan do khong bao gio duoc chon, chay ca ngay khong don
 *   mat mot tick    -> nguoi dung bam Luu va MAT mot quan dang chay ma khong
 *                      he thay minh vua bo di cai gi
 *
 * Giao dien la JavaScript thuan khong test duoc, nen moi quyet dinh doi sang
 * day — va do la ly do nhom test nay phai phu kin.
 */

function quan(patch: Partial<QuanCoTheChon> = {}): QuanCoTheChon {
  return {
    merchantID: '5-AAA',
    tenHienThi: 'Quán A',
    city: 'Ho Chi Minh',
    status: 'ACTIVE',
    dangHoatDong: true,
    ...patch,
  };
}

describe('maQuanDeGoiApi', () => {
  /**
   * UU TIEN MA DOC TU TRANG. Cai bay da dam phai that: ma quan khong thuoc tai
   * khoan dang dang nhap tra ve 400 chu khong phai 401. Neu uu tien cau hinh
   * thi mot cau hinh cu (tai khoan khac) se lam bang chon khong bao gio mo
   * duoc — dung luc nguoi dung can no de chon lai quan.
   */
  it('uu tien ma doc tu trang Grab dang mo', () => {
    expect(maQuanDeGoiApi(['5-CAUHINH'], '5-TRANG')).toBe('5-TRANG');
  });

  it('khong doc duoc tu trang thi lay quan dau trong cau hinh', () => {
    expect(maQuanDeGoiApi(['5-MOT', '5-HAI'], null)).toBe('5-MOT');
  });

  it('khong co ca hai thi tra null', () => {
    expect(maQuanDeGoiApi([], null)).toBeNull();
  });

  it('bo qua chuoi rong va khoang trang', () => {
    expect(maQuanDeGoiApi(['', '   ', '5-THAT'], '  ')).toBe('5-THAT');
    expect(maQuanDeGoiApi(['', '  '], null)).toBeNull();
  });

  it('cat khoang trang thua o ma doc tu trang', () => {
    expect(maQuanDeGoiApi([], '  5-TRANG  ')).toBe('5-TRANG');
  });
});

describe('ghepLuaChon — tick san', () => {
  it('quan dang theo doi thi tick san', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-A' }), quan({ merchantID: '5-B' })], ['5-A']);
    expect(ds.map((d) => [d.merchantID, d.daTick])).toEqual([
      ['5-A', true],
      ['5-B', false],
    ]);
  });

  it('chua chon quan nao thi khong dong nao duoc tick', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-A' }), quan({ merchantID: '5-B' })], []);
    expect(ds.every((d) => !d.daTick)).toBe(true);
  });

  it('tick san ca 14 quan khi dang theo doi ca 14', () => {
    const grab = Array.from({ length: 14 }, (_, i) => quan({ merchantID: `5-Q${i}` }));
    const ds = ghepLuaChon(grab, grab.map((q) => q.merchantID));
    expect(ds.filter((d) => d.daTick)).toHaveLength(14);
  });

  it('bo qua ma rong trong danh sach dang chon', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-A' })], ['', '   ', '5-A']);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.daTick).toBe(true);
  });
});

describe('ghepLuaChon — quan mo coi', () => {
  /**
   * CHOT QUAN TRONG NHAT CUA FILE NAY.
   *
   * Quan dang duoc theo doi ma Grab khong tra ve (bi go khoi nhom, doi chu, hay
   * chi la mot loi goi tra thieu) van phai hien ra va van tick san. Bo no di
   * thi bang chon thieu mot dong, nguoi dung bam Luu, va quan do bien mat khoi
   * cau hinh ma khong ai thay minh vua mat gi.
   */
  it('quan dang theo doi ma Grab khong tra ve VAN hien va VAN tick', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-CON' })], ['5-CON', '5-MOCOI']);
    const moCoi = ds.find((d) => d.merchantID === '5-MOCOI');

    expect(moCoi).toBeDefined();
    expect(moCoi!.daTick).toBe(true);
    expect(moCoi!.nhan).toContain('không thấy trong nhóm');
  });

  it('quan mo coi xep xuong cuoi, sau moi quan con trong nhom', () => {
    const grab = [quan({ merchantID: '5-A' }), quan({ merchantID: '5-B' })];
    const ds = ghepLuaChon(grab, ['5-MOCOI', '5-A']);
    expect(ds.at(-1)!.merchantID).toBe('5-MOCOI');
  });

  it('Grab tra ve rong ma dang theo doi 3 quan thi van du 3 dong', () => {
    const ds = ghepLuaChon([], ['5-A', '5-B', '5-C']);
    expect(ds).toHaveLength(3);
    expect(ds.every((d) => d.daTick && d.nhan !== null)).toBe(true);
  });

  // Khong co ten that thi hien ma quan — mot dong trong se lam nguoi dung tuong
  // day la rac va bo tick di.
  it('quan mo coi hien ma quan thay cho ten', () => {
    const ds = ghepLuaChon([], ['5-MOCOI']);
    expect(ds[0]!.tenHienThi).toBe('5-MOCOI');
  });

  it('khong sinh dong trung khi quan vua co trong nhom vua dang theo doi', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-A' })], ['5-A', '5-A']);
    expect(ds).toHaveLength(1);
  });
});

describe('ghepLuaChon — nhan va thong tin dong', () => {
  it('quan da ngung duoc gan nhan, quan dang chay thi khong', () => {
    const ds = ghepLuaChon(
      [
        quan({ merchantID: '5-CHAY', dangHoatDong: true }),
        quan({ merchantID: '5-NGUNG', dangHoatDong: false }),
      ],
      [],
    );
    expect(ds.find((d) => d.merchantID === '5-CHAY')!.nhan).toBeNull();
    expect(ds.find((d) => d.merchantID === '5-NGUNG')!.nhan).toContain('đã ngừng');
  });

  /**
   * Quan da ngung VAN tick duoc — no chi bi gan nhan, khong bi khoa. Grab co
   * the danh dau nham, hoac quan mo lai ngay hom sau; chan cung o day la giau
   * mat mot quan dang ban.
   */
  it('quan da ngung van tick duoc neu dang theo doi', () => {
    const ds = ghepLuaChon([quan({ merchantID: '5-NGUNG', dangHoatDong: false })], ['5-NGUNG']);
    expect(ds[0]!.daTick).toBe(true);
    expect(ds[0]!.nhan).toContain('đã ngừng');
  });

  it('giu nguyen ten tieng Viet co dau va thanh pho', () => {
    const ds = ghepLuaChon([quan({ tenHienThi: 'Quán Bến Thành', city: 'Hồ Chí Minh' })], []);
    expect(ds[0]!.tenHienThi).toBe('Quán Bến Thành');
    expect(ds[0]!.city).toBe('Hồ Chí Minh');
  });

  it('thieu thanh pho thi la null chu khong phai chuoi rong', () => {
    expect(ghepLuaChon([quan({ city: null })], [])[0]!.city).toBeNull();
  });

  it('giu nguyen thu tu Grab tra ve', () => {
    const grab = [
      quan({ merchantID: '5-C', tenHienThi: 'C' }),
      quan({ merchantID: '5-A', tenHienThi: 'A' }),
    ];
    expect(ghepLuaChon(grab, []).map((d) => d.merchantID)).toEqual(['5-C', '5-A']);
  });
});

describe('ketQuaDanhSach', () => {
  const FIXTURE = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'store-search.json'), 'utf8'),
  ) as unknown;

  it('doc duoc fixture that thanh bang chon', () => {
    const kq = ketQuaDanhSach(FIXTURE, ['5-C8DEEF3TEXVVA2']);
    expect(kq.ok).toBe(true);
    expect(kq.thongBao).toBeNull();
    expect(kq.canDangNhap).toBe(false);
    expect(kq.quan).toHaveLength(4);
    expect(kq.quan.filter((q) => q.daTick).map((q) => q.merchantID)).toEqual(['5-C8DEEF3TEXVVA2']);
  });

  it('quan da ngung trong fixture duoc gan nhan', () => {
    const kq = ketQuaDanhSach(FIXTURE, []);
    const ngung = kq.quan.find((q) => q.merchantID === '5-C5KKPP1VBH6WKS');
    expect(ngung!.nhan).toContain('đã ngừng');
  });

  /**
   * Phan hoi la (hinh dang doi, mang rong) khong duoc nem — nem o day la giet
   * luon nut "Lay danh sach quan", tuc la khoa han duong cai dat.
   */
  it('phan hoi la thi bao mot cau ro rang, khong nem', () => {
    for (const xau of [null, undefined, 'chuoi', 42, {}, { merchants: null }]) {
      const kq = ketQuaDanhSach(xau, []);
      expect(kq.ok).toBe(true);
      expect(kq.quan).toEqual([]);
      expect(kq.thongBao).toContain('không trả về quán nào');
    }
  });

  // Phan hoi rong NHUNG dang theo doi vai quan: khong duoc bao "khong co quan
  // nao" roi de bang trong — nhung quan dang chay phai con nguyen de tick.
  it('phan hoi rong ma dang theo doi 2 quan thi van hien 2 dong', () => {
    const kq = ketQuaDanhSach({ merchants: [] }, ['5-A', '5-B']);
    expect(kq.quan).toHaveLength(2);
    expect(kq.thongBao).toBeNull();
  });
});

describe('chuaCoMaQuan', () => {
  it('bao khong ok, day nguoi dung sang nut dang nhap', () => {
    const kq = chuaCoMaQuan();
    expect(kq.ok).toBe(false);
    expect(kq.canDangNhap).toBe(true);
    expect(kq.quan).toEqual([]);
    expect(kq.thongBao).toContain('Mở trang Grab');
  });
});

describe('ketQuaLoi', () => {
  /**
   * Mat phien phai ra cau KHAC hoan toan voi loi mang: mot cai can nguoi dang
   * nhap, cai kia chi can bam lai. Gop chung thi nguoi dung ngoi bam lai mai
   * ma khong ai bao ho phai dang nhap.
   */
  it('mat phien thi bao dang nhap, va bat co canDangNhap', () => {
    const kq = ketQuaLoi(new SessionExpiredError('401'));
    expect(kq.ok).toBe(false);
    expect(kq.canDangNhap).toBe(true);
    expect(kq.thongBao).toContain('hết hạn');
  });

  it('loi mang thi KHONG bat co dang nhap, va kem cau loi that', () => {
    const kq = ketQuaLoi(new Error('Failed to fetch'));
    expect(kq.canDangNhap).toBe(false);
    expect(kq.thongBao).toContain('Failed to fetch');
  });

  // Bat duoc thu khong phai Error (throw mot chuoi, hoac null) van phai ra cau
  // doc duoc, khong phai "undefined".
  it('nem thu khong phai Error van ra cau doc duoc', () => {
    for (const xau of [null, undefined, 'chuoi tho', 42]) {
      const kq = ketQuaLoi(xau);
      expect(kq.ok).toBe(false);
      expect(kq.thongBao).toBeTruthy();
      expect(kq.thongBao).not.toContain('undefined');
    }
  });
});
