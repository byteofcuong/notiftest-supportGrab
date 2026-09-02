import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chuanBiCauHinh, loadStores } from '../src/core/config.js';

/**
 * Nhom nay ghim mot lo hong se chi lo ra o LAN CAP NHAT DAU TIEN, tuc la khi
 * cong cu da chay that ngoai quan vai tuan:
 *
 * cap nhat = chep de nguyen ca thu muc app -> .env va config/stores.json bi xoa
 * sach -> nhan vien mo len thay "CHAY KHO" va khong don nao duoc gui, khong ai
 * hieu vi sao.
 */

let goc: string;
let thuMucApp: string;
let thuMucNguoiDung: string;

beforeEach(() => {
  goc = mkdtempSync(join(tmpdir(), 'cauhinh-'));
  thuMucApp = join(goc, 'app');
  thuMucNguoiDung = join(goc, 'nguoidung');
  mkdirSync(thuMucApp, { recursive: true });
});

afterEach(() => {
  try {
    chmodSync(thuMucNguoiDung, 0o700);
  } catch {
    /* thu muc co the chua ton tai */
  }
  rmSync(goc, { recursive: true, force: true });
});

function datEnv(thuMuc: string, noiDung: string): void {
  mkdirSync(thuMuc, { recursive: true });
  writeFileSync(join(thuMuc, '.env'), noiDung, 'utf8');
}

/** File stores.json that su LUON co ma quan — day la thu app tu ghi vao. */
function datStores(thuMuc: string, ten: string, maQuan = '5-AAAAAAAAAA'): void {
  mkdirSync(join(thuMuc, 'config'), { recursive: true });
  writeFileSync(
    join(thuMuc, 'config', 'stores.json'),
    JSON.stringify({ stores: [{ grabMerchantID: maQuan, storeName: ten }] }),
    'utf8',
  );
}

describe('chuanBiCauHinh', () => {
  it('chep cau hinh canh .exe sang thu muc nguoi dung, roi doc ban do', () => {
    datEnv(thuMucApp, 'CCMANY_API_KEY=abc\n');
    datStores(thuMucApp, 'Quan A');

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.envFile).toBe(join(thuMucNguoiDung, '.env'));
    expect(viTri.storesRoot).toBe(thuMucNguoiDung);
    expect(readFileSync(join(thuMucNguoiDung, '.env'), 'utf8')).toContain('abc');
    expect(viTri.ghiChu).toHaveLength(2);
  });

  // Day la ca quan trong nhat: mo phong dung canh cap nhat app.
  it('thu muc app bi thay moi (mat cau hinh) thi van doc duoc ban da luu', () => {
    datEnv(thuMucApp, 'CCMANY_API_KEY=abc\n');
    datStores(thuMucApp, 'Quan A');
    chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    // Cap nhat: xoa sach thu muc app roi dat ban moi vao, khong co cau hinh.
    rmSync(thuMucApp, { recursive: true, force: true });
    mkdirSync(thuMucApp, { recursive: true });

    const sauCapNhat = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(sauCapNhat.envFile).toBe(join(thuMucNguoiDung, '.env'));
    expect(readFileSync(sauCapNhat.envFile!, 'utf8')).toContain('abc');
    expect(sauCapNhat.storesRoot).toBe(thuMucNguoiDung);
    // Khong chep gi ca, nen khong co ghi chu nao.
    expect(sauCapNhat.ghiChu).toEqual([]);
  });

  // "Cai minh vua bo vao thi thang" — quy tac duy nhat khong lam ai bat ngo.
  it('file moi dat canh .exe thi THANG ban da luu', () => {
    datEnv(thuMucNguoiDung, 'CCMANY_API_KEY=cu\n');
    datEnv(thuMucApp, 'CCMANY_API_KEY=moi\n');

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(readFileSync(viTri.envFile!, 'utf8')).toContain('moi');
  });

  it('khong co cau hinh o dau ca thi bao null, khong nem loi', () => {
    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.envFile).toBeNull();
    // Khong co ban da luu thi tro ve thu muc app, de loi "khong doc duoc
    // stores.json" chi dung vao cho nguoi dung that su nhin thay.
    expect(viTri.storesRoot).toBe(thuMucApp);
  });

  it('chi co .env ma khong co stores.json thi moi thu xu ly doc lap', () => {
    datEnv(thuMucApp, 'X=1\n');

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.envFile).toBe(join(thuMucNguoiDung, '.env'));
    expect(viTri.storesRoot).toBe(thuMucApp);
  });

  // O che do phat trien, hai thu muc co the la mot. Khong duoc tu chep de len
  // chinh minh roi bao da lam gi do.
  it('hai thu muc trung nhau thi khong chep, khong ghi chu', () => {
    datEnv(thuMucApp, 'X=1\n');
    datStores(thuMucApp, 'Quan A');

    const viTri = chuanBiCauHinh(thuMucApp, thuMucApp);

    expect(viTri.ghiChu).toEqual([]);
    expect(viTri.envFile).toBe(join(thuMucApp, '.env'));
    expect(viTri.storesRoot).toBe(thuMucApp);
  });

  // Chep hong thi van phai chay duoc bang ban canh .exe, va phai NOI RA.
  it('chep that bai thi lui ve doc ban canh .exe va ghi lai ly do', () => {
    datEnv(thuMucApp, 'CCMANY_API_KEY=abc\n');
    // Tao san mot THU MUC ten ".env" o dich: copyFileSync se that bai.
    mkdirSync(join(thuMucNguoiDung, '.env'), { recursive: true });

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.ghiChu.join(' ')).toMatch(/Khong chep duoc/);
    expect(viTri.envFile).toBe(join(thuMucApp, '.env'));
  });

  /**
   * Ban di kem luon co config/stores.json RONG (ma quan do app tu nhan dien).
   * Neu ban rong do cung "thang" thi moi lan mo app se ghi de len quan nguoi
   * dung vua chon — ho mat quan sau dung mot lan khoi dong lai, va khong hieu
   * vi sao phai chon lai tu dau.
   */
  it('stores.json rong di kem ban cai KHONG duoc ghi de quan da chon', () => {
    // Nguoi dung da chon quan o lan truoc.
    mkdirSync(join(thuMucNguoiDung, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucNguoiDung, 'config', 'stores.json'),
      JSON.stringify({ stores: [{ grabMerchantID: '5-DACHON', ccmanyStoreID: '', storeName: '' }] }),
      'utf8',
    );
    // Ban cai di kem: rong.
    mkdirSync(join(thuMucApp, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucApp, 'config', 'stores.json'),
      JSON.stringify({ stores: [{ grabMerchantID: '', ccmanyStoreID: '', storeName: '' }] }),
      'utf8',
    );

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.storesRoot).toBe(thuMucNguoiDung);
    const conLai = JSON.parse(
      readFileSync(join(thuMucNguoiDung, 'config', 'stores.json'), 'utf8'),
    ) as { stores: { grabMerchantID: string }[] };
    expect(conLai.stores[0]!.grabMerchantID).toBe('5-DACHON');
  });

  /**
   * Cung chot chan tren, nhung o canh nhieu quan — day moi la canh dat gia.
   * Mot lan cap nhat app ma nuot mat lua chon 14 quan thi nguoi dung phai mo
   * bang chon, tick lai tung dong, va trong luc do khong quan nao len don.
   */
  it('stores.json rong KHONG duoc ghi de danh sach 14 quan', () => {
    const daChon = Array.from({ length: 14 }, (_, i) => ({
      grabMerchantID: `5-QUAN${i}`,
      ccmanyStoreID: '',
      storeName: `Quan ${i}`,
    }));
    mkdirSync(join(thuMucNguoiDung, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucNguoiDung, 'config', 'stores.json'),
      JSON.stringify({ stores: daChon }),
      'utf8',
    );
    mkdirSync(join(thuMucApp, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucApp, 'config', 'stores.json'),
      JSON.stringify({ stores: [{ grabMerchantID: '', ccmanyStoreID: '', storeName: '' }] }),
      'utf8',
    );

    const viTri = chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(viTri.storesRoot).toBe(thuMucNguoiDung);
    expect(loadStores(thuMucNguoiDung)).toHaveLength(14);
  });

  /**
   * Ban cai di kem chi co MOT quan mau — no van "thang" theo quy tac cu, va
   * dieu do dung: file canh .exe la cai nguoi dung vua dat vao. Nhung phai chac
   * la thang tron ven chu khong tron mot nua, de lai 13 quan mo coi.
   */
  it('stores.json canh .exe CO ma quan thi thay TOAN BO danh sach cu', () => {
    mkdirSync(join(thuMucNguoiDung, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucNguoiDung, 'config', 'stores.json'),
      JSON.stringify({
        stores: Array.from({ length: 14 }, (_, i) => ({
          grabMerchantID: `5-CU${i}`,
          ccmanyStoreID: '',
          storeName: '',
        })),
      }),
      'utf8',
    );
    mkdirSync(join(thuMucApp, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucApp, 'config', 'stores.json'),
      JSON.stringify({ stores: [{ grabMerchantID: '5-MOI', ccmanyStoreID: '', storeName: '' }] }),
      'utf8',
    );

    chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    expect(loadStores(thuMucNguoiDung).map((s) => s.grabMerchantID)).toEqual(['5-MOI']);
  });

  it('stores.json canh .exe CO ma quan thi van thang nhu cu', () => {
    datStores(thuMucNguoiDung, 'cu');
    mkdirSync(join(thuMucApp, 'config'), { recursive: true });
    writeFileSync(
      join(thuMucApp, 'config', 'stores.json'),
      JSON.stringify({ stores: [{ grabMerchantID: '5-MOI', ccmanyStoreID: '', storeName: '' }] }),
      'utf8',
    );

    chuanBiCauHinh(thuMucApp, thuMucNguoiDung);

    const conLai = JSON.parse(
      readFileSync(join(thuMucNguoiDung, 'config', 'stores.json'), 'utf8'),
    ) as { stores: { grabMerchantID: string }[] };
    expect(conLai.stores[0]!.grabMerchantID).toBe('5-MOI');
  });
});