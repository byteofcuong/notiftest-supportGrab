import { describe, expect, it, vi } from 'vitest';
import { formatOrder, TelegramNotifier } from '../src/core/telegram.js';
import type { CcmanyPayload } from '../src/core/types.js';

const PAYLOAD: CcmanyPayload = {
  store_id: 'STORE1',
  store_name: 'Quan Test',
  order_number: '001500221566-C8D2VEDVCY5WSA',
  order_code: 'GF-547',
  created_at: '28/08/2026 - 11:24',
  customer: { name: 'Khach Test' },
  driver: { name: '', phone: '' },
  items: [
    {
      name: '🍓 Que Quế Dâu Hồng Ngọt Ngào',
      quantity: 1,
      price: 5000,
      original_price: null,
      note: 'note: test note kem quế dâu',
      modifiers: [],
    },
    {
      name: 'Sting Đỏ',
      quantity: 1,
      price: 26000,
      original_price: null,
      note: '',
      modifiers: [
        { name: 'option3', price: 4000, quantity: 1 },
        { name: 'option2', price: 3000, quantity: 1 },
      ],
    },
  ],
  subtotal: 121000,
  discount: 0,
  tax: 0,
  total: 121000,
};

const CONFIG = { botToken: 'TOKEN', chatId: '123' };
const ok = () => new Response('{"ok":true}', { status: 200 });

function notifier(fetchImpl: ReturnType<typeof vi.fn>, config = CONFIG as typeof CONFIG | null) {
  return new TelegramNotifier({
    config,
    fetchImpl: fetchImpl as never,
    sleep: async () => {},
  });
}

describe('gui tin', () => {
  it('goi dung endpoint sendMessage voi token', async () => {
    const fetchImpl = vi.fn(ok);
    await notifier(fetchImpl).sendAlert('mat phien');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage');
    expect(JSON.parse(init.body).chat_id).toBe('123');
  });

  it('TUYET DOI khong dung parse_mode', async () => {
    // Ten mon chua *, _, (, ) va emoji. Bat Markdown thi Telegram tu choi ca
    // tin nhan voi HTTP 400 — notiftest da dam phai va ghi lai trong comment.
    const fetchImpl = vi.fn(ok);
    await notifier(fetchImpl).sendOrder(PAYLOAD);

    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body.parse_mode).toBeUndefined();
  });

  it('co timeout', async () => {
    const fetchImpl = vi.fn(ok);
    await notifier(fetchImpl).sendAlert('x');
    expect(fetchImpl.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });

  it('cat bot tin nhan qua dai', async () => {
    const fetchImpl = vi.fn(ok);
    await notifier(fetchImpl).send('x'.repeat(9000));

    const text = JSON.parse(fetchImpl.mock.calls[0]![1].body).text;
    expect(text.length).toBeLessThanOrEqual(4000);
  });
});

describe('hong thi im lang, KHONG lam hong luong gui don', () => {
  it('loi mang -> tra false chu khong nem', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('mat mang'));
    await expect(notifier(fetchImpl).sendAlert('x')).resolves.toBe(false);
  });

  it('HTTP 400 -> tra false chu khong nem', async () => {
    const fetchImpl = vi.fn(() => new Response('bad', { status: 400 }));
    await expect(notifier(fetchImpl).sendOrder(PAYLOAD)).resolves.toBe(false);
  });

  it('thu lai 2 lan roi thoi', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('mat mang'));
    await notifier(fetchImpl).sendAlert('x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('chua cau hinh Telegram', () => {
  it('khong goi mang, tra false', async () => {
    const fetchImpl = vi.fn(ok);
    const quiet = notifier(fetchImpl, null);

    expect(quiet.enabled).toBe(false);
    await expect(quiet.sendOrder(PAYLOAD)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('formatOrder', () => {
  const text = formatOrder(PAYLOAD);

  it('co ma don, ten quan, gio', () => {
    expect(text).toContain('GF-547');
    expect(text).toContain('Quan Test');
    expect(text).toContain('28/08/2026 - 11:24');
  });

  it('liet ke mon kem topping thut vao', () => {
    expect(text).toContain('1x Sting Đỏ — 26.000đ');
    expect(text).toContain('• option3 4.000đ');
    expect(text).toContain('• option2 3.000đ');
  });

  /**
   * `price` cua mon DA gom topping (19.000 + 4.000 + 3.000 = 26.000), nen dong
   * topping chi la liet ke thanh phan chu khong phai khoan cong them.
   *
   * Truoc day viet "(+4.000d)". Nguoi dung doc xong cong tiep thanh 33.000 roi
   * doi chieu voi man hinh Grab thay lech va tuong cong cu tinh sai — ho bao
   * lai ngay 02/09/2026. So lieu van dung, chi cach viet gay hieu nham.
   */
  it('KHONG dung dau + truoc gia topping', () => {
    expect(text).not.toContain('(+');
  });

  it('noi ro gia mon da gom topping', () => {
    expect(text).toContain('1x Sting Đỏ — 26.000đ (đã gồm topping)');
  });

  // Mon khong co topping thi khong can chu thich — them vao chi lam roi mat.
  it('mon khong topping thi khong co chu thich', () => {
    expect(text).toContain('1x 🍓 Que Quế Dâu Hồng Ngọt Ngào — 5.000đ');
    expect(text).not.toContain('Dâu Hồng Ngọt Ngào — 5.000đ (đã gồm');
  });

  // Topping gia 0 (tuy chon khong tinh tien) cung khong lam mon co chu thich.
  it('topping gia 0 khong lam mon bi ghi "da gom topping"', () => {
    const mien = formatOrder({
      ...PAYLOAD,
      items: [
        {
          name: 'Mon',
          quantity: 1,
          price: 10_000,
          original_price: null,
          note: '',
          modifiers: [{ name: 'Khong da', price: 0, quantity: 1 }],
        },
      ],
    });
    expect(mien).toContain('1x Mon — 10.000đ');
    expect(mien).toContain('• Khong da');
    expect(mien).not.toContain('đã gồm topping');
  });

  it('giu ghi chu cua mon', () => {
    expect(text).toContain('ghi chu: note: test note kem quế dâu');
  });

  it('co tong cong', () => {
    expect(text).toContain('TONG CONG: 121.000đ');
  });

  it('bo qua dong giam gia va thue khi bang 0', () => {
    expect(text).not.toContain('Giam:');
    expect(text).not.toContain('Thue:');
  });
});

/**
 * Nhom nay ghim bai hoc dat nhat cua Task 10: su co dang lo nhat la MAT MANG,
 * ma canh bao ve mat mang thi lai phai gui qua mang. Khong co hang cho thi dung
 * luc can bao nhat la luc chac chan bao khong toi.
 */
describe('hang cho gui muon', () => {
  const T0 = Date.parse('2026-08-28T09:15:00Z');

  /** Ban gia fetch: bat/tat duoc "mang" giua chung. */
  function mang() {
    const trangThai = { song: true };
    const fetchImpl = vi.fn(async () => {
      if (!trangThai.song) throw new TypeError('fetch failed');
      return new Response('{}', { status: 200 });
    });
    return { trangThai, fetchImpl };
  }

  function notifier(fetchImpl: ReturnType<typeof mang>['fetchImpl'], now = () => T0) {
    return new TelegramNotifier({
      config: CONFIG,
      fetchImpl: fetchImpl as never,
      maxAttempts: 1,
      now,
      sleep: async () => {},
    });
  }

  it('gui hong thi giu lai, khong mat', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    expect(await tele.sendAlert('poll dung im')).toBe(false);
    expect(tele.soTinChoGui).toBe(1);
  });

  it('mang ve thi gui bu, kem gio phat sinh', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    await tele.sendAlert('mat mang luc 16:15');
    trangThai.song = true;

    expect(await tele.guiBu()).toBe(1);
    expect(tele.soTinChoGui).toBe(0);

    const body = JSON.parse((fetchImpl.mock.lastCall![1] as RequestInit).body as string);
    expect(body.text).toContain('gui muon');
    expect(body.text).toContain('mat mang luc 16:15');
  });

  it('van mat mang thi gui bu khong lam mat tin', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    await tele.sendAlert('mot');
    await tele.sendAlert('hai');

    expect(await tele.guiBu()).toBe(0);
    expect(tele.soTinChoGui).toBe(2);
  });

  it('gui bu theo dung thu tu phat sinh', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    await tele.sendAlert('mot');
    await tele.sendAlert('hai');
    await tele.sendAlert('ba');
    trangThai.song = true;

    expect(await tele.guiBu()).toBe(3);
    const daGui = fetchImpl.mock.calls
      .slice(-3)
      .map((call) => JSON.parse((call[1] as RequestInit).body as string).text as string);
    expect(daGui[0]).toContain('mot');
    expect(daGui[1]).toContain('hai');
    expect(daGui[2]).toContain('ba');
  });

  // Mat mang ca dem sinh ra hang tram canh bao. Gui bu ca tram tin luc 7h sang
  // thi khong ai doc — chi lam nguoi ta tat bot di.
  it('hang cho co tran, va giu tin CU nhat', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    for (let i = 0; i < 50; i += 1) await tele.sendAlert(`canh bao ${i}`);
    expect(tele.soTinChoGui).toBe(20);

    trangThai.song = true;
    await tele.guiBu();
    const daGui = fetchImpl.mock.calls
      .map((call) => JSON.parse((call[1] as RequestInit).body as string).text as string)
      .filter((text) => text.includes('canh bao'));
    // Tin dau tien la tin noi ro su co bat dau luc nao — phai con.
    expect(daGui[0]).toContain('canh bao 0');
    expect(daGui.at(-1)).toContain('canh bao 19');
  });

  it('noi that la da bo bot bao nhieu tin', async () => {
    const { trangThai, fetchImpl } = mang();
    const tele = notifier(fetchImpl);

    trangThai.song = false;
    for (let i = 0; i < 25; i += 1) await tele.sendAlert(`canh bao ${i}`);
    trangThai.song = true;
    await tele.guiBu();

    const tatCa = fetchImpl.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).text as string,
    );
    expect(tatCa.some((text) => text.includes('Da bo 5 canh bao'))).toBe(true);
  });

  it('khong cau hinh Telegram thi khong xep hang gi ca', async () => {
    const tele = new TelegramNotifier({ config: null });
    expect(await tele.sendAlert('gi do')).toBe(false);
    expect(tele.soTinChoGui).toBe(0);
  });
});
