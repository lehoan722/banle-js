// scripts/luuhoadon_ccn.js
import { supabase } from './supabaseClient.js';
import { resetBangKetQua, getBangKetQua } from './hoadon.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';

import {
  refreshSessionIfNeeded,
  ensureCatalogsReady,
  hoaDonDaTonTai
} from './luuhoadon/api.js';

import {
  buildCCNCtxFromPathname,
  showExistDialog
} from './luuhoadon/builders.js';

import {
  normalizeBangKetQua,
  calcTongThanhTienFromBangKetQua
} from './luuhoadon/pricing.js';

import { requireManagedAtBranch } from './luuhoadon/validators.js';

window.HD_CTX = window.HD_CTX || { mode: 'NEW', version: null };

const CCN_CTX = buildCCNCtxFromPathname();
let choPhepSua = false;

function toastError(msg) {
  alert('❌ ' + msg);
}

function getInt(id) {
  return parseInt((document.getElementById(id)?.value || '').replace(/[.,]/g, '') || '0', 10);
}

function getVal(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function parseSoHD(sohd) {
  const [prefix = '', numStr = ''] = String(sohd || '').trim().split('_');
  const so = parseInt(numStr, 10);
  return { prefix, numStr, so };
}

function buildCounterpartSoHD(sohdGoc, loaiDoiUng) {
  const { numStr } = parseSoHD(sohdGoc);
  if (!numStr) throw new Error('Số hóa đơn gốc không hợp lệ.');
  return `${loaiDoiUng}_${numStr}`;
}

function ensureCCNPage() {
  if (!CCN_CTX?.isCCN) {
    throw new Error('Trang hiện tại không phải trang chuyển chi nhánh.');
  }
}

function ensureBaseInputs() {
  capNhatThongTinTong(getBangKetQua());

  const maspChuaNhap = getVal('masp');
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    document.getElementById('masp')?.focus();
    throw new Error('Bạn còn mã sản phẩm chưa thêm vào bảng!');
  }

  const sohd = getVal('sohd');
  if (!sohd) throw new Error('Chưa có số hóa đơn.');

  const tennv = getVal('tennv');
  if (!tennv) throw new Error('Bạn chưa nhập tên nhân viên.');

  const manv = getVal('manv') || localStorage.getItem('manv') || '';
  if (!manv || manv.toUpperCase() === 'ADMIN') {
    throw new Error('Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.');
  }

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    throw new Error('Không có dữ liệu để lưu hóa đơn.');
  }

  return { sohd, tennv, manv, bangKetQua };
}

function appendEditNote(noteGoc) {
  const oldNote = String(noteGoc || '').trim();
  const manv = getVal('manv');
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const count = (oldNote.match(/Sửa lần/g) || []).length + 1;
  const line = `Sửa lần ${count} – ${timestamp} – ${manv}`;
  return oldNote ? `${oldNote}\n${line}` : line;
}

function buildHeaderBase(bangKetQua, noteOverride = null) {
  return {
    ngay: getVal('ngay'),
    manv: getVal('manv'),
    tennv: getVal('tennv'),
    khachhang: getVal('khachhang'),
    tongsl: getInt('tongsl'),
    tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
    tongkm: getInt('tongkm'),
    chietkhau: getInt('chietkhau'),
    thanhtoan: getInt('phaithanhtoan'),
    hinhthuctt: getVal('hinhthuctt'),
    ghichu: noteOverride !== null ? noteOverride : (document.getElementById('ghichu')?.value || ''),
    loai: '',
    dvt: '',
    nhacc: ''
  };
}

function buildDetailRowsForBranch(bangKetQua, sohd, branchCode, createdAt, updatedAt = null) {
  const rows = [];
  const branchUpper = String(branchCode || '').toUpperCase();

  Object.values(bangKetQua).forEach(item => {
    const sizes = Array.isArray(item.sizes) ? item.sizes : [];
    const soluongs = Array.isArray(item.soluongs) ? item.soluongs : [];

    sizes.forEach((sz, i) => {
      const sl = Number(soluongs[i] || 0);
      if (!sl) return;

      const masp = String(item.masp || '').trim().toUpperCase();
      const inputSize = String(sz ?? '').trim() || '0';
      const managed = requireManagedAtBranch(masp, branchUpper);
      const effectiveSize = managed ? inputSize : '0';

      const row = {
        sohd,
        masp,
        tensp: item.tensp || '',
        size: effectiveSize,
        soluong: sl,
        gia: Number(item.gia || 0),
        km: Number(item.km || 0),
        thanhtien: (Number(item.gia || 0) - Number(item.km || 0)) * sl,
        dvt: item.dvt || '',
        diadiem: branchCode.toLowerCase(),
        created_at: createdAt,
        ngay: getVal('ngay')
      };

      if (updatedAt) row.updated_at = updatedAt;
      rows.push(row);
    });
  });

  return rows;
}

async function buildCCNPayload() {
  ensureCCNPage();
  const { sohd, bangKetQua } = ensureBaseInputs();

  normalizeBangKetQua(bangKetQua);
  await ensureCatalogsReady();

  const { prefix, so } = parseSoHD(sohd);
  if (!Number.isInteger(so) || so <= 0) {
    throw new Error('Số hóa đơn không hợp lệ.');
  }

  if (prefix !== CCN_CTX.loaihdGoc) {
    throw new Error(`Trang này yêu cầu số chứng từ có tiền tố "${CCN_CTX.loaihdGoc}_*".`);
  }

  const isEdit = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;
  const updatedAt = isEdit ? (window.HD_CTX?.edit_at || new Date().toISOString()) : null;

  let note = document.getElementById('ghichu')?.value || '';
  if (isEdit) {
    note = appendEditNote(note);
    document.getElementById('ghichu').value = note;
  }

  const sohdGoc = sohd;
  const sohdDoiUng = buildCounterpartSoHD(sohdGoc, CCN_CTX.loaihdDoiUng);

  const baseHeader = buildHeaderBase(bangKetQua, note);
  const headerGoc = {
    ...baseHeader,
    sohd: sohdGoc,
    loaihd: CCN_CTX.loaihdGoc,
    diadiem: CCN_CTX.src.toLowerCase()
  };

  const headerDoiUng = {
    ...baseHeader,
    sohd: sohdDoiUng,
    loaihd: CCN_CTX.loaihdDoiUng,
    diadiem: CCN_CTX.dst.toLowerCase()
  };

  if (updatedAt) {
    headerGoc.updated_at = updatedAt;
    headerDoiUng.updated_at = updatedAt;
  }

  const createdAtTemp = new Date().toISOString();

  const linesGoc = buildDetailRowsForBranch(
    bangKetQua,
    sohdGoc,
    CCN_CTX.src,
    createdAtTemp,
    updatedAt
  );

  const linesDoiUng = buildDetailRowsForBranch(
    bangKetQua,
    sohdDoiUng,
    CCN_CTX.dst,
    createdAtTemp,
    updatedAt
  );

  if (!linesGoc.length) throw new Error('Không có dòng chi tiết hợp lệ của hóa đơn gốc.');
  if (!linesDoiUng.length) throw new Error('Không có dòng chi tiết hợp lệ của hóa đơn đối ứng.');

  return {
    mode: isEdit ? 'edit' : 'new',
    sohd_goc: sohdGoc,
    sohd_doi_ung: sohdDoiUng,
    loaihd_goc: CCN_CTX.loaihdGoc,
    loaihd_doi_ung: CCN_CTX.loaihdDoiUng,
    diadiem_goc: CCN_CTX.src.toLowerCase(),
    diadiem_doi_ung: CCN_CTX.dst.toLowerCase(),
    header_goc: headerGoc,
    header_doi_ung: headerDoiUng,
    lines_goc: linesGoc,
    lines_doi_ung: linesDoiUng
  };
}

async function saveCCNViaRPC(payload) {
  await refreshSessionIfNeeded();

  const { data, error } = await supabase.rpc('rpc_save_ccn_atomic', {
    p_mode: payload.mode,
    p_sohd_goc: payload.sohd_goc,
    p_loaihd_goc: payload.loaihd_goc,
    p_loaihd_doi_ung: payload.loaihd_doi_ung,
    p_diadiem_goc: payload.diadiem_goc,
    p_diadiem_doi_ung: payload.diadiem_doi_ung,
    p_header_goc: payload.header_goc,
    p_header_doi_ung: payload.header_doi_ung,
    p_lines_goc: payload.lines_goc,
    p_lines_doi_ung: payload.lines_doi_ung
  });

  if (error) {
    throw new Error(error.message || 'RPC lưu chuyển chi nhánh thất bại.');
  }

  if (!data || data.ok !== true) {
    throw new Error(data?.error || 'RPC lưu chuyển chi nhánh trả về không hợp lệ.');
  }

  return data;
}

function inHoaDon(hoadon, chitiet) {
  const data = { hoadon, chitiet };
  localStorage.setItem('data_hoadon_in', JSON.stringify(data));

  const url = '/in-hoadon.html';

  if (typeof window.openPrintOverlay === 'function') {
    const fast1 = document.getElementById('inNhanh')?.checked;
    const fast2 = document.getElementById('chk_innhanh')?.checked;
    const fast3 = document.getElementById('inKhongHoi')?.checked;
    const fast = !!(fast1 || fast2 || fast3);

    if (fast && typeof window.quickPrint === 'function') {
      window.quickPrint(url);
    } else {
      window.openPrintOverlay(url, { autoPrint: false });
    }
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Không thể gọi print() từ iframe:', e);
      } finally {
        iframe.remove();
      }
    }, 500);
  };
}

async function lamMoiSauKhiLuu() {
  const diadiemVal = document.getElementById('diadiem')?.value || '';
  const manvVal = document.getElementById('manv')?.value || '';
  const tennvVal = document.getElementById('tennv')?.value || '';

  document.querySelectorAll('input').forEach(input => {
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

  window.HD_CTX = { mode: 'NEW', version: null };
  choPhepSua = false;
  window.choPhepSua = false;

  await capNhatSoHoaDonTuDong();

  const st = document.getElementById('hd_state');
  if (st) st.value = 'moi';

  document.getElementById('masp')?.focus();
}

async function handleNewWhenExists(sohd) {
  const choice = await showExistDialog(sohd);

  if (choice === 'edit') {
    const p = document.getElementById('popupXacThucSua');
    if (p) {
      p.style.display = 'block';
      document.getElementById('xacmanv')?.focus();
    }
    return true;
  }

  await capNhatSoHoaDonTuDong();
  const sohdMoi = getVal('sohd');
  alert(`ℹ️ Số cũ đã tồn tại. Hệ thống đã cấp số mới: ${sohdMoi}. Bấm Lưu lại để lưu số mới.`);
  return true;
}

export async function luuHoaDonccn1v2() {
  try {
    ensureCCNPage();

    const hdState = (document.getElementById('hd_state')?.value || 'moi').trim().toLowerCase();
    const isEdit = (window.HD_CTX?.mode === 'EDIT') || !!choPhepSua;

    if (hdState === 'xem' && !isEdit) {
      const p = document.getElementById('popupXacThucSua');
      if (p) {
        p.style.display = 'block';
        document.getElementById('xacmanv')?.focus();
      } else {
        throw new Error('Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.');
      }
      return;
    }

    const sohd = getVal('sohd');
    if (!isEdit && sohd && await hoaDonDaTonTai(sohd)) {
      const handled = await handleNewWhenExists(sohd);
      if (handled) return;
    }

    const payload = await buildCCNPayload();
    const out = await saveCCNViaRPC(payload);

    document.getElementById('sohd').value = out.sohd_goc || payload.sohd_goc;
    alert(`✅ Đã lưu hóa đơn CCN (cả gốc và đối ứng)!`);

    inHoaDon(payload.header_goc, payload.lines_goc);
    await lamMoiSauKhiLuu();
  } catch (err) {
    console.error('luuHoaDonccn1v2 error:', err);
    alert('❌ ' + (err?.message || 'Lưu hóa đơn CCN thất bại.'));
    throw err;
  }
}

export async function xacNhanSuaHoaDon() {
  const popup = document.getElementById('popupXacThucSua');
  const closePopup = () => {
    if (popup) popup.style.display = 'none';
  };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toastError('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.');
      closePopup();
      return;
    }
  } catch (e) {
    toastError('Không kiểm tra được phiên đăng nhập. Vui lòng tải lại trang.');
    closePopup();
    return;
  }

  try {
    const { data: isAdmin, error } = await supabase.rpc('is_admin');
    if (error || isAdmin !== true) {
      toastError('Bạn không có quyền sửa hóa đơn.');
      closePopup();
      return;
    }
  } catch (e) {
    toastError('Không kiểm tra được quyền sửa hóa đơn.');
    closePopup();
    return;
  }

  choPhepSua = true;
  window.choPhepSua = true;
  window.HD_CTX = {
    ...(window.HD_CTX || {}),
    mode: 'EDIT',
    fromConfirm: true,
    edit_at: new Date().toISOString()
  };

  closePopup();
  await luuHoaDonccn1v2();
}

window.luuHoaDonccn1v2 = luuHoaDonccn1v2;
window.xacNhanSuaHoaDon = xacNhanSuaHoaDon;
window.LUU_HOADON_F2 = luuHoaDonccn1v2;