/**
 * Doc nhat ky DEV_GHI_MANG thanh mot bao cao tai.
 *
 * Task 8 hoi mot cau rat cu the: chay 14 quan thi cong cu ban bao nhieu request
 * moi giay, va co bi Grab chan khong. Dem bang mat tren mot file nhat ky vai
 * nghin dong thi vua lau vua sai, nen dem bang may.
 *
 * HAI CON SO, VA CON SO THU HAI MOI QUAN TRONG:
 *
 *   trung binh moi giay  — de doi chieu voi uoc luong ~3 req/s
 *   DINH moi giay        — so request don vao MOT giay xau nhat
 *
 * Phia server chan theo dinh chu khong theo trung binh. 14 quan rai deu thi
 * trung binh 3 req/s ma dinh cung chi 3; 14 quan don cuc thi trung binh van 3
 * nhung dinh la 14 — va chinh cai dinh do moi lanh 429. Do duoc ca hai la cach
 * duy nhat biet viec rai lech pha co that su an thua khong.
 *
 * Ham thuan, khong doc dia — CLI o scripts/do-tai.mjs lo phan doc file.
 */

export type LoaiLoiGoi =
  | 'danh-sach-don'
  | 'trang-thai-quan'
  | 'chi-tiet-don'
  | 'danh-sach-quan'
  | 'khac';

export interface LoiGoi {
  /** Moc thoi gian, ms. */
  luc: number;
  method: string;
  status: number;
  duong: string;
  /** Ma quan doc tu query string. null khi loi goi khong kem ma quan. */
  merchantID: string | null;
  loai: LoaiLoiGoi;
}

/** Dong do `ghiLaiLoiGoiMang()` ghi ra: `... INFO  MANG GET 200 https://...` */
const DONG_MANG = /^(\S+)\s+\w+\s+MANG\s+(\w+)\s+(\d+)\s+(\S+)/;

function xepLoai(duong: string): LoaiLoiGoi {
  if (duong.includes('orders-pagination')) return 'danh-sach-don';
  if (duong.includes('open-status')) return 'trang-thai-quan';
  if (duong.includes('merchant-group/store/search')) return 'danh-sach-quan';
  // Chi tiet don: /food/merchant/v3/orders/<id>. Doi hoi mot doan `/orders/`
  // rieng nen KHONG cham vao `/v4/orders-pagination` — thu tu hai dong nay
  // khong quan trong, va test da xac nhan bang cach doi thu tu ma ket qua
  // khong doi.
  if (/\/orders\/[^/]+$/.test(duong)) return 'chi-tiet-don';
  return 'khac';
}

/** Mot dong nhat ky -> mot loi goi. null khi dong do khong phai dong MANG. */
export function docDongMang(dong: string): LoiGoi | null {
  const m = DONG_MANG.exec(dong.trim());
  if (!m) return null;

  const luc = Date.parse(m[1]!);
  if (Number.isNaN(luc)) return null;

  let duong: string;
  let merchantID: string | null = null;
  try {
    const url = new URL(m[4]!);
    duong = url.pathname;
    merchantID = url.searchParams.get('merchantID');
  } catch {
    // URL la thi van dem duoc loi goi do — bo han mot dong la bao cao thieu.
    duong = m[4]!;
  }

  return {
    luc,
    method: m[2]!,
    status: Number(m[3]),
    duong,
    merchantID,
    loai: xepLoai(duong),
  };
}

export function docNhatKy(vanBan: string): LoiGoi[] {
  const ra: LoiGoi[] = [];
  for (const dong of vanBan.split('\n')) {
    const g = docDongMang(dong);
    if (g !== null) ra.push(g);
  }
  // Nhat ky ghi theo thu tu thoi gian, nhung xoay vong file co the lam lech.
  return ra.sort((a, b) => a.luc - b.luc);
}

export interface BaoCaoTai {
  soLoiGoi: number;
  /** Khoang do duoc, giay. 0 khi it hon hai loi goi. */
  khoangGiay: number;
  trungBinhMoiGiay: number;
  /** So loi goi don vao mot giay xau nhat, TINH CA loi goi cua trang Grab. */
  dinhMoiGiay: number;
  /** Moc bat dau cua giay xau nhat, de tim lai trong nhat ky. */
  dinhLuc: string | null;
  /**
   * Dinh chi tinh cac endpoint CUA CONG CU (bo cac loi goi cua trang Grab).
   *
   * Day moi la con so co the tac dong duoc. Trang Grab tu ban hang chuc request
   * luc tai lan dau — do lan vao thi dinh chung luon la con so cua luc khoi
   * dong, va no che mat dinh that cua nhip poll.
   */
  dinhCongCu: number;
  dinhCongCuLuc: string | null;
  /** So loi goi la cua cong cu (khong ke trang Grab tu goi). */
  soLoiGoiCongCu: number;
  theoLoai: { loai: LoaiLoiGoi; so: number }[];
  theoQuan: { merchantID: string; so: number }[];
  /** Cac ma trang thai KHONG phai 2xx, kem so lan. */
  maLoi: { status: number; so: number }[];
  batDau: string | null;
  ketThuc: string | null;
}

/**
 * So loi goi don vao mot giay xau nhat.
 *
 * Cua so truot chu khong chia o co dinh: 14 loi goi trai deu tu 0,9s den 1,1s
 * se roi vao hai o khac nhau va bao "dinh = 7", trong khi phia server nhin
 * thay dung 14 trong mot giay.
 */
function dinhTrongMotGiay(goi: LoiGoi[]): { dinh: number; luc: number | null } {
  let dinh = 0;
  let luc: number | null = null;
  let dau = 0;
  for (let cuoi = 0; cuoi < goi.length; cuoi++) {
    while (goi[cuoi]!.luc - goi[dau]!.luc >= 1000) dau++;
    const so = cuoi - dau + 1;
    if (so > dinh) {
      dinh = so;
      luc = goi[dau]!.luc;
    }
  }
  return { dinh, luc };
}

function dem<T extends string | number>(gt: T[]): { khoa: T; so: number }[] {
  const m = new Map<T, number>();
  for (const g of gt) m.set(g, (m.get(g) ?? 0) + 1);
  return [...m.entries()]
    .map(([khoa, so]) => ({ khoa, so }))
    .sort((a, b) => b.so - a.so || String(a.khoa).localeCompare(String(b.khoa)));
}

export function baoCaoTai(goi: LoiGoi[]): BaoCaoTai {
  if (goi.length === 0) {
    return {
      soLoiGoi: 0,
      khoangGiay: 0,
      trungBinhMoiGiay: 0,
      dinhMoiGiay: 0,
      dinhLuc: null,
      dinhCongCu: 0,
      dinhCongCuLuc: null,
      soLoiGoiCongCu: 0,
      theoLoai: [],
      theoQuan: [],
      maLoi: [],
      batDau: null,
      ketThuc: null,
    };
  }

  const dau = goi[0]!.luc;
  const cuoi = goi.at(-1)!.luc;
  const khoangGiay = (cuoi - dau) / 1000;
  const { dinh, luc } = dinhTrongMotGiay(goi);
  const cuaCongCu = goi.filter((g) => g.loai !== 'khac');
  const dinhCC = dinhTrongMotGiay(cuaCongCu);

  return {
    soLoiGoi: goi.length,
    khoangGiay,
    // Chia cho 0 khi moi loi goi cung mot moc: luc do trung binh khong co
    // nghia, va con so dung de doc la `dinhMoiGiay`.
    trungBinhMoiGiay: khoangGiay > 0 ? goi.length / khoangGiay : 0,
    dinhMoiGiay: dinh,
    dinhLuc: luc === null ? null : new Date(luc).toISOString(),
    dinhCongCu: dinhCC.dinh,
    dinhCongCuLuc: dinhCC.luc === null ? null : new Date(dinhCC.luc).toISOString(),
    soLoiGoiCongCu: cuaCongCu.length,
    theoLoai: dem(goi.map((g) => g.loai)).map(({ khoa, so }) => ({ loai: khoa, so })),
    theoQuan: dem(goi.map((g) => g.merchantID).filter((m): m is string => m !== null)).map(
      ({ khoa, so }) => ({ merchantID: khoa, so }),
    ),
    maLoi: dem(goi.filter((g) => g.status < 200 || g.status >= 300).map((g) => g.status)).map(
      ({ khoa, so }) => ({ status: khoa, so }),
    ),
    batDau: new Date(dau).toISOString(),
    ketThuc: new Date(cuoi).toISOString(),
  };
}

/** Bao cao thanh chu, de dan thang vao ghi chu nghiem thu. */
export function inBaoCao(bc: BaoCaoTai): string {
  if (bc.soLoiGoi === 0) {
    return 'Khong tim thay dong MANG nao. Da bat DEV_GHI_MANG=true chua?';
  }

  const d: string[] = [];
  d.push(`Khoang do:      ${bc.batDau} -> ${bc.ketThuc}  (${bc.khoangGiay.toFixed(0)}s)`);
  d.push(`Tong loi goi:   ${bc.soLoiGoi}  (cong cu: ${bc.soLoiGoiCongCu})`);
  d.push(`Trung binh:     ${bc.trungBinhMoiGiay.toFixed(2)} req/s  (ca trang Grab)`);
  d.push(`DINH ca trang:  ${bc.dinhMoiGiay} req  ${bc.dinhLuc ? `(luc ${bc.dinhLuc})` : ''}`);
  d.push(
    `DINH cong cu:   ${bc.dinhCongCu} req  ${bc.dinhCongCuLuc ? `(luc ${bc.dinhCongCuLuc})` : ''}` +
      '   <- con so quyet dinh co phai gian nhip poll khong',
  );
  d.push('');
  d.push('Theo loai:');
  for (const { loai, so } of bc.theoLoai) {
    d.push(`  ${loai.padEnd(16)} ${String(so).padStart(6)}`);
  }
  d.push('');
  d.push(`Theo quan (${bc.theoQuan.length} ma quan):`);
  for (const { merchantID, so } of bc.theoQuan) {
    d.push(`  ${merchantID.padEnd(20)} ${String(so).padStart(6)}`);
  }
  d.push('');
  if (bc.maLoi.length === 0) {
    d.push('Ma loi:         khong co ma nao ngoai 2xx');
  } else {
    d.push('Ma loi:');
    for (const { status, so } of bc.maLoi) {
      // 429 la cai Task 8 di tim; noi to len de khong ai luot qua.
      const to = status === 429 ? '   <<< BI CHAN, PHAI GIAN NHIP POLL' : '';
      d.push(`  ${status}  x${so}${to}`);
    }
  }
  return d.join('\n');
}
