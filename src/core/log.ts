/**
 * Nhat ky: ra man hinh va ra file.
 *
 * Ghi ra file quan trong hon ve tren may quan — khong ai mo devtools o do, nen
 * khi co su co thi file log la thu duy nhat con lai de lan ra chuyen gi da xay ra.
 *
 * Xoay vong file de o Task 10; hien tai chi ghi noi tiep.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LoggerOptions {
  level?: LogLevel;
  /** Thu muc chua file log. Bo trong thi chi ghi ra man hinh. */
  dir?: string;
  now?: () => number;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly file: string | null;
  private readonly now: () => number;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.now = options.now ?? Date.now;

    if (options.dir) {
      mkdirSync(options.dir, { recursive: true });
      this.file = join(options.dir, 'app.log');
    } else {
      this.file = null;
    }
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
        appendFileSync(this.file, `${line}\n`, 'utf8');
      } catch {
        // Dia day hoac khong ghi duoc: van phai chay tiep. Ghi log that bai ma
        // lam chet app thi con te hon khong co log.
      }
    }
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
