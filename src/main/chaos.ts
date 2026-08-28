/**
 * Kich ban pha hoai co chu dich, de kiem chung kha nang tu phuc hoi.
 *
 * Vi sao can:
 *
 * Cach duy nhat truoc day de thu "mat mang roi co tu vao lai khong" la rut day
 * mang that roi ngoi doi. Da lam hai lan, moi lan mat gan mot tieng, va ca hai
 * lan deu ket luan sai — vi mat mang that thi khong dieu khien duoc thoi diem,
 * khong lap lai duoc, va nguoi thu bo cuoc truoc khi app kip phuc hoi.
 *
 * Kich ban nay chay het trong khoang 4 phut va doc thang tu nhat ky.
 *
 * ═══ GIOI HAN ═══
 * Chi cat mang cua Chromium. `fetch` tu Node (ccmany, Telegram) VAN CHAY, nen
 * kich ban nay KHONG kiem chung duoc hang cho gui bu cua Telegram — phan do
 * kiem bang unit test.
 *
 * Chi chay khi `DEV_CHAOS=true`. Tuyet doi khong bat tren may quan.
 */

import type { Logger } from '../core/log.js';
import type { GrabWindow } from './grab-window.js';

/** Cho app on dinh truoc khi pha. */
const CHO_ON_DINH_MS = 15_000;
/**
 * Ngat mang bao lau.
 *
 * CO Y dai hon nguong watchdog (3 phut), de dung lai DUNG canh da gap that:
 * watchdog het kien nhan -> tai lai trang -> tai that bai vi khong co mang ->
 * trang bien thanh trang loi trang tron cua Chromium. Do moi la trang thai kho,
 * vi tu do tro di `fetch` khong bao gio thanh cong nua ke ca khi mang da ve.
 *
 * Ngat ngan hon 3 phut thi trang van con nguyen, poll ke tiep tu chay lai —
 * phep thu xanh ma khong chung minh duoc gi.
 */
const NGAT_MANG_MS = 200_000;

export interface ChaosDeps {
  grabWindow: GrabWindow;
  logger: Logger;
}

export function chayKichBanPhaHoai(deps: ChaosDeps): void {
  const { grabWindow, logger } = deps;

  logger.warn('═══ DEV_CHAOS dang bat — se chu dong ngat mang de thu tu phuc hoi ═══');
  logger.warn(
    `Kich ban: cho ${CHO_ON_DINH_MS / 1000}s -> ngat mang ${NGAT_MANG_MS / 1000}s -> noi lai`,
  );
  // CO Y khong viet ra day chuoi danh dau ma nguoi doc dang tim. Lan truoc co
  // viet, va vong cho tu dong khop trung vao chinh dong ky vong nay chu khong
  // phai vao su kien that — phep thu bao xanh trong khi chua co gi xay ra.
  logger.warn('Ky vong: sau khi noi lai, poll phai chay lai trong vong 35 giay');

  setTimeout(() => {
    void grabWindow.gioLapMatMang(true);

    setTimeout(() => {
      void grabWindow.gioLapMatMang(false);
      logger.warn('GIA LAP: bat dau dem thoi gian phuc hoi tu day');
    }, NGAT_MANG_MS);
  }, CHO_ON_DINH_MS);
}
