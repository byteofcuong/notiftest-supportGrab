/**
 * Doc tien VND tu cac truong `*Display` cua API Grab.
 *
 * Grab dung "." lam dau phan nhom nghin va KHONG kem hau to don vi:
 * "121.000" -> 121000, "5.000" -> 5000, "0" -> 0.
 *
 * Co y NGHIEM NGAT: chi chap nhan dau phan nhom la "." va nhom dung 3 chu so.
 * Neu mot ngay nao do Grab doi sang "121,000" thi ham nay tra ve null, mapper
 * nem loi va don do di vao hang doi loi kem JSON tho — thay vi doan bua roi gui
 * sai tien len ccmany. Hong to con hon sai am tham.
 *
 * (Khac Money.kt cua notiftest: ben Green SM doc chu tren man hinh nen luon co
 * hau to "d"; ben nay doc JSON nen khong co. Van cho phep hau to "d" vi no
 * khong gay nhap nhang gi, phong khi doc lai chuoi da dinh dang.)
 */

// -?  (123.456.789  |  123456789)  d?
const MONEY_PATTERN = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)đ?$/;

/** Tra ve so dong, hoac null neu chuoi khong phai tien hop le. */
export function parseVnd(text: string | null | undefined): number | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === '' || !MONEY_PATTERN.test(trimmed)) return null;

  const negative = trimmed.startsWith('-');
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/**
 * Nhu [parseVnd] nhung nem loi thay vi tra null — dung cho nhung truong bat
 * buoc phai doc duoc (gia mon, tong tien), noi ma "khong doc duoc" nghia la
 * khong the gui don di.
 */
export function parseVndOrThrow(text: string | null | undefined, field: string): number {
  const value = parseVnd(text);
  if (value === null) {
    throw new Error(`Khong doc duoc tien o truong "${field}": ${JSON.stringify(text)}`);
  }
  return value;
}

/** 121000 -> "121.000d". Chi dung de hien thi (log, Telegram). */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const grouped = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped}đ`;
}
