/**
 * Kieu du lieu cho response cua API Grab Merchant.
 *
 * CHI khai bao nhung truong thuc su dung. Response that lon hon nhieu (chi tiet
 * don ~7-10 KB); chep ca vao day chi lam nhieu mat va tao cam giac an toan gia.
 * Tat ca deu de long (optional / nullable) vi day la du lieu cua nguoi khac —
 * mapper la noi kiem tra va nem loi neu thieu, khong phai he thong kieu.
 *
 * Doi chieu mau that: test/fixtures/*.json
 * Tai lieu day du: docs/grab-api-findings.md §4
 */

// ── Danh sach don: GET /delvplatformapi/merchant/v4/orders-pagination ────────

export interface GrabOrderTimes {
  createdAt?: string | null; // ISO UTC, vd "2026-08-28T04:24:32Z"
  acceptedAt?: string | null; // null khi chua ai bam nhan don
  cancelledAt?: string | null;
  expiredAt?: string | null;
  readyAt?: string | null;
  /**
   * KHONG PHAI "don da hoan tat". O ca hai don mau, truong nay duoc set chi 8-9
   * giay sau createdAt trong khi don van dang state=ALLOCATING. Dung dung no de
   * suy ra trang thai.
   */
  completedAt?: string | null;
}

export interface GrabOrderSummary {
  orderID?: string;
  displayID?: string;
  times?: GrabOrderTimes;
  state?: string; // vd "ALLOCATING"
  preparationTaskpoolStatus?: string; // vd "NEW"
  orderValue?: string; // vd "121.000"
}

export interface GrabOrderListResponse {
  orders?: GrabOrderSummary[] | null;
  orderStats?: {
    numberInNew?: number;
    unreadNumberInNew?: number;
  };
  /** Grab tu goi y nhip poll: 300 khi ranh, 60 khi co don dang chay. */
  pollInterval?: number;
  serverTime?: string;
}

// ── Chi tiet don: GET /food/merchant/v3/orders/{orderID} ─────────────────────

export interface GrabModifier {
  modifierName?: string;
  /** Gia cua rieng tuy chon nay. DA duoc cong vao item.fare.priceDisplay. */
  priceDisplay?: string;
  quantity?: number;
}

export interface GrabModifierGroup {
  modifierGroupName?: string;
  modifiers?: GrabModifier[] | null;
}

export interface GrabItemFare {
  /** Tong dong, DA nhan so luong VA da cong topping. Day la con so can dung. */
  priceDisplay?: string;
  /**
   * Gia mon goc CHUA cong topping (vd 19.000 cho mon hien 26.000).
   * KHONG phai "gia truoc khi giam gia" — dung map vao original_price.
   */
  originalItemPriceDisplay?: string;
  /** DON GIA da gom topping. Khong phai gia dong. Khong dung. */
  priceFloat?: number;
}

export interface GrabOrderItem {
  name?: string;
  quantity?: number;
  fare?: GrabItemFare;
  /** Ghi chu khach de rieng cho mon nay. */
  comment?: string | null;
  modifierGroups?: GrabModifierGroup[] | null;
  /** Chua gap mau nao khac null — chua biet cau truc. */
  discountInfo?: unknown | null;
}

export interface GrabEater {
  name?: string | null;
  mobileNumber?: string | null;
  /** Ghi chu cho ca don, vd "Gap mat o sanh". */
  comment?: string | null;
  address?: unknown | null;
}

/**
 * CHUA CO MAU THAT: ca hai don trong fixture deu co `driver: null` (chua gan
 * tai xe). Ban ghi trong danh sach dung {ID, name, avatar} — khong co so dien
 * thoai. Nen mapper phai doc phong thu ca `phone` lan `mobileNumber`, va lan
 * dau gap driver khac null thi PHAI luu JSON tho de bo sung fixture.
 */
export interface GrabDriver {
  name?: string | null;
  phone?: string | null;
  mobileNumber?: string | null;
}

export interface GrabFare {
  subTotalDisplay?: string;
  /** Dong "Tong cong" tren giao dien — con so dung lam `total`. */
  totalDisplay?: string;
  taxDisplay?: string;
  /** Khuyen mai cho KHACH, Grab bu. KHONG tru vao tien quan → khong map. */
  promotionDisplay?: string;
  deliveryFeeDisplay?: string;
  passengerTotalDisplay?: string;
  /** "0" o ca hai don mau; chiet khau san co le quyet toan o tang sao ke. */
  mexCommissionDisplay?: string;
  currencySymbol?: string;
}

export interface GrabOrder {
  orderID?: string;
  displayID?: string;
  bookingCode?: string;
  eater?: GrabEater | null;
  driver?: GrabDriver | null;
  itemInfo?: {
    count?: number;
    items?: GrabOrderItem[] | null;
  };
  fare?: GrabFare;
  times?: GrabOrderTimes;
  merchant?: { ID?: string };
  /** So bo dung cu an uong khach yeu cau. */
  cutlery?: number;
  paymentMethod?: string;
  state?: string;
  preparationTaskpoolStatus?: string;
  isOrderEdited?: boolean;
  flags?: {
    isManualAcceptMode?: boolean;
  };
}

export interface GrabOrderDetailResponse {
  order?: GrabOrder;
}

// ── Trang thai quan: GET /food/merchant/v3/open-status ───────────────────────

export interface GrabOpenStatusResponse {
  isOpen?: boolean;
  isMexInBusyMode?: boolean;
  statusDisplayInfo?: {
    statusContent?: string;
  };
}

// ── Danh sach quan trong nhom ────────────────────────────────────────────────
// GET /delvplatformapi/merchant/v1/merchant-group/store/search

/**
 * Mot quan trong nhom. Do duoc bang DEV_GHI_MANG tren tai khoan that (14 quan);
 * hinh dang ghi lai o docs/spec-van-hanh.md §7.1b.
 *
 * Response that con nhieu truong hon (modelType, menuDisplayOption, timezone,
 * deliverOption...). Giu dung nep da lam voi don hang: chi khai nhung truong
 * THUC SU dung, de khong tao cam giac an toan gia ve nhung truong chua ai doc.
 */
export interface GrabGroupStore {
  /** Ma quan, chinh la thu dua vao header/query merchantID. Vd "5-C8DEEF3TEXVVA2". */
  merchantID?: string;
  /** Ten that cua quan, co dau tieng Viet. Day la ly do goi endpoint nay. */
  merchantName?: string;
  city?: string;
  address?: string;
  /**
   * CHUA BIET HET TAP GIA TRI. Chi do duoc mot lan tren mot tai khoan, nen
   * `quanCoTheChon()` doc no theo kieu HONG THI CHO QUA (xem src/grab/quan.ts),
   * chu khong dam liet ke du.
   */
  status?: string;
}

export interface GrabStoreSearchResponse {
  merchantGroupID?: string;
  merchants?: GrabGroupStore[] | null;
}
