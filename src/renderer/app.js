// Giao dien dieu khien. JavaScript thuan, khong bien dich — day la mot trang
// nho, them mot buoc build cho no chi lam cham vong lap sua-thu.
//
// Giao dien day du lam o Task 9. Hien tai chi du de kiem chung Task 6: thay
// duoc phien Grab con hay mat, va bam duoc nut dang nhap.

const $ = (id) => document.getElementById(id);

function set(id, text) {
  $(id).textContent = text;
}

async function refresh() {
  let status;
  try {
    status = await window.api.getStatus();
  } catch (err) {
    set('trangthai', 'khong lay duoc trang thai');
    $('den').className = 'den do';
    return;
  }

  // Trang thai phien lay tu KET QUA GOI API THAT, khong suy tu URL: Grab tai
  // trang xong roi moi chuyen huong sang trang dang nhap, nen co mot khoang
  // URL van tro nhu binh thuong du da mat phien.
  const probe = status.lastProbe;
  if (!probe) {
    $('den').className = 'den vang';
    set('trangthai', 'chưa kiểm tra kết nối');
  } else if (probe.ok) {
    $('den').className = 'den xanh';
    set(
      'trangthai',
      `Phiên Grab sống · quán ${probe.quanDangMo ? 'đang mở' : 'đóng cửa'} · ${probe.soDon} đơn đang chuẩn bị`,
    );
  } else if (probe.matPhien) {
    $('den').className = 'den do';
    set('trangthai', 'MẤT PHIÊN — bấm "Mở trang Grab" để đăng nhập lại');
  } else {
    $('den').className = 'den do';
    set('trangthai', `Lỗi: ${probe.error}`);
  }
  set('kiemtra', probe ? new Date(probe.at).toLocaleTimeString('vi-VN') : 'chưa kiểm tra');

  set('quan', `${status.storeName} · ${status.merchantID}`);
  set(
    'chedo',
    status.dryRun ? `CHẠY KHÔ — ${status.dryRunReason}` : 'GỬI THẬT lên ccmany',
  );
  set('telegram', status.telegramEnabled ? 'đã bật' : 'chưa cấu hình');
  set('url', status.grabUrl ?? '—');
  set('ua', status.userAgent);
  set('phien', status.partitionPath);

  const box = $('canhbao');
  box.innerHTML = '';
  for (const warning of status.warnings) {
    const div = document.createElement('div');
    div.className = 'canhbao';
    div.textContent = `⚠ ${warning}`;
    box.appendChild(div);
  }
}

$('btn-mo').addEventListener('click', async () => {
  await window.api.showGrabWindow();
  // Doi mot nhip cho trang bat dau chuyen huong roi hay doc lai trang thai.
  setTimeout(refresh, 1500);
});
$('btn-an').addEventListener('click', () => window.api.hideGrabWindow());
$('btn-kiem').addEventListener('click', async () => {
  set('trangthai', 'đang kiểm tra…');
  await window.api.probeGrab();
  refresh();
});
$('btn-tai').addEventListener('click', async () => {
  await window.api.reloadGrab();
  setTimeout(refresh, 2000);
});

refresh();
setInterval(refresh, 3000);
