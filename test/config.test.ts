import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, loadEnvFile, loadStores, luuDanhSachQuan } from '../src/core/config.js';

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

  // ccmanyStoreID va storeName chi de hien thi / danh dau ben ccmany. Chan app
  // chay chi vi mot o trong trong file text la doi mot phien thiet lap chua
  // xong thanh mot cong cu ngung nhan don.
  it('thieu ccmanyStoreID thi lay chinh ma quan Grab', () => {
    writeStores({ stores: [{ grabMerchantID: '5-AAA', ccmanyStoreID: '', storeName: '' }] });
    const stores = loadStores(root);
    expect(stores[0]!.ccmanyStoreID).toBe('5-AAA');
    // Khong co ten thi lay chinh ma quan lam ten — du de nhan ra tren giao dien.
    expect(stores[0]!.storeName).toBe('5-AAA');
  });

  it('co ghi ccmanyStoreID trong file thi ton trong', () => {
    writeStores({ stores: [{ grabMerchantID: '5-AAA', ccmanyStoreID: 'RIENG', storeName: '' }] });
    expect(loadStores(root)[0]!.ccmanyStoreID).toBe('RIENG');
  });

  // Lan chay dau tien chua nhan dien duoc quan nao. Do la trang thai binh
  // thuong, khong phai loi: app se hien "chua chon quan".
  it('chua co ma quan thi tra ve mang rong, khong nem loi', () => {
    writeStores({ stores: [{ grabMerchantID: '', ccmanyStoreID: '', storeName: '' }] });
    expect(loadStores(root)).toEqual([]);
  });

  it('khong co quan nao bat thi tra ve mang rong', () => {
    writeStores({ stores: [] });
    expect(loadStores(root)).toEqual([]);
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

/**
 * DI SAN CCMANY_STORE_ID.
 *
 * `ccmanyStoreID` khong chi di vao payload — no con la TEN FILE CACHE
 * (`src/core/cache.ts`). Ap mot gia tri tu .env cho nhieu quan la cho tat ca
 * cung ghi de len mot file, va tap don da gui cua quan nay bi quan kia xoa:
 * gui trung hoac mat don, khong mot dong loi nao.
 *
 * Voi dung mot quan thi van phai ap, khong thi ban cai cu vua cap nhat xong se
 * doi ca `store_id` gui ccmany lan ten file cache.
 */
describe('loadStores — CCMANY_STORE_ID di san', () => {
  it('dung MOT quan thi van ap gia tri tu .env', () => {
    writeStores({ stores: [{ grabMerchantID: '5-AAA', ccmanyStoreID: '', storeName: '' }] });
    expect(loadStores(root, { ccmanyStoreID: 'TU-ENV' })[0]!.ccmanyStoreID).toBe('TU-ENV');
  });

  it('tu HAI quan tro len thi bo qua, moi quan mot ma rieng', () => {
    writeStores({
      stores: [
        { grabMerchantID: '5-AAA', ccmanyStoreID: '', storeName: '' },
        { grabMerchantID: '5-BBB', ccmanyStoreID: '', storeName: '' },
      ],
    });
    const stores = loadStores(root, { ccmanyStoreID: 'TU-ENV' });
    expect(stores.map((s) => s.ccmanyStoreID)).toEqual(['5-AAA', '5-BBB']);
  });

  // Chot chan cuoi, phat bieu thang vao hau qua: hai quan trung `ccmanyStoreID`
  // la hai poller trung file cache.
  it('14 quan thi ma quan doi mot khong trung nhau', () => {
    writeStores({
      stores: Array.from({ length: 14 }, (_, i) => ({
        grabMerchantID: `5-QUAN${i}`,
        ccmanyStoreID: '',
        storeName: '',
      })),
    });
    const ma = loadStores(root, { ccmanyStoreID: 'TU-ENV' }).map((s) => s.ccmanyStoreID);
    expect(ma).toHaveLength(14);
    expect(new Set(ma).size).toBe(14);
  });

  it('khong dat CCMANY_STORE_ID cung khong sao', () => {
    writeStores({ stores: [{ grabMerchantID: '5-AAA', ccmanyStoreID: '', storeName: '' }] });
    expect(loadStores(root, { ccmanyStoreID: null })[0]!.ccmanyStoreID).toBe('5-AAA');
  });
});

/**
 * Danh sach quan do app tu ghi sau khi nguoi dung tick trong bang chon, nen cap
 * ghi-doc phai khop nhau. Lech mot chut la nguoi dung chon quan xong, khoi dong
 * lai, va thay "chua chon quan" nhu chua he bam gi.
 */
describe('luuDanhSachQuan', () => {
  it('ghi xong thi doc lai duoc dung nhung quan do', () => {
    luuDanhSachQuan(root, [
      { grabMerchantID: '5-C7XUNYEVEADYN2', storeName: 'Quan Mot' },
      { grabMerchantID: '5-C8DEEF3TEXVVA2', storeName: 'Quan Hai' },
    ]);
    const stores = loadStores(root);
    expect(stores).toHaveLength(2);
    expect(stores.map((s) => s.grabMerchantID)).toEqual(['5-C7XUNYEVEADYN2', '5-C8DEEF3TEXVVA2']);
    expect(stores.map((s) => s.storeName)).toEqual(['Quan Mot', 'Quan Hai']);
  });

  // Ten that la ca ly do goi endpoint danh sach quan. Roi mat no thi bang dieu
  // khien 14 dong toan ma quan, khong ai doc duoc dong nao la quan nao.
  it('giu nguyen ten tieng Viet co dau qua mot vong ghi rong doc', () => {
    luuDanhSachQuan(root, [{ grabMerchantID: '5-AAA', storeName: 'Quán Bến Thành' }]);
    expect(loadStores(root)[0]!.storeName).toBe('Quán Bến Thành');
  });

  it('khong ghi ccmanyStoreID de loadStores dien bang ma quan Grab', () => {
    luuDanhSachQuan(root, [{ grabMerchantID: '5-AAA' }]);
    const tho = JSON.parse(readFileSync(join(root, 'config', 'stores.json'), 'utf8')) as {
      stores: { ccmanyStoreID: string }[];
    };
    expect(tho.stores[0]!.ccmanyStoreID).toBe('');
    expect(loadStores(root)[0]!.ccmanyStoreID).toBe('5-AAA');
  });

  it('tu tao thu muc config neu chua co', () => {
    luuDanhSachQuan(join(root, 'chua-ton-tai'), [{ grabMerchantID: '5-AAAAAAAAAA' }]);
    expect(loadStores(join(root, 'chua-ton-tai'))[0]!.grabMerchantID).toBe('5-AAAAAAAAAA');
  });

  it('chon lai thi ghi de, khong de lai quan cu', () => {
    luuDanhSachQuan(root, [{ grabMerchantID: '5-AAAAAAAAAA' }, { grabMerchantID: '5-CU' }]);
    luuDanhSachQuan(root, [{ grabMerchantID: '5-BBBBBBBBBB' }]);
    const stores = loadStores(root);
    expect(stores).toHaveLength(1);
    expect(stores[0]!.grabMerchantID).toBe('5-BBBBBBBBBB');
  });

  // Trung ma quan = hai poller cung mot quan, cung mot file cache, gui trung.
  it('trung ma quan thi chi ghi mot lan', () => {
    luuDanhSachQuan(root, [
      { grabMerchantID: '5-AAA', storeName: 'Ten Dau' },
      { grabMerchantID: ' 5-AAA ', storeName: 'Ten Sau' },
    ]);
    const stores = loadStores(root);
    expect(stores).toHaveLength(1);
    expect(stores[0]!.storeName).toBe('Ten Dau');
  });

  it('bo qua ma quan rong ma van giu nhung quan lanh', () => {
    luuDanhSachQuan(root, [
      { grabMerchantID: '' },
      { grabMerchantID: '   ' },
      { grabMerchantID: '5-LANH' },
    ]);
    expect(loadStores(root).map((s) => s.grabMerchantID)).toEqual(['5-LANH']);
  });

  /**
   * Ghi de bang danh sach rong se lam ca 14 quan ngung nhan don, va nguoi dung
   * chi thay "chua chon quan" ma khong hieu vua mat gi. Nem de cho goi bao
   * duoc, con hon am tham xoa sach lua chon.
   */
  it('danh sach rong thi nem loi va KHONG dung toi file dang co', () => {
    luuDanhSachQuan(root, [{ grabMerchantID: '5-DANG-CHAY' }]);
    expect(() => luuDanhSachQuan(root, [])).toThrowError(/rong/);
    expect(() => luuDanhSachQuan(root, [{ grabMerchantID: '  ' }])).toThrowError(/rong/);
    expect(loadStores(root)[0]!.grabMerchantID).toBe('5-DANG-CHAY');
  });

  // Ghi qua file tam roi doi ten. Bo quen file tam thi thu muc config cua nguoi
  // dung day rac sau moi lan chon quan.
  it('khong de lai file tam canh stores.json', () => {
    luuDanhSachQuan(root, [{ grabMerchantID: '5-AAA' }]);
    expect(readdirSync(join(root, 'config'))).toEqual(['stores.json']);
  });
});

/**
 * Cong cu Windows hay chen BOM vao dau file UTF-8 (Notepad ban cu,
 * `Set-Content -Encoding utf8` cua PowerShell 5.1). Hai hau qua, ca hai deu
 * kho lan ra — nhat la voi .env: bo doc cua Node coi kho a dau tien la
 * "\uFEFFCCMANY_API_URL" nen thieu URL ma KHONG bao loi gi, app am tham chay
 * o che do kho.
 */
describe('file cau hinh co BOM', () => {
  it('stores.json co BOM van doc duoc', () => {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(
      join(root, 'config', 'stores.json'),
      '\uFEFF' + JSON.stringify({ stores: [{ grabMerchantID: '5-AAAAAAAAAA' }] }),
      'utf8',
    );
    expect(loadStores(root)[0]!.grabMerchantID).toBe('5-AAAAAAAAAA');
  });

  it('.env co BOM thi duoc sua han o dia, khong chi bo qua luc doc', () => {
    const duongDan = join(root, '.env');
    writeFileSync(duongDan, '\uFEFFCCMANY_API_URL=https://x/y\n', 'utf8');

    loadEnvFile(duongDan);

    expect(readFileSync(duongDan, 'utf8').startsWith('\uFEFF')).toBe(false);
    expect(process.env.CCMANY_API_URL).toBe('https://x/y');
    delete process.env.CCMANY_API_URL;
  });

  it('file khong co BOM thi khong bi dung toi', () => {
    const duongDan = join(root, '.env');
    const truoc = 'CCMANY_API_KEY=k\n';
    writeFileSync(duongDan, truoc, 'utf8');
    loadEnvFile(duongDan);
    expect(readFileSync(duongDan, 'utf8')).toBe(truoc);
    delete process.env.CCMANY_API_KEY;
  });
});
