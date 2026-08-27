import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CcmanyUploader } from '../src/core/uploader.js';
import type { CcmanyPayload } from '../src/core/types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'uploader-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const PAYLOAD: CcmanyPayload = {
  store_id: 'STORE1',
  store_name: 'Quan Test',
  order_number: '001500221566-C8D2VEDVCY5WSA',
  order_code: 'GF-547',
  created_at: '28/08/2026 - 11:24',
  customer: { name: 'Khach Test' },
  driver: { name: '', phone: '' },
  items: [
    { name: 'Sting Đỏ', quantity: 1, price: 26000, original_price: null, note: '', modifiers: [] },
  ],
  subtotal: 121000,
  discount: 0,
  tax: 0,
  total: 121000,
};

const ok = () => new Response('{}', { status: 200 });
const status = (code: number, body = 'loi') => () => new Response(body, { status: code });

function makeUploader(fetchImpl: ReturnType<typeof vi.fn>, dryRun = false) {
  return new CcmanyUploader({
    url: 'https://vi-du/api/orders',
    apiKey: 'KHOA',
    dryRun,
    dataDir: dir,
    fetchImpl: fetchImpl as never,
    sleep: async () => {}, // khong cho that trong test
  });
}

describe('gui thanh cong', () => {
  it('goi dung mot lan khi 2xx', async () => {
    const fetchImpl = vi.fn(ok);
    const result = await makeUploader(fetchImpl).upload(PAYLOAD);

    expect(result).toMatchObject({ ok: true, attempts: 1, dryRun: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gui dung header, method va than', async () => {
    const fetchImpl = vi.fn(ok);
    await makeUploader(fetchImpl).upload(PAYLOAD);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://vi-du/api/orders');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'KHOA',
    });
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
  });

  it('LUON co timeout — thieu no thi mot ket noi treo chan ca hang doi', async () => {
    const fetchImpl = vi.fn(ok);
    await makeUploader(fetchImpl).upload(PAYLOAD);

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('thu lai', () => {
  it('5xx -> thu du 3 lan roi bo cuoc', async () => {
    const fetchImpl = vi.fn(status(500));
    const result = await makeUploader(fetchImpl).upload(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.error).toContain('500');
  });

  it('loi mang -> thu lai, roi thanh cong o lan hai', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockImplementation(ok);

    const result = await makeUploader(fetchImpl).upload(PAYLOAD);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
  });

  it('timeout duoc coi la dang thu lai', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
    const result = await makeUploader(fetchImpl).upload(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('429 va 408 van thu lai', async () => {
    for (const code of [429, 408]) {
      const fetchImpl = vi.fn(status(code));
      await makeUploader(fetchImpl).upload(PAYLOAD);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    }
  });
});

describe('KHONG thu lai voi loi cua phia minh', () => {
  it.each([400, 401, 403, 404, 422])('%i -> dung ngay sau lan dau', async (code) => {
    // Payload sai hoac kho a sai thi thu them ba lan cung khong bao gio thanh
    // cong — chi ton 4,5 giay va lam ban log. Day la cho lam khac notiftest.
    const fetchImpl = vi.fn(status(code));
    const result = await makeUploader(fetchImpl).upload(PAYLOAD);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, attempts: 1, retryable: false });
  });
});

describe('che do chay kho', () => {
  it('KHONG goi mang lan nao', async () => {
    const fetchImpl = vi.fn(ok);
    const result = await makeUploader(fetchImpl, true).upload(PAYLOAD);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, dryRun: true, attempts: 0 });
  });

  it('ghi payload ra data/dry-run doc duoc', async () => {
    const result = await makeUploader(vi.fn(ok), true).upload(PAYLOAD);

    expect(existsSync(result.file!)).toBe(true);
    expect(JSON.parse(readFileSync(result.file!, 'utf8'))).toEqual(PAYLOAD);

    const files = readdirSync(join(dir, 'dry-run'));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('GF-547');
  });

  it('ma don co ky tu la khong lam hong ten file', async () => {
    const nasty = { ...PAYLOAD, order_code: '../../hiem' };
    const result = await makeUploader(vi.fn(ok), true).upload(nasty);
    expect(readdirSync(join(dir, 'dry-run'))).toHaveLength(1);
    expect(result.file).not.toContain('..');
  });
});
