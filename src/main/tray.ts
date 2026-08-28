/**
 * Bieu tuong o khay he thong.
 *
 * May quan chay cong cu nay ca ngay, va nhan vien con phai dung man hinh do cho
 * viec khac. Neu dong bang dieu khien la thoat app thi som muon cung co nguoi
 * dong nham roi den toi ca buoi khong ai biet. Nen: dong = thu xuong khay, va
 * chi thoat khi bam dung muc "Thoat" o day.
 *
 * Mau cham o khay chinh la den trang thai — xanh dang theo doi, vang dang thu
 * lai, do mat phien. Nhin luot qua thanh tac vu la biet, khong can mo gi.
 */

import { Menu, Tray, nativeImage } from 'electron';
import type { PollerState } from '../core/poller.js';

/**
 * Ba cham mau 32x32, nhung thang trong ma nguon.
 *
 * Nhung nen file anh vao thay vi doc tu dia: khi dong goi thanh .exe thi
 * __dirname nam trong asar, va duong dan tuong doi toi assets/ la mot cho rat
 * de hong ma chi phat hien ra sau khi da cai len may quan.
 */
const CHAM: Record<'xanh' | 'vang' | 'do', string> = {
  xanh:
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAqElEQVR42u2XvRHAIAiFGYRFnILKJe1YgrVMY4rk1ItRgcLidXLvu5NfACYw1WAAAlMEptRQLG+WAwRgEmDKHyUlZhoAB41rIPgXIE4YvxVHAVaa9yGUzNsQlT/Pm4U9AFEAkBZAUDC/FWoAogggbwBUNH/mgkLm9yuiACQDgHQADoArAPMyNG9E5q3YxTAyH8cuFhLzlczFUupiLXdxmLg4zdwcp9t0AVhIrE8hi4OgAAAAAElFTkSuQmCC',
  vang:
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAqElEQVR42u2XzQ3AIAiFGYRFHIQdiYMwB5vYS3too6ZWBQ49vJvkfYn8gjKAp0YDUBlIGXJDdL5ZDpCUQZShvJScMdMAOGhcA8GvADRh/BSNAqw070JYmTchan9eNgt7AGIAIC2AZGB+KdUAxBBAngBoaH7LBYvM71bEBZAdAPIP8AOEAnAvQ/dG5N6KQwwj93EcYiFxX8lCLKUh1vIQh0mI0yzMcbpNByWvzG1YOkajAAAAAElFTkSuQmCC',
  do:
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAqklEQVR42u2XuQ3AIAxFGcSLULrwCCzJIB7B65AmFEGAQg7bBcXvsP6T8BmEMFhqNQCEMAlhHiidbz4HiELIQlhuis+Y1wCwaNwDgacA6YVxq7QK8KX5FELLfAjR+/Pys2AGwAoAPAKICuZVsQfAigDcAoCi+SUXNDJ/WhEVIBsA5A2wAVwBmJeheSMyb8UuhpH5OHaxkJivZC6WUhdruYvDxMVp5uY4/U0HTmwcbXGMLRkAAAAASUVORK5CYII=',
};

export type MauDen = keyof typeof CHAM;

export interface TrayOptions {
  moBangDieuKhien: () => void;
  moTrangGrab: () => void;
  xemNhatKy: () => void;
  batTatTheoDoi: () => void;
  thoat: () => void;
}

export class AppTray {
  private tray: Tray | null = null;
  private mauHienTai: MauDen | null = null;
  private dangTheoDoi = false;

  constructor(private readonly options: TrayOptions) {}

  start(): void {
    this.tray = new Tray(anh('vang'));
    this.tray.setToolTip('Theo doi don Grab');
    this.veMenu();
    // Bam doi vao bieu tuong la mo bang dieu khien — thoi quen cua Windows.
    this.tray.on('double-click', () => this.options.moBangDieuKhien());
  }

  /** Goi moi lan trang thai doi. Chi ve lai khi thuc su khac, khong nhap nhay. */
  capNhat(state: PollerState | null, matPhien: boolean): void {
    if (!this.tray) return;

    const dangTheoDoi = state === 'dang-chay';
    const mau: MauDen =
      matPhien || state === 'mat-phien' ? 'do' : dangTheoDoi ? 'xanh' : 'vang';

    if (mau !== this.mauHienTai) {
      this.tray.setImage(anh(mau));
      this.mauHienTai = mau;
    }
    this.tray.setToolTip(`Theo doi don Grab — ${nhan(state, matPhien)}`);

    if (dangTheoDoi !== this.dangTheoDoi) {
      this.dangTheoDoi = dangTheoDoi;
      this.veMenu();
    }
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private veMenu(): void {
    this.tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Bảng điều khiển', click: this.options.moBangDieuKhien },
        { label: 'Mở trang Grab / Đăng nhập', click: this.options.moTrangGrab },
        { label: 'Xem nhật ký', click: this.options.xemNhatKy },
        { type: 'separator' },
        {
          label: this.dangTheoDoi ? 'Tạm dừng theo dõi' : 'Tiếp tục theo dõi',
          click: this.options.batTatTheoDoi,
        },
        { type: 'separator' },
        { label: 'Thoát', click: this.options.thoat },
      ]),
    );
  }
}

function anh(mau: MauDen): Electron.NativeImage {
  return nativeImage.createFromDataURL(`data:image/png;base64,${CHAM[mau]}`);
}

function nhan(state: PollerState | null, matPhien: boolean): string {
  if (matPhien || state === 'mat-phien') return 'MẤT PHIÊN, cần đăng nhập lại';
  if (state === 'dang-chay') return 'đang theo dõi';
  if (state === 'loi') return 'đang thử lại';
  return 'chưa theo dõi';
}
