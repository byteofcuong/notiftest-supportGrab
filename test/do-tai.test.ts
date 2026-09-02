import { describe, expect, it } from 'vitest';
import {
  baoCaoTai,
  docDongMang,
  docNhatKy,
  inBaoCao,
  nhipDeGiuDinh,
  uocLuongTai,
} from '../src/core/do-tai.js';
import type { LoiGoi } from '../src/core/do-tai.js';

/**
 * Cong cu do tai cho Task 8.
 *
 * Con so o day quyet dinh mot viec that: co phai gian POLL_INTERVAL_MS ra hay
 * khong. Dem sai thi hoac gian nhip vo co (don ve cham hon ma khong duoc gi),
 * hoac de nguyen mot muc tai se an 429 vao dung gio cao diem.
 *
 * Nen nhom test nay soi ky hai cho: doc dong nhat ky co dung khong, va con so
 * DINH co dung khong — dinh moi la con so phia server nhin thay.
 */

const API = 'https://api.grab.com';

/** Mot dong nhat ky DEV_GHI_MANG that. */
function dong(luc: string, status: number, url: string, method = 'GET'): string {
  return `${luc} INFO  MANG ${method} ${status} ${url}`;
}

function goi(vao: Partial<LoiGoi> = {}): LoiGoi {
  return {
    luc: Date.parse('2026-09-02T10:00:00.000Z'),
    method: 'GET',
    status: 200,
    duong: '/delvplatformapi/merchant/v4/orders-pagination',
    merchantID: '5-A',
    loai: 'danh-sach-don',
    ...vao,
  };
}

describe('docDongMang', () => {
  it('doc duoc mot dong MANG day du', () => {
    const g = docDongMang(
      dong(
        '2026-09-02T10:00:01.500Z',
        200,
        `${API}/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-AAA&offset=0`,
      ),
    );
    expect(g).not.toBeNull();
    expect(g!.luc).toBe(Date.parse('2026-09-02T10:00:01.500Z'));
    expect(g!.status).toBe(200);
    expect(g!.method).toBe('GET');
    expect(g!.merchantID).toBe('5-AAA');
    expect(g!.loai).toBe('danh-sach-don');
  });

  it('bo qua dong khong phai MANG', () => {
    expect(docDongMang('2026-09-02T10:00:00.000Z INFO  === Khoi dong ===')).toBeNull();
    expect(docDongMang('')).toBeNull();
    expect(docDongMang('rac')).toBeNull();
    expect(docDongMang('2026-09-02T10:00:00.000Z DEBUG [5-A] nhip poll OK - 0 don')).toBeNull();
  });

  it('moc thoi gian hong thi bo dong do, khong nem', () => {
    expect(docDongMang(dong('khong-phai-ngay', 200, `${API}/x`))).toBeNull();
  });

  /**
   * URL la (thieu scheme, cat giua chung do nhat ky xoay vong) van phai dem
   * duoc — bo han mot dong la bao cao thieu, va thieu thi khong ai biet.
   */
  it('URL la van dem duoc, chi la khong ro ma quan', () => {
    const g = docDongMang(dong('2026-09-02T10:00:00.000Z', 200, 'khong-phai-url'));
    expect(g).not.toBeNull();
    expect(g!.merchantID).toBeNull();
    expect(g!.loai).toBe('khac');
  });

  it('khong co merchantID trong query thi la null', () => {
    const g = docDongMang(dong('2026-09-02T10:00:00.000Z', 200, `${API}/food/merchant/v3/open-status`));
    expect(g!.merchantID).toBeNull();
  });

  it('doc dung method khac GET', () => {
    const g = docDongMang(dong('2026-09-02T10:00:00.000Z', 204, `${API}/x`, 'POST'));
    expect(g!.method).toBe('POST');
  });

  describe('xep loai duong dan', () => {
    const bang: [string, string][] = [
      ['/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-A', 'danh-sach-don'],
      ['/food/merchant/v3/open-status?merchantID=5-A', 'trang-thai-quan'],
      ['/food/merchant/v3/orders/001299501957-C8D3AN2VE66CNX', 'chi-tiet-don'],
      ['/delvplatformapi/merchant/v1/merchant-group/store/search?offset=0', 'danh-sach-quan'],
      ['/api/passenger/v3/profile', 'khac'],
    ];
    for (const [duong, mongDoi] of bang) {
      it(`${duong} -> ${mongDoi}`, () => {
        const g = docDongMang(dong('2026-09-02T10:00:00.000Z', 200, `${API}${duong}`));
        expect(g!.loai).toBe(mongDoi);
      });
    }

    /**
     * `orders-pagination` la endpoint ton request nhat, nen doc nham no thanh
     * chi-tiet-don se lam bao cao noi doi ve dung cai can nhin nhat.
     *
     * GIOI HAN DA BIET: hien tai hai mau khong the cham nhau (`/orders/<id>`
     * doi mot doan `/orders/` rieng), nen test nay chi ghim KET QUA chu chua
     * chan duoc moi cach lam hong. Doi mau chi-tiet-don thanh
     * `duong.includes('orders')` van qua duoc — da thu bang dot bien. Chan
     * duoc cach do can mot mau URL that ma chua ai thay, nen khong bia ra.
     */
    it('orders-pagination khong bi doc nham thanh chi tiet don', () => {
      const g = docDongMang(
        dong('2026-09-02T10:00:00.000Z', 200, `${API}/delvplatformapi/merchant/v4/orders-pagination`),
      );
      expect(g!.loai).toBe('danh-sach-don');
    });
  });
});

describe('docNhatKy', () => {
  it('doc ca file, bo qua moi dong khac', () => {
    const vanBan = [
      '2026-09-02T10:00:00.000Z INFO  === Khoi dong ===',
      dong('2026-09-02T10:00:01.000Z', 200, `${API}/food/merchant/v3/open-status?merchantID=5-A`),
      '2026-09-02T10:00:01.100Z DEBUG [5-A] nhip poll OK - 0 don trong tab',
      dong('2026-09-02T10:00:02.000Z', 200, `${API}/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-A`),
      '',
    ].join('\n');
    expect(docNhatKy(vanBan)).toHaveLength(2);
  });

  it('file rong thi ra mang rong', () => {
    expect(docNhatKy('')).toEqual([]);
    expect(docNhatKy('\n\n\n')).toEqual([]);
  });

  // Nhat ky xoay vong co the ghep hai doan lech thu tu; sap lai truoc khi tinh
  // cua so truot, khong thi cua so truot cho ket qua vo nghia.
  it('sap lai theo thoi gian du nhat ky lech thu tu', () => {
    const vanBan = [
      dong('2026-09-02T10:00:05.000Z', 200, `${API}/a`),
      dong('2026-09-02T10:00:01.000Z', 200, `${API}/b`),
      dong('2026-09-02T10:00:03.000Z', 200, `${API}/c`),
    ].join('\n');
    const g = docNhatKy(vanBan);
    expect(g.map((x) => x.duong)).toEqual(['/b', '/c', '/a']);
  });
});

describe('baoCaoTai — con so', () => {
  it('khong co loi goi nao thi moi con so la 0, khong phai NaN', () => {
    const bc = baoCaoTai([]);
    expect(bc.soLoiGoi).toBe(0);
    expect(bc.trungBinhMoiGiay).toBe(0);
    expect(bc.dinhMoiGiay).toBe(0);
    expect(bc.batDau).toBeNull();
    expect(Number.isNaN(bc.trungBinhMoiGiay)).toBe(false);
  });

  /**
   * Mot loi goi duy nhat: khoang do bang 0, va chia cho 0 se ra Infinity. Bao
   * cao co Infinity trong do la bao cao khong doc duoc.
   */
  it('mot loi goi duy nhat khong lam trung binh thanh Infinity', () => {
    const bc = baoCaoTai([goi()]);
    expect(bc.soLoiGoi).toBe(1);
    expect(bc.trungBinhMoiGiay).toBe(0);
    expect(Number.isFinite(bc.trungBinhMoiGiay)).toBe(true);
    expect(bc.dinhMoiGiay).toBe(1);
  });

  it('tinh dung trung binh moi giay', () => {
    const T = Date.parse('2026-09-02T10:00:00.000Z');
    // 11 loi goi trai deu tren 10 giay = 1,1 req/s.
    const ds = Array.from({ length: 11 }, (_, i) => goi({ luc: T + i * 1000 }));
    expect(baoCaoTai(ds).khoangGiay).toBe(10);
    expect(baoCaoTai(ds).trungBinhMoiGiay).toBeCloseTo(1.1, 5);
  });

  it('bat dau va ket thuc la moc dau va moc cuoi', () => {
    const T = Date.parse('2026-09-02T10:00:00.000Z');
    const bc = baoCaoTai([goi({ luc: T }), goi({ luc: T + 5000 })]);
    expect(bc.batDau).toBe('2026-09-02T10:00:00.000Z');
    expect(bc.ketThuc).toBe('2026-09-02T10:00:05.000Z');
  });
});

/**
 * DINH la con so phia server nhin thay, va la con so quyet dinh co bi 429 hay
 * khong. Trung binh 3 req/s trai deu khac han 3 req/s don cuc.
 */
describe('baoCaoTai — dinh mot giay', () => {
  const T = Date.parse('2026-09-02T10:00:00.000Z');

  it('14 quan don cuc vao mot khoanh khac thi dinh la 14', () => {
    const ds = Array.from({ length: 14 }, (_, i) => goi({ luc: T + i }));
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(14);
  });

  // Chinh la thu Task 4 sinh ra de tranh: rai deu thi dinh tut xuong con 1.
  it('14 quan rai deu trong 5 giay thi dinh chi con 3', () => {
    const ds = Array.from({ length: 14 }, (_, i) => goi({ luc: T + Math.round((i * 5000) / 14) }));
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(3);
  });

  /**
   * Cua so TRUOT chu khong phai o co dinh. 14 loi goi trai tu 0,9s den 1,1s roi
   * vao hai o khac nhau va se bao "dinh = 7", trong khi phia server nhin thay
   * dung 14 trong mot giay.
   */
  it('dung cua so truot, khong chia o co dinh', () => {
    const ds = [
      ...Array.from({ length: 7 }, (_, i) => goi({ luc: T + 900 + i })),
      ...Array.from({ length: 7 }, (_, i) => goi({ luc: T + 1100 + i })),
    ];
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(14);
  });

  it('dung 1000ms thi da ra ngoai cua so', () => {
    const ds = [goi({ luc: T }), goi({ luc: T + 1000 })];
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(1);
  });

  it('999ms thi van trong cua so', () => {
    const ds = [goi({ luc: T }), goi({ luc: T + 999 })];
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(2);
  });

  it('bao ca moc cua giay xau nhat de tim lai trong nhat ky', () => {
    const ds = [
      goi({ luc: T }),
      ...Array.from({ length: 5 }, (_, i) => goi({ luc: T + 60_000 + i })),
    ];
    const bc = baoCaoTai(ds);
    expect(bc.dinhMoiGiay).toBe(5);
    expect(bc.dinhLuc).toBe('2026-09-02T10:01:00.000Z');
  });

  it('moi loi goi cung mot moc thi dinh bang tong', () => {
    const ds = Array.from({ length: 8 }, () => goi({ luc: T }));
    expect(baoCaoTai(ds).dinhMoiGiay).toBe(8);
  });
});

describe('baoCaoTai — phan nhom', () => {
  const T = Date.parse('2026-09-02T10:00:00.000Z');

  it('dem theo loai, xep nhieu nhat truoc', () => {
    const ds = [
      ...Array.from({ length: 5 }, (_, i) => goi({ luc: T + i, loai: 'danh-sach-don' })),
      ...Array.from({ length: 2 }, (_, i) => goi({ luc: T + i, loai: 'trang-thai-quan' })),
      goi({ luc: T, loai: 'chi-tiet-don' }),
    ];
    expect(baoCaoTai(ds).theoLoai).toEqual([
      { loai: 'danh-sach-don', so: 5 },
      { loai: 'trang-thai-quan', so: 2 },
      { loai: 'chi-tiet-don', so: 1 },
    ]);
  });

  it('dem theo ma quan, bo qua loi goi khong kem ma quan', () => {
    const ds = [
      goi({ luc: T, merchantID: '5-A' }),
      goi({ luc: T + 1, merchantID: '5-A' }),
      goi({ luc: T + 2, merchantID: '5-B' }),
      goi({ luc: T + 3, merchantID: null }),
    ];
    expect(baoCaoTai(ds).theoQuan).toEqual([
      { merchantID: '5-A', so: 2 },
      { merchantID: '5-B', so: 1 },
    ]);
  });

  /**
   * Mot quan im lang giua 14 quan la dau hieu quan do khong duoc poll — dung
   * cai hong am tham ma Task 8 di tim. Bao cao phai liet ke DU ma quan de doi
   * chieu voi so quan da chon.
   */
  it('liet ke du 14 ma quan khi ca 14 deu co loi goi', () => {
    const ds = Array.from({ length: 14 }, (_, i) => goi({ luc: T + i, merchantID: `5-Q${i}` }));
    expect(baoCaoTai(ds).theoQuan).toHaveLength(14);
  });
});

describe('baoCaoTai — ma loi', () => {
  const T = Date.parse('2026-09-02T10:00:00.000Z');

  it('toan 2xx thi khong co ma loi nao', () => {
    const ds = [goi({ luc: T, status: 200 }), goi({ luc: T + 1, status: 204 })];
    expect(baoCaoTai(ds).maLoi).toEqual([]);
  });

  it('dem 429 va cac ma khac 2xx', () => {
    const ds = [
      goi({ luc: T, status: 200 }),
      goi({ luc: T + 1, status: 429 }),
      goi({ luc: T + 2, status: 429 }),
      goi({ luc: T + 3, status: 400 }),
      goi({ luc: T + 4, status: 401 }),
      goi({ luc: T + 5, status: 500 }),
    ];
    expect(baoCaoTai(ds).maLoi).toEqual([
      { status: 429, so: 2 },
      { status: 400, so: 1 },
      { status: 401, so: 1 },
      { status: 500, so: 1 },
    ]);
  });

  // 3xx khong phai loi ung dung nhung cung khong phai 2xx — dem rieng de biet.
  it('3xx cung duoc dem, khong bi coi la thanh cong', () => {
    expect(baoCaoTai([goi({ luc: T, status: 302 })]).maLoi).toEqual([{ status: 302, so: 1 }]);
  });
});

describe('inBaoCao', () => {
  const T = Date.parse('2026-09-02T10:00:00.000Z');

  it('khong co dong MANG nao thi nhac bat DEV_GHI_MANG', () => {
    expect(inBaoCao(baoCaoTai([]))).toContain('DEV_GHI_MANG');
  });

  it('in du cac con so chinh', () => {
    const ds = Array.from({ length: 10 }, (_, i) => goi({ luc: T + i * 500 }));
    const chu = inBaoCao(baoCaoTai(ds));
    expect(chu).toContain('Tong loi goi:');
    expect(chu).toContain('req/s');
    expect(chu).toContain('DINH ca trang:');
    expect(chu).toContain('DINH cong cu:');
    expect(chu).toContain('Theo quan');
  });

  /**
   * 429 la thu Task 8 di tim. Neu no chi nam lan trong mot bang so thi rat de
   * bi luot qua — phai co chu de nguoi doc dung lai.
   */
  it('co 429 thi noi to len', () => {
    const chu = inBaoCao(baoCaoTai([goi({ luc: T, status: 429 })]));
    expect(chu).toContain('BI CHAN');
  });

  it('khong co loi thi noi ro la khong co', () => {
    const chu = inBaoCao(baoCaoTai([goi({ luc: T })]));
    expect(chu).toContain('khong co ma nao ngoai 2xx');
    expect(chu).not.toContain('BI CHAN');
  });
});

/**
 * Doc thang tu mot doan nhat ky that (chep dinh dang tu ghiLaiLoiGoiMang) —
 * chot chan rang regex khop voi dinh dang ma app THUC SU ghi ra, chu khong chi
 * khop voi mot dinh dang tu nghi ra trong test.
 */
describe('doc mot doan nhat ky that', () => {
  const NHAT_KY = [
    '2026-09-02T04:33:00.100Z WARN  DEV_GHI_MANG: dang ghi lai moi loi goi API cua trang Grab',
    '2026-09-02T04:33:00.653Z INFO  MANG GET 200 https://api.grab.com/food/merchant/v3/open-status?merchantID=5-C8DWNYEUGKWZUA',
    '2026-09-02T04:33:00.812Z INFO  MANG GET 200 https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-C8DWNYEUGKWZUA&offset=0',
    '2026-09-02T04:33:02.151Z INFO  MANG GET 200 https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-C8C1L8JJHBUZHA&offset=0',
    '2026-09-02T04:33:03.816Z INFO  MANG GET 429 https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?merchantID=5-C8DZE3A1CETZLX&offset=0',
    '2026-09-02T04:33:04.010Z DEBUG [5-C8DWNYEUGKWZUA] nhip poll OK - 0 don trong tab',
  ].join('\n');

  it('doc dung so loi goi, ma quan, loai va ma loi', () => {
    const bc = baoCaoTai(docNhatKy(NHAT_KY));
    expect(bc.soLoiGoi).toBe(4);
    expect(bc.theoQuan).toHaveLength(3);
    expect(bc.theoLoai).toEqual([
      { loai: 'danh-sach-don', so: 3 },
      { loai: 'trang-thai-quan', so: 1 },
    ]);
    expect(bc.maLoi).toEqual([{ status: 429, so: 1 }]);
    expect(inBaoCao(bc)).toContain('BI CHAN');
  });
});

/**
 * Tach tai CUA CONG CU khoi tai cua trang Grab.
 *
 * Do duoc ngay 02/09: trang Grab ban ~40 request trong hai giay dau khi tai lan
 * dau, va tu poll them cho quan no dang hien. Gop chung vao thi dinh chung luon
 * la con so cua trang, va no che mat dinh that cua nhip poll — tuc la che mat
 * dung con so quyet dinh co phai gian POLL_INTERVAL_MS hay khong.
 */
describe('baoCaoTai - tach tai cong cu', () => {
  const T = Date.parse('2026-09-02T10:00:00.000Z');

  it('dem rieng so loi goi cua cong cu', () => {
    const ds = [
      goi({ luc: T, loai: 'danh-sach-don' }),
      goi({ luc: T + 1, loai: 'trang-thai-quan' }),
      goi({ luc: T + 2, loai: 'khac' }),
      goi({ luc: T + 3, loai: 'khac' }),
    ];
    const bc = baoCaoTai(ds);
    expect(bc.soLoiGoi).toBe(4);
    expect(bc.soLoiGoiCongCu).toBe(2);
  });

  it('dinh cua trang Grab khong keo dinh cua cong cu len', () => {
    const ds = [
      ...Array.from({ length: 40 }, (_, i) => goi({ luc: T + i, loai: 'khac' })),
      goi({ luc: T + 10_000, loai: 'danh-sach-don' }),
      goi({ luc: T + 10_100, loai: 'danh-sach-don' }),
    ];
    const bc = baoCaoTai(ds);
    expect(bc.dinhMoiGiay).toBe(40);
    expect(bc.dinhCongCu).toBe(2);
  });

  it('moc dinh cua cong cu tro dung vao luc cong cu don, khong phai luc tai trang', () => {
    const ds = [
      ...Array.from({ length: 20 }, (_, i) => goi({ luc: T + i, loai: 'khac' })),
      ...Array.from({ length: 3 }, (_, i) => goi({ luc: T + 30_000 + i, loai: 'danh-sach-don' })),
    ];
    const bc = baoCaoTai(ds);
    expect(bc.dinhLuc).toBe('2026-09-02T10:00:00.000Z');
    expect(bc.dinhCongCuLuc).toBe('2026-09-02T10:00:30.000Z');
  });

  it('khong co loi goi nao cua cong cu thi dinh cong cu la 0', () => {
    const ds = Array.from({ length: 5 }, (_, i) => goi({ luc: T + i, loai: 'khac' }));
    const bc = baoCaoTai(ds);
    expect(bc.soLoiGoiCongCu).toBe(0);
    expect(bc.dinhCongCu).toBe(0);
    expect(bc.dinhCongCuLuc).toBeNull();
  });

  /**
   * Preflight CORS: moi loi goi API keo theo mot OPTIONS. Do duoc 105 GET / 91
   * OPTIONS ngay 02/09. Bao cao phai dem CA HAI — dem moi GET la bao cao chi
   * bang mot nua tai that, va do la kieu sai dan toi ket luan "con thua cho".
   */
  it('dem ca OPTIONS lan GET, khong bo preflight', () => {
    const ds = [
      goi({ luc: T, method: 'OPTIONS' }),
      goi({ luc: T + 50, method: 'GET' }),
    ];
    expect(baoCaoTai(ds).soLoiGoi).toBe(2);
    expect(baoCaoTai(ds).soLoiGoiCongCu).toBe(2);
  });

  it('bao cao rong van co du truong moi, khong undefined', () => {
    const bc = baoCaoTai([]);
    expect(bc.soLoiGoiCongCu).toBe(0);
    expect(bc.dinhCongCu).toBe(0);
    expect(bc.dinhCongCuLuc).toBeNull();
  });
});

/**
 * Uoc luong tai TRUOC khi chay.
 *
 * Cau hoi that dang sau nhom nay: "30 quan thi co chay noi khong". Tra loi sai
 * theo huong lac quan thi tin xau den duoi dang 429 giua gio cao diem, luc
 * khong ai ngoi canh may.
 */
describe('uocLuongTai', () => {
  it('khong co quan nao thi tai bang 0', () => {
    const t = uocLuongTai(0, 5000);
    expect(t.trungBinh).toBe(0);
    expect(t.dinh).toBe(0);
  });

  it('cau hinh la (nhip 0, so quan am) khong lam ra NaN', () => {
    for (const [n, nhip] of [[-1, 5000], [5, 0], [0, 0], [-3, -3]] as const) {
      const t = uocLuongTai(n, nhip);
      expect(Number.isFinite(t.trungBinh), `${n}/${nhip}`).toBe(true);
      expect(Number.isFinite(t.dinh)).toBe(true);
      expect(t.dinh).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * HE SO 2 LA CORS PREFLIGHT. Do duoc that ngay 02/09: 105 GET di kem 91
   * OPTIONS. Bo he so nay la moi uoc luong chi bang mot nua tai that.
   */
  it('mot quan nhip 5s: 0,2 loi goi/s -> 0,4 req/s vi preflight', () => {
    const t = uocLuongTai(1, 5000);
    // 1/5 (danh sach) + 1/60 (trang thai quan) = 0,2167 loi goi/s, nhan 2.
    expect(t.trungBinh).toBeCloseTo(0.433, 2);
  });

  it('14 quan nhip 5s ra khoang 6 req/s trung binh', () => {
    const t = uocLuongTai(14, 5000);
    expect(t.trungBinh).toBeCloseTo(6.07, 1);
  });

  /**
   * Cau tra loi cho "30 quan thi sao": tang gap doi so quan la tang gap doi CA
   * trung binh LAN dinh, du nhip poll khong doi.
   */
  it('30 quan ton gap doi 14 quan, ca trung binh lan dinh', () => {
    const muoiBon = uocLuongTai(14, 5000);
    const baMuoi = uocLuongTai(30, 5000);
    expect(baMuoi.trungBinh / muoiBon.trungBinh).toBeCloseTo(30 / 14, 1);
    expect(baMuoi.dinh).toBeGreaterThan(muoiBon.dinh);
  });

  it('14 quan rai deu thi khoang 3 quan ban trong mot giay', () => {
    expect(uocLuongTai(14, 5000).quanTrongMotGiay).toBe(3);
  });

  it('30 quan rai deu thi khoang 6 quan ban trong mot giay', () => {
    expect(uocLuongTai(30, 5000).quanTrongMotGiay).toBe(7);
  });

  // Gian nhip ra thi dinh tut xuong — do la can gat duy nhat co that.
  it('gian nhip poll lam dinh giam', () => {
    const nhanh = uocLuongTai(30, 5000);
    const cham = uocLuongTai(30, 15_000);
    expect(cham.dinh).toBeLessThan(nhanh.dinh);
    expect(cham.trungBinh).toBeLessThan(nhanh.trungBinh);
  });

  /**
   * Nhip rat cham: moi giay chi mot quan ban. San duoi la 4 req/s, khong phai 2
   * — mot nhip DAY DU la hai loi goi API (danh sach + trang thai quan), va moi
   * loi goi keo theo mot preflight CORS.
   */
  it('nhip rat cham thi dinh cham san o 4 req/s, khong xuong 0', () => {
    const t = uocLuongTai(2, 600_000);
    expect(t.quanTrongMotGiay).toBe(1);
    expect(t.dinh).toBe(4);
  });

  // Nhieu quan hon so mili giay trong mot nhip: tat ca ban trong cung mot giay.
  it('so quan rat lon thi dinh cham tran o so quan', () => {
    const t = uocLuongTai(50, 1000);
    expect(t.quanTrongMotGiay).toBe(50);
    expect(t.dinh).toBe(200);
  });

  /**
   * DOI CHIEU VOI SO DO THAT (02/09/2026, 3 quan, nhip 5s): do duoc dinh 9
   * req/s. Uoc luong phai o cung bac do — thap hon nhieu la mo hinh sai va se
   * cho ket luan "con thua cho" dung luc sap het.
   *
   * Uoc luong CO Y thap hon so do mot it: no khong tinh phan trang Grab tu goi
   * cho quan dang hien (4-5 lan moi phut, loi goi giong het nen khong tach
   * duoc). Chenh nhieu hon the thi mo hinh co van de.
   */
  it('khop bac voi so do that ngay 02/09: 3 quan nhip 5s', () => {
    const t = uocLuongTai(3, 5000);
    expect(t.dinh).toBeGreaterThanOrEqual(4);
    expect(t.dinh).toBeLessThanOrEqual(9);
  });
});

describe('nhipDeGiuDinh', () => {
  it('goi y nhip cham hon khi nhieu quan', () => {
    expect(nhipDeGiuDinh(30, 10)).toBeGreaterThan(nhipDeGiuDinh(14, 10));
  });

  /**
   * Goi y phai THUC SU dat duoc muc mong muon. Goi y mot con so roi dat vao van
   * vuot nguong thi con te hon khong goi y — nguoi dung tuong da xu ly xong.
   */
  it('dat nhip theo goi y thi dinh khong con vuot nguong', () => {
    for (const soQuan of [5, 14, 30, 50]) {
      for (const nguong of [4, 6, 10, 20]) {
        const nhip = nhipDeGiuDinh(soQuan, nguong);
        const t = uocLuongTai(soQuan, nhip);
        expect(t.dinh, `${soQuan} quan, nguong ${nguong}, nhip ${nhip}`).toBeLessThanOrEqual(nguong);
      }
    }
  });

  it('cau hinh la thi tra 0 chu khong nem', () => {
    expect(nhipDeGiuDinh(0, 10)).toBe(0);
    expect(nhipDeGiuDinh(30, 0)).toBe(0);
    expect(nhipDeGiuDinh(-1, -1)).toBe(0);
  });

  /**
   * Nguong thap hon 2 req/s la khong dat duoc bang cach gian nhip: mot loi goi
   * da ton dung 2 request (chinh no + preflight). Phai tra 0 chu khong duoc
   * quay vong lap mai de tim mot con so khong ton tai.
   */
  it('nguong thap hon mot loi goi thi bao khong dat duoc, khong treo', () => {
    expect(nhipDeGiuDinh(30, 1)).toBe(0);
    expect(nhipDeGiuDinh(1, 1)).toBe(0);
  });

  // Chinh la cho test bat duoc off-by-one: chia dung bang roi lam tron 500 se
  // roi dung vao bien va van vuot mot bac.
  it('truong hop bien 5 quan / nguong 4 phai that su dat', () => {
    const nhip = nhipDeGiuDinh(5, 4);
    expect(uocLuongTai(5, nhip).dinh).toBeLessThanOrEqual(4);
  });

  it('lam tron len boi cua 500ms cho de doc', () => {
    for (const soQuan of [7, 14, 30]) {
      expect(nhipDeGiuDinh(soQuan, 6) % 500).toBe(0);
    }
  });
});
