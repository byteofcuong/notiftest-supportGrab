import { describe, expect, it } from 'vitest';
import { noiDungNhipTim, tomTatNhipTim } from '../src/core/nhip-tim.js';
import type { DauVaoNhipTim, QuanNhipTim } from '../src/core/nhip-tim.js';

/**
 * Nhip tim la bang chung DUY NHAT rang cong cu con song. Tren may quan khong ai
 * mo bang dieu khien ra xem — neu tin nay sai hoac kho hieu thi khong con duong
 * nao khac de biet.
 *
 * Hai kieu sai deu ton kem, va khong can nhau:
 *
 *   noi "on" khi dang hong  -> khong ai vao cuu, quan mat don ca ngay
 *   noi "hong" khi dang on  -> vai lan la nguoi ta tat thong bao cua bot, va
 *                              tat luon ca canh bao that
 */

const POLL = '2026-09-02T03:15:00.000Z';

function quan(ten: string, patch: Partial<QuanNhipTim> = {}): QuanNhipTim {
  return { ten, state: 'dang-chay', soDonHomNay: 0, lastError: null, ...patch };
}

function vao(patch: Partial<DauVaoNhipTim> = {}): DauVaoNhipTim {
  return {
    quan: [quan('Quan A')],
    phien: 'song',
    dryRun: false,
    pollGanNhat: POLL,
    ...patch,
  };
}

describe('noiDungNhipTim — chua chon quan', () => {
  it('khong co quan nao thi noi thang ra, khong bao con so 0/0', () => {
    const dong = noiDungNhipTim(vao({ quan: [] }));
    expect(dong).toHaveLength(1);
    expect(dong[0]).toContain('CHUA CHON QUAN NAO');
  });
});

describe('noiDungNhipTim — mot quan', () => {
  /**
   * "1/1 quan dang theo doi" doc rat ky quai, va phan lon may quan van chi chay
   * mot quan. Giu nguyen cau chu cu de ban dang chay ngoai tiem khong doi giong
   * sau khi cap nhat.
   */
  it('giu nguyen cau chu thoi mot quan, khong hien phan so', () => {
    const dong = noiDungNhipTim(vao());
    expect(dong[0]).toBe('Quan A - dang theo doi');
    expect(dong[0]).not.toContain('/');
  });

  it('che do chay kho duoc noi ro ngay dong dau', () => {
    expect(noiDungNhipTim(vao({ dryRun: true }))[0]).toBe('Quan A - dang theo doi (CHAY KHO)');
  });

  it('mot quan bi loi thi kem cau loi', () => {
    const dong = noiDungNhipTim(vao({ quan: [quan('Quan A', { state: 'loi', lastError: 'HTTP 500' })] }));
    expect(dong.join('\n')).toContain('Loi gan nhat: HTTP 500');
  });

  it('mot quan tam dung', () => {
    expect(noiDungNhipTim(vao({ quan: [quan('Quan A', { state: 'dung' })] }))[0]).toContain(
      'DA TAM DUNG',
    );
  });

  /**
   * Phien la chuyen cua CA CUA SO, doc lap voi trang thai poller. Poller co the
   * con dang bao 'dang-chay' vi chua toi nhip poll ke tiep, trong khi lan goi
   * API that gan nhat da bao mat phien — luc do phai tin lan goi that.
   */
  it('phien mat thi thang, du poller van bao dang chay', () => {
    const dong = noiDungNhipTim(vao({ phien: 'mat' }));
    expect(dong[0]).toContain('MAT PHIEN GRAB');
  });

  it('phien chua ro thi khong bao dong nham', () => {
    expect(noiDungNhipTim(vao({ phien: 'chua-ro' }))[0]).toBe('Quan A - dang theo doi');
  });
});

describe('noiDungNhipTim — nhieu quan', () => {
  const muoiBon = Array.from({ length: 14 }, (_, i) => quan(`Quan ${i}`));

  it('bao phan so quan dang theo doi', () => {
    expect(noiDungNhipTim(vao({ quan: muoiBon }))[0]).toBe('14/14 quan dang theo doi');
  });

  it('hai quan hong thi phan so giam dung bay nhieu', () => {
    const ds = [...muoiBon];
    ds[3] = quan('Quan 3', { state: 'loi', lastError: 'HTTP 500' });
    ds[9] = quan('Quan 9', { state: 'dung' });
    expect(noiDungNhipTim(vao({ quan: ds }))[0]).toBe('12/14 quan dang theo doi');
  });

  it('che do chay kho van hien khi nhieu quan', () => {
    expect(noiDungNhipTim(vao({ quan: muoiBon, dryRun: true }))[0]).toBe(
      '14/14 quan dang theo doi (CHAY KHO)',
    );
  });

  /**
   * "12/14 quan dang theo doi" ma khong noi la quan nao thi bao dung mot dieu
   * vo dung: co hai quan hong, khong biet quan nao. Nguoi doc phai mo may len
   * xem — dung cai viec ma nhip tim sinh ra de khoi phai lam.
   */
  it('goi TEN cac quan dang co van de', () => {
    const ds = [...muoiBon];
    ds[3] = quan('Quan Ben Thanh', { state: 'loi', lastError: 'HTTP 500' });
    ds[9] = quan('Quan Dong Da', { state: 'dung' });
    const text = noiDungNhipTim(vao({ quan: ds })).join('\n');

    expect(text).toContain('Quan co van de (2):');
    expect(text).toContain('Quan Ben Thanh: HTTP 500');
    expect(text).toContain('Quan Dong Da: tam dung');
  });

  it('quan loi khong co cau loi thi van co dong cua no', () => {
    const ds = [quan('A'), quan('B', { state: 'loi', lastError: null })];
    expect(noiDungNhipTim(vao({ quan: ds })).join('\n')).toContain('B: loi');
  });

  /**
   * Mat mang thi ca 14 quan cung hong mot luc. Liet ke ca 14 dong kem thong bao
   * loi thi tin bi cat giua chung tren dien thoai — bay dong dau la du de biet
   * "hong dien rong" hay "hong mot quan".
   */
  it('hong hang loat thi cat bot danh sach nhung van bao du so luong', () => {
    const ds = Array.from({ length: 14 }, (_, i) =>
      quan(`Quan ${i}`, { state: 'loi', lastError: 'Failed to fetch' }),
    );
    const dong = noiDungNhipTim(vao({ quan: ds }));
    const text = dong.join('\n');

    expect(text).toContain('Quan co van de (14):');
    expect(dong.filter((d) => d.startsWith('  - '))).toHaveLength(7);
    expect(text).toContain('va 7 quan nua');
  });

  it('dung 7 quan hong thi khong hien dong "va ... nua"', () => {
    const ds = [
      ...Array.from({ length: 7 }, (_, i) => quan(`Hong ${i}`, { state: 'loi' })),
      quan('Khoe'),
    ];
    expect(noiDungNhipTim(vao({ quan: ds })).join('\n')).not.toContain('quan nua');
  });

  it('moi quan deu khoe thi khong co muc "quan co van de"', () => {
    expect(noiDungNhipTim(vao({ quan: muoiBon })).join('\n')).not.toContain('van de');
  });

  // Mot cua so, mot bo cookie — mat phien la chuyen cua ca cum, nen no phai de
  // len dau, truoc moi con so khac.
  it('mat phien de len dong dau, khong lan giua cac con so', () => {
    const ds = [...muoiBon];
    ds[0] = quan('Quan 0', { state: 'mat-phien' });
    expect(noiDungNhipTim(vao({ quan: ds }))[0]).toBe(
      'MAT PHIEN GRAB - can dang nhap lai tren may quan (14 quan)',
    );
  });

  it('phien mat theo lan goi API that cung de len dong dau', () => {
    expect(noiDungNhipTim(vao({ quan: muoiBon, phien: 'mat' }))[0]).toContain('MAT PHIEN GRAB');
  });

  it('tam dung tat ca thi noi ro la tat ca', () => {
    const ds = muoiBon.map((q) => ({ ...q, state: 'dung' as const }));
    expect(noiDungNhipTim(vao({ quan: ds }))[0]).toBe(
      'DA TAM DUNG TAT CA - khong theo doi don nao (14 quan)',
    );
  });

  // Con MOT quan chay thi chua phai "tam dung tat ca" — cong cu van dang lam
  // viec, va bao ngung het la bao sai.
  it('con mot quan chay thi KHONG phai tam dung tat ca', () => {
    const ds = muoiBon.map((q, i) => ({ ...q, state: i === 5 ? ('dang-chay' as const) : ('dung' as const) }));
    expect(noiDungNhipTim(vao({ quan: ds }))[0]).toBe('1/14 quan dang theo doi');
  });
});

describe('noiDungNhipTim — con so va thoi gian', () => {
  it('cong don don cua tat ca cac quan', () => {
    const ds = [quan('A', { soDonHomNay: 12 }), quan('B', { soDonHomNay: 25 }), quan('C')];
    expect(noiDungNhipTim(vao({ quan: ds }))).toContain('Don hom nay: 37');
  });

  // Don da gui hom nay van la don da gui — tam dung khong xoa no di.
  it('don cua quan dang tam dung van duoc cong', () => {
    const ds = [quan('A', { state: 'dung', soDonHomNay: 5 }), quan('B', { soDonHomNay: 2 })];
    expect(noiDungNhipTim(vao({ quan: ds }))).toContain('Don hom nay: 7');
  });

  it('chua poll lan nao thi noi that la chua co, khong in ngay 1970', () => {
    const dong = noiDungNhipTim(vao({ pollGanNhat: null }));
    expect(dong).toContain('Poll gan nhat: chua co');
  });

  // Gio Viet Nam, khong phai UTC: 03:15Z la 10:15 gio quan.
  it('gio poll doi sang gio Viet Nam', () => {
    const dong = noiDungNhipTim(vao({ pollGanNhat: POLL })).join('\n');
    expect(dong).toMatch(/Poll gan nhat: 10:15/);
  });
});

describe('tomTatNhipTim', () => {
  it('lay dung dong dau de ghi nhat ky', () => {
    const d = vao({ quan: [quan('A'), quan('B')] });
    expect(tomTatNhipTim(d)).toBe(noiDungNhipTim(d)[0]);
  });

  it('khong quan nao thi van co chuoi, khong phai undefined', () => {
    expect(tomTatNhipTim(vao({ quan: [] }))).toContain('CHUA CHON QUAN');
  });
});
