import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, loadStores } from '../src/core/config.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const FULL = {
  CCMANY_API_URL: 'https://vi-du/api/orders',
  CCMANY_API_KEY: 'KHOA',
  DRY_RUN: 'false',
};

function writeStores(content: unknown): void {
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'config', 'stores.json'), JSON.stringify(content), 'utf8');
}

describe('chot an toan cua che do chay kho', () => {
  it('thieu kho a API -> TU BAT chay kho du DRY_RUN=false', async () => {
    const config = loadConfig({ ...FULL, CCMANY_API_KEY: '' }, root);

    expect(config.dryRun).toBe(true);
    expect(config.dryRunReason).toContain('chua cau hinh');
    expect(config.warnings.some((w) => w.includes('tu bat che do chay kho'))).toBe(true);
  });

  it('thieu URL -> cung tu bat chay kho', () => {
    expect(loadConfig({ ...FULL, CCMANY_API_URL: '' }, root).dryRun).toBe(true);
  });

  it('du cau hinh va DRY_RUN=false -> gui that', () => {
    const config = loadConfig(FULL, root);
    expect(config.dryRun).toBe(false);
    expect(config.dryRunReason).toBeNull();
  });

  it('mac dinh khi khong khai bao gi la CHAY KHO', () => {
    // An toan mac dinh: khong bao gio vo tinh ban vao du lieu that.
    expect(loadConfig({}, root).dryRun).toBe(true);
  });
});

describe('nhip poll', () => {
  it('ep san toi thieu 3 giay va canh bao', () => {
    const config = loadConfig({ ...FULL, POLL_INTERVAL_MS: '500' }, root);

    expect(config.pollIntervalMs).toBe(3000);
    expect(config.warnings.some((w) => w.includes('qua thap'))).toBe(true);
  });

  it('gia tri rac thi dung mac dinh', () => {
    expect(loadConfig({ ...FULL, POLL_INTERVAL_MS: 'nhanh len' }, root).pollIntervalMs).toBe(5000);
  });
});

describe('Telegram', () => {
  it('du ca hai -> bat', () => {
    const config = loadConfig({ ...FULL, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' }, root);
    expect(config.telegram).toEqual({ botToken: 'T', chatId: '1' });
  });

  it('chi co mot nua -> tat, kem canh bao', () => {
    const config = loadConfig({ ...FULL, TELEGRAM_BOT_TOKEN: 'T' }, root);

    expect(config.telegram).toBeNull();
    expect(config.warnings.some((w) => w.includes('mot nua'))).toBe(true);
  });

  it('khong khai bao -> tat, khong canh bao', () => {
    const config = loadConfig(FULL, root);
    expect(config.telegram).toBeNull();
    expect(config.warnings).toEqual([]);
  });
});

describe('doc cac gia tri khac', () => {
  it('doc dung kieu boolean', () => {
    for (const value of ['true', '1', 'yes', 'TRUE']) {
      expect(loadConfig({ ...FULL, ORDER_NUMBER_WITH_DATE: value }, root).orderNumberWithDate).toBe(true);
    }
    for (const value of ['false', '0', 'khong', '']) {
      expect(loadConfig({ ...FULL, ORDER_NUMBER_WITH_DATE: value }, root).orderNumberWithDate).toBe(false);
    }
  });

  it('log level la mot trong bon gia tri, khac di thi ve info', () => {
    expect(loadConfig({ ...FULL, LOG_LEVEL: 'debug' }, root).logLevel).toBe('debug');
    expect(loadConfig({ ...FULL, LOG_LEVEL: 'om som' }, root).logLevel).toBe('info');
  });
});

describe('loadStores', () => {
  it('doc duoc danh sach quan', () => {
    writeStores({
      stores: [
        { grabMerchantID: '5-AAA', ccmanyStoreID: 'STORE1', storeName: 'Quan A', enabled: true },
      ],
    });
    const stores = loadStores(root);
    expect(stores).toHaveLength(1);
    expect(stores[0]!.grabMerchantID).toBe('5-AAA');
  });

  it('bo qua quan da tat', () => {
    writeStores({
      stores: [
        { grabMerchantID: '5-AAA', ccmanyStoreID: 'S1', storeName: 'A', enabled: true },
        { grabMerchantID: '5-BBB', ccmanyStoreID: 'S2', storeName: 'B', enabled: false },
      ],
    });
    expect(loadStores(root).map((s) => s.ccmanyStoreID)).toEqual(['S1']);
  });

  it('nem loi khi thieu truong bat buoc — khong am tham gui sai ma quan', () => {
    writeStores({ stores: [{ grabMerchantID: '5-AAA', ccmanyStoreID: '', storeName: 'A' }] });
    expect(() => loadStores(root)).toThrowError(/ccmanyStoreID/);
  });

  it('nem loi khi khong co quan nao bat', () => {
    writeStores({ stores: [] });
    expect(() => loadStores(root)).toThrowError(/khong co quan nao/);
  });

  it('nem loi khi file khong ton tai', () => {
    expect(() => loadStores(root)).toThrowError(/Khong doc duoc/);
  });

  it('nem loi khi JSON hong', () => {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config', 'stores.json'), '{hong', 'utf8');
    expect(() => loadStores(root)).toThrowError(/khong phai JSON/);
  });
});
