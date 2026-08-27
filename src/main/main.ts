import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';

/**
 * Diem vao cua app. Task 0 chi dung o muc "mo duoc mot cua so trong roi dong
 * sach" — cac task sau se gan poller, client Grab va giao dien vao day.
 */

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'Theo doi don Grab',
    webPreferences: {
      // Tab chay nen bi Chromium bop co hen gio; tat di ngay tu dau vi ca app
      // song bang viec poll dung nhip.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Khong bao gio chet im: moi loi khong bat duoc deu phai de lai dau vet.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
