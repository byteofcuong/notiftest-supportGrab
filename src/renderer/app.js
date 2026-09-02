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

/** Đang mở bảng chọn — để refresh() định kỳ không ghi đè lên thao tác dở dang. */
let dangChon = false;

/**
 * Bảng chọn quán.
 *
 * Mọi QUYẾT ĐỊNH — dòng nào tick sẵn, câu nào hiện khi hỏng, quán nào phải
 * hiện dù Grab không trả về — nằm ở `src/main/chon-quan.ts`, nơi test được mà
 * không cần jsdom. Ở đây chỉ còn việc vẽ ra.
 */
function capNhatChonQuan(status) {
  // Ban dev khong go duoc (thu muc "app" chinh la node_modules/electron/dist),
  // nen an han cai nut di thay vi de no bao loi khi bam.
  $('khu-go').hidden = !status.daCaiDat;

  // Chưa chọn quán nào thì nói to hơn: đây là việc bắt buộc của lần chạy đầu,
  // không phải một mục cài đặt tuỳ chọn.
  const chuaChon = !status.merchantID;
  set('chonquan-tieude', chuaChon ? 'Chưa chọn quán' : 'Quán theo dõi');
  if (chuaChon && !dangChon) {
    $('chonquan-huong').innerHTML =
      'Bấm <b>Mở trang Grab / Đăng nhập</b> để đăng nhập, rồi bấm ' +
      '<b>Lấy danh sách quán</b> để chọn quán của bạn.';
  }
}

function veDanhSachQuan(ketQua) {
  const hop = $('ds-quan');
  hop.innerHTML = '';

  for (const q of ketQua.quan) {
    const dong = document.createElement('div');
    dong.className = 'dongquan';

    const nhan = document.createElement('label');

    const o = document.createElement('input');
    o.type = 'checkbox';
    o.checked = q.daTick;
    o.dataset.ma = q.merchantID;
    o.dataset.ten = q.tenHienThi;
    o.addEventListener('change', capNhatNutLuu);
    nhan.appendChild(o);

    const ten = document.createElement('span');
    ten.textContent = q.tenHienThi;
    nhan.appendChild(ten);

    if (q.city) {
      const tp = document.createElement('span');
      tp.className = 'thanhpho';
      tp.textContent = q.city;
      nhan.appendChild(tp);
    }
    if (q.nhan) {
      const n = document.createElement('span');
      n.className = 'nhan';
      n.textContent = `⚠ ${q.nhan}`;
      nhan.appendChild(n);
    }

    dong.appendChild(nhan);
    hop.appendChild(dong);
  }

  hop.hidden = ketQua.quan.length === 0;
  $('btn-luu-quan').hidden = ketQua.quan.length === 0;
  capNhatNutLuu();

  const bao = $('chonquan-bao');
  bao.hidden = !ketQua.thongBao;
  bao.textContent = ketQua.thongBao ?? '';
}

function quanDaTick() {
  return [...$('ds-quan').querySelectorAll('input:checked')].map((o) => ({
    merchantID: o.dataset.ma,
    tenHienThi: o.dataset.ten,
  }));
}

/**
 * Không quán nào được tick thì khoá nút Lưu.
 *
 * Lưu danh sách rỗng nghĩa là ngừng theo dõi tất cả, và `luuDanhSachQuan()`
 * ném lỗi thay vì ghi đè. Khoá ở đây để người dùng thấy ngay lý do thay vì bấm
 * rồi nhận một câu lỗi khó hiểu.
 */
function capNhatNutLuu() {
  const so = quanDaTick().length;
  const nut = $('btn-luu-quan');
  nut.disabled = so === 0;
  nut.textContent = so === 0 ? 'Chưa chọn quán nào' : `Lưu ${so} quán và khởi động lại`;
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

$('btn-tai-ds').addEventListener('click', async () => {
  const nut = $('btn-tai-ds');
  nut.disabled = true;
  nut.textContent = 'Đang lấy…';
  try {
    const ketQua = await window.api.listStores();
    dangChon = true;
    veDanhSachQuan(ketQua);
    if (ketQua.canDangNhap) {
      $('chonquan-huong').innerHTML =
        'Bấm <b>Mở trang Grab / Đăng nhập</b> ở khung dưới, đăng nhập xong thì quay lại bấm nút này.';
    }
  } finally {
    nut.disabled = false;
    nut.textContent = 'Lấy lại danh sách';
  }
});

$('btn-luu-quan').addEventListener('click', async () => {
  const chon = quanDaTick();
  const nut = $('btn-luu-quan');
  nut.disabled = true;
  nut.textContent = 'Đang lưu, app sẽ khởi động lại…';
  const ketQua = await window.api.saveStores(chon);
  if (!ketQua?.ok) {
    nut.disabled = false;
    nut.textContent = `Lỗi: ${ketQua?.loi ?? 'không rõ'}`;
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
