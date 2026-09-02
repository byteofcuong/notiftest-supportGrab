import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rang buoc giua `app.js` va `index.html`.
 *
 * Giao dien la JavaScript thuan, khong bien dich, va du an co y khong keo jsdom
 * vao chi de test mot trang nho. Nhung co MOT lop loi o day van bat duoc bang
 * cach doc hai file nhu van ban, va no la lop loi de mac nhat:
 *
 *   go sai mot id  ->  `$('...')` tra ve null  ->  TypeError o dong dau tien
 *                      cua refresh()  ->  CA BANG DIEU KHIEN dung im, khong
 *                      mot dong nao duoc cap nhat, va khong co loi nao hien ra
 *                      cho nguoi dung thay
 *
 * Trieu chung ben ngoai chi la "bang dieu khien khong nhuc nhich" — rat de bi
 * doc nham thanh "app chet", trong khi poller van dang chay tot.
 *
 * Doi lai: moi id dung trong app.js PHAI co that trong index.html.
 */

const GOC = join(import.meta.dirname, '..', 'src', 'renderer');
const APP_JS = readFileSync(join(GOC, 'app.js'), 'utf8');
const HTML = readFileSync(join(GOC, 'index.html'), 'utf8');

/** Moi id duoc tra cuu qua `$('...')` hoac `getElementById('...')`. */
function idDuocDung(): string[] {
  const ra = new Set<string>();
  for (const m of APP_JS.matchAll(/\$\(\s*'([^']+)'\s*\)/g)) ra.add(m[1]!);
  for (const m of APP_JS.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) ra.add(m[1]!);
  // set('x', ...) cung la mot loi goi $('x') o ben trong.
  for (const m of APP_JS.matchAll(/\bset\(\s*'([^']+)'\s*,/g)) ra.add(m[1]!);
  return [...ra].sort();
}

/** Moi id khai bao trong HTML. */
function idCoTrongHtml(): Set<string> {
  const ra = new Set<string>();
  for (const m of HTML.matchAll(/\bid="([^"]+)"/g)) ra.add(m[1]!);
  return ra;
}

describe('giao dien: id giua app.js va index.html', () => {
  it('doc duoc ca hai file va tim thay id de kiem', () => {
    // Chot chong test rong: neu regex hong thi nhung test duoi se xanh gia.
    expect(idDuocDung().length).toBeGreaterThan(10);
    expect(idCoTrongHtml().size).toBeGreaterThan(10);
  });

  it('moi id app.js dung deu co that trong index.html', () => {
    const co = idCoTrongHtml();
    const thieu = idDuocDung().filter((id) => !co.has(id));
    expect(thieu, `id khong co trong index.html: ${thieu.join(', ')}`).toEqual([]);
  });

  /**
   * Nut nao cung phai co nguoi nghe. Mot cai nut bam vao khong lam gi con te
   * hon khong co nut: nguoi dung bam vai lan roi ket luan la app hong.
   */
  it('moi nut trong index.html deu co addEventListener', () => {
    const nut = [...HTML.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(nut.length).toBeGreaterThan(5);
    const khongNghe = nut.filter(
      (id) => !APP_JS.includes(`$('${id}').addEventListener`),
    );
    expect(khongNghe, `nut khong co nguoi nghe: ${khongNghe.join(', ')}`).toEqual([]);
  });

  /**
   * Moi ham `window.api.*` giao dien goi deu phai duoc preload bay ra. Goi mot
   * ham khong ton tai la TypeError, va no giet luon phan con lai cua ham dang
   * chay — vd bam "Lay danh sach quan" khong ra gi va cung khong bao loi.
   */
  it('moi window.api.* deu co trong preload', () => {
    const preload = readFileSync(join(GOC, '..', 'main', 'preload.ts'), 'utf8');
    const goi = new Set([...APP_JS.matchAll(/window\.api\.(\w+)/g)].map((m) => m[1]!));
    expect(goi.size).toBeGreaterThan(5);
    const thieu = [...goi].filter((ten) => !new RegExp(`\\b${ten}\\s*:`).test(preload));
    expect(thieu, `preload thieu: ${thieu.join(', ')}`).toEqual([]);
  });

  /**
   * Nguoc lai: preload bay ra ham ma khong ai goi thi la ma chet — thuong la
   * tan du sau mot lan doi giao dien, va no danh lua nguoi doc sau.
   */
  it('khong con ham preload nao bi bo quen', () => {
    const preload = readFileSync(join(GOC, '..', 'main', 'preload.ts'), 'utf8');
    const khoi = preload.slice(preload.indexOf('exposeInMainWorld'));
    const bayRa = [...khoi.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]!);
    expect(bayRa.length).toBeGreaterThan(5);
    const khongDung = bayRa.filter((ten) => !APP_JS.includes(`window.api.${ten}`));
    expect(khongDung, `preload bay ra nhung khong ai goi: ${khongDung.join(', ')}`).toEqual([]);
  });
});
