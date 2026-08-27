import { describe, expect, it } from 'vitest';
import { formatVnd, parseVnd, parseVndOrThrow } from '../src/core/money.js';

describe('parseVnd', () => {
  it('doc dung dinh dang cua Grab', () => {
    expect(parseVnd('0')).toBe(0);
    expect(parseVnd('5.000')).toBe(5000);
    expect(parseVnd('121.000')).toBe(121000);
    expect(parseVnd('1.234.567')).toBe(1234567);
    expect(parseVnd('19000')).toBe(19000); // khong nhom cung chap nhan
  });

  it('bo qua khoang trang thua va hau to don vi', () => {
    expect(parseVnd('  121.000  ')).toBe(121000);
    expect(parseVnd('121.000đ')).toBe(121000);
  });

  it('doc duoc so am', () => {
    // Chua gap trong API Grab, nhung Green SM hien phi/thue duoi dang am.
    expect(parseVnd('-7.350')).toBe(-7350);
  });

  it('tra null khi khong phai tien', () => {
    expect(parseVnd(null)).toBeNull();
    expect(parseVnd(undefined)).toBeNull();
    expect(parseVnd('')).toBeNull();
    expect(parseVnd('   ')).toBeNull();
    expect(parseVnd('abc')).toBeNull();
    expect(parseVnd('12.34.56')).toBeNull(); // nhom sai
  });

  it('TU CHOI dau phay — day la diem chinh cua viec parse nghiem ngat', () => {
    // Neu Grab doi sang "121,000" thi "," co the la phan nhom (121000) hoac
    // thap phan (121). Doan bua o day nghia la gui sai tien len ccmany, nen
    // tra null de mapper nem loi va don di vao hang doi loi kem JSON tho.
    expect(parseVnd('121,000')).toBeNull();
    expect(parseVnd('121.000,50')).toBeNull();
  });
});

describe('parseVndOrThrow', () => {
  it('nem loi co ten truong de con lan ra cho hong', () => {
    expect(() => parseVndOrThrow('121,000', 'items[2].fare.priceDisplay')).toThrowError(
      /items\[2\]\.fare\.priceDisplay/,
    );
  });

  it('tra so khi doc duoc', () => {
    expect(parseVndOrThrow('26.000', 'x')).toBe(26000);
  });
});

describe('formatVnd', () => {
  it('dinh dang lai de hien thi', () => {
    expect(formatVnd(0)).toBe('0đ');
    expect(formatVnd(5000)).toBe('5.000đ');
    expect(formatVnd(121000)).toBe('121.000đ');
    expect(formatVnd(1234567)).toBe('1.234.567đ');
    expect(formatVnd(-7350)).toBe('-7.350đ');
  });

  it('di duoc ca vong: parse roi format ra chinh no', () => {
    for (const text of ['0', '5.000', '121.000', '1.234.567']) {
      expect(formatVnd(parseVnd(text)!)).toBe(`${text}đ`);
    }
  });
});
