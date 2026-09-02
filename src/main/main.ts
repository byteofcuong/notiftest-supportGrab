import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chonThuMucGhiDuoc,
  chuanBiCauHinh,
  loadConfig,
  loadEnvFile,
  loadStores,
  luuDanhSachQuan,
} from '../core/config.js';
import { Logger } from '../core/log.js';
import { GrabWindow } from './grab-window.js';
import { AppTray } from './tray.js';
import { dangKyGoCaiDat } from './registry.js';
import { Resilience } from './resilience.js';
import { chayKichBanPhaHoai } from './chaos.js';
import { chayVaGhiKetLuan } from './thu-cheo.js';
import {
  chuaCoMaQuan,
  ketQuaDanhSach,
  ketQuaLoi,
  maQuanDeGoiApi,
} from './chon-quan.js';
import { GrabClient, SessionExpiredError } from '../grab/client.js';
import { OrderCache } from '../core/cache.js';
import { CcmanyUploader } from '../core/uploader.js';
import { TelegramNotifier } from '../core/telegram.js';
import { StorePoller } from '../core/poller.js';
import { dongBangDieuKhien, gopTrangThai, nhanKhay, treKhoiDauMs } from '../core/tong-hop.js';
import type { AppConfig } from '../core/config.js';
import type { StoreConfig } from '../core/types.js';
import type { TrangThaiQuan } from '../core/tong-hop.js';
import type { KetQuaDanhSachQuan } from './chon-quan.js';
import type { QuanDaChon } from '../core/config.js';

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

// PHAI dat DONG DAU TIEN, truoc moi loi goi app.getPath(). Khong dat thi
// Electron dung ten mac dinh "Electron", va ca phien Grab lan cau hinh se nam o
// AppData/Roaming/Electron/ — dung chung voi moi app Electron khac chay o che do
// phat trien, va se DOI CHO khi dong goi thanh .exe, tuc la mat het sau khi cai.
//
// CO Y GIU TEN CU khi app doi ten hien thi thanh Notiftest-Grab. Day khong phai
// ten nguoi dung nhin thay (ten do o TEN_APP), ma la DINH DANH THU MUC DU LIEU.
// Doi no la doi luon %APPDATA%\grab-order-watcher\ sang mot thu muc khac, tuc
// la mat phien dang nhap Grab va mat ca ma quan da chon — nguoi dung phai dang
// nhap lai va chon quan lai, ma khong hieu vi sao chi doi cai ten.
app.setName('grab-order-watcher');

/**
 * Chi cho phep MOT ban chay cung luc.
 *
 * Khong phai chuyen lich su: hai ban chay song song deu tro vao cung mot thu
 * muc phien `%APPDATA%\grab-order-watcher\Partitions\grab`, va hai Chromium
 * ghi chung mot kho cookie thi giam len nhau. Grab xoay token dinh ky; ban A
 * lam moi xong ghi cookie moi xuong dia, ban B van giu token cu trong bo nho va
 * nam phut sau ghi de token cu len tren. Loi goi tiep theo cua ban nao cung an
 * 401, va nguoi dung chi thay "mat phien Grab" ma khong hieu vi sao.
 *
 * Da xay ra that trong lua khao sat: mot ban da cai va mot ban portable cung
 * chay, phien chet trong vong mot ngay. Voi nhieu quan thi thiet hai nhan len
 * dung bang so quan.
 *
 * Dat TRUOC app.whenReady(): khong lay duoc khoa thi thoat ngay, truoc khi kip
 * tao cua so hay dung toi thu muc phien.
 */
if (!app.requestSingleInstanceLock()) {
  // Khong ghi nhat ky o day: logger chua duoc tao, va ghi vao cung file voi ban
  // dang chay thi chi lam nhieu nhat ky cua no.
  app.quit();
  process.exit(0);
}

/**
 * Nguoi dung bam loi tat lan nua trong khi app dang chay.
 *
 * Khong lam gi ca thi ho tuong bam hut roi bam tiep vai lan nua. Dua cua so
 * dang chay len la cau tra loi dung: app von an minh o khay, nen "khong thay
 * gi" la trang thai binh thuong cua no.
 */
app.on('second-instance', () => {
  // Ghi lai: tren may quan, thay dong nay lap di lap lai nghia la nhan vien
  // dang bam loi tat vi tuong app chua chay — dau hieu can lam ro giao dien
  // chu khong phai loi ky thuat.
  logger?.info('Da co mot ban dang chay - dua bang dieu khien len');
  moBangDieuKhien();
});

// Goc du an. Khi da dong goi thanh .exe thi __dirname nam trong asar, nen lay
// thu muc chua file thuc thi de .env va config/ van sua duoc sau khi cai.
const ROOT = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '../..');

/**
 * Icon cua cua so — thanh tieu de va nut tren thanh tac vu.
 *
 * PHAI dat tuong minh. Ban portable chay bang chinh electron.exe khong sua mot
 * byte nao (do la dieu kien de Smart App Control cho chay), nen file thuc thi
 * KHONG nhung duoc icon rieng. Khong dat o day thi cua so mang icon Electron
 * mac dinh, va logo chi hien tren moi cai loi tat ngoai desktop.
 *
 * Ban dong goi: icon.ico nam canh .exe. Ban dev: o build/ sau khi chay
 * `npm run build:icon`. Thieu ca hai thi Electron tu lui ve icon mac dinh,
 * khong nem loi — nen khong can chan gi them.
 */
const ICON = app.isPackaged ? join(ROOT, 'icon.ico') : join(ROOT, 'build', 'icon.ico');

// Cau hinh duoc gieo sang thu muc du lieu nguoi dung de lan cap nhat app (chep
// de nguyen ca thu muc) khong xoa mat no. Xem chuanBiCauHinh().
const VI_TRI_CAU_HINH = chuanBiCauHinh(ROOT, app.getPath('userData'));
if (VI_TRI_CAU_HINH.envFile) loadEnvFile(VI_TRI_CAU_HINH.envFile);

/**
 * App duoc Windows tu chay luc dang nhap, chu khong phai nguoi dung tu bam.
 *
 * Tham so nay do chinh app dat vao khi bat `openAtLogin` — xem
 * capNhatTuChayCungWindows().
 */
const TU_CHAY = process.argv.includes('--tu-chay');

let config: AppConfig;
let stores: StoreConfig[];
let logger: Logger;
let controlWindow: BrowserWindow | null = null;
let grabWindow: GrabWindow | null = null;
let grabClient: GrabClient | null = null;
/**
 * Moi quan mot poller, khoa theo `grabMerchantID`.
 *
 * Tat ca dung CHUNG mot GrabWindow va mot GrabClient — §7.1 da kiem chung: mot
 * cua so dang mo trang quan X goi duoc API cua quan Y, bay lan thu tren bay
 * quan khac nhau deu 200. Nen khong can N cua so, va RAM khong tang theo so
 * quan.
 *
 * Map chu khong phai mang: cho nao can "quan nay dang the nao" thi tra cuu
 * thang bang ma quan, khong phai do lai chi so va hy vong hai mang con cung
 * thu tu.
 */
const pollers = new Map<string, StorePoller>();
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
    if (!nguoiDungDaTamDung) {
      const daBat = batLaiPollerDangDung();
      if (daBat > 0) logger.info(`Da bat ${daBat} poller sau khi kiem tra ket noi thanh cong`);
    }
  } catch (err) {
    const matPhien = err instanceof SessionExpiredError;
    lastProbe = { at, ok: false, matPhien, error: (err as Error).message };
    if (matPhien) logger.warn('MAT PHIEN - can dang nhap lai');
    else logger.error('Kiem tra Grab that bai', err);
  }
  capNhatKhay();
}

/**
 * Trang thai tung quan, dung thu tu trong config/stores.json.
 *
 * Doc tu `stores` chu khong tu `pollers`: quan da cau hinh ma chua co poller
 * (lap rap hong giua chung) phai van hien ra, khong duoc bien mat khoi giao
 * dien nhu the nguoi dung chua he chon no.
 */
function trangThaiTungQuan(): TrangThaiQuan[] {
  return stores.map((s) => ({
    merchantID: s.grabMerchantID,
    ccmanyStoreID: s.ccmanyStoreID,
    storeName: s.storeName,
    stats: pollers.get(s.grabMerchantID)?.stats ?? {
      state: 'dung' as const,
      lastPollAt: null,
      lastError: null,
      quanDangMo: null,
      soDonHomNay: 0,
      donGanNhat: null,
    },
  }));
}

/** Bat lai nhung poller dang dung. Tra ve so poller vua bat. */
function batLaiPollerDangDung(): number {
  let daBat = 0;
  for (const p of pollers.values()) {
    if (p.stats.state !== 'dung') continue;
    p.start();
    daBat++;
  }
  return daBat;
}

/**
 * Mot nut cho tat ca cac quan.
 *
 * Con quan nao dang chay thi bam la DUNG HET. Chi khi tat ca deu dung thi bam
 * moi la chay lai — dung nhu chu tren nut ma giao dien dang hien.
 */
function batTatTheoDoi(): void {
  if (pollers.size === 0) return;
  const dangChay = [...pollers.values()].filter((p) => p.stats.state !== 'dung');
  if (dangChay.length === 0) {
    nguoiDungDaTamDung = false;
    // Do lech pha tu tro lai: `khoiDauTreMs` duoc doc lai o moi lan start(),
    // nen bat lai ca 14 quan khong dung lai thanh mot dong nhon.
    batLaiPollerDangDung();
    logger.info(`Nguoi dung bat lai theo doi ${pollers.size} quan`);
  } else {
    nguoiDungDaTamDung = true;
    for (const p of dangChay) p.stop();
    logger.info(`Nguoi dung tam dung theo doi ${dangChay.length} quan`);
  }
  capNhatKhay();
}

function capNhatKhay(): void {
  tray?.capNhat(nhanKhay(trangThaiTungQuan(), lastProbe?.matPhien === true));
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

/**
 * Mo file .env bang Notepad, tu tao tu mau neu chua co.
 *
 * Bo hai buoc ma nguoi khong ranh may tinh hay hong nhat: di tim thu muc trong
 * AppData, va DOI TEN `.env.example` thanh `.env` — Notepad rat thich luu thanh
 * `.env.txt`, va luc do app bao "chua cau hinh" ma khong ai hieu vi sao.
 */
function moFileCauHinh(): void {
  const dich = join(app.getPath('userData'), '.env');
  try {
    if (!existsSync(dich)) {
      const mau = join(ROOT, '.env.example');
      if (existsSync(mau)) copyFileSync(mau, dich);
      else writeFileSync(dich, ['CCMANY_API_URL=', 'CCMANY_API_KEY=', 'DRY_RUN=true', ''].join('\n'), 'utf8');
      logger.info('Da tao file cau hinh tu mau', dich);
    }
  } catch (err) {
    logger.error('Khong tao duoc file cau hinh', err);
    return;
  }
  void shell.openPath(dich);
}

/**
 * Go cai dat: hoi cho ro roi giao viec cho "uninstall.cmd".
 *
 * App KHONG TU XOA MINH DUOC. Windows khoa file .exe dang chay va cac DLL da
 * nap, nen moi co gang xoa thu muc cai tu ben trong deu ket thuc bang mot ban
 * cai xoa do dang. Nen o day chi lam ba viec: hoi, day script ra %TEMP% (ra
 * ngoai thu muc sap bi xoa), chay no roi thoat. Script tu doi tien trinh nay
 * chet han moi bat dau xoa.
 */
async function goCaiDat(): Promise<{ ok: boolean; loi?: string }> {
  // Rao quan trong nhat cua tinh nang nay. O che do phat trien, "thu muc app"
  // chinh la node_modules/electron/dist — bam nut nay se xoa mat Electron cua
  // repo. Chua ke muc tu chay va loi tat cung khong ton tai de ma go.
  if (!app.isPackaged) {
    return {
      ok: false,
      loi: 'Chi go duoc ban da cai. Dang chay o che do phat trien (npm run dev), khong co gi de go.',
    };
  }

  const script = join(ROOT, 'uninstall.cmd');
  if (!existsSync(script)) {
    return { ok: false, loi: `Khong thay "uninstall.cmd" trong ${ROOT}` };
  }

  const opts: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Gỡ cài đặt',
    message: 'Gỡ "Notiftest-Grab" khỏi máy này?',
    detail: [
      'Sẽ xoá:',
      `    •  thư mục cài đặt   ${ROOT}`,
      '    •  lối tắt ngoài desktop',
      '    •  mục tự chạy cùng Windows',
      '',
      'App đóng lại ngay và ngừng theo dõi đơn. Đơn về trong lúc đó sẽ không lên ccmany.',
    ].join('\n'),
    checkboxLabel: 'Giữ lại phiên đăng nhập Grab và cấu hình — cài lại không phải đăng nhập lại',
    checkboxChecked: true,
    buttons: ['Huỷ', 'Gỡ cài đặt'],
    defaultId: 0,
    // Bam Esc hay dong hop thoai = Huy. Mac dinh cua mot hop thoai xoa khong
    // bao gio duoc la "xoa".
    cancelId: 0,
    noLink: true,
  };
  const chon = controlWindow
    ? await dialog.showMessageBox(controlWindow, opts)
    : await dialog.showMessageBox(opts);
  if (chon.response !== 1) return { ok: false };

  const duLieu = chon.checkboxChecked ? 'giu' : 'xoa';
  const banSao = join(tmpdir(), 'go-cai-dat-theo-doi-don-grab.cmd');
  try {
    copyFileSync(script, banSao);
  } catch (err) {
    logger.error('Khong chep duoc trinh go cai dat sang thu muc tam', err);
    return { ok: false, loi: (err as Error).message };
  }

  logger.warn('NGUOI DUNG GO CAI DAT', { thuMuc: ROOT, duLieu });

  // Tham so di bang BIEN MOI TRUONG chu khong bang tham so dong lenh: duong dan
  // cai co the co dau cach, va cach `start` boc dau ngoac thi khong theo quy
  // tac nao on dinh. Bien moi truong khong dinh toi chuyen dat dau ngoac.
  //
  // `start ""` de cua so console hien ra that su — nguoi bam nut can nhin thay
  // viec dang chay va ket qua, chu khong phai app bien mat roi khong biet gi.
  const con = spawn('cmd.exe', ['/c', 'start', '', banSao], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GOCAIDAT_DIR: ROOT, GOCAIDAT_DULIEU: duLieu },
  });
  con.unref();

  choPhepThoat = true;
  // Thoat theo duong binh thuong (qua before-quit) de kip ghi phien Grab xuong
  // dia — neu nguoi dung chon GIU LAI thi do chinh la thu ho muon giu.
  app.quit();
  return { ok: true };
}

/**
 * Luu ma quan vua chon roi khoi dong lai app.
 *
 * CO Y khoi dong lai thay vi lap rap lai tai cho. Doi quan nghia la doi ca
 * poller, cache, bo dem don hom nay, trang thai khay — lap rap lai giua chung
 * de sot mot manh la sinh ra loi chi hien ra sau vai gio. Khoi dong lai mat ba
 * giay va khong bo sot gi.
 */
function luuVaKhoiDongLai(quan: QuanDaChon[]): { ok: boolean; loi?: string } {
  if (quan.length === 0) return { ok: false, loi: 'Chua chon quan nao' };
  try {
    luuDanhSachQuan(app.getPath('userData'), quan);
    logger.info(
      `Da luu ${quan.length} quan, dang khoi dong lai`,
      quan.map((q) => q.grabMerchantID),
    );
  } catch (err) {
    logger.error('Khong luu duoc danh sach quan', err);
    return { ok: false, loi: (err as Error).message };
  }
  choPhepThoat = true;
  app.relaunch();
  app.quit();
  return { ok: true };
}

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 720,
    height: 520,
    title: 'Notiftest-Grab',
    icon: ICON,
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
    const quan = trangThaiTungQuan();
    const store = stores[0];
    return {
      // Mot quan thi hien ten quan nhu cu; nhieu quan thi hien so luong, vi
      // ten cua rieng quan dau tien se noi doi ve 13 quan con lai.
      storeName: quan.length > 1 ? `${quan.length} quan` : (store?.storeName ?? null),
      merchantID: store?.grabMerchantID ?? null,
      maQuanPhatHien: grabWindow?.maQuanPhatHien() ?? null,
      dryRun: config.dryRun,
      dryRunReason: config.dryRunReason,
      telegramEnabled: config.telegram !== null,
      telegramChoGui: telegram?.soTinChoGui ?? 0,
      grabUrl: grabWindow?.currentUrl() ?? null,
      pageLoaded: grabWindow?.pageLoaded() ?? false,
      userAgent: app.userAgentFallback,
      // Ban dev khong go duoc (xem goCaiDat). Giao dien dua vao day de khong
      // chia ra mot cai nut chac chan bao loi khi bam.
      daCaiDat: app.isPackaged,
      partitionPath: GrabWindow.partitionPath(),
      logPath: logger.filePath,
      lastProbe,
      // Gop N quan thanh mot cho phan tom tat o dau bang dieu khien.
      poller: gopTrangThai(quan),
      // Va tung quan mot, da soan san cau chu + mau den. Giao dien chi ve.
      quan: dongBangDieuKhien(quan),
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
  ipcMain.handle('config:open', () => {
    moFileCauHinh();
  });
  /**
   * Danh sach quan trong nhom, da ghep san voi lua chon hien tai.
   *
   * Giao dien chi ve ra, khong quyet dinh gi — moi quyet dinh o chon-quan.ts,
   * noi test duoc ma khong can jsdom.
   */
  ipcMain.handle('store:list', async (): Promise<KetQuaDanhSachQuan> => {
    const daChon = stores.map((s) => s.grabMerchantID);
    const ma = maQuanDeGoiApi(daChon, grabWindow?.maQuanPhatHien() ?? null);
    if (ma === null || !grabClient) return chuaCoMaQuan();
    try {
      const phanHoi = await grabClient.danhSachQuanTrongNhom(ma);
      const kq = ketQuaDanhSach(phanHoi, daChon);
      logger.info(`Doc danh sach quan trong nhom: ${kq.quan.length} quan`, { goiBang: ma });
      return kq;
    } catch (err) {
      logger.warn('Khong lay duoc danh sach quan trong nhom', err);
      return ketQuaLoi(err);
    }
  });

  ipcMain.handle('store:save', (_e, quan: unknown) => {
    // Du lieu tu tien trinh giao dien: loc lai o day chu khong tin.
    const ds = Array.isArray(quan)
      ? quan
          .filter((q): q is { merchantID: unknown; tenHienThi?: unknown } => typeof q === 'object' && q !== null)
          .map((q) => ({
            grabMerchantID: typeof q.merchantID === 'string' ? q.merchantID : '',
            storeName: typeof q.tenHienThi === 'string' ? q.tenHienThi : '',
          }))
          .filter((q) => q.grabMerchantID.trim() !== '')
      : [];
    return luuVaKhoiDongLai(ds);
  });
  ipcMain.handle('app:go-cai-dat', () => goCaiDat());
}

app.whenReady().then(async () => {
  config = loadConfig(process.env, ROOT);

  // PHAI lam truoc khi tao Logger — chinh Logger la thu dau tien can ghi dia.
  const noiLuu = chonThuMucGhiDuoc(config.dataDir, path.join(app.getPath('userData'), 'data'));
  if (noiLuu.canhBao) config.warnings.push(noiLuu.canhBao);
  config.dataDir = noiLuu.dir;

  logger = new Logger({ level: config.logLevel, dir: path.join(config.dataDir, 'logs') });

  logger.info('=== Khoi dong ===', { root: ROOT, dataDir: config.dataDir });
  for (const ghi of VI_TRI_CAU_HINH.ghiChu) logger.info(ghi);
  logger.info('Doc cau hinh tu', {
    env: VI_TRI_CAU_HINH.envFile ?? '(khong co - se chay kho)',
    stores: path.join(VI_TRI_CAU_HINH.storesRoot, 'config', 'stores.json'),
  });
  if (config.dryRun) logger.warn(`CHE DO CHAY KHO - ${config.dryRunReason}`);
  for (const warning of config.warnings) logger.warn(warning);

  capNhatTuChayCungWindows();
  dangKyVaoSettingsWindows();

  try {
    stores = loadStores(VI_TRI_CAU_HINH.storesRoot, { ccmanyStoreID: config.ccmanyStoreID });
  } catch (err) {
    logger.error('Khong doc duoc config/stores.json', err);
    stores = [];
  }
  if (stores.length === 0) {
    // Lan chay dau: chua nhan dien duoc quan nao. Day KHONG phai loi — app van
    // mo binh thuong, giao dien hien "chua chon quan" va cho nguoi dung dang
    // nhap Grab roi bam vao quan cua ho.
    logger.warn('CHUA CHON QUAN - mo trang Grab va bam vao quan de app tu nhan ma');
  } else {
    logger.info(
      `Doc duoc ${stores.length} quan`,
      // Ten truoc, ma cache sau: cac dong poller ben duoi deu mang tien to
      // [ccmanyStoreID], nen dong nay la cho duy nhat tra ra "ma do la quan nao".
      stores.map((s) => `${s.storeName} [${s.ccmanyStoreID}]`),
    );
    // Noi ro thay vi lang le bo qua: chu quan da tung dien o nay va se tuong no
    // van co tac dung. Xem AppConfig.ccmanyStoreID de biet vi sao khong ap duoc.
    if (config.ccmanyStoreID !== null && stores.length > 1) {
      logger.warn(
        `BO QUA CCMANY_STORE_ID=${config.ccmanyStoreID} vi dang chay ${stores.length} quan - ` +
          'moi quan dung chinh ma quan Grab lam store_id. Xoa dong do khoi .env cho khoi nham.',
      );
    }
  }

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

  // Cua so Grab duoc tao DU CHUA CHON QUAN. Thieu no thi nguoi dung khong co
  // cho nao de dang nhap, ma khong dang nhap thi khong bao gio nhan dien duoc
  // ma quan — be tac ngay tu lan chay dau.
  grabWindow = new GrabWindow({
    merchantID: store?.grabMerchantID ?? null,
    logger,
    onHidden: moBangDieuKhien,
    icon: ICON,
    // Chi khi DEV_THU_CHEO=true. Bam sang mot quan khac trong cua so Grab la
    // phep thu tu chay, ket luan nam trong nhat ky. Xem thu-cheo.ts.
    onMaQuanMoi: (ma) => {
      const daChon = stores[0]?.grabMerchantID;
      if (!config.devThuCheo || !grabClient || !daChon || ma === daChon) return;
      void chayVaGhiKetLuan(grabClient, ma, daChon, logger, config.dataDir);
    },
  });
  // Bat TRUOC khi mo trang, khong thi bo lo dung nhung loi goi luc tai lan dau.
  if (config.devGhiMang) grabWindow.ghiLaiLoiGoiMang(true);

  await grabWindow.open();
  logger.info('Cua so Grab da san sang', {
    url: grabWindow.currentUrl(),
    trangDaTai: grabWindow.pageLoaded(),
  });

  if (store) {
    grabClient = new GrabClient({
      getRunner: () => grabWindow?.runner() ?? null,
      getUrl: () => grabWindow?.currentUrl() ?? null,
    });

    telegram = new TelegramNotifier({ config: config.telegram });

    // Mot uploader cho tat ca: no khong giu trang thai rieng cua quan nao, chi
    // cam URL va kho a. Nhan ban theo quan chi ton bo nho ma khong duoc gi.
    const uploader = new CcmanyUploader({
      url: config.ccmany.url,
      apiKey: config.ccmany.apiKey,
      dryRun: config.dryRun,
      dataDir: config.dataDir,
    });

    for (const [i, s] of stores.entries()) {
      const tre = treKhoiDauMs(i, stores.length, config.pollIntervalMs);
      pollers.set(
        s.grabMerchantID,
        new StorePoller({
          store: s,
          config,
          // MOT client cho tat ca. GrabClient nhan merchantID theo tung loi goi
          // chu khong giu san, nen mot the hien phuc vu duoc moi quan.
          client: grabClient,
          // Cache thi PHAI rieng: ten file lay tu ccmanyStoreID, va hai quan
          // chung mot file la tap don da gui cua nhau bi ghi de.
          cache: new OrderCache(s.ccmanyStoreID, {
            dir: path.join(config.dataDir, 'cache'),
            lookbackMinutes: config.orderLookbackMinutes,
          }),
          uploader,
          telegram,
          logger,
          khoiDauTreMs: tre,
        }),
      );
    }
    logger.info(`Da lap ${pollers.size} poller tren MOT cua so Grab`, {
      nhipMs: config.pollIntervalMs,
      raiLechPhaMs: stores.map((_, i) => treKhoiDauMs(i, stores.length, config.pollIntervalMs)),
    });

    // Kiem tra ngay luc khoi dong: day la cach DUY NHAT dang tin de biet phien
    // con song hay khong (doc URL khong dung - xem grab-window.ts).
    await probeGrab();

    // Ghi phien xuong dia dinh ky: Grab xoay cookie trong luc chay, neu chi ghi
    // luc khoi dong va luc thoat thi mot lan giet cung o giua van mat phien.
    setInterval(() => void grabWindow?.luuPhien(), 5 * 60_000);

    resilience = new Resilience({
      config,
      logger,
      grabWindow,
      // MOT bo canh cho tat ca. Xem ResilienceDeps.pollers de biet vi sao
      // khong phai moi quan mot bo.
      pollers: [...pollers.values()],
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
    for (const p of pollers.values()) p.start();
    if (lastProbe?.ok) {
      // MOT tin cho ca N quan. Ban 14 tin lien tiep luc khoi dong thi nguoi
      // nhan se tat thong bao cua bot, va tat luon ca canh bao mat phien.
      const ten =
        stores.length === 1
          ? stores[0]!.storeName
          : `${stores.length} quan (${stores.map((s) => s.storeName).join(', ')})`;
      void telegram.sendAlert(`Da khoi dong theo doi ${ten}${config.dryRun ? ' (CHAY KHO)' : ''}`);
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
}).catch((err) => {
  // Luoi an toan cho ca chuoi lap rap o tren.
  //
  // Khong co no thi mot loi bat ky giua chung se dut lang: cua so van hien,
  // bieu tuong khay van xanh, ma GrabClient chua duoc tao nen khong co don nao
  // duoc lay — va dau vet duy nhat la mot dong unhandledRejection lan giua
  // nhat ky. Da xay ra that: `loadURL` nem ERR_ABORTED khi Grab da sang trang
  // logout, va ca poller lan resilience deu khong bao gio khoi dong.
  //
  // Khong sua duoc tu day, nhung PHAI noi that to.
  logger?.error('KHOI DONG THAT BAI - app KHONG theo doi don nao. Mo lai app.', err);
});

/**
 * Hien trong Settings -> Apps -> Installed apps, kem nut Uninstall.
 *
 * Chi lam khi da dong goi, cung ly do voi tu-chay-cung-Windows: o che do phat
 * trien thi "thu muc cai" la node_modules/electron/dist, dang ky no vao Windows
 * la bay ra mot muc go cai dat tro vao giua repo.
 */
function dangKyVaoSettingsWindows(): void {
  if (!app.isPackaged) return;
  dangKyGoCaiDat(
    {
      tenHienThi: 'Notiftest-Grab',
      phienBan: app.getVersion(),
      thuMucCai: ROOT,
      trinhGoCaiDat: join(ROOT, 'uninstall.cmd'),
      icon: join(ROOT, 'icon.ico'),
    },
    (thong, err) => logger.warn(thong, err),
  );
}

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
      name: 'Notiftest-Grab',
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
  for (const p of pollers.values()) p.stop();
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
