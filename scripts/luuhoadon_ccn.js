// scripts/luuhoadon_ccn.js
import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';

/* =========================================================
 * MODULE LƯU HÓA ĐƠN CHUYỂN CHI NHÁNH (CCN)
 * - Dùng riêng cho:
 *   + ccn1v2cs1.html
 *   + ccn2v1cs2.html
 * - Frontend:
 *   + validate dữ liệu trên UI
 *   + build payload
 *   + gọi RPC atomic
 * - Database / RPC:
 *   + ghi hóa đơn gốc
 *   + ghi chi tiết gốc
 *   + ghi hóa đơn đối ứng
 *   + ghi chi tiết đối ứng
 *   + cập nhật sochungtu
 *   + rollback toàn bộ nếu có lỗi
 * ========================================================= */

let choPhepSuaCCN = false;

/* =========================
 * HELPERS GỘP CHUNG TRONG FILE
 * ========================= */

function buildCCNCtxFromPathname() {
  const p = (window.location.pathname || '').toLowerCase();

  let ctx = {
    isCCN: false,
    src: 'CS1',
    dst: 'CS2',
    loaihdGoc: '',
    loaihdDoiUng: '',
    page: p
  };

  if (p.includes('ccn1v2')) {
    ctx.isCCN = true;
    ctx.src = 'CS1';
    ctx.dst = 'CS2';
    ctx.loaihdGoc = 'xcncs1';
    ctx.loaihdDoiUng = 'ncncs2';
    return ctx;
  }

  if (p.includes('ccn2v1')) {
    ctx.isCCN = true;
    ctx.src = 'CS2';
    ctx.dst = 'CS1';
    ctx.loaihdGoc = 'xcncs2';
    ctx.loaihdDoiUng = 'ncncs1';
    return ctx;
  }

  return ctx;
}

async function ensureCatalogsReady() {
  // Sản phẩm
  if (!window.sanPhamData || Object.keys(window.sanPhamData).length === 0) {
    const { data: dssp, error } = await supabase.from('dmhanghoa').select('*');

    if (!error && Array.isArray(dssp)) {
      window.sanPhamData = {};
      dssp.forEach((sp) => {
        const key = String(sp.masp || '').toUpperCase().trim();
        window.sanPhamData[key] = sp;
      });
    } else {
      console.warn('⚠️ Không tải được dmhanghoa.', error);
      window.sanPhamData = window.sanPhamData || {};
    }
  }

  // Nhóm hàng
  if (!(window.danhMucNhom instanceof Map) || window.danhMucNhom.size === 0) {
    const { data, error } = await supabase
      .from('dmnhomhang')
      .select('manhom, quanlysize, diadiem');

    if (!error && Array.isArray(data)) {
      window.danhMucNhom = new Map();
      data.forEach((row) => {
        window.danhMucNhom.set(String(row.manhom).toUpperCase().trim(), {
          quanlysize: !!row.quanlysize,
          diadiem: String(row.diadiem || 'ALL').toUpperCase().trim()
        });
      });
    } else {
      console.warn('⚠️ Không tải được dmnhomhang.', error);
      window.danhMucNhom = window.danhMucNhom instanceof Map ? window.danhMucNhom : new Map();
    }
  }
}

function resolveGroupKeyFromSP(sp) {
  const candidates = ['nhomhang', 'manhom', 'nhom', 'group_code', 'nhomsp'];
  for (const key of candidates) {
    if (sp && sp[key] != null && String(sp[key]).trim() !== '') {
      return String(sp[key]).toUpperCase().trim();
    }
  }
  return null;
}

function requireManagedAtBranch(masp, branch) {
  const upper = (s) => String(s || '').toUpperCase().trim();
  const sp = window.sanPhamData?.[upper(masp)];
  const br = upper(branch);

  // Nếu chưa tra được catalog -> giữ size
  if (!sp) return true;

  // Chủng loại GD => quản size
  if (upper(sp.chungloai || '') === 'GD') return true;

  // Cờ riêng của sản phẩm
  if (sp.quanlykichco === true) return true;

  // Theo nhóm + địa điểm
  if (window.danhMucNhom instanceof Map && window.danhMucNhom.size) {
    const groupKey = resolveGroupKeyFromSP(sp);
    if (groupKey) {
      const nhom = window.danhMucNhom.get(upper(groupKey));
      if (nhom && nhom.quanlysize) {
        const dia = upper(nhom.diadiem || 'ALL');
        return dia === 'ALL' || dia === br;
      }
    }
  }

  return true;
}

const getIntValue = (id) =>
  parseInt((document.getElementById(id)?.value || '').replace(/[.,]/g, '') || '0', 10);

function normalizeSizeValue(v) {
  const s = String(v ?? '').trim();
  return s === '' ? '0' : s;
}

function getNgayValue() {
  return document.getElementById('ngay')?.value || new Date().toISOString().slice(0, 10);
}

function getNowIso() {
  return new Date().toISOString();
}

function calcTongThanhTienFromBangKetQuaCCN(bangKetQua) {
  let sum = 0;
  try {
    Object.values(bangKetQua || {}).forEach((item) => {
      const gia = Number(item?.gia || 0);
      const km = Number(item?.km || 0);
      const soluongs = item?.soluongs || [];
      for (let i = 0; i < soluongs.length; i++) {
        const sl = Number(soluongs[i] || 0);
        sum += (gia - km) * sl;
      }
    });
  } catch (e) {
    console.warn('calcTongThanhTienFromBangKetQuaCCN error:', e);
  }
  return Math.round(sum);
}

function getHeaderFromUI(sohd, ctx, createdAt, updatedAt = null) {
  const bangKetQua = getBangKetQua();

  return {
    sohd,
    ngay: getNgayValue(),
    manv: document.getElementById('manv')?.value?.trim() || '',
    tennv: document.getElementById('tennv')?.value?.trim() || '',
    diadiem: ctx.src.toLowerCase(),
    khachhang: document.getElementById('khachhang')?.value || '',
    tongsl: getIntValue('tongsl'),
    tongthanhtien: calcTongThanhTienFromBangKetQuaCCN(bangKetQua),
    tongkm: getIntValue('tongkm'),
    chietkhau: getIntValue('chietkhau'),
    thanhtoan: getIntValue('phaithanhtoan'),
    hinhthuctt: document.getElementById('hinhthuctt')?.value || 'tm',
    ghichu: document.getElementById('ghichu')?.value || '',
    created_at: createdAt,
    updated_at: updatedAt,
    loaihd: ctx.loaihdGoc,
    loai: '',
    dvt: '',
    nhacc: ''
  };
}

async function buildDetailsForRPC(sohd, ctx, createdAt, updatedAt = null) {
  await ensureCatalogsReady();

  const bangKetQua = getBangKetQua();
  const src = ctx.src;
  const dst = ctx.dst;

  const details_goc = [];
  const details_doi_ung = [];

  Object.values(bangKetQua || {}).forEach((item) => {
    const masp = String(item.masp || '').trim().toUpperCase();
    const tensp = item.tensp || '';
    const dvt = item.dvt || '';
    const gia = Number(item.gia || 0);
    const km = Number(item.km || 0);

    const sizes = Array.isArray(item.sizes) ? item.sizes : [];
    const soluongs = Array.isArray(item.soluongs) ? item.soluongs : [];

    sizes.forEach((sz, i) => {
      const sizeInput = normalizeSizeValue(sz);
      const sl = Number(soluongs[i] || 0);

      const managedAtSrc = requireManagedAtBranch(masp, src);
      const managedAtDst = requireManagedAtBranch(masp, dst);

      const sizeSrc = managedAtSrc ? sizeInput : '0';
      const sizeDst = managedAtDst ? sizeInput : '0';

      details_goc.push({
        sohd,
        masp,
        tensp,
        size: sizeSrc,
        soluong: sl,
        gia,
        km,
        thanhtien: (gia - km) * sl,
        dvt,
        diadiem: ctx.src.toLowerCase(),
        created_at: createdAt,
        updated_at: updatedAt,
        ngay: getNgayValue()
      });

      details_doi_ung.push({
        sohd: '', // RPC tự gán số hóa đơn đối ứng
        masp,
        tensp,
        size: sizeDst,
        soluong: sl,
        gia,
        km,
        thanhtien: (gia - km) * sl,
        dvt,
        diadiem: ctx.dst.toLowerCase(),
        created_at: createdAt,
        updated_at: updatedAt,
        ngay: getNgayValue()
      });
    });
  });

  return { details_goc, details_doi_ung };
}

function validateBeforeSaveCCN(ctx) {
  capNhatThongTinTong(getBangKetQua());

  const maspChuaNhap = document.getElementById('masp')?.value?.trim();
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert('❌ Bạn còn mã sản phẩm chưa thêm vào bảng!');
    document.getElementById('masp')?.focus();
    return false;
  }

  const sohd = document.getElementById('sohd')?.value?.trim();
  if (!sohd) {
    alert('❌ Chưa có số hóa đơn.');
    return false;
  }

  const prefix = sohd.split('_')[0] || '';
  if (prefix !== ctx.loaihdGoc) {
    alert(`🚫 Sai prefix số chứng từ. Trang này yêu cầu "${ctx.loaihdGoc}_*"`);
    return false;
  }

  const tennv = document.getElementById('tennv')?.value?.trim();
  if (!tennv) {
    alert('❌ Bạn chưa nhập tên nhân viên.');
    return false;
  }

  const manv =
    document.getElementById('manv')?.value?.trim() ||
    localStorage.getItem('manv') ||
    '';

  if (!manv || manv.toUpperCase() === 'ADMIN') {
    alert('❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.');
    return false;
  }

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert('❌ Chưa có dữ liệu hàng hóa để lưu.');
    return false;
  }

  return true;
}

async function checkEditPermission() {
  try {
    const { data, error } = await supabase.rpc('is_admin');
    if (error || data !== true) {
      alert('❌ Bạn không có quyền sửa hóa đơn CCN.');
      return false;
    }
    return true;
  } catch (e) {
    alert('❌ Không kiểm tra được quyền sửa hóa đơn CCN.');
    return false;
  }
}

async function saveViaRpcCCN({ isEdit = false } = {}) {
  const ctx = buildCCNCtxFromPathname();

  if (!ctx?.isCCN) {
    alert('❌ Trang hiện tại không phải trang chuyển chi nhánh.');
    return;
  }

  if (!validateBeforeSaveCCN(ctx)) return;

  const sohd = document.getElementById('sohd')?.value?.trim();
  const hdState = (document.getElementById('hd_state')?.value || 'moi').trim().toLowerCase();

  const shouldEdit = isEdit || choPhepSuaCCN || (window.HD_CTX?.mode === 'EDIT');

  if (hdState === 'xem' && !shouldEdit) {
    const p = document.getElementById('popupXacThucSua');
    if (p) {
      p.style.display = 'block';
      document.getElementById('xacmanv')?.focus();
    } else {
      alert('❌ Bạn đang xem hóa đơn cũ. Vui lòng xác thực sửa trước khi lưu.');
    }
    return;
  }

  const xacNhan = confirm(
    shouldEdit
      ? 'Bạn có chắc chắn muốn SỬA hóa đơn chuyển chi nhánh này không?'
      : 'Bạn có chắc chắn muốn LƯU hóa đơn chuyển chi nhánh này không?'
  );
  if (!xacNhan) return;

  const createdAt = getNowIso();
  const updatedAt = shouldEdit ? getNowIso() : null;

  const header_goc = getHeaderFromUI(sohd, ctx, createdAt, updatedAt);
  const { details_goc, details_doi_ung } = await buildDetailsForRPC(sohd, ctx, createdAt, updatedAt);

  const payload = {
    mode: shouldEdit ? 'EDIT' : 'NEW',
    page_ctx: {
      page: window.location.pathname || '',
      src: ctx.src,
      dst: ctx.dst,
      loaihd_goc: ctx.loaihdGoc,
      loaihd_doi_ung: ctx.loaihdDoiUng
    },
    header_goc,
    details_goc,
    details_doi_ung,
    user_info: {
      manv: document.getElementById('manv')?.value?.trim() || '',
      tennv: document.getElementById('tennv')?.value?.trim() || ''
    }
  };

  const { data, error } = await supabase.rpc('rpc_save_ccn_atomic', {
    p_payload: payload
  });

  if (error) {
    console.error('rpc_save_ccn_atomic error:', error);
    alert(`❌ Lưu hóa đơn CCN thất bại!\n${error.message || 'Lỗi không xác định'}`);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    alert(`❌ Lưu hóa đơn CCN thất bại!\n${row?.message || 'Không rõ nguyên nhân'}`);
    return;
  }

  document.getElementById('sohd').value = row.sohd_goc || sohd;

  alert(`✅ Đã lưu hóa đơn CCN thành công!\nGốc: ${row.sohd_goc}\nĐối ứng: ${row.sohd_doi_ung}`);

  await lamMoiSauKhiLuuCCN();

  choPhepSuaCCN = false;
  window.choPhepSua = false;
  window.HD_CTX = { mode: 'NEW', version: null };
}

async function lamMoiSauKhiLuuCCN() {
  const diadiemVal = document.getElementById('diadiem')?.value || '';
  const manvVal = document.getElementById('manv')?.value || '';
  const tennvVal = document.getElementById('tennv')?.value || '';

  document.querySelectorAll('input').forEach((input) => {
    if (!['diadiem', 'manv', 'tennv', 'hd_state'].includes(input.id)) {
      input.value = '';
    }
  });

  resetBangKetQua();
  capNhatThongTinTong(getBangKetQua());

  if (document.getElementById('diadiem')) document.getElementById('diadiem').value = diadiemVal;
  if (document.getElementById('manv')) document.getElementById('manv').value = manvVal;
  if (document.getElementById('tennv')) document.getElementById('tennv').value = tennvVal;
  if (document.getElementById('ngay')) document.getElementById('ngay').value = new Date().toISOString().slice(0, 10);

  await capNhatSoHoaDonTuDong();

  const st = document.getElementById('hd_state');
  if (st) st.value = 'moi';

  document.getElementById('masp')?.focus();
}

/* =========================
 * PUBLIC FUNCTIONS
 * ========================= */

export async function luuHoaDonCCN() {
  await saveViaRpcCCN({ isEdit: false });
}

export async function xacNhanSuaHoaDonCCN() {
  const ok = await checkEditPermission();
  if (!ok) return;

  choPhepSuaCCN = true;
  window.choPhepSua = true;
  window.HD_CTX = {
    ...(window.HD_CTX || {}),
    mode: 'EDIT',
    fromConfirm: true,
    edit_at: new Date().toISOString()
  };

  const popup = document.getElementById('popupXacThucSua');
  if (popup) popup.style.display = 'none';

  await saveViaRpcCCN({ isEdit: true });
}

/* =========================
 * EXPOSE TO WINDOW
 * ========================= */
window.luuHoaDonCCN = luuHoaDonCCN;
window.xacNhanSuaHoaDonCCN = xacNhanSuaHoaDonCCN;
window.LUU_HOADON_F2 = luuHoaDonCCN;
