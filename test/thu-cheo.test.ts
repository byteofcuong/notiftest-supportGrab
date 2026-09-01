import { describe, expect, it } from 'vitest';
import { dienGiai, lamDuocKhong, thuGoiCheoQuan } from '../src/main/thu-cheo.js';
import type { KetQuaThuCheo } from '../src/main/thu-cheo.js';
import { SessionExpiredError } from '../src/grab/client.js';
import type { GrabClient } from '../src/grab/client.js';

/**
 * Phep thu nay chi chay MOT LAN trong doi du an, va ket qua cua no quyet dinh
 * kien truc nhieu quan. Doc nham ket qua thi di sai duong ca thang.
 *
 * Nen phan doc ket qua duoc tach ra thanh ham thuan de test duoc ma khong can
 * Grab, khong can Electron, khong can quan thu hai.
 */

function ketQua(vao: Partial<KetQuaThuCheo>): KetQuaThuCheo {
  return {
    quanTrenManHinh: '5-AAA',
    quanGoiApi: '5-BBB',
    openStatus: 'ok',
    listPreparing: 'ok',
    soDon: 0,
    loi: null,
    ...vao,
  };
}

describe('doc ket qua thu cheo quan', () => {
  it('ca hai API deu OK thi ket luan la lam duoc', () => {
    const kq = ketQua({});
    expect(lamDuocKhong(kq)).toBe(true);
    expect(dienGiai(kq)).toMatch(/^LAM DUOC/);
    expect(dienGiai(kq)).toContain('MOT cua so');
  });

  /**
   * Nua voi con te hon la hong han: no nghia la co quan chay duoc co quan
   * khong, va loi se hien ra sau vai ngay duoi dang "quan nay khong len don"
   * chu khong phai mot thong bao ro rang.
   *
   * Hai API nay nam o hai dich vu khac nhau cua Grab (`/food/merchant/` va
   * `/delvplatformapi/`) nen chuyen mot cai qua mot cai chan la co that.
   */
  it('chi mot trong hai API truot cung la KHONG lam duoc', () => {
    expect(lamDuocKhong(ketQua({ openStatus: 'mat-phien' }))).toBe(false);
    expect(lamDuocKhong(ketQua({ listPreparing: 'mat-phien' }))).toBe(false);
    expect(lamDuocKhong(ketQua({ listPreparing: 'loi' }))).toBe(false);
  });

  it('bi tu choi phien thi noi ro phai moi quan mot cua so', () => {
    const noi = dienGiai(ketQua({ openStatus: 'mat-phien', listPreparing: 'mat-phien' }));
    expect(noi).toMatch(/^KHONG DUOC/);
    expect(noi).toContain('MOI QUAN MOT CUA SO');
  });

  /**
   * Mat mang giua chung khong duoc doc thanh "Grab tu choi". Ket luan sai o day
   * dan toi viet thua han mot tang N cua so ma khong ai can.
   */
  it('loi khong phai tu choi phien thi KHONG duoc ket luan', () => {
    const noi = dienGiai(ketQua({ openStatus: 'loi', listPreparing: 'loi', loi: 'Failed to fetch' }));
    expect(noi).toMatch(/^CHUA KET LUAN DUOC/);
    expect(noi).toContain('Failed to fetch');
  });
});

describe('thuGoiCheoQuan', () => {
  it('goi API bang ma quan KIA, khong phai quan dang mo', async () => {
    const daGoi: string[] = [];
    const client = {
      openStatus: async (ma: string) => {
        daGoi.push(`openStatus:${ma}`);
        return { isOpen: true };
      },
      listPreparing: async (ma: string) => {
        daGoi.push(`listPreparing:${ma}`);
        return { orders: [{}, {}] };
      },
    } as unknown as GrabClient;

    const kq = await thuGoiCheoQuan(client, '5-DANG-MO', '5-QUAN-KIA');

    // Ca phep thu nam o day: goi phai mang ma quan KHONG hien tren man hinh.
    expect(daGoi).toEqual(['openStatus:5-QUAN-KIA', 'listPreparing:5-QUAN-KIA']);
    expect(lamDuocKhong(kq)).toBe(true);
    expect(kq.soDon).toBe(2);
  });

  // Goi ca hai du cai dau da hong: can biet Grab chan mot dich vu hay ca hai.
  it('openStatus hong thi VAN goi tiep listPreparing', async () => {
    const daGoi: string[] = [];
    const client = {
      openStatus: async () => {
        daGoi.push('openStatus');
        throw new SessionExpiredError('401');
      },
      listPreparing: async () => {
        daGoi.push('listPreparing');
        return { orders: [] };
      },
    } as unknown as GrabClient;

    const kq = await thuGoiCheoQuan(client, '5-A', '5-B');

    expect(daGoi).toEqual(['openStatus', 'listPreparing']);
    expect(kq.openStatus).toBe('mat-phien');
    expect(kq.listPreparing).toBe('ok');
    expect(lamDuocKhong(kq)).toBe(false);
  });

  it('phan biet duoc tu choi phien voi loi mang', async () => {
    const client = {
      openStatus: async () => {
        throw new Error('Failed to fetch');
      },
      listPreparing: async () => {
        throw new Error('Failed to fetch');
      },
    } as unknown as GrabClient;

    const kq = await thuGoiCheoQuan(client, '5-A', '5-B');

    expect(kq.openStatus).toBe('loi');
    expect(kq.listPreparing).toBe('loi');
    expect(dienGiai(kq)).toMatch(/^CHUA KET LUAN DUOC/);
  });
});
