/**
 * Cau noi giua tien trinh chinh va giao dien.
 *
 * `contextIsolation` bat, `nodeIntegration` tat — giao dien khong duoc cham vao
 * Node. Chi nhung ham liet ke o day moi goi duoc, va deu la loi moi mot chieu
 * sang tien trinh chinh.
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface AppStatus {
  storeName: string;
  merchantID: string;
  dryRun: boolean;
  dryRunReason: string | null;
  telegramEnabled: boolean;
  grabUrl: string | null;
  /** Chi la "trang da tai", KHONG phai "da dang nhap" — xem grab-window.ts */
  pageLoaded: boolean;
  userAgent: string;
  partitionPath: string;
  lastProbe: ProbeResult | null;
  poller: PollerStats | null;
  warnings: string[];
}

export interface PollerStats {
  state: 'dung' | 'dang-chay' | 'mat-phien' | 'loi';
  lastPollAt: string | null;
  lastError: string | null;
  quanDangMo: boolean | null;
  soDonHomNay: number;
  donGanNhat: { orderCode: string; total: number | null; at: string } | null;
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
  startPoller: (): Promise<void> => ipcRenderer.invoke('poller:start'),
  stopPoller: (): Promise<void> => ipcRenderer.invoke('poller:stop'),
});
