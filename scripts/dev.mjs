// Chay app o che do phat trien.
//
// KHONG goi thang `electron out/main/main.js` trong npm script: neu moi truong
// co san bien ELECTRON_RUN_AS_NODE=1 (cac IDE/terminal chay tren Electron —
// VS Code, Claude Code... — deu dat bien nay cho tien trinh con), thi
// electron.exe se chay nhu Node thuan. Khi do `require('electron')` tra ve mot
// CHUOI duong dan thay vi module, va app chet ngay voi
// "Cannot read properties of undefined (reading 'whenReady')".
//
// Launcher nay xoa bien do truoc khi spawn nen chay dung o moi terminal.

import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['out/main/main.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('close', (code) => process.exit(code ?? 0));
