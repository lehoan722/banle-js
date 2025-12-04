// bannvcs1nhanh.js
import { supabase } from './supabaseClient.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { showPopupTimKH } from './popupKhachhang.js';
import { khoiTaoDangNhapDungChung } from './authModule.js';

// SỬA DÒNG NÀY: chỉ còn openProductCodeScanner
import { openProductCodeScanner } from './productCodeScanner.js';

import './stockQuickPopup.js';


// StockQuickPopup chỉ xuất ra window.StockQuick qua side-effect
import './stockQuickPopup.js'; // :contentReference[oaicite:7]{index=7}

// ===== CẤU HÌNH ẢNH – chỉnh cho đúng với dự án của bạn =====
const IMAGE_BUCKET = 'anhsanpham'; // TODO: đổi thành bucket thật
const IMAGE_PATH_PREFIX = '';       // ví dụ 'sanpham/' nếu có thư mục con
const IMAGE_EXTS = ['JPG', 'jpg', 'png', 'webp'];

// ===== BIẾN TOÀN CỤC =====
let CURRENT_MASP = '';
let CURRENT_SP = null;
let currentImageHasPhoto = false;
let IS_SAVING = false;
// Biến dùng cho popup gợi ý mã SP
let maspInputEl = null;
let maspSuggestDiv = null;


// ========== HÀM LOAD DANH MỤC + QUẢN LÝ SIZE (copy từ luuhoadon.js, rút gọn) ==========

async function ensureCatalogsReady() {
  // dmhanghoa
  if (!window.sanPhamData || Object.keys(window.sanPhamData).length === 0) {
    const { data: dssp, error } = await supabase
      .from("dmhanghoa")
      .select("*"); // cần cả giale, khuyenmai, vitrikho1/2, chungloai, quanlykichco

    if (!error && Array.isArray(dssp)) {
      window.sanPhamData = {};
      dssp.forEach(sp => {
        const key = String(sp.masp || "").toUpperCase().trim();
        window.sanPhamData[key] = sp;
      });
    } else {
      console.warn("⚠️ Không tải được dmhanghoa:", error);
      window.sanPhamData = window.sanPhamData || {};
    }
  }

  // dmnhomhang
  if (!(window.danhMucNhom instanceof Map) || window.danhMucNhom.size === 0) {
    const { data, error } = await supabase
      .from("dmnhomhang")
      .select("manhom, quanlysize, diadiem");

    if (!error && Array.isArray(data)) {
      window.danhMucNhom = new Map();
      data.forEach(row => {
        window.danhMucNhom.set(String(row.manhom).toUpperCase().trim(), {
          quanlysize: !!row.quanlysize,
          diadiem: String(row.diadiem || "ALL").toUpperCase().trim()
        });
      });
    } else {
      console.warn("⚠️ Không tải được dmnhomhang:", error);
      window.danhMucNhom = window.danhMucNhom || new Map();
    }
  }
}

function resolveGroupKeyFromSP(sp) {
  if (!sp) return "";
  const tryFields = ["manhom", "nhomhang", "nhom", "nhom_hang"];
  for (const f of tryFields) {
    if (sp[f]) return String(sp[f]).toUpperCase().trim();
  }
  return "";
}

function requireManagedAtBranch(masp, branch) {
  const upper = s => String(s || "").toUpperCase().trim();
  const sp = window.sanPhamData?.[upper(masp)];
  const br = upper(branch);

  // Nếu chưa tra được catalog → cho là quản size (tránh làm hỏng dữ liệu)
  if (!sp) return true;

  // 1) Chủng loại GD => quản size
  if (upper(sp.chungloai || "") === "GD") return true;

  // 2) Cờ riêng của SP
  if (sp.quanlykichco === true) return true;

  // 3) Theo nhóm + địa điểm
  if (window.danhMucNhom instanceof Map && window.danhMucNhom.size) {
    const groupKey = resolveGroupKeyFromSP(sp);
    if (groupKey) {
      const nhom = window.danhMucNhom.get(upper(groupKey));
      if (nhom && nhom.quanlysize) {
        const dia = upper(nhom.diadiem || "ALL");
        return dia === "ALL" || dia === br;
      }
    }
  }

  // 4) Mặc định: KHÔNG quản size
  return false;
}

// ========== HÀM TIỆN ÍCH ==========

function getBranchFromDiaDiem() {
  const diadiem = (document.getElementById('diadiem').value || 'cs1').toLowerCase();
  return diadiem === 'cs2' ? 'CS2' : 'CS1';
}

function normalizeMasp(raw) {
  return String(raw || '').trim().toUpperCase();
}

// ===== HÀM CẬP NHẬT DÒNG TRẠNG THÁI ẢNH / CẢNH BÁO =====
function setStatusAnh(text, color) {
  const el = document.getElementById('statusAnh');
  if (!el) return;
  el.textContent = text || '';
  // màu mặc định = đen đậm
  el.style.color = color || '#111827';
}

function extractBaseSize(sizeStr) {
  const m = String(sizeStr || '').match(/(\d{1,2})/);
  return m ? m[1] : null;
}

function isValidSizeInput(sizeStr) {
  const allowed = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];
  const base = extractBaseSize(sizeStr) || String(sizeStr || '').trim();
  return allowed.includes(base);
}

function formatTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function updateTimeField() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const gio = `${hh}:${mm}`;
  const gioEl = document.getElementById('gio');
  if (gioEl) gioEl.value = gio;
}

// ========== ẢNH SẢN PHẨM ==========

function resetImagePreview() {
  const img = document.getElementById('productImage');
  const ph = document.getElementById('imagePlaceholder');
  img.style.display = 'none';
  img.src = '';
  ph.style.display = '';
  ph.textContent = 'Chưa có ảnh sản phẩm.';
  currentImageHasPhoto = false;
}

async function loadImagePreview(masp) {
  resetImagePreview();
  if (!masp) return;

  const img = document.getElementById('productImage');
  const ph = document.getElementById('imagePlaceholder');

  ph.textContent = 'Đang kiểm tra ảnh...';
  // thông báo lên dòng trạng thái
  setStatusAnh('Đang kiểm tra ảnh sản phẩm...', '#2563eb'); // xanh dương

  for (const ext of IMAGE_EXTS) {
    const path = `${IMAGE_PATH_PREFIX}${masp}.${ext}`;
    const { data, error } = await supabase
      .storage
      .from(IMAGE_BUCKET)
      .download(path);

    if (!error && data) {
      const url = URL.createObjectURL(data);
      img.src = url;
      img.style.display = 'block';
      ph.style.display = 'none';
      currentImageHasPhoto = true;

      // có ảnh → báo "ĐÃ CÓ ẢNH"
      setStatusAnh('ĐÃ CÓ ẢNH', '#16a34a'); // xanh lá
      return;
    }
  }

  // không tải được ảnh nào
  ph.textContent = 'Chưa tìm thấy ảnh cho mã ' + masp;
  currentImageHasPhoto = false;

  // không có ảnh → báo "CHƯA CÓ ẢNH"
  setStatusAnh('CHƯA CÓ ẢNH', '#b91c1c'); // đỏ
}


let hiddenFileInput = null;

function ensureHiddenFileInput() {
  if (!hiddenFileInput) {
    hiddenFileInput = document.createElement('input');
    hiddenFileInput.type = 'file';
    hiddenFileInput.accept = 'image/*';
    hiddenFileInput.style.display = 'none';
    hiddenFileInput.addEventListener('change', onFileSelected);
    document.body.appendChild(hiddenFileInput);
  }
  return hiddenFileInput;
}

async function onFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !CURRENT_MASP) return;

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${IMAGE_PATH_PREFIX}${CURRENT_MASP}.${ext}`;

  const { error } = await supabase
    .storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error(error);
    alert('❌ Upload ảnh thất bại.');
    return;
  }

  await loadImagePreview(CURRENT_MASP);
  alert('✅ Đã cập nhật ảnh sản phẩm.');
}

function triggerUploadNewImage() {
  if (!CURRENT_MASP) {
    alert('Bạn cần chọn mã sản phẩm trước.');
    return;
  }
  const input = ensureHiddenFileInput();
  input.value = '';
  input.click();
}

// ========== LOAD THÔNG TIN NV / CƠ SỞ LÚC ĐẦU ==========

async function initPage() {
  const diadiem = window.diadiem || localStorage.getItem('diadiem') || 'cs1';
  const manv = localStorage.getItem('manv') || '';
  const tennv = localStorage.getItem('tennv') || '';

  document.getElementById('diadiem').value = diadiem;
  document.getElementById('manv').value = manv;
  document.getElementById('tennv').value = tennv;

  document.getElementById('ngay').value = formatTodayISO();
  updateTimeField();

  // Chuẩn bị dmhanghoa + dmnhomhang
  await ensureCatalogsReady();

  // Gắn event
  bindEvents();

  // Phát sinh trước 1 số hóa đơn – để chắc chắn struct hoạt động
  await capNhatSoHoaDonTuDong();
}

// ========== GỢI Ý MÃ SẢN PHẨM (dmhanghoa) ==========

function positionMaspSuggestList() {
  if (!maspSuggestDiv || !maspInputEl) return;
  const rect = maspInputEl.getBoundingClientRect();
  maspSuggestDiv.style.left = (rect.left + window.scrollX) + 'px';
  maspSuggestDiv.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
  maspSuggestDiv.style.minWidth = rect.width + 'px';
}

function hideMaspSuggest() {
  if (maspSuggestDiv) maspSuggestDiv.style.display = 'none';
}

async function loadMaspSuggest(keyword) {
  if (!maspSuggestDiv || !maspInputEl) return;

  const q = (keyword || '').trim();
  if (!q) {
    hideMaspSuggest();
    return;
  }

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp')
    .or(`masp.ilike.%${q}%,tensp.ilike.%${q}%`)
    .order('masp')
    .limit(100);

  if (error) {
    console.warn('Lỗi load gợi ý mã SP:', error);
    hideMaspSuggest();
    return;
  }

  if (!data || !data.length) {
    hideMaspSuggest();
    return;
  }

  let html = '<table style="border-collapse:collapse;width:100%;font-size:13px;"><tbody>';
  for (const row of data) {
    const masp = String(row.masp || '').toUpperCase();
    const tensp = row.tensp || '';
    html += `
      <tr data-masp="${masp}" data-tensp="${tensp.replace(/"/g, '&quot;')}"
          style="cursor:pointer;">
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;width:110px;white-space:nowrap;">
          ${masp}
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#4b5563;">
          ${tensp}
        </td>
      </tr>`;
  }
  html += '</tbody></table>';

  maspSuggestDiv.innerHTML = html;
  positionMaspSuggestList();
  maspSuggestDiv.style.display = 'block';

  maspSuggestDiv.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const masp = tr.dataset.masp || '';
      maspInputEl.value = masp;
      hideMaspSuggest();
      onMaspSelected(masp); // chọn xong → load thông tin SP
    });
  });
}


// ========== XỬ LÝ MÃ SẢN PHẨM / SIZE ==========

// ====== CHỌN MÃ SẢN PHẨM (có fallback query 1 dòng) ======
// ===== CHỌN MÃ SẢN PHẨM (có fallback query 1 dòng, chỉ hiển thị trạng thái) =====
async function onMaspSelected(raw) {
  const masp = normalizeMasp(raw);
  const input = document.getElementById('masp');
  input.value = masp;
  CURRENT_MASP = masp;

  if (!masp) {
    CURRENT_SP = null;
    resetImagePreview();
    setStatusAnh('', '#111827');
    return;
  }

  // Báo cho người dùng biết đang kiểm tra mã
  setStatusAnh('Đang kiểm tra mã sản phẩm...', '#2563eb');

  // 1) Đảm bảo đã load cache danh mục
  await ensureCatalogsReady();

  // 2) Thử lấy trong cache sanPhamData
  let sp = window.sanPhamData?.[masp];

  // 3) Nếu chưa có → hỏi trực tiếp bảng dmhanghoa 1 dòng
  if (!sp) {
    console.warn('[bannvcs1nhanh] Không có trong sanPhamData, fallback dmhanghoa cho', masp);

    const { data, error } = await supabase
      .from('dmhanghoa')
      .select('*')
      .eq('masp', masp)
      .maybeSingle();

    if (!error && data) {
      sp = data;
      // Lưu lại vào cache để lần sau khỏi hỏi nữa
      window.sanPhamData = window.sanPhamData || {};
      window.sanPhamData[masp] = sp;
    } else {
      console.error('Lỗi load 1 dòng dmhanghoa:', error || null);
    }
  }

  CURRENT_SP = sp || null;

  // 4) Nếu thực sự không có trong danh mục → chỉ báo ở dòng trạng thái, không alert
  if (!sp) {
    setStatusAnh('Mã sản phẩm không có trong danh mục.', '#b91c1c'); // đỏ
    resetImagePreview();
    return;
  }

  // 5) Có sản phẩm → cập nhật thông tin, trạng thái ảnh sẽ do loadImagePreview xử lý
  setStatusAnh('Đang kiểm tra ảnh sản phẩm...', '#2563eb');

  // Giá & khuyến mãi
  const giaEl = document.getElementById('gia_sp');
  const kmEl = document.getElementById('khuyen_mai');
  giaEl.value = sp.giale || sp.giaban || 0;
  kmEl.value = sp.khuyenmai || 0;

  // Vị trí kho theo cơ sở
  const branch = getBranchFromDiaDiem(); // CS1 / CS2
  const vitriEl = document.getElementById('vitrikho');
  vitriEl.value = branch === 'CS1'
    ? (sp.vitrikho1 || '')
    : (sp.vitrikho2 || '');

  // Quản lý size?
  const inputSize = document.getElementById('size');
  const managed = requireManagedAtBranch(masp, branch);

  if (managed) {
    inputSize.disabled = false;
    inputSize.value = '';
    inputSize.focus();
  } else {
    inputSize.value = '0';
    inputSize.disabled = true;
  }

  // Ảnh + popup tồn kho
  await loadImagePreview(masp);
  attachStockPopupForCurrentMasp(masp);
}


function attachStockPopupForCurrentMasp(masp) {
  const card = document.getElementById('imageCard');
  if (window.StockQuick && card && masp) {
    window.StockQuick.attach(card, masp);
  }
}

// ========== KHÁCH HÀNG ==========

async function fetchKhachHangByMa(makh) {
  if (!makh) return null;
  const { data, error } = await supabase
    .from('dmkhachhang')
    .select('makh,tenkh')
    .eq('makh', makh)
    .maybeSingle();

  if (error) {
    console.warn('Lỗi đọc dmkhachhang:', error);
    return null;
  }
  return data || null;
}

function openPopupChonKhach() {
  showPopupTimKH((makh, tenkh) => {
    document.getElementById('makh').value = makh;
    document.getElementById('tenkh').value = tenkh;
  });
}

// ========== LƯU HÓA ĐƠN BÁN NHANH ==========

async function luuHoaDonBanNhanh() {
  if (IS_SAVING) return;
  const btn = document.getElementById('btnLuu');

  const masp = normalizeMasp(document.getElementById('masp').value);
  const sizeStr = document.getElementById('size').value.trim();
  const gia = parseInt((document.getElementById('gia_sp').value || '0').replace(/[.,]/g, ''), 10) || 0;
  const km = parseInt((document.getElementById('khuyen_mai').value || '0').replace(/[.,]/g, ''), 10) || 0;
  const makh = document.getElementById('makh').value.trim();
  const diadiemTrang = (document.getElementById('diadiem').value || 'cs1').toLowerCase();
  const manv = document.getElementById('manv').value || '';
  const tennv = document.getElementById('tennv').value || '';
  const ngay = document.getElementById('ngay').value || formatTodayISO();
  updateTimeField();

  if (!masp) {
    alert('Bạn chưa nhập mã sản phẩm.');
    document.getElementById('masp').focus();
    return;
  }

  if (!sizeStr) {
    alert('Bạn chưa nhập size.');
    document.getElementById('size').focus();
    return;
  }

  if (!isValidSizeInput(sizeStr)) {
    alert('Size phải thuộc 0, 38–45 (hoặc chuỗi chứa các số đó).');
    document.getElementById('size').focus();
    return;
  }

  if (!CURRENT_SP) {
    alert('Không tìm thấy sản phẩm trong danh mục, vui lòng nhập lại.');
    return;
  }

  if (!currentImageHasPhoto) {
    alert('Sản phẩm chưa có ảnh. Vui lòng chụp / chèn ảnh rồi lưu lại.');
    triggerUploadNewImage();
    return;
  }

  IS_SAVING = true;
  btn.classList.add('saving');
  btn.textContent = 'Đang lưu...';

  try {
    const sohd = await capNhatSoHoaDonTuDong();
    if (!sohd) {
      throw new Error('Không phát sinh được số hóa đơn.');
    }

    document.getElementById('sohd').value = sohd;

    const loai = String(sohd).split('_')[0]; // ví dụ: bannvcs1
    const diadiemRPC = loai.includes('cs2') ? 'cs2' : 'cs1';
    const hinhthuctt = 'NV';

    const header = {
      ngay,
      manv,
      tennv,
      diadiem: diadiemRPC,
      khachhang: makh,
      tongsl: 1,
      tongkm: km,
      chietkhau: 0,
      thanhtoan: gia - km,
      hinhthuctt,
      ghichu: '',
      dvt: '',
      loaihd: loai,
      loai,
      nhacc: ''
    };

    // RPC cấp số + insert header
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_new_header', {
      p_loai: loai,
      p_diadiem: diadiemRPC,
      p_header: header
    });

    if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
      console.error(rpcErr);
      throw new Error('Lưu header thất bại (RPC save_new_header).');
    }

    const sohdThucTe = rpcRes[0].sohd;
    document.getElementById('sohd').value = sohdThucTe;

    const createdAt = new Date().toISOString();
    const baseSize = extractBaseSize(sizeStr) || sizeStr;

    const chitiet = [{
      sohd: sohdThucTe,
      masp,
      tensp: CURRENT_SP.tensp || CURRENT_SP.tenspfull || '',
      size: sizeStr,
      soluong: 1,
      gia,
      km,
      thanhtien: gia - km,
      dvt: CURRENT_SP.dvt || '',
      diadiem: diadiemRPC,
      created_at: createdAt,
      ngay
    }];

    const { error: errCT } = await supabase.from('ct_hoadon_banle').insert(chitiet);
    if (errCT) {
      console.error(errCT);
      await supabase.from('hoadon_banle').delete().eq('sohd', sohdThucTe);
      throw new Error('Lỗi khi lưu chi tiết hóa đơn.');
    }

    alert('✅ Đã lưu hóa đơn bán NV nhanh.');
    resetFormBanNhanh();

  } catch (e) {
    console.error(e);
    alert('❌ Lưu hóa đơn thất bại: ' + (e.message || e));
  } finally {
    IS_SAVING = false;
    btn.classList.remove('saving');
    btn.textContent = 'LƯU';
  }
}

// ========== RESET TRANG SAU KHI LƯU / THÊM MỚI ==========

async function resetFormBanNhanh() {
  CURRENT_MASP = '';
  CURRENT_SP = null;
  currentImageHasPhoto = false;

  document.getElementById('masp').value = '';
  document.getElementById('size').value = '';
  document.getElementById('size').disabled = false;
  document.getElementById('gia_sp').value = '';
  document.getElementById('khuyen_mai').value = '';
  document.getElementById('vitrikho').value = '';
  // Giữ nguyên makh/tenkh nếu bạn muốn; ở đây mình cũng reset
  document.getElementById('makh').value = '';
  document.getElementById('tenkh').value = '';

  resetImagePreview();
  document.getElementById('masp').focus();

  // Phát sinh luôn số HĐ tiếp theo
  await capNhatSoHoaDonTuDong();
}

// ========== GẮN EVENT ==========

function bindEvents() {
  const maspEl = document.getElementById('masp');
  maspInputEl = maspEl;
  maspSuggestDiv = document.getElementById('maspSuggestList');

  // Gợi ý mã SP khi gõ
  maspEl.addEventListener('input', () => {
    const v = maspEl.value || '';
    if (!v.trim()) {
      hideMaspSuggest();
      return;
    }
    loadMaspSuggest(v).catch(() => {});
  });

  window.addEventListener('resize', positionMaspSuggestList);

  document.addEventListener('click', (ev) => {
    if (!maspSuggestDiv || maspSuggestDiv.style.display === 'none') return;
    if (ev.target === maspEl || maspSuggestDiv.contains(ev.target)) return;
    hideMaspSuggest();
  });

  // Phần cũ: Enter / change → chọn mã SP
  maspEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onMaspSelected(maspEl.value);
    }
  });
  maspEl.addEventListener('change', () => onMaspSelected(maspEl.value));

  // ========= NÚT CHỤP MÃ SẢN PHẨM =========
  const btnScanMasp = document.getElementById('btnScanMasp');
  if (btnScanMasp) {
    btnScanMasp.addEventListener('click', (e) => {
      e.preventDefault();
      openProductCodeScanner({
        onDetected: (maspFound) => {
          if (!maspFound) return;
          const maspUpper = String(maspFound).toUpperCase().trim();
          maspEl.value = maspUpper;
          onMaspSelected(maspUpper);
        }
      });
    });
  }
  // =======================================

  document.getElementById('btnLuu').addEventListener('click', e => {
    e.preventDefault();
    luuHoaDonBanNhanh();
  });

  document.getElementById('btnThemMoi').addEventListener('click', e => {
    e.preventDefault();
    resetFormBanNhanh();
  });

  document.getElementById('btnKiemTraAnh').addEventListener('click', e => {
    e.preventDefault();
    if (!CURRENT_MASP) {
      alert('Nhập mã sản phẩm trước.');
      return;
    }
    loadImagePreview(CURRENT_MASP);
  });

  document.getElementById('btnChenAnhMoi').addEventListener('click', e => {
    e.preventDefault();
    triggerUploadNewImage();
  });

  document.getElementById('btnTimKH').addEventListener('click', e => {
    e.preventDefault();
    openPopupChonKhach();
  });

  const makhEl = document.getElementById('makh');
  makhEl.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const mk = makhEl.value.trim();
      if (!mk) return;
      const kh = await fetchKhachHangByMa(mk);
      if (kh) {
        document.getElementById('makh').value = kh.makh;
        document.getElementById('tenkh').value = kh.tenkh;
      } else {
        alert('Không tìm thấy khách hàng.');
      }
    }
  });

  // Khu ảnh: click để hiện popup tồn/bán – StockQuick.attach đã gắn trong onMaspSelected
  const card = document.getElementById('imageCard');
  if (card) {
    // không cần add gì thêm, StockQuick sẽ xử lý click/hover
  }

  // Cập nhật giờ định kỳ cho đẹp (không bắt buộc)
  setInterval(updateTimeField, 60 * 1000);
}

// ========== KHỞI ĐỘNG ==========

// ========== KHỞI ĐỘNG VỚI ĐĂNG NHẬP ==========

document.addEventListener('DOMContentLoaded', () => {
  khoiTaoDangNhapDungChung({
    loginContainerId: 'login-container',
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: () => {
      // authModule sẽ lưu manv, tennv, diadiem vào localStorage
      initPage().catch(err => {
        console.error(err);
        alert('Lỗi khởi tạo trang bán NV nhanh.');
      });
    }
  });
});
