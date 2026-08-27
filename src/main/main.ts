import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { loadConfig, loadEnvFile, loadStores } from '../core/config.js';
import { Logger } from '../core/log.js';
import { GrabWindow } from './grab-window.js';
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
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('before-quit', () => {
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
