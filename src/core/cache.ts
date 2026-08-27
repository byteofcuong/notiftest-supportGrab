/**
 * Chong gui trung, hai lop.
 *
 * Vi cong cu KHONG BAO GIO bam "Nhan don", don nam li trong tab "Dang chuan bi"
 * cho toi khi nhan vien xu ly. Nghia la moi luot poll deu nhin thay lai dung
 * nhung don do. **Cache la thu duy nhat chan gui trung** — y het notiftest
 * (ProcessedOrderCache.kt).
 *
 * LOP 1 — tap orderID da gui thanh cong, ghi ra dia, nap lai luc khoi dong.
 *   Chan gui trung khi poll lap va khi khoi dong lai binh thuong.
 *
 * LOP 2 — chi ap dung khi KHOI DONG LANH (mat / hong file cache):
 *   bo qua don co createdAt cu hon (luc khoi dong - lookbackMinutes).
 *   Va cham file cache thi cung chi gui lai don cua 15 phut gan nhat, thay vi
 *   ca tab. Vá dung lo hong con ton tai o notiftest.
 *
 * VI SAO LOP 2 CHI AP DUNG KHI KHOI DONG LANH:
 * Neu loc theo thoi gian ca khi cache con nguyen, thi don DAT TRUOC se bi nuot.
 * Don dat truoc nam o tab Upcoming rat lau roi moi nhay sang PreparingV2 — luc
 * do createdAt cua no da cu hang gio. Cache con nguyen thi lop 1 da du: don nao
 * khong co trong cache tuc la don that su moi, cu gui.
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CacheOptions {
  /** Thu muc chua file cache, thuong la data/cache. */
  dir: string;
  /** Tran so orderID giu lai. Cu nhat bi day ra. */
  maxEntries?: number;
  /** Cua so thoi gian cua lop 2, tinh bang phut. */
  lookbackMinutes?: number;
  /** Cho test thay dong ho. Mac dinh Date.now. */
  now?: () => number;
}

export type SkipReason = 'da-gui' | 'cu-hon-cua-so' | 'thieu-createdAt';

export type Decision =
  | { send: true }
  | { send: false; reason: SkipReason; detail?: string };

interface CacheFile {
  version: 1;
  storeId: string;
  /** Thu tu chen, cu nhat truoc. */
  orderIDs: string[];
  updatedAt: string;
}

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_LOOKBACK_MINUTES = 15;

export class OrderCache {
  private readonly ids: Set<string>;
  private readonly order: string[];
  private readonly file: string;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly windowFloorMs: number | null;

  /**
   * True khi khong nap duoc file cache (chua tung chay, hoac file hong).
   * Poller nen ghi log ro rang khi gap — day la luc duy nhat lop 2 hoat dong.
   */
  readonly coldStart: boolean;

  constructor(
    readonly storeId: string,
    options: CacheOptions,
  ) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
    this.file = join(options.dir, `${sanitise(storeId)}.json`);

    mkdirSync(options.dir, { recursive: true });

    const loaded = this.load();
    this.order = loaded ?? [];
    this.ids = new Set(this.order);
    this.coldStart = loaded === null;

    const lookback = options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
    // Moc san duoc chot MOT LAN luc khoi dong, khong troi theo thoi gian: neu
    // tinh lai moi luot poll thi mot don bi bo qua luc dau van co the lot vao
    // sau do, hoac nguoc lai — quyet dinh phai on dinh.
    this.windowFloorMs = this.coldStart ? this.now() - lookback * 60_000 : null;
  }

  /** Da gui thanh cong don nay chua. */
  has(orderID: string): boolean {
    return this.ids.has(orderID);
  }

  /**
   * Co nen xu ly don nay khong. Tra ve ly do khi bo qua, de poller ghi log —
   * mot don bi bo qua am tham la thu kho lan ra nhat khi co su co.
   */
  decide(orderID: string, createdAt: string | null | undefined): Decision {
    if (this.ids.has(orderID)) {
      return { send: false, reason: 'da-gui' };
    }
    if (this.windowFloorMs === null) {
      return { send: true };
    }
    if (!createdAt) {
      // Khoi dong lanh ma khong biet don tao luc nao thi khong the phan dinh.
      // Chon gui: gui trung con cuu duoc (ccmany dedup theo order_number),
      // mat don thi khong.
      return { send: true };
    }
    const ms = Date.parse(createdAt);
    if (Number.isNaN(ms)) return { send: true };

    if (ms < this.windowFloorMs) {
      return {
        send: false,
        reason: 'cu-hon-cua-so',
        detail: `createdAt ${createdAt} cu hon moc ${new Date(this.windowFloorMs).toISOString()}`,
      };
    }
    return { send: true };
  }

  /**
   * Ghi nhan don da gui THANH CONG. Goi ham nay TRUOC khi POST la sai nghiem
   * trong: POST hong thi don do vinh vien khong bao gio duoc gui lai.
   */
  markSent(orderID: string): void {
    if (this.ids.has(orderID)) return;

    this.ids.add(orderID);
    this.order.push(orderID);

    while (this.order.length > this.maxEntries) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.ids.delete(evicted);
    }

    this.persist();
  }

  /** So don dang giu. Chu yeu de test va hien thi. */
  get size(): number {
    return this.ids.size;
  }

  // ── Dia ────────────────────────────────────────────────────────────────────

  /** Tra ve null khi khong nap duoc — nghia la khoi dong lanh. */
  private load(): string[] | null {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return null; // chua tung chay
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CacheFile>;
      if (!Array.isArray(parsed.orderIDs)) return null;
      return parsed.orderIDs.filter((id): id is string => typeof id === 'string');
    } catch {
      // File hong (mat dien giua chung o ban cu chua ghi nguyen tu). Coi nhu
      // khoi dong lanh: lop 2 se chan gui lai ca tab.
      return null;
    }
  }

  /**
   * Ghi NGUYEN TU: ra file tam roi doi ten de. Ghi thang vao file that thi mot
   * lan mat dien dung luc do se de lai JSON cut doi — va cache hong dong nghia
   * voi gui trung ca tab o lan chay sau.
   */
  private persist(): void {
    const data: CacheFile = {
      version: 1,
      storeId: this.storeId,
      orderIDs: this.order,
      updatedAt: new Date(this.now()).toISOString(),
    };

    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    try {
      renameSync(tmp, this.file);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        /* khong con gi de lam */
      }
      throw err;
    }
  }
}

/** Ma quan di thang vao ten file nen phai chan ky tu duong dan. */
function sanitise(storeId: string): string {
  return storeId.replace(/[^A-Za-z0-9_-]/g, '_');
}
