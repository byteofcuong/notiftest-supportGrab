// Giao dien dieu khien. JavaScript thuan, khong bien dich — day la mot trang
// nho, them mot buoc build cho no chi lam cham vong lap sua-thu.
//
// Nguoi doc trang nay la nhan vien quan, khong phai lap trinh vien: moi dong
// phai tra loi duoc mot cau hoi cu the, va cau quan trong nhat — "no dang chay
// dung khong" — phai tra loi duoc chi bang mau cua cham trang thai.

const $ = (id) => document.getElementById(id);

function set(id, text) {
  $(id).textContent = text;
}

function tien(so) {
  return so === null || so === undefined ? '—' : `${so.toLocaleString('vi-VN')}đ`;
}

function gio(iso) {
  return iso ? new Date(iso).toLocaleTimeString('vi-VN') : '—';
}

async function refresh() {
  let status;
  try {
    status = await window.api.getStatus();
  } catch {
    set('trangthai', 'không lấy được trạng thái');
    $('den').className = 'den do';
    return;
  }

  capNhatDen(status);
  capNhatChonQuan(status);

  set(
    'quan',
    status.merchantID ? `${status.storeName} · ${status.merchantID}` : 'chưa chọn quán',
  );
  set('chedo', status.dryRun ? `CHẠY KHÔ — ${status.dryRunReason}` : 'GỬI THẬT lên ccmany');
  set(
    'telegram',
    !status.telegramEnabled
      ? 'chưa cấu hình'
      : status.telegramChoGui > 0
        ? `đã bật · ${status.telegramChoGui} tin đang chờ gửi bù`
        : 'đã bật',
  );

  const poller = status.poller;
  set('donhomnay', poller ? String(poller.soDonHomNay) : '—');
  set(
    'donganhat',
    poller?.donGanNhat
      ? `${poller.donGanNhat.orderCode} · ${tien(poller.donGanNhat.total)} · ${gio(poller.donGanNhat.at)}`
      : 'chưa có',
  );

  $('btn-dung').textContent =
    poller?.state === 'dung' ? 'Tiếp tục theo dõi' : 'Tạm dừng theo dõi';

  set('kiemtra', status.lastProbe ? gio(status.lastProbe.at) : 'chưa kiểm tra');
  set('benbi', motaBenBi(status.resilience));
  set('url', status.grabUrl ?? '—');
  set('ua', status.userAgent);
  set('phien', status.partitionPath);

  const box = $('canhbao');
  box.innerHTML = '';
  const canhbao = [...status.warnings];
  if (poller?.lastError) canhbao.push(`Lỗi gần nhất: ${poller.lastError}`);
  for (const text of canhbao) {
    const div = document.createElement('div');
    div.className = 'canhbao';
    div.textContent = `⚠ ${text}`;
    box.appendChild(div);
  }
}

/**
 * Khung "chưa chọn quán" chỉ hiện ở lần chạy đầu, và tự biến mất khi đã chọn.
 *
 * Mã quán đọc thẳng từ URL của tab Grab — chỗ người dùng vốn đã bấm vào. Bỏ
 * được khâu gõ tay một chuỗi 16 ký tự, vốn là chỗ sai nhiều nhất khi cài.
 */
function capNhatChonQuan(status) {
  // Ban dev khong go duoc (thu muc "app" chinh la node_modules/electron/dist),
  // nen an han cai nut di thay vi de no bao loi khi bam.
  $('khu-go').hidden = !status.daCaiDat;

  const khung = $('chuachon');
  khung.hidden = Boolean(status.merchantID);
  if (khung.hidden) return;

  const ma = status.maQuanPhatHien;
  set('maquan', ma ?? 'chưa có — hãy mở Grab và bấm vào quán');
  $('btn-dung-quan').disabled = !ma;
  $('btn-dung-quan').textContent = ma ? `Dùng quán ${ma}` : 'Dùng quán này';
}

/**
 * Trang thai lay tu KET QUA GOI API THAT, khong suy tu URL: Grab tai trang xong
 * roi moi chuyen huong sang trang dang nhap, nen co mot khoang URL van tro nhu
 * binh thuong du da mat phien.
 */
function capNhatDen(status) {
  const poller = status.poller;
  const probe = status.lastProbe;

  if (!status.merchantID) {
    $('den').className = 'den vang';
    set('trangthai', 'Chưa chọn quán — xem khung phía trên');
    return;
  }
  if (poller?.state === 'mat-phien') {
    $('den').className = 'den do';
    set('trangthai', 'MẤT PHIÊN — bấm "Mở trang Grab" để đăng nhập lại');
    return;
  }
  if (poller?.state === 'dang-chay') {
    $('den').className = 'den xanh';
    const quan = poller.quanDangMo === false ? 'quán đóng cửa' : 'quán đang mở';
    set('trangthai', `Đang theo dõi · ${quan} · poll lúc ${gio(poller.lastPollAt)}`);
    return;
  }
  if (poller?.state === 'loi') {
    $('den').className = 'den vang';
    set('trangthai', `Đang thử lại — ${poller.lastError ?? 'lỗi'}`);
    return;
  }
  if (!probe) {
    $('den').className = 'den vang';
    set('trangthai', 'chưa kiểm tra kết nối');
    return;
  }
  $('den').className = probe.ok ? 'den vang' : 'den do';
  if (probe.ok) {
    set('trangthai', 'Phiên sống nhưng chưa theo dõi — bấm "Kiểm tra kết nối Grab"');
  } else if (probe.matPhien) {
    set('trangthai', 'MẤT PHIÊN — bấm "Mở trang Grab" để đăng nhập lại');
  } else {
    set('trangthai', `Lỗi: ${probe.error}`);
  }
}

$('btn-mo').addEventListener('click', async () => {
  await window.api.showGrabWindow();
  // Doi mot nhip cho trang bat dau chuyen huong roi hay doc lai trang thai.
  setTimeout(refresh, 1500);
});
$('btn-an').addEventListener('click', () => window.api.hideGrabWindow());
$('btn-tai').addEventListener('click', async () => {
  await window.api.reloadGrab();
  setTimeout(refresh, 2000);
});
/**
 * Ba con so cua cac lop bao ve. Binh thuong ca ba deu bang khong — khi khac
 * khong thi tuc la da co su co tu phuc hoi ma khong ai ngoi day de nhin thay.
 */
function motaBenBi(r) {
  if (!r) return '—';
  const phan = [];
  phan.push(r.soLanMoLaiCuaSo === 0 ? 'cửa sổ chưa phải mở lại lần nào' : `mở lại cửa sổ ${r.soLanMoLaiCuaSo} lần`);
  if (r.soLanCanThiep > 0) phan.push(`watchdog can thiệp ${r.soLanCanThiep} lần`);
  if (r.lanTaiLaiCuoi) phan.push(`tải lại trang lúc ${gio(r.lanTaiLaiCuoi)}`);
  return phan.join(' · ');
}

$('btn-nhatky').addEventListener('click', () => window.api.openLog());

$('btn-go').addEventListener('click', async () => {
  const nut = $('btn-go');
  nut.disabled = true;
  // Hop thoai hoi/dap nam o tien trinh chinh chu khong phai confirm() cua trang:
  // confirm() khong co o checkbox, ma cai checkbox ("giu lai dang nhap") moi la
  // phan quan trong cua cau hoi nay.
  const ketQua = await window.api.goCaiDat();
  if (ketQua?.ok) {
    nut.textContent = 'Đang gỡ, app sẽ đóng lại…';
    return;
  }
  nut.disabled = false;
  // Khong co `loi` = nguoi dung bam Huy. Khong bao gi ca, ho biet ho vua lam gi.
  if (ketQua?.loi) nut.textContent = `Không gỡ được: ${ketQua.loi}`;
});
$('btn-cauhinh').addEventListener('click', () => window.api.openConfig());

$('btn-chon-grab').addEventListener('click', async () => {
  await window.api.showGrabWindow();
  // Doc lai lien tuc mot lúc: người dùng còn phải đăng nhập rồi bấm vào quán,
  // và mã chỉ xuất hiện sau khi họ tới trang đơn hàng.
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    await refresh();
  }
});

$('btn-dung-quan').addEventListener('click', async () => {
  const ma = $('maquan').textContent;
  $('btn-dung-quan').disabled = true;
  $('btn-dung-quan').textContent = 'Đang lưu, app sẽ khởi động lại…';
  const ketQua = await window.api.saveStore(ma);
  if (!ketQua?.ok) {
    $('btn-dung-quan').disabled = false;
    $('btn-dung-quan').textContent = `Lỗi: ${ketQua?.loi ?? 'không rõ'}`;
  }
});
$('btn-kiem').addEventListener('click', async () => {
  set('trangthai', 'đang kiểm tra…');
  await window.api.probeGrab();
  refresh();
});
$('btn-dung').addEventListener('click', async () => {
  await window.api.togglePoller();
  refresh();
});

refresh();
setInterval(refresh, 3000);
