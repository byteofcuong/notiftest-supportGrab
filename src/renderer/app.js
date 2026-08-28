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

  set('quan', `${status.storeName} · ${status.merchantID}`);
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
 * Trang thai lay tu KET QUA GOI API THAT, khong suy tu URL: Grab tai trang xong
 * roi moi chuyen huong sang trang dang nhap, nen co mot khoang URL van tro nhu
 * binh thuong du da mat phien.
 */
function capNhatDen(status) {
  const poller = status.poller;
  const probe = status.lastProbe;

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
