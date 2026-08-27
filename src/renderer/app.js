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

  // KHONG suy ra "da dang nhap" tu URL: Grab la SPA, no ve man hinh dang nhap
  // ma khong doi URL. Task 7 se kiem bang mot loi goi API that (401 hay khong).
  $('den').className = `den ${status.pageLoaded ? 'vang' : 'do'}`;
  set(
    'trangthai',
    status.pageLoaded
      ? 'Trang Grab đã tải — chưa kiểm chứng được phiên (Task 7)'
      : 'Chưa tải được trang Grab',
  );

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
$('btn-tai').addEventListener('click', async () => {
  await window.api.reloadGrab();
  setTimeout(refresh, 2000);
});

refresh();
setInterval(refresh, 3000);
