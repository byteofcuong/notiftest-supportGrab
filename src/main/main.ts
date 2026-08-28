import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { loadConfig, loadEnvFile, loadStores } from '../core/config.js';
import { Logger } from '../core/log.js';
import { GrabWindow } from './grab-window.js';
import { GrabClient, SessionExpiredError } from '../grab/client.js';
import { OrderCache } from '../core/cache.js';
import { CcmanyUploader } from '../core/uploader.js';
import { TelegramNotifier } from '../core/telegram.js';
import { StorePoller } from '../core/poller.js';
import type { AppConfig } from '../core/config.js';
import type { StoreConfig } from '../core/types.js';

/**
 * Diem vao cua app.
 *
 * Hien tai (Task 6): mo cua so dieu khien, dung cua so Grab an de giu phien,
 * va cho phep dang nhap bang tay. Poller gan vao o Task 8.
 */

// Goc du an. Khi da dong goi thanh .exe thi __dirname nam trong asar, nen lay
// thu muc chua file thuc thi de .env va config/ van sua duoc sau khi cai.
const ROOT = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '../..');

loadEnvFile(path.join(ROOT, '.env'));

// PHAI dat TRUOC khi app san sang. Khong dat thi Electron dung ten mac dinh
// "Electron", va phien Grab se nam o AppData/Roaming/Electron/ — dung chung
// voi moi app Electron khac chay o che do phat trien, va se DOI CHO khi dong
// goi thanh .exe, tuc la mat phien dang nhap sau khi cai dat.
app.setName('grab-order-watcher');

let config: AppConfig;
let stores: StoreConfig[];
let logger: Logger;
let controlWindow: BrowserWindow | null = null;
let grabWindow: GrabWindow | null = null;
let grabClient: GrabClient | null = null;
let poller: StorePoller | null = null;
let telegram: TelegramNotifier | null = null;

/** Ket qua lan kiem tra ket noi gan nhat, de hien len giao dien. */
let lastProbe: {
  at: string;
  ok: boolean;
  quanDangMo?: boolean;
  soDon?: number;
  matPhien?: boolean;
  error?: string;
} | null = null;

async function probeGrab(): Promise<void> {
  const store = stores[0];
  if (!store || !grabClient) return;

  const at = new Date().toISOString();
  try {
    const [status, list] = await Promise.all([
      grabClient.openStatus(store.grabMerchantID),
      grabClient.listPreparing(store.grabMerchantID),
    ]);
    lastProbe = {
      at,
      ok: true,
      quanDangMo: status.isOpen === true,
      soDon: list.orders?.length ?? 0,
    };
    logger.info('Kiem tra Grab OK', lastProbe);

    // Phien vua song lai (nguoi dung vua dang nhap) thi bat poller luon,
    // khong bat nguoi dung phai bam them nut nao nua.
    if (poller && poller.stats.state === 'dung') {
      poller.start();
      logger.info('Da bat poller sau khi kiem tra ket noi thanh cong');
    }
  } catch (err) {
    const matPhien = err instanceof SessionExpiredError;
    lastProbe = { at, ok: false, matPhien, error: (err as Error).message };
    if (matPhien) logger.warn('MAT PHIEN - can dang nhap lai');
    else logger.error('Kiem tra Grab that bai', err);
  }
}

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 720,
    height: 480,
    title: 'Theo doi don Grab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWindow.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  controlWindow.on('closed', () => {
    controlWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('status:get', () => {
    const store = stores[0]!;
    return {
      storeName: store.storeName,
      merchantID: store.grabMerchantID,
      dryRun: config.dryRun,
      dryRunReason: config.dryRunReason,
      telegramEnabled: config.telegram !== null,
      grabUrl: grabWindow?.currentUrl() ?? null,
      pageLoaded: grabWindow?.pageLoaded() ?? false,
      userAgent: app.userAgentFallback,
      partitionPath: GrabWindow.partitionPath(),
      lastProbe,
      poller: poller?.stats ?? null,
      warnings: config.warnings,
    };
  });

  ipcMain.handle('grab:show', async () => {
    await grabWindow?.show();
  });
  ipcMain.handle('grab:hide', () => {
    grabWindow?.hide();
  });
  ipcMain.handle('grab:reload', async () => {
    await grabWindow?.reload();
  });
  ipcMain.handle('grab:probe', async () => {
    await probeGrab();
    return lastProbe;
  });
  ipcMain.handle('poller:start', () => {
    poller?.start();
  });
  ipcMain.handle('poller:stop', () => {
    poller?.stop();
  });
}

app.whenReady().then(async () => {
  config = loadConfig(process.env, ROOT);
  logger = new Logger({ level: config.logLevel, dir: path.join(config.dataDir, 'logs') });

  logger.info('=== Khoi dong ===', { root: ROOT, dataDir: config.dataDir });
  if (config.dryRun) logger.warn(`CHE DO CHAY KHO - ${config.dryRunReason}`);
  for (const warning of config.warnings) logger.warn(warning);

  try {
    stores = loadStores(ROOT);
  } catch (err) {
    logger.error('Khong doc duoc config/stores.json', err);
    // Khong co quan thi khong co gi de lam. Van mo cua so de nguoi dung thay
    // loi, thay vi thoat im lang.
    stores = [];
  }
  logger.info(`Doc duoc ${stores.length} quan`, stores.map((s) => s.grabMerchantID));

  GrabWindow.applyUserAgent(logger);
  logger.info('Thu muc phien Grab', GrabWindow.partitionPath());

  registerIpc();
  createControlWindow();

  const store = stores[0];
  if (store) {
    grabWindow = new GrabWindow({ merchantID: store.grabMerchantID, logger });
    // Mo san (van an) de phien duoc khoi phuc va trang bat dau song.
    await grabWindow.open();
    logger.info('Cua so Grab da san sang', {
      url: grabWindow.currentUrl(),
      trangDaTai: grabWindow.pageLoaded(),
    });

    grabClient = new GrabClient({ getRunner: () => grabWindow?.runner() ?? null });

    telegram = new TelegramNotifier({ config: config.telegram });
    poller = new StorePoller({
      store,
      config,
      client: grabClient,
      cache: new OrderCache(store.ccmanyStoreID, {
        dir: path.join(config.dataDir, 'cache'),
        lookbackMinutes: config.orderLookbackMinutes,
      }),
      uploader: new CcmanyUploader({
        url: config.ccmany.url,
        apiKey: config.ccmany.apiKey,
        dryRun: config.dryRun,
        dataDir: config.dataDir,
      }),
      telegram,
      logger,
    });

    // Kiem tra ngay luc khoi dong: day la cach DUY NHAT dang tin de biet phien
    // con song hay khong (doc URL khong dung - xem grab-window.ts).
    await probeGrab();

    if (lastProbe?.ok) {
      poller.start();
      void telegram.sendAlert(
        `Da khoi dong theo doi ${store.storeName}${config.dryRun ? ' (CHAY KHO)' : ''}`,
      );
    } else {
      // Chua co phien thi poll cung vo ich. Cho nguoi dung dang nhap roi bam
      // "Kiem tra ket noi" — luc do poller tu bat.
      logger.warn('Chua co phien Grab - chua bat poller. Dang nhap roi bam Kiem tra ket noi.');
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('before-quit', () => {
  poller?.stop();
  grabWindow?.allowClose();
});

app.on('window-all-closed', () => {
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  logger?.error('unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  logger?.error('uncaughtException', err);
});
