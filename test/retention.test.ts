import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { donDepFileCu } from '../src/core/retention.js';

const NGAY = 86_400_000;
const BAY_GIO = Date.parse('2026-08-28T10:00:00Z');

let thuMuc: string;

beforeEach(() => {
  thuMuc = mkdtempSync(join(tmpdir(), 'retention-'));
});
afterEach(() => {
  rmSync(thuMuc, { recursive: true, force: true });
});

/** Tao file voi thoi diem sua dat lui `soNgay` ngay so voi BAY_GIO. */
function taoFile(ten: string, soNgay: number): void {
  const duongDan = join(thuMuc, ten);
  writeFileSync(duongDan, '{}', 'utf8');
  const giay = (BAY_GIO - soNgay * NGAY) / 1000;
  utimesSync(duongDan, giay, giay);
}

const now = () => BAY_GIO;

describe('donDepFileCu', () => {
  it('xoa file cu hon han, giu file con moi', () => {
    taoFile('cu.json', 30);
    taoFile('vua.json', 20);
    taoFile('moi.json', 1);

    expect(donDepFileCu(thuMuc, 14, now)).toEqual({ daXoa: 2, loi: 0 });
    expect(readdirSync(thuMuc)).toEqual(['moi.json']);
  });

  it('file dung bang tuoi han thi GIU — nguong la "cu hon", khong phai "bang"', () => {
    taoFile('dung-han.json', 14);
    expect(donDepFileCu(thuMuc, 14, now).daXoa).toBe(0);
    expect(readdirSync(thuMuc)).toEqual(['dung-han.json']);
  });

  // Cach kiem chung nhanh cua Task 10: dat RAW_RETENTION_DAYS=0 roi xem file
  // raw co bi don khong.
  it('so ngay = 0 thi xoa het', () => {
    taoFile('a.json', 5);
    taoFile('b.json', 0.001);
    expect(donDepFileCu(thuMuc, 0, now).daXoa).toBe(2);
    expect(readdirSync(thuMuc)).toEqual([]);
  });

  // Mot cau hinh sai khong duoc phep bien thanh lenh xoa sach.
  it('so ngay am hoac khong phai so thi KHONG xoa gi', () => {
    taoFile('a.json', 999);
    expect(donDepFileCu(thuMuc, -1, now)).toEqual({ daXoa: 0, loi: 0 });
    expect(donDepFileCu(thuMuc, Number.NaN, now)).toEqual({ daXoa: 0, loi: 0 });
    expect(readdirSync(thuMuc)).toEqual(['a.json']);
  });

  it('thu muc chua ton tai thi im lang, khong nem loi', () => {
    expect(donDepFileCu(join(thuMuc, 'chua-co'), 14, now)).toEqual({ daXoa: 0, loi: 0 });
  });

  it('bo qua thu muc con, chi dung toi file', () => {
    taoFile('cu.json', 30);
    const con = join(thuMuc, 'thu-muc-con');
    writeFileSync(join(thuMuc, 'giu-lai.json'), '{}', 'utf8');
    mkdirSync(con);
    const giay = (BAY_GIO - 30 * NGAY) / 1000;
    utimesSync(con, giay, giay);

    expect(donDepFileCu(thuMuc, 14, now).daXoa).toBe(1);
    expect(readdirSync(thuMuc).sort()).toEqual(['giu-lai.json', 'thu-muc-con']);
  });
});
