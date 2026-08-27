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
    expect(text).toContain('• option3 (+4.000đ)');
    expect(text).toContain('• option2 (+3.000đ)');
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
