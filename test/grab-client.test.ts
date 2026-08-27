import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GrabApiError, GrabClient, SessionExpiredError } from '../src/grab/client.js';

const MEX = '5-C7XUNYEVEADYN2';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** Ban gia cua WebContents: tra ve ket qua da dinh, va giu lai script da chay. */
function runner(result: unknown) {
  const executeJavaScript = vi.fn().mockResolvedValue(result);
  return { runner: { executeJavaScript }, executeJavaScript };
}

function clientWith(result: unknown) {
  const { runner: r, executeJavaScript } = runner(result);
  const client = new GrabClient({ getRunner: () => r });
  return { client, executeJavaScript };
}

const okResult = (body: string) => ({ status: 200, ok: true, body });

// ── RANH GIOI CUNG: chi duoc GET ─────────────────────────────────────────────

describe('ranh gioi cung — chi GET, khong bao gio cham /orders/mark', () => {
  const source = readFileSync(new URL('../src/grab/client.ts', import.meta.url), 'utf8');
  // Bo phan chu thich dau file, vi o do co NHAC den /orders/mark de giai thich.
  const code = source.slice(source.indexOf('*/') + 2);

  it('khong he nhac toi endpoint mark trong phan code', () => {
    // Goi endpoint nay se xoa dau "chua doc" cua nhan vien tren web Grab —
    // ho se tuong don da duoc xu ly. Day la rui ro "chi doc" nghiem trong nhat.
    expect(code).not.toMatch(/orders\/mark/);
  });

  it('khong co method nao khac GET', () => {
    const methods = [...code.matchAll(/method:\s*'([A-Z]+)'/g)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0); // chac chan co bat gap
    expect(new Set(methods)).toEqual(new Set(['GET']));
  });

  it('khong dung tu khoa cua cac dong ghi', () => {
    for (const forbidden of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      expect(code).not.toContain(`'${forbidden}'`);
    }
  });
});

// ── Dung URL va header ───────────────────────────────────────────────────────

describe('dung URL, header, va credentials', () => {
  it('danh sach don goi dung endpoint PreparingV2', async () => {
    const { client, executeJavaScript } = clientWith(okResult(fixture('list-gf547.json')));
    await client.listPreparing(MEX);

    const script = executeJavaScript.mock.calls[0]![0] as string;
    expect(script).toContain('/delvplatformapi/merchant/v4/orders-pagination');
    expect(script).toContain('PageType=PreparingV2');
    expect(script).toContain(`merchantID=${MEX}`);
  });

  it('chi tiet don goi dung endpoint v3/orders', async () => {
    const { client, executeJavaScript } = clientWith(okResult(fixture('detail-gf547.json')));
    await client.orderDetail(MEX, '001500221566-C8D2VEDVCY5WSA');

    const script = executeJavaScript.mock.calls[0]![0] as string;
    expect(script).toContain('/food/merchant/v3/orders/001500221566-C8D2VEDVCY5WSA');
  });

  it("LUON co credentials: 'include' — cookie la toan bo xac thuc", async () => {
    const { client, executeJavaScript } = clientWith(okResult(fixture('open-status.json')));
    await client.openStatus(MEX);

    expect(executeJavaScript.mock.calls[0]![0]).toContain("credentials: 'include'");
  });

  it('gui du sau header tinh', async () => {
    const { client, executeJavaScript } = clientWith(okResult(fixture('open-status.json')));
    await client.openStatus(MEX);

    const script = executeJavaScript.mock.calls[0]![0] as string;
    for (const header of [
      'Accept',
      'Accept-Language',
      'merchantID',
      'requestSource',
      'x-client-id',
      'x-grabkit-clientid',
    ]) {
      expect(script).toContain(header);
    }
    expect(script).toContain('troyPortal');
    expect(script).toContain('GrabMerchant-Portal');
  });

  it('ma don co ky tu la duoc ma hoa vao URL', async () => {
    const { client, executeJavaScript } = clientWith(okResult('{}'));
    await client.orderDetail(MEX, 'a b/c?d');

    const script = executeJavaScript.mock.calls[0]![0] as string;
    expect(script).toContain('a%20b%2Fc%3Fd');
  });
});

// ── Doc du lieu that ─────────────────────────────────────────────────────────

describe('doc duoc response that cua Grab', () => {
  it('danh sach tra ve don kem pollInterval', async () => {
    const { client } = clientWith(okResult(fixture('list-gf547.json')));
    const result = await client.listPreparing(MEX);

    expect(result.orders).toHaveLength(1);
    expect(result.orders![0]!.displayID).toBe('GF-547');
    expect(result.pollInterval).toBe(60);
  });

  it('danh sach rong van doc duoc', async () => {
    const { client } = clientWith(okResult(fixture('list-empty.json')));
    const result = await client.listPreparing(MEX);

    expect(result.orders ?? []).toHaveLength(0);
    expect(result.pollInterval).toBe(300);
  });

  it('chi tiet don doc duoc', async () => {
    const { client } = clientWith(okResult(fixture('detail-gf547.json')));
    const result = await client.orderDetail(MEX, 'x');

    expect(result.order!.displayID).toBe('GF-547');
    expect(result.order!.fare!.totalDisplay).toBe('121.000');
  });

  it('open-status doc duoc', async () => {
    const { client } = clientWith(okResult(fixture('open-status.json')));
    expect((await client.openStatus(MEX)).isOpen).toBe(true);
  });
});

// ── Mat phien ────────────────────────────────────────────────────────────────

describe('nhan biet mat phien', () => {
  it.each([401, 403])('%i -> SessionExpiredError', async (status) => {
    const { client } = clientWith({ status, ok: false, body: 'unauthorized' });
    await expect(client.openStatus(MEX)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('isSessionAlive tra false thay vi nem', async () => {
    const { client } = clientWith({ status: 401, ok: false, body: '' });
    await expect(client.isSessionAlive(MEX)).resolves.toBe(false);
  });

  it('isSessionAlive tra true khi goi duoc', async () => {
    const { client } = clientWith(okResult(fixture('open-status.json')));
    await expect(client.isSessionAlive(MEX)).resolves.toBe(true);
  });
});

// ── Cac loi khac ─────────────────────────────────────────────────────────────

describe('loi khac', () => {
  it('5xx -> GrabApiError kem ma', async () => {
    const { client } = clientWith({ status: 500, ok: false, body: 'oops' });
    await expect(client.openStatus(MEX)).rejects.toMatchObject({
      name: 'GrabApiError',
      status: 500,
    });
  });

  it('loi mang trong trang -> GrabApiError', async () => {
    const { client } = clientWith({ status: 0, ok: false, error: 'Failed to fetch' });
    await expect(client.openStatus(MEX)).rejects.toThrowError(/Failed to fetch/);
  });

  it('tra ve thu khong phai JSON -> GrabApiError', async () => {
    const { client } = clientWith(okResult('<html>trang dang nhap</html>'));
    await expect(client.openStatus(MEX)).rejects.toThrowError(/khong phai JSON/);
  });

  it('cua so Grab chua san sang -> bao ro chu khong sap', async () => {
    const client = new GrabClient({ getRunner: () => null });
    await expect(client.openStatus(MEX)).rejects.toThrowError(/chua san sang/);
  });
});

// ── Timeout ──────────────────────────────────────────────────────────────────

describe('timeout', () => {
  it('fetch treo trong trang KHONG duoc treo vong lap poll', async () => {
    // executeJavaScript khong co timeout san. Thieu chot nay thi mot fetch treo
    // se lam dung ca cong cu — im lang, khong loi. Dung bai hoc cua notiftest.
    const client = new GrabClient({
      getRunner: () => ({ executeJavaScript: () => new Promise(() => {}) }),
      timeoutMs: 50,
    });
    await expect(client.openStatus(MEX)).rejects.toThrowError(/khong thay tra loi/);
  });
});
