import { describe, expect, it } from 'vitest';
import {
  quyetDinhWatchdog,
  quyetDinhWatchdogNhieuQuan,
  type DauVaoWatchdog,
  type DauVaoWatchdogNhieuQuan,
  type QuanTheoDoi,
} from '../src/core/watchdog.js';

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

// ── Nhieu quan ───────────────────────────────────────────────────────────────

function quan(ten: string, patch: Partial<QuanTheoDoi> = {}): QuanTheoDoi {
  return { ten, state: 'dang-chay', lastPollAt: T0, ...patch };
}

/** Quan dung im tu `phutTruoc` phut truoc. */
function ket(ten: string, phutTruoc: number): QuanTheoDoi {
  return quan(ten, { lastPollAt: T0 - phutTruoc * PHUT });
}

function nhieuQuan(patch: Partial<DauVaoWatchdogNhieuQuan> = {}): DauVaoWatchdogNhieuQuan {
  return {
    quan: [quan('A'), quan('B'), quan('C')],
    batDauLuc: T0 - 60 * PHUT,
    canThiepLanCuoi: null,
    now: T0,
    nguongMs: 3 * PHUT,
    ...patch,
  };
}

describe('quyetDinhWatchdogNhieuQuan', () => {
  it('khong co quan nao thi khong lam gi', () => {
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: [] }));
    expect(kq.quyetDinh).toBe('khong-lam-gi');
    expect(kq.quanDungIm).toEqual([]);
  });

  it('moi quan deu vua poll xong thi khong dung toi', () => {
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan()).quyetDinh).toBe('khong-lam-gi');
  });

  /**
   * Ca test quan trong nhat cua nhom nay. 13 quan chay tot khong duoc phep che
   * mat mot quan dang ket — do dung la kieu hong im lang ma watchdog sinh ra de
   * bat: app van chay, cham khay van xanh, chi mot quan khong len don.
   */
  it('MOT quan ket giua 13 quan khoe van keo duoc lenh tai lai', () => {
    const ds = [...Array.from({ length: 13 }, (_, i) => quan(`OK${i}`)), ket('KET', 5)];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    expect(kq.quyetDinh).toBe('tai-lai-trang');
    expect(kq.quanDungIm).toEqual(['KET']);
  });

  // Mot cua so -> mot lenh tai lai, du bao nhieu quan cung ket. Lam N lenh thi
  // chung se da trang chong len nhau va huy fetch cua nhau.
  it('nhieu quan cung ket van chi la MOT lenh tai lai, kem du ten', () => {
    const ds = [ket('A', 5), quan('B'), ket('C', 9), ket('D', 4)];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    expect(kq.quyetDinh).toBe('tai-lai-trang');
    expect(kq.quanDungIm).toEqual(['A', 'C', 'D']);
  });

  it('ca 14 quan cung ket (mat mang) van chi mot lenh', () => {
    const ds = Array.from({ length: 14 }, (_, i) => ket(`Q${i}`, 10));
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    expect(kq.quyetDinh).toBe('tai-lai-trang');
    expect(kq.quanDungIm).toHaveLength(14);
  });

  it('con trong nguong thi cho tiep', () => {
    const ds = [quan('A'), ket('B', 2.9)];
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds })).quyetDinh).toBe('khong-lam-gi');
  });

  it('dung dung nguong thi da tinh la ket', () => {
    const ds = [ket('B', 3)];
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds })).quyetDinh).toBe('tai-lai-trang');
  });

  // Quan nguoi dung tu tam dung dung im la chuyen binh thuong, khong phai su co.
  it('quan dang tam dung du lau cung khong keo tai lai', () => {
    const ds = [quan('A'), quan('DUNG', { state: 'dung', lastPollAt: T0 - 60 * PHUT })];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    expect(kq.quyetDinh).toBe('khong-lam-gi');
    expect(kq.quanDungIm).toEqual([]);
  });

  // Tai lai khong cuu duoc mat phien — phai co nguoi dang nhap. Da trang luc do
  // chi lam mat luon phien dang duoc khoi phuc.
  it('quan mat phien du lau cung khong keo tai lai', () => {
    const ds = [quan('A'), quan('MAT', { state: 'mat-phien', lastPollAt: T0 - 60 * PHUT })];
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds })).quyetDinh).toBe('khong-lam-gi');
  });

  /**
   * Canh lan lon that: mot quan mat phien (khong cuu duoc) NAM CANH mot quan
   * loi (cuu duoc). Quan loi van phai duoc cuu, va ten hai quan kia khong duoc
   * lot vao danh sach bao.
   */
  it('quan loi van duoc cuu du canh no co quan mat phien va quan tam dung', () => {
    const ds = [
      quan('MAT', { state: 'mat-phien', lastPollAt: T0 - 60 * PHUT }),
      quan('LOI', { state: 'loi', lastPollAt: T0 - 5 * PHUT }),
      quan('DUNG', { state: 'dung', lastPollAt: T0 - 60 * PHUT }),
    ];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    expect(kq.quyetDinh).toBe('tai-lai-trang');
    expect(kq.quanDungIm).toEqual(['LOI']);
  });

  it('trang thai loi la luc can watchdog nhat', () => {
    const ds = [quan('LOI', { state: 'loi', lastPollAt: T0 - 5 * PHUT })];
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds })).quyetDinh).toBe('tai-lai-trang');
  });

  // Quan vua duoc them (chua poll lan nao) khong duoc bi ket toi ngay.
  it('quan chua tung poll thi tinh tuoi tu luc bat dau, khong ket toi ngay', () => {
    const vuaBatDau = nhieuQuan({
      quan: [quan('MOI', { lastPollAt: null })],
      batDauLuc: T0,
      now: T0 + 30_000,
    });
    expect(quyetDinhWatchdogNhieuQuan(vuaBatDau).quyetDinh).toBe('khong-lam-gi');
  });

  it('quan chua tung poll va da qua nguong thi van tai lai', () => {
    const daLau = nhieuQuan({
      quan: [quan('MOI', { lastPollAt: null })],
      batDauLuc: T0,
      now: T0 + 4 * PHUT,
    });
    expect(quyetDinhWatchdogNhieuQuan(daLau).quyetDinh).toBe('tai-lai-trang');
  });

  it('vua can thiep xong thi cho het mot nguong', () => {
    const ds = [ket('A', 10)];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds, canThiepLanCuoi: T0 - 1 * PHUT }));
    expect(kq.quyetDinh).toBe('khong-lam-gi');
  });

  /**
   * Bi hoan vi vua can thiep, NHUNG van phai bao duoc quan nao dang ket — day
   * la thu de mat nhat khi viet: neu ap chot chong-da-lien-tiep cho tung quan
   * thi danh sach se rong ngay sau mot lan tai lai, va nhat ky mat ten quan
   * dung luc nguoi doc can no nhat.
   */
  it('bi hoan vi vua can thiep thi VAN giu ten cac quan dang ket', () => {
    const ds = [ket('A', 10), ket('B', 10)];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds, canThiepLanCuoi: T0 - 1 * PHUT }));
    expect(kq.quanDungIm).toEqual(['A', 'B']);
  });

  it('can thiep truoc do khong an thua thi lan hai duoc phep', () => {
    const ds = [ket('A', 10)];
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds, canThiepLanCuoi: T0 - 4 * PHUT }));
    expect(kq.quyetDinh).toBe('tai-lai-trang');
  });

  it('nguong 0 la tat han watchdog, du moi quan deu ket', () => {
    const ds = Array.from({ length: 14 }, (_, i) => ket(`Q${i}`, 100));
    const kq = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds, nguongMs: 0 }));
    expect(kq.quyetDinh).toBe('khong-lam-gi');
    expect(kq.quanDungIm).toEqual([]);
  });

  // Ket qua khong duoc phu thuoc thu tu quan trong config/stores.json.
  it('doi thu tu quan khong doi ket qua', () => {
    const ds = [quan('A'), ket('KET', 5), quan('B')];
    const xuoi = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds }));
    const nguoc = quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: [...ds].reverse() }));
    expect(nguoc.quyetDinh).toBe(xuoi.quyetDinh);
    expect([...nguoc.quanDungIm].sort()).toEqual([...xuoi.quanDungIm].sort());
  });

  // Hai quan trung ten (Grab cho phep) khong duoc lam mat mot dong trong danh
  // sach — dem theo so quan, khong theo ten duy nhat.
  it('hai quan trung ten van ra hai dong', () => {
    const ds = [ket('Trung Ten', 5), ket('Trung Ten', 9)];
    expect(quyetDinhWatchdogNhieuQuan(nhieuQuan({ quan: ds })).quanDungIm).toEqual([
      'Trung Ten',
      'Trung Ten',
    ]);
  });

  /**
   * Mot quan duy nhat phai cho ra dung ket qua nhu ham mot quan — neu lech thi
   * ban mot quan dang chay ngoai tiem se doi hanh vi sau khi cap nhat.
   */
  it('mot quan thi khop y het quyetDinhWatchdog', () => {
    for (const phut of [0, 2.9, 3, 10]) {
      for (const state of ['dang-chay', 'loi', 'dung', 'mat-phien'] as const) {
        const mot = quyetDinhWatchdog(
          dauVao({ state, lastPollAt: T0 - phut * PHUT, now: T0 }),
        );
        const nhieu = quyetDinhWatchdogNhieuQuan(
          nhieuQuan({ quan: [quan('A', { state, lastPollAt: T0 - phut * PHUT })] }),
        );
        expect(nhieu.quyetDinh, `${state} ${phut}p`).toBe(mot);
      }
    }
  });
});
