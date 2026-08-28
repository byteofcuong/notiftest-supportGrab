import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { chonThuMucGhiDuoc, loadConfig, loadEnvFile, loadStores } from '../core/config.js';
import { Logger } from '../core/log.js';
import { GrabWindow } from './grab-window.js';
import { AppTray } from './tray.js';
import { Resilience } from './resilience.js';
import { chayKichBanPhaHoai } from './chaos.js';
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
 * Ba manh ghep: cua so Grab (giu phien), poller (vong lap lay don), va cac lop
 * bao ve o resilience.ts (canh cua so, tai lai trang, nhip tim, don rac).
 */

// ELECTRON_RUN_AS_NODE bien electron.exe thanh mot trinh chay Node thuan: khong
// co `app`, khong co cua so, va `require('electron')` tra ve mot chuoi duong dan
// thay vi module. VS Code va vai cong cu khac dat bien nay cho tien trinh con,
// va no da lam mat thoi gian hai lan trong du an nay.
//
// GIOI HAN: rao nay chi cuu duoc truong hop co nguoi goi thang
// `electron.exe out/main/main.js`. Voi BAN DONG GOI thi no vo dung — bien do
// lam file thuc thi hanh xu nhu `node` chay rong, tuc la KHONG nap app cua
// minh, nen khong dong ma nao o day duoc chay. Luc do trieu chung la mot tien
// trinh vut tat, khong nhat ky, khong thong bao. Khong sua duoc tu ben trong.
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.error(
    [
      'Khong chay duoc: bien moi truong ELECTRON_RUN_AS_NODE dang duoc dat.',
      'No bien Electron thanh Node thuan nen app khong the mo cua so.',
      'Bo bien do di roi chay lai.',
      'PowerShell:  Remove-Item Env:\\ELECTRON_RUN_AS_NODE',
    ].join('\n'),
  );
  process.exit(1);
}

// Goc du an. Khi da dong goi thanh .exe thi __dirname nam trong asar, nen lay
// thu muc chua file thuc thi de .env va config/ van sua duoc sau khi cai.
const ROOT = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '../..');

loadEnvFile(path.join(ROOT, '.env'));

/**
 * App duoc Windows tu chay luc dang nhap, chu khong phai nguoi dung tu bam.
 *
 * Tham so nay do chinh app dat vao khi bat `openAtLogin` — xem
 * capNhatTuChayCungWindows().
 */
const TU_CHAY = process.argv.includes('--tu-chay');

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
let tray: AppTray | null = null;
let resilience: Resilience | null = null;
/**
 * Nguoi dung bam "Tam dung" thi phai dung — khong duoc de lan kiem tra ket noi
 * ke tiep tu bat lai. Day la lan duy nhat trong app ma y muon cua nguoi thang
 * moi co che tu phuc hoi.
 */
let nguoiDungDaTamDung = false;

/** Chan vong lap khi before-quit chay lai sau khi da ghi phien xong. */
let dangThoat = false;
/** Nguoi dung da chon Thoat that su, khong phai chi dong cua so. */
let choPhepThoat = false;
/** Bieu tuong khay da tao duoc. Xem cho tao no de biet vi sao can co bien nay. */
let coKhay = false;

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
    // Phien vua duoc xac nhan la song thi ghi xuong dia ngay, de mot lan
    // tat may dot ngot khong lam mat no.
    void grabWindow?.luuPhien();

    // Phien vua song lai (nguoi dung vua dang nhap) thi bat poller luon,
    // khong bat nguoi dung phai bam them nut nao nua.
    if (poller && poller.stats.state === 'dung' && !nguoiDungDaTamDung) {
      poller.start();
      logger.info('Da bat poller sau khi kiem tra ket noi thanh cong');
    }
  } catch (err) {
    const matPhien = err instanceof SessionExpiredError;
    lastProbe = { at, ok: false, matPhien, error: (err as Error).message };
    if (matPhien) logger.warn('MAT PHIEN - can dang nhap lai');
    else logger.error('Kiem tra Grab that bai', err);
  }
  capNhatKhay();
}

function batTatTheoDoi(): void {
  if (!poller) return;
  if (poller.stats.state === 'dung') {
    nguoiDungDaTamDung = false;
    poller.start();
    logger.info('Nguoi dung bat lai theo doi');
  } else {
    nguoiDungDaTamDung = true;
    poller.stop();
    logger.info('Nguoi dung tam dung theo doi');
  }
  capNhatKhay();
}

function capNhatKhay(): void {
  tray?.capNhat(poller?.stats.state ?? null, lastProbe?.matPhien === true);
}

function moBangDieuKhien(): void {
  if (!controlWindow || controlWindow.isDestroyed()) {
    createControlWindow();
    return;
  }
  controlWindow.show();
  controlWindow.focus();
}

function xemNhatKy(): void {
  const file = logger?.filePath;
  if (!file) return;
  // openPath mo bang chuong trinh mac dinh cua .log (thuong la Notepad).
  void shell.openPath(file);
}

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 720,
    height: 520,
    title: 'Theo doi don Grab',
    // Tu chay cung Windows thi vao thang khay, khong dap cua so vao mat nguoi
    // ta moi lan bat may — lam the som muon cung co nguoi tat han app di.
    show: !TU_CHAY,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Tinh tu __dirname chu KHONG tu ROOT: khi da dong goi, `src/` khong con nam
  // canh file thuc thi nua. `out/renderer/` thi co ca o ban dev lan ban dong goi
  // (scripts/copy-renderer.mjs chep sang do).
  controlWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Dong bang dieu khien = thu xuong khay, KHONG phai thoat. Dong nham mot cai
  // ma tat ca ngay theo doi don thi khong ai biet cho toi khi khach phan nan.
  controlWindow.on('close', (event) => {
    if (choPhepThoat || !coKhay) return;
    event.preventDefault();
    controlWindow?.hide();
  });
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
      telegramChoGui: telegram?.soTinChoGui ?? 0,
      grabUrl: grabWindow?.currentUrl() ?? null,
      pageLoaded: grabWindow?.pageLoaded() ?? false,
      userAgent: app.userAgentFallback,
      partitionPath: GrabWindow.partitionPath(),
      logPath: logger.filePath,
      lastProbe,
      poller: poller?.stats ?? null,
      resilience: resilience?.stats ?? null,
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
  ipcMain.handle('poller:toggle', () => {
    batTatTheoDoi();
  });
  ipcMain.handle('log:open', () => {
    xemNhatKy();
  });
}

app.whenReady().then(async () => {
  config = loadConfig(process.env, ROOT);

  // PHAI lam truoc khi tao Logger — chinh Logger la thu dau tien can ghi dia.
  const noiLuu = chonThuMucGhiDuoc(config.dataDir, path.join(app.getPath('userData'), 'data'));
  if (noiLuu.canhBao) config.warnings.push(noiLuu.canhBao);
  config.dataDir = noiLuu.dir;

  logger = new Logger({ level: config.logLevel, dir: path.join(config.dataDir, 'logs') });

  logger.info('=== Khoi dong ===', { root: ROOT, dataDir: config.dataDir });
  if (config.dryRun) logger.warn(`CHE DO CHAY KHO - ${config.dryRunReason}`);
  for (const warning of config.warnings) logger.warn(warning);

  capNhatTuChayCungWindows();

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

  // Bieu tuong khay la loi thoat DUY NHAT sau khi dong bang dieu khien. Tao
  // that bai ma van chan khong cho thoat thi nguoi dung bi ket: cua so an di,
  // khong co gi goi no ra lai. Nen: khay hong -> tro ve nep cu (dong het cua so
  // la thoat).
  tray = new AppTray({
    moBangDieuKhien,
    moTrangGrab: () => void grabWindow?.show(),
    xemNhatKy,
    batTatTheoDoi,
    thoat: () => {
      choPhepThoat = true;
      app.quit();
    },
  });
  try {
    tray.start();
    coKhay = true;
  } catch (err) {
    logger.error('Khong tao duoc bieu tuong khay - dong cua so se thoat app', err);
    tray = null;
  }

  const store = stores[0];
  if (store) {
    grabWindow = new GrabWindow({
      merchantID: store.grabMerchantID,
      logger,
      onHidden: moBangDieuKhien,
    });
    // Mo san (van an) de phien duoc khoi phuc va trang bat dau song.
    await grabWindow.open();
    logger.info('Cua so Grab da san sang', {
      url: grabWindow.currentUrl(),
      trangDaTai: grabWindow.pageLoaded(),
    });

    grabClient = new GrabClient({
      getRunner: () => grabWindow?.runner() ?? null,
      getUrl: () => grabWindow?.currentUrl() ?? null,
    });

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

    // Ghi phien xuong dia dinh ky: Grab xoay cookie trong luc chay, neu chi ghi
    // luc khoi dong va luc thoat thi mot lan giet cung o giua van mat phien.
    setInterval(() => void grabWindow?.luuPhien(), 5 * 60_000);

    resilience = new Resilience({
      config,
      store,
      logger,
      grabWindow,
      poller,
      telegram,
      probe: probeGrab,
      trangThaiPhien: () => {
        if (!lastProbe) return 'chua-ro';
        if (lastProbe.matPhien) return 'mat';
        return lastProbe.ok ? 'song' : 'chua-ro';
      },
    });
    resilience.start();

    // Chi khi DEV_CHAOS=true. Xem chaos.ts.
    if (config.devChaos) chayKichBanPhaHoai({ grabWindow, logger });

    // LUON bat poller, ke ca khi lan kiem tra dau tien that bai.
    //
    // Truoc day co gate "chi bat khi probe OK", va no de lai mot lo hong im
    // lang: mot lan 401 luc khoi dong la app ngoi khong mai mai, khong co gi
    // thu lai. Da dam phai trong lua chay thu Task 10 — lan chay dau bao mat
    // phien, lan chay sau (cung cookie do) lai vao binh thuong, tuc la cai 401
    // do chi la nhat thoi.
    //
    // Ban than poller da xu ly mat phien dung cach roi: gian nhip ra 30s, bao
    // Telegram DUNG MOT LAN, va tu chay lai ngay khi co phien tro lai. De no
    // chay la duong tu phuc hoi ngan nhat.
    poller.start();
    if (lastProbe?.ok) {
      void telegram.sendAlert(
        `Da khoi dong theo doi ${store.storeName}${config.dryRun ? ' (CHAY KHO)' : ''}`,
      );
    } else {
      logger.warn('Khoi dong khi chua co phien Grab - poller van chay va se tu vao khi dang nhap xong');
    }
    capNhatKhay();
    // Den o khay phai theo kip trang thai ngay ca khi khong ai mo giao dien.
    setInterval(capNhatKhay, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

/**
 * Tu chay cung Windows.
 *
 * Chi lam khi da dong goi. O che do phat trien, duong dan thuc thi la
 * node_modules/electron/dist/electron.exe — dang ky no vao Run cua Windows thi
 * moi lan bat may se hien mot cua so Electron trang tron, va nguoi dung khong
 * hieu no o dau ra de ma tat.
 */
function capNhatTuChayCungWindows(): void {
  if (!app.isPackaged) {
    logger.debug('Bo qua tu-chay-cung-Windows (dang o che do phat trien)');
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: config.autoStart,
      // PHAI dat `name`. Khong dat thi Electron lay ten nhung trong file thuc
      // thi de dat ten khoa registry — ma ban portable giu nguyen xi
      // electron.exe nen ten do van la "Electron", ra khoa
      // `electron.app.Electron`. Bat ky app Electron portable nao khac cung se
      // ghi de len dung khoa do, va ta mat tu chay ma khong hay biet.
      // (Da thay that: Notion dang o `electron.app.Notion` ngay canh.)
      name: 'Theo doi don Grab',
      // Danh dau de lan chay do biet la may tu bat, ma vao thang khay.
      args: ['--tu-chay'],
    });
    logger.info('Tu chay cung Windows', { bat: config.autoStart });
  } catch (err) {
    logger.warn('Khong dat duoc tu-chay-cung-Windows', err);
  }
}

app.on('before-quit', (event) => {
  choPhepThoat = true;
  resilience?.stop();
  poller?.stop();
  if (grabWindow && !dangThoat) {
    // Hoan thoat mot nhip de kip ghi cookie xuong dia — thoat ngay thi
    // phan chua ghi se mat va lan sau phai dang nhap lai.
    event.preventDefault();
    dangThoat = true;
    void grabWindow.luuPhien().finally(() => {
      grabWindow?.allowClose();
      app.quit();
    });
    return;
  }
  grabWindow?.allowClose();
});

app.on('quit', () => {
  tray?.destroy();
});

// CO Y KHONG thoat khi dong het cua so: app song tiep o khay he thong. Chi muc
// "Thoat" trong menu khay moi that su ket thuc. Khong co khay thi khong con loi
// vao nao, nen quay ve nep thong thuong.
app.on('window-all-closed', () => {
  if (!coKhay) app.quit();
});

process.on('unhandledRejection', (reason) => {
  logger?.error('unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  logger?.error('uncaughtException', err);
});
