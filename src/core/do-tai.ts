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

// ── Uoc luong truoc khi chay ─────────────────────────────────────────────────

/**
 * MOI LOI GOI API TON HAI REQUEST.
 *
 * Do duoc ngay 02/09/2026: 105 GET di kem 91 OPTIONS. Fetch chay tu
 * merchant.grab.com sang api.grab.com voi header rieng, nen trinh duyet bat
 * buoc phai hoi truoc bang mot CORS preflight.
 *
 * Moi uoc luong tinh tu "so nhip poll" deu phai nhan doi. Quen he so nay la
 * bao cao chi bang mot nua tai that — va do la kieu sai dan toi ket luan
 * "con thua cho" dung luc sap khong con.
 */
export const REQUEST_MOI_LOI_GOI = 2;

/** Chi hoi trang thai mo/dong nhieu nhat mot lan moi phut moi quan. */
const NHIP_OPEN_STATUS_GIAY = 60;

/**
 * Mot nhip poll co the ton toi HAI loi goi API, khong phai mot.
 *
 * Nhip thuong chi goi `orders-pagination`. Nhung moi phut mot lan, TTL cua
 * `open-status` het han va nhip do goi ca hai. Dinh la con so cua giay xau
 * nhat, nen phai tinh theo nhip day du.
 *
 * Bo ve 1 thi uoc luong noi doi han mot nua — da doi chieu voi so do that
 * ngay 02/09 va thay dung cho nay lech.
 */
const LOI_GOI_MOI_NHIP_TOI_DA = 2;

export interface UocLuongTai {
  soQuan: number;
  nhipMs: number;
  /** Request/giay trung binh, da nhan he so preflight. */
  trungBinh: number;
  /** Request/giay o giay dong nhat, da nhan he so preflight. */
  dinh: number;
  /** So quan cung ban trong giay dong nhat. */
  quanTrongMotGiay: number;
}

/**
 * Uoc luong tai truoc khi chay, tu so quan va nhip poll.
 *
 * DINH moi la con so dang nhin. Rai lech pha lam cac quan cach nhau
 * `nhipMs / soQuan`; trong mot giay bat ky chi nhung quan roi vao cua so do moi
 * ban. Voi 14 quan nhip 5s thi la ~3 quan/giay, nhung voi 30 quan cung nhip do
 * la ~7 quan/giay — tuc la tang so quan len gap doi thi dinh cung gap doi, du
 * nhip poll khong doi.
 *
 * KHONG TINH phan trang Grab tu goi. Trang dang mo cung ban `orders-pagination`
 * cho quan no hien thi, 4-5 lan moi phut, va loi goi do GIONG HET loi goi cua
 * cong cu nen khong tach duoc ca o day lan trong bao cao. Nghia la so do that
 * se cao hon uoc luong nay mot it, va phan chenh do bam vao MOT quan chu khong
 * tang theo so quan.
 */
export function uocLuongTai(soQuan: number, nhipMs: number): UocLuongTai {
  if (soQuan <= 0 || nhipMs <= 0) {
    return { soQuan: Math.max(soQuan, 0), nhipMs, trungBinh: 0, dinh: 0, quanTrongMotGiay: 0 };
  }

  const nhipGiay = nhipMs / 1000;
  const loiGoiMoiGiay = soQuan / nhipGiay + soQuan / NHIP_OPEN_STATUS_GIAY;

  // Khoang cach giua hai quan lien tiep sau khi rai lech pha.
  const cachNhauMs = nhipMs / soQuan;
  const quanTrongMotGiay = Math.min(soQuan, Math.floor(1000 / cachNhauMs) + 1);

  return {
    soQuan,
    nhipMs,
    trungBinh: loiGoiMoiGiay * REQUEST_MOI_LOI_GOI,
    // Giay xau nhat: moi quan trong cua so do dang chay mot nhip DAY DU
    // (danh sach + trang thai quan), va moi loi goi keo theo mot preflight.
    dinh: quanTrongMotGiay * LOI_GOI_MOI_NHIP_TOI_DA * REQUEST_MOI_LOI_GOI,
    quanTrongMotGiay,
  };
}

/**
 * Nhip poll can dat de giu dinh khong vuot qua `dinhMongMuon` request/giay.
 *
 * Tra ve ms, lam tron len 500ms cho de doc. Dung de goi y trong nhat ky khi so
 * quan tang — de nguoi dung co mot con so cu the thay vi phai tu mo tinh.
 */
export function nhipDeGiuDinh(soQuan: number, dinhMongMuon: number): number {
  if (soQuan <= 0 || dinhMongMuon <= 0) return 0;
  // Mot quan o giay xau nhat da ton LOI_GOI_MOI_NHIP_TOI_DA * REQUEST_MOI_LOI_GOI
  // request, nen nguong thap hon the la khong the dat bang cach gian nhip.
  // Tra 0 = "khong co nhip nao cuu duoc".
  if (dinhMongMuon < LOI_GOI_MOI_NHIP_TOI_DA * REQUEST_MOI_LOI_GOI) return 0;

  const moiQuan = LOI_GOI_MOI_NHIP_TOI_DA * REQUEST_MOI_LOI_GOI;
  const quanChoPhep = Math.max(1, Math.floor(dinhMongMuon / moiQuan));
  // quanTrongMotGiay = floor(1000 * soQuan / nhipMs) + 1, va ta muon no <= k.
  // Suy ra nhipMs phai LON HON 1000 * soQuan / k — bat dang thuc NGHIEM NGAT.
  // Chia dung bang thi roi vao bien va van vuot mot bac; test bat duoc dung cho
  // nay (5 quan, nguong 4 -> goi y 2500ms ma dinh van la 6).
  let nhip = Math.ceil((soQuan * 1000) / quanChoPhep / 500) * 500;
  // Day them tung nac 500ms cho toi khi that su dat. Chan tren 10 phut: qua do
  // thi gian nhip khong con la giai phap, va vong lap khong duoc phep chay mai.
  while (nhip < 600_000 && uocLuongTai(soQuan, nhip).dinh > dinhMongMuon) nhip += 500;
  return nhip;
}
