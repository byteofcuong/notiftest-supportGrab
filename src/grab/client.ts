/**
 * Goi API Grab tu BEN TRONG trang merchant.grab.com.
 *
 * Xac thuc cua Grab la COOKIE (da xac minh — docs/grab-api-findings.md §2).
 * Nen thay vi boc cookie ra roi tu goi tu Node, minh chay `fetch` ngay trong
 * trang: trinh duyet tu gan cookie, tu dat Origin/Referer, tu lo CORS
 * preflight — dung y het khi chinh trang do goi. Khong gia mao gi ca.
 *
 * ═══ RANH GIOI CUNG ═══
 * File nay CHI phat sinh request GET. Khong POST, khong PUT, khong DELETE.
 * Dac biet KHONG BAO GIO goi POST /food/merchant/orders/mark — endpoint do
 * xoa dau "chua doc" cua nhan vien tren web, ho se tuong don da duoc xu ly.
 * Co mot test tu dong quet chinh file nay de ghim ranh gioi do.
 *
 * (Nguoi that bam nut trong cua so Grab thi trang tu POST — do la hanh vi cua
 * nguoi, khong phai cua code o day.)
 */

import type {
  GrabStoreSearchResponse,
  GrabOpenStatusResponse,
  GrabOrderDetailResponse,
  GrabOrderListResponse,
} from './types.js';

const API = 'https://api.grab.com';

/** Sau header tinh ma JS cua trang tu dat — da xac minh bang hook XMLHttpRequest. */
function staticHeaders(merchantID: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Accept-Language': 'vi',
    merchantID,
    requestSource: 'troyPortal',
    'x-client-id': 'GrabMerchant-Portal',
    'x-grabkit-clientid': 'grabmerchant-portal',
  };
}

/** Mat phien: nguoi dung phai dang nhap lai, khong thu lai duoc bang code. */
export class SessionExpiredError extends Error {
  /** `status` = 0 nghia la suy ra tu cho cua so dang dung, khong phai tu ma HTTP. */
  constructor(readonly status: number) {
    super(
      status === 0
        ? 'Phien Grab da het han (cua so da bi da ve trang dang nhap) - can dang nhap lai'
        : `Phien Grab da het han (HTTP ${status}) - can dang nhap lai`,
    );
    this.name = 'SessionExpiredError';
  }
}

/** Loi khac tu phia Grab. */
export class GrabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GrabApiError';
  }
}

/** Phan toi thieu cua WebContents ma client can — de test tiem ban gia. */
export interface ScriptRunner {
  executeJavaScript(code: string): Promise<unknown>;
}

export interface GrabClientOptions {
  /** Tra ve null khi cua so Grab chua san sang. */
  getRunner: () => ScriptRunner | null;
  /**
   * URL hien tai cua cua so Grab. CHI dung de phan loai mot loi DA XAY RA —
   * xem `laTrangDangNhap()`.
   */
  getUrl?: () => string | null;
  timeoutMs?: number;
}

interface RawResult {
  status: number;
  ok: boolean;
  body?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class GrabClient {
  private readonly timeoutMs: number;

  constructor(private readonly options: GrabClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Danh sach don tab "Dang chuan bi". Khong kem gia — phai goi them chi tiet. */
  async listPreparing(merchantID: string): Promise<GrabOrderListResponse> {
    const query = new URLSearchParams({
      AutoAcceptGroup: '1',
      merchantID,
      PageType: 'PreparingV2',
      searchToken: '',
      size: '50',
    });
    return this.get<GrabOrderListResponse>(
      `${API}/delvplatformapi/merchant/v4/orders-pagination?${query}`,
      merchantID,
    );
  }

  /** Chi tiet mot don: mon, topping, tien. */
  async orderDetail(merchantID: string, orderID: string): Promise<GrabOrderDetailResponse> {
    return this.get<GrabOrderDetailResponse>(
      `${API}/food/merchant/v3/orders/${encodeURIComponent(orderID)}`,
      merchantID,
    );
  }

  /**
   * Quan dang mo hay dong.
   *
   * Cung la cach DUY NHAT dang tin de biet phien con song: goi that, 401/403
   * nghia la mat phien. Doc URL cua trang khong dung duoc — Grab tai trang
   * xong roi moi chuyen huong sang trang dang nhap, nen co mot khoang thoi
   * gian URL van tro nhu binh thuong.
   */
  /**
   * Danh sach quan cua CA NHOM merchant, kem ten that.
   *
   * Endpoint cap nhom, khong phai cap quan — tim ra bang cach ghi lai loi goi
   * cua trang "Tat ca cac cua hang" (DEV_GHI_MANG). Mot loi goi lay het, nen
   * khong phai go tay ma quan nao, va ten hien thi la ten that cua quan chu
   * khong phai chuoi ma 16 ky tu.
   *
   * `limit=100` lay theo dung trang Grab. Tren 100 quan thi phai phan trang
   * bang `offset` — chua lam vi chua co ai toi nguong do.
   */
  async danhSachQuanTrongNhom(merchantID: string): Promise<GrabStoreSearchResponse> {
    const query = new URLSearchParams({
      offset: '0',
      limit: '100',
      search: '',
      includeItemsWithoutPhotosCount: 'false',
      includeInactive: 'true',
      cityIDs: 'ALL',
      asc: 'true',
    });
    return this.get<GrabStoreSearchResponse>(
      `${API}/delvplatformapi/merchant/v1/merchant-group/store/search?${query}`,
      merchantID,
    );
  }

  async openStatus(merchantID: string): Promise<GrabOpenStatusResponse> {
    return this.get<GrabOpenStatusResponse>(
      `${API}/food/merchant/v3/open-status`,
      merchantID,
    );
  }

  /** Con phien khong. Khong nem loi — tra ve true/false de hien thi. */
  async isSessionAlive(merchantID: string): Promise<boolean> {
    try {
      await this.openStatus(merchantID);
      return true;
    } catch {
      return false;
    }
  }

  // ── Ruot ───────────────────────────────────────────────────────────────────

  private async get<T>(url: string, merchantID: string): Promise<T> {
    const runner = this.options.getRunner();
    if (!runner) throw new GrabApiError('Cua so Grab chua san sang', 0);

    const raw = await this.run(runner, url, staticHeaders(merchantID));

    if (raw.status === 401 || raw.status === 403) {
      throw new SessionExpiredError(raw.status);
    }
    if (raw.status === 0) {
      // fetch that bai o tang mang, khong co ma HTTP nao de doc. Hai nguyen
      // nhan hoan toan khac nhau lai cho ra cung mot ket qua o day:
      //   - rot mang / Grab sap  -> cho la duoc, tu khoi
      //   - da bi da ve trang dang nhap -> phai co nguoi dang nhap lai
      // Phan biet duoc thi mot lan mat phien moi bao dung, thay vi im lang bao
      // "loi mang" trong khi ca buoi khong don nao ve.
      if (this.laTrangDangNhap()) throw new SessionExpiredError(0);
      throw new GrabApiError(`Khong goi duoc: ${raw.error ?? 'khong ro'}`, 0);
    }
    if (!raw.ok) {
      throw new GrabApiError(`Grab tra ve HTTP ${raw.status}`, raw.status);
    }

    try {
      return JSON.parse(raw.body ?? '') as T;
    } catch {
      throw new GrabApiError('Grab tra ve thu khong phai JSON', raw.status);
    }
  }

  /**
   * Cua so hien khong con o merchant.grab.com nua.
   *
   * KHONG dung URL de doan "da dang nhap chua" — do la cuoc dua thoi gian da
   * mac mot lan roi (xem grab-window.ts). O day khac han: chi hoi khi mot lan
   * goi API DA that bai, va cau hoi la "vi sao no that bai". Luc do URL la
   * bang chung chac chan, khong con la du doan.
   *
   * Trang dang nhap nam o weblogin.grab.com — khac origin, nen fetch sang
   * api.grab.com bi CORS chan va tra ve dung "Failed to fetch" y het luc rot
   * mang.
   */
  private laTrangDangNhap(): boolean {
    const url = this.options.getUrl?.();
    if (!url) return false;
    return !url.startsWith('https://merchant.grab.com');
  }

  private async run(
    runner: ScriptRunner,
    url: string,
    headers: Record<string, string>,
  ): Promise<RawResult> {
    // Nhung tri so di vao script deu qua JSON.stringify — khong noi chuoi bang tay.
    const script = `(async () => {
      try {
        const response = await fetch(${JSON.stringify(url)}, {
          method: 'GET',
          credentials: 'include',
          headers: ${JSON.stringify(headers)},
        });
        return { status: response.status, ok: response.ok, body: await response.text() };
      } catch (err) {
        return { status: 0, ok: false, error: String((err && err.message) || err) };
      }
    })()`;

    // executeJavaScript khong co timeout san. Thieu no thi mot fetch treo trong
    // trang se treo luon vong lap poll — dung bai hoc cua notiftest.
    return (await Promise.race([
      runner.executeJavaScript(script),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new GrabApiError(`Qua ${this.timeoutMs}ms khong thay tra loi`, 0)),
          this.timeoutMs,
        ),
      ),
    ])) as RawResult;
  }
}
