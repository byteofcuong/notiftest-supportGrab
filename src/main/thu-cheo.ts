/**
 * Tra loi cau hoi §7.1 cua spec van hanh — mon no tu ngay dau du an.
 *
 *   Mot cua so Grab dang mo trang quan A, goi API kem header merchantID cua
 *   quan B thi Grab co chap nhan khong?
 *
 * Ke hoach tam cho la CO, va cau tra loi do quyet dinh kien truc nhieu quan:
 *
 *   CO    -> mot cua so phuc vu tat ca. Moi quan mot poller, dung chung
 *            GrabClient. Nhe, don gian.
 *   KHONG -> moi quan mot BrowserWindow an, dung chung phien `persist:grab`.
 *            Ton them RAM moi quan, va phai canh N cua so thay vi mot.
 *
 * Doan thi ra doan sai. Nen bat bang DEV_THU_CHEO=true, bam sang mot quan khac
 * trong cua so Grab, roi doc ket luan trong nhat ky.
 *
 * KHONG BAO GIO bat cai nay tren may quan: no goi them API trong luc dang chay
 * that, va ket qua chi co y nghia luc dang khao sat.
 */

import type { Logger } from '../core/log.js';
import { SessionExpiredError } from '../grab/client.js';
import type { GrabClient } from '../grab/client.js';

export type KetCuc = 'ok' | 'mat-phien' | 'loi';

export interface KetQuaThuCheo {
  /** Quan ma cua so Grab dang mo. */
  quanTrenManHinh: string;
  /** Quan ma ta goi API toi — khac quan tren man hinh. Do la ca phep thu. */
  quanGoiApi: string;
  openStatus: KetCuc;
  listPreparing: KetCuc;
  soDon: number | null;
  loi: string | null;
}

/**
 * Ca hai loi goi deu OK thi ket luan la lam duoc. Chi can MOT cai truot la
 * khong duoc — nua voi o day con te hon la khong duoc, vi no nghia la co quan
 * chay duoc co quan khong, tuy luc.
 */
export function lamDuocKhong(kq: KetQuaThuCheo): boolean {
  return kq.openStatus === 'ok' && kq.listPreparing === 'ok';
}

/** Cau ket luan cho vao nhat ky, viet de nguoi doc khong can mo file nay ra. */
export function dienGiai(kq: KetQuaThuCheo): string {
  if (lamDuocKhong(kq)) {
    return (
      'LAM DUOC: mot cua so Grab goi duoc API cua quan khac. ' +
      'Nhieu quan chi can MOT cua so, moi quan mot poller.'
    );
  }
  if (kq.openStatus === 'mat-phien' || kq.listPreparing === 'mat-phien') {
    return (
      'KHONG DUOC: Grab tu choi (mat phien) khi goi bang ma quan khac voi quan ' +
      'dang mo. Nhieu quan phai MOI QUAN MOT CUA SO an, dung chung phien.'
    );
  }
  return (
    'CHUA KET LUAN DUOC: loi khong phai tu choi phien. Xem lai mang hoac ma quan ' +
    `roi thu lai. Loi: ${kq.loi ?? 'khong ro'}`
  );
}

function xepLoai(err: unknown): KetCuc {
  return err instanceof SessionExpiredError ? 'mat-phien' : 'loi';
}

/**
 * Goi hai API that su duoc dung trong vong lap poll, bang ma quan KHONG phai
 * quan dang mo tren man hinh.
 *
 * Goi ca hai chu khong chi mot: `open-status` va `orders-pagination` nam o hai
 * dich vu khac nhau cua Grab (`/food/merchant/` va `/delvplatformapi/`), hoan
 * toan co the mot cai cho qua ma cai kia chan.
 */
export async function thuGoiCheoQuan(
  client: GrabClient,
  quanTrenManHinh: string,
  quanGoiApi: string,
): Promise<KetQuaThuCheo> {
  const kq: KetQuaThuCheo = {
    quanTrenManHinh,
    quanGoiApi,
    openStatus: 'loi',
    listPreparing: 'loi',
    soDon: null,
    loi: null,
  };

  try {
    await client.openStatus(quanGoiApi);
    kq.openStatus = 'ok';
  } catch (err) {
    kq.openStatus = xepLoai(err);
    kq.loi = (err as Error).message;
  }

  try {
    const ds = await client.listPreparing(quanGoiApi);
    kq.listPreparing = 'ok';
    kq.soDon = ds.orders?.length ?? 0;
  } catch (err) {
    kq.listPreparing = xepLoai(err);
    kq.loi ??= (err as Error).message;
  }

  return kq;
}

/**
 * Doc hinh dang phan hoi cua endpoint danh sach quan.
 *
 * Chua co fixture nen chua biet ten truong. Thay vi doan, in ra khoa cap mot va
 * mot ban ghi mau — du de khai bao kieu cho dung o buoc sau, va du de biet
 * endpoint co that su tra ve du 14 quan hay khong.
 */
export function moTaDanhSachQuan(phanHoi: unknown): Record<string, unknown> {
  if (phanHoi === null || typeof phanHoi !== 'object') {
    return { kieu: typeof phanHoi };
  }
  const gocKhoa = Object.keys(phanHoi as Record<string, unknown>);
  // Mang quan co the nam ngay goc, hoac long trong mot khoa nao do.
  for (const khoa of gocKhoa) {
    const gt = (phanHoi as Record<string, unknown>)[khoa];
    if (Array.isArray(gt)) {
      return {
        khoaCapMot: gocKhoa,
        mangNamO: khoa,
        soQuan: gt.length,
        khoaCuaMotQuan: gt.length > 0 && typeof gt[0] === 'object' && gt[0] !== null
          ? Object.keys(gt[0] as Record<string, unknown>)
          : [],
      };
    }
  }
  return { khoaCapMot: gocKhoa, mangNamO: null };
}

/** Chay phep thu roi ghi ket luan that to trong nhat ky. */
export async function chayVaGhiKetLuan(
  client: GrabClient,
  quanTrenManHinh: string,
  quanGoiApi: string,
  logger: Logger,
): Promise<KetQuaThuCheo> {
  logger.warn('=== THU GOI CHEO QUAN (DEV_THU_CHEO) ===', {
    cuaSoDangMo: quanTrenManHinh,
    goiApiBang: quanGoiApi,
  });
  const kq = await thuGoiCheoQuan(client, quanTrenManHinh, quanGoiApi);
  logger.warn('Ket qua thu cheo quan', kq);
  logger.warn(`=== ${dienGiai(kq)} ===`);

  // Tien the do luon endpoint danh sach quan: du §7.1 tra loi the nao thi cung
  // can no de biet nhom co nhung quan gi, va de lay TEN THAT thay cho ma quan.
  try {
    const ds = await client.danhSachQuanTrongNhom(quanTrenManHinh);
    logger.warn('=== DANH SACH QUAN TRONG NHOM ===', moTaDanhSachQuan(ds));
  } catch (err) {
    logger.warn('Khong doc duoc danh sach quan trong nhom', err);
  }

  return kq;
}
