import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/core/log.js';

let thuMuc: string;

beforeEach(() => {
  thuMuc = mkdtempSync(join(tmpdir(), 'log-'));
  // Nhat ky van in ra man hinh — trong test thi che di cho do nhieu.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(thuMuc, { recursive: true, force: true });
});

const doc = (ten: string) => readFileSync(join(thuMuc, ten), 'utf8');

describe('Logger', () => {
  it('ghi ra file va loc theo muc', () => {
    const logger = new Logger({ dir: thuMuc, level: 'warn' });
    logger.debug('khong hien');
    logger.info('cung khong hien');
    logger.warn('co hien');
    logger.error('cung hien');

    const noiDung = doc('app.log');
    expect(noiDung).not.toContain('khong hien');
    expect(noiDung).toContain('co hien');
    expect(noiDung).toContain('cung hien');
  });

  it('filePath tro dung toi app.log, de nut "Xem nhat ky" mo duoc', () => {
    const logger = new Logger({ dir: thuMuc });
    expect(logger.filePath).toBe(join(thuMuc, 'app.log'));
  });

  it('khong truyen dir thi chi ra man hinh, filePath la null', () => {
    const logger = new Logger({});
    expect(logger.filePath).toBeNull();
    expect(() => logger.info('ok')).not.toThrow();
  });

  describe('xoay vong', () => {
    it('vuot nguong thi doi ten thanh app.log.1 va bat dau file moi', () => {
      const logger = new Logger({ dir: thuMuc, maxBytes: 200 });
      for (let i = 0; i < 20; i += 1) logger.info(`dong so ${i}`);

      expect(existsSync(join(thuMuc, 'app.log.1'))).toBe(true);
      // Dong moi nhat luon nam o app.log, khong phai o file da xoay.
      expect(doc('app.log')).toContain('dong so 19');
      expect(doc('app.log')).not.toContain('dong so 0 ');
    });

    it('khong giu qua so file cu da dat', () => {
      const logger = new Logger({ dir: thuMuc, maxBytes: 120, soFileCu: 2 });
      for (let i = 0; i < 60; i += 1) logger.info(`dong ${i}`);

      const file = readdirSync(thuMuc).sort();
      expect(file).toEqual(['app.log', 'app.log.1', 'app.log.2']);
    });

    // Doi ten chu khong cat noi dung: khong duoc mat dong nao o giua.
    it('khong mat dong nao khi xoay', () => {
      const logger = new Logger({ dir: thuMuc, maxBytes: 300, soFileCu: 5 });
      for (let i = 0; i < 40; i += 1) logger.info(`dong ${i}`);

      const tatCa = readdirSync(thuMuc)
        .map((ten) => doc(ten))
        .join('\n');
      for (let i = 0; i < 40; i += 1) {
        expect(tatCa).toContain(`dong ${i}`);
      }
    });

    // Chay lai app thi phai tiep tuc dem tu kich thuoc that cua file, khong
    // tuong la dang tu so khong roi de file phinh gap doi nguong.
    it('doc lai kich thuoc san co khi khoi tao', () => {
      writeFileSync(join(thuMuc, 'app.log'), 'x'.repeat(500), 'utf8');
      const logger = new Logger({ dir: thuMuc, maxBytes: 200 });
      logger.info('dong dau tien sau khi chay lai');

      expect(existsSync(join(thuMuc, 'app.log.1'))).toBe(true);
      expect(doc('app.log.1')).toContain('xxxxx');
      expect(doc('app.log')).toContain('dong dau tien sau khi chay lai');
    });
  });
});
