/**
 * Nhat ky: ra man hinh va ra file.
 *
 * Ghi ra file quan trong hon ve tren may quan — khong ai mo devtools o do, nen
 * khi co su co thi file log la thu duy nhat con lai de lan ra chuyen gi da xay ra.
 *
 * File duoc xoay vong theo kich thuoc. May quan chay lien tuc hang thang, o muc
 * info moi luot poll van sinh vai dong khi co don; khong xoay thi app.log lon
 * dan toi luc mo bang Notepad cung khong noi, tuc la co log ma nhu khong co.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Xoay khi file vuot nguong nay. 2 MB ~ vai chuc nghin dong, van mo duoc. */
const MAC_DINH_MAX_BYTES = 2 * 1024 * 1024;
/** Giu bao nhieu file cu (app.log.1 ... app.log.N). */
const MAC_DINH_SO_FILE_CU = 3;

export interface LoggerOptions {
  level?: LogLevel;
  /** Thu muc chua file log. Bo trong thi chi ghi ra man hinh. */
  dir?: string;
  /** Nguong xoay vong, byte. */
  maxBytes?: number;
  /** So file cu giu lai. */
  soFileCu?: number;
  now?: () => number;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly file: string | null;
  private readonly maxBytes: number;
  private readonly soFileCu: number;
  private readonly now: () => number;

  /** Kich thuoc file hien tai, dem trong bo nho de khoi stat moi dong. */
  private coBytes = 0;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.maxBytes = options.maxBytes ?? MAC_DINH_MAX_BYTES;
    this.soFileCu = options.soFileCu ?? MAC_DINH_SO_FILE_CU;
    this.now = options.now ?? Date.now;

    if (options.dir) {
      mkdirSync(options.dir, { recursive: true });
      this.file = join(options.dir, 'app.log');
      try {
        this.coBytes = statSync(this.file).size;
      } catch {
        this.coBytes = 0;
      }
    } else {
      this.file = null;
    }
  }

  /** Duong dan file log, de giao dien mo bang nut "Xem nhat ky". */
  get filePath(): string | null {
    return this.file;
  }

  debug(message: string, extra?: unknown): void {
    this.write('debug', message, extra);
  }
  info(message: string, extra?: unknown): void {
    this.write('info', message, extra);
  }
  warn(message: string, extra?: unknown): void {
    this.write('warn', message, extra);
  }
  error(message: string, extra?: unknown): void {
    this.write('error', message, extra);
  }

  private write(level: LogLevel, message: string, extra?: unknown): void {
    if (ORDER[level] < ORDER[this.level]) return;

    const stamp = new Date(this.now()).toISOString();
    const tail = extra === undefined ? '' : ` ${stringify(extra)}`;
    const line = `${stamp} ${level.toUpperCase().padEnd(5)} ${message}${tail}`;

    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);

    if (this.file) {
      try {
        const data = `${line}\n`;
        this.xoayNeuCan(Buffer.byteLength(data, 'utf8'));
        appendFileSync(this.file, data, 'utf8');
        this.coBytes += Buffer.byteLength(data, 'utf8');
      } catch {
        // Dia day hoac khong ghi duoc: van phai chay tiep. Ghi log that bai ma
        // lam chet app thi con te hon khong co log.
      }
    }
  }

  /**
   * app.log -> app.log.1 -> app.log.2 -> ... -> file cu nhat bi xoa.
   *
   * Doi ten chu khong cat bot noi dung: doi ten la mot thao tac duy nhat cua he
   * thong file, nen khong co khoanh khac nao file dang do dang neu mat dien
   * giua chung.
   */
  private xoayNeuCan(themBytes: number): void {
    if (!this.file || this.coBytes + themBytes <= this.maxBytes) return;

    // Xoa file cu nhat truoc, roi day tung file lui mot bac.
    const cuNhat = `${this.file}.${this.soFileCu}`;
    try {
      if (existsSync(cuNhat)) unlinkSync(cuNhat);
    } catch {
      /* khong xoa duoc thi renameSync ben duoi se ghi de len */
    }

    for (let i = this.soFileCu - 1; i >= 1; i -= 1) {
      const tu = `${this.file}.${i}`;
      if (existsSync(tu)) renameSync(tu, `${this.file}.${i + 1}`);
    }

    renameSync(this.file, `${this.file}.1`);
    this.coBytes = 0;
  }
}

function stringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
