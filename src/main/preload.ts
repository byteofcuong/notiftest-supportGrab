/**
 * Cau noi giua tien trinh chinh va giao dien.
 *
 * `contextIsolation` bat, `nodeIntegration` tat — giao dien khong duoc cham vao
 * Node. Chi nhung ham liet ke o day moi goi duoc, va deu la loi moi mot chieu
 * sang tien trinh chinh.
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface AppStatus {
  /** null khi chua chon quan — lan chay dau tien. */
  storeName: string | null;
  merchantID: string | null;
  /** Ma quan doc duoc tu URL tab Grab, de nguoi dung khoi go tay. */
  maQuanPhatHien: string | null;
  dryRun: boolean;
  dryRunReason: string | null;
  telegramEnabled: boolean;
  /** So canh bao dang cho gui bu vi luc phat sinh khong co mang. */
  telegramChoGui: number;
  grabUrl: string | null;
  /** Chi la "trang da tai", KHONG phai "da dang nhap" — xem grab-window.ts */
  pageLoaded: boolean;
  userAgent: string;
  /** Ban da cai (khong phai `npm run dev`). Chi ban nay moi go cai dat duoc. */
  daCaiDat: boolean;
  partitionPath: string;
  /** Duong dan file nhat ky, cho nut "Xem nhat ky". */
  logPath: string | null;
  lastProbe: ProbeResult | null;
  /**
   * N quan GOP lai thanh mot — trang thai xau nhat thang, so don cong don.
   * Xem `src/core/tong-hop.ts`. null khi chua chon quan nao.
   */
  poller: PollerStats | null;
  /** Tung quan mot, dung thu tu trong config/stores.json. Task 7 ve tung dong. */
  quan: TrangThaiQuan[];
  resilience: ResilienceStats | null;
  warnings: string[];
}

/** Mot dong trong bang nhieu quan. */
export interface TrangThaiQuan {
  merchantID: string;
  ccmanyStoreID: string;
  storeName: string;
  stats: PollerStats;
}

/** Ket qua lam viec cua cac lop bao ve (Task 10). */
export interface ResilienceStats {
  lanTaiLaiCuoi: string | null;
  lanCanThiepCuoi: string | null;
  soLanCanThiep: number;
  soLanMoLaiCuaSo: number;
}

export interface PollerStats {
  state: 'dung' | 'dang-chay' | 'mat-phien' | 'loi';
  lastPollAt: string | null;
  lastError: string | null;
  quanDangMo: boolean | null;
  soDonHomNay: number;
  donGanNhat: { orderCode: string; total: number | null; at: string } | null;
}

/** Mot dong trong bang chon quan. Moi quyet dinh da lam o main/chon-quan.ts. */
export interface DongChonQuan {
  merchantID: string;
  tenHienThi: string;
  city: string | null;
  daTick: boolean;
  /** Nhan phu hien canh ten (vd "da ngung hoat dong"). null khi binh thuong. */
  nhan: string | null;
}

export interface KetQuaDanhSachQuan {
  ok: boolean;
  quan: DongChonQuan[];
  thongBao: string | null;
  canDangNhap: boolean;
}

/** Ket qua goi thu API Grab — cach duy nhat dang tin de biet phien con song. */
export interface ProbeResult {
  at: string;
  ok: boolean;
  quanDangMo?: boolean;
  soDon?: number;
  matPhien?: boolean;
  error?: string;
}

contextBridge.exposeInMainWorld('api', {
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke('status:get'),
  showGrabWindow: (): Promise<void> => ipcRenderer.invoke('grab:show'),
  hideGrabWindow: (): Promise<void> => ipcRenderer.invoke('grab:hide'),
  reloadGrab: (): Promise<void> => ipcRenderer.invoke('grab:reload'),
  probeGrab: (): Promise<ProbeResult | null> => ipcRenderer.invoke('grab:probe'),
  togglePoller: (): Promise<void> => ipcRenderer.invoke('poller:toggle'),
  openLog: (): Promise<void> => ipcRenderer.invoke('log:open'),
  openConfig: (): Promise<void> => ipcRenderer.invoke('config:open'),
  /** Danh sach quan trong nhom, da ghep san voi lua chon hien tai. */
  listStores: (): Promise<KetQuaDanhSachQuan> => ipcRenderer.invoke('store:list'),
  /** Luu lua chon roi khoi dong lai. Truyen dung nhung dong da tick. */
  saveStores: (quan: DongChonQuan[]): Promise<{ ok: boolean; loi?: string }> =>
    ipcRenderer.invoke('store:save', quan),
  /** `ok:false` khong kem `loi` nghia la nguoi dung bam Huy — khong phai that bai. */
  goCaiDat: (): Promise<{ ok: boolean; loi?: string }> => ipcRenderer.invoke('app:go-cai-dat'),
});
