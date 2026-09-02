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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Logger } from '../core/log.js';
import { quanCoTheChon } from '../grab/quan.js';
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
 * Ghi nguyen van phan hoi danh sach quan ra `data/raw/store-search.json`.
 *
 * Vi sao can: fixture `test/fixtures/store-search.json` hien la HANG VIET TAY
 * theo hinh dang do duoc (docs/spec-van-hanh.md §7.1b), KHONG phai ban chup —
 * nhat ky chua phan hoi that da bi xoay mat truoc khi kip cat ra. Lan chay co
 * phien Grab tiep theo se de lai ban that o day de thay vao, sau khi doi ten
 * quan sang ten gia nhu cac fixture khac.
 *
 * Ten va dia chi quan la du lieu KINH DOANH chu khong phai du lieu khach,
 * nhung `data/` van nam trong gitignore nen no khong tu leo len remote.
 */
function luuDanhSachQuanTho(phanHoi: unknown, thuMucDuLieu: string, logger: Logger): void {
  try {
    const dir = join(thuMucDuLieu, 'raw');
    mkdirSync(dir, { recursive: true });
    const tep = join(dir, 'store-search.json');
    writeFileSync(tep, JSON.stringify(phanHoi, null, 2), 'utf8');
    logger.warn(`Da luu phan hoi tho de lam fixture: ${tep}`);
  } catch (err) {
    // Mat ban chup thi chi thiet cho viec lam fixture. Phep thu §7.1 van co gia
    // tri, nen khong de loi ghi dia lam hong ket luan.
    logger.warn('Khong luu duoc phan hoi danh sach quan', err);
  }
}

/** Chay phep thu roi ghi ket luan that to trong nhat ky. */
export async function chayVaGhiKetLuan(
  client: GrabClient,
  quanTrenManHinh: string,
  quanGoiApi: string,
  logger: Logger,
  /** Goc `data/` de luu phan hoi tho. null thi bo qua viec luu. */
  thuMucDuLieu: string | null = null,
): Promise<KetQuaThuCheo> {
  logger.warn('=== THU GOI CHEO QUAN (DEV_THU_CHEO) ===', {
    cuaSoDangMo: quanTrenManHinh,
    goiApiBang: quanGoiApi,
  });
  const kq = await thuGoiCheoQuan(client, quanTrenManHinh, quanGoiApi);
  logger.warn('Ket qua thu cheo quan', kq);
  logger.warn(`=== ${dienGiai(kq)} ===`);

  // Tien the do luon endpoint danh sach quan: §7.1 da tra loi xong, nhung van
  // can no de biet nhom co nhung quan gi va de lay TEN THAT thay cho ma quan.
  try {
    const ds = await client.danhSachQuanTrongNhom(quanTrenManHinh);
    if (thuMucDuLieu !== null) luuDanhSachQuanTho(ds, thuMucDuLieu, logger);
    const quan = quanCoTheChon(ds);
    logger.warn(`=== DANH SACH QUAN TRONG NHOM: ${quan.length} quan ===`, {
      dangHoatDong: quan.filter((q) => q.dangHoatDong).length,
      quan: quan.map(
        (q) => `${q.merchantID} ${q.tenHienThi}${q.dangHoatDong ? '' : ` [${q.status ?? '?'}]`}`,
      ),
    });
  } catch (err) {
    logger.warn('Khong doc duoc danh sach quan trong nhom', err);
  }

  return kq;
}
