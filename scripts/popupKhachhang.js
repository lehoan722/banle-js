// popupKhachhang.js
import { supabase } from './supabaseClient.js';

let currentOnSelect = null;

const URL_TAO_KH_MOI = 'https://banle-js.vercel.app/nhapdmkhachhang.html';

// coi keyword là "mã KH" nếu toàn số và đủ dài (anh đang dùng mã = SĐT 10 số)
function isMaKhachHangLike(keyword) {
  const k = (keyword || '').trim();
  if (!k) return false;
  if (!/^\d+$/.test(k)) return false;
  return k.length >= 6; // gõ 6 số trở lên thì coi như đang tìm theo mã
}

function openTaoKhachHangMoi(makh) {
  const url = makh
    ? `${URL_TAO_KH_MOI}?makh=${encodeURIComponent(makh)}`
    : URL_TAO_KH_MOI;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Tạo DOM popup 1 lần
function ensurePopupDom() {
  if (document.getElementById('popupTimKH')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="popupTimKH"
         style="
           display:none;
           position:fixed;
           inset:0;
           background:rgba(0,0,0,0.25);
           z-index:9999;
           display:flex;
           align-items:center;
           justify-content:center;
         ">
      <div id="popupTimKHBox"
           style="
             background:#fff;
             border-radius:6px;
             width:420px;
             max-width:92vw;
             height:420px;
             max-height:88vh;
             padding:10px;
             box-shadow:0 10px 25px rgba(0,0,0,0.25);
             display:flex;
             flex-direction:column;
           ">
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input id="txtSearchKH"
                 placeholder="Nhập mã / tên khách..."
                 autocomplete="off"
                 style="flex:1 1 auto;padding:6px 8px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;outline:none;">
          <button id="btnSearchKH"
                  style="padding:6px 10px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;">
            Tìm
          </button>
        </div>

        <div style="flex:1 1 auto;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;">
          <table id="tableKH" style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:left;width:120px;">Mã KH</th>
                <th style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:left;">Tên khách</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div id="khFooterNote" style="margin-top:6px;font-size:11px;color:#6b7280;">
          ESC để đóng popup • Click vào dòng để chọn khách.
        </div>

        <div id="khCreateWrap" style="display:none;margin-top:8px;">
          <button id="btnCreateKH"
                  style="width:100%;padding:9px 10px;font-size:13px;border-radius:8px;border:1px solid #16a34a;background:#16a34a;color:#fff;cursor:pointer;">
            + Tạo khách hàng mới
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);

  const popup = document.getElementById('popupTimKH');
  const box = document.getElementById('popupTimKHBox');
  const txt = document.getElementById('txtSearchKH');
  const btn = document.getElementById('btnSearchKH');
  const btnCreate = document.getElementById('btnCreateKH');

  // Click nền để đóng (click vào box thì không đóng)
  popup.addEventListener('mousedown', (e) => {
    if (box && box.contains(e.target)) return;
    popup.style.display = 'none';
  });

  // Đóng popup bằng ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const p = document.getElementById('popupTimKH');
      if (p) p.style.display = 'none';
    }
  });

  // Enter để search
  txt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadListKH(txt.value.trim());
    }
  });

  // click nút tìm
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    loadListKH(txt.value.trim());
  });

  // gợi ý: gõ là search nhẹ (debounce mini)
  let t = null;
  txt.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => loadListKH(txt.value.trim()), 180);
  });

  // Nút tạo KH mới
  btnCreate.addEventListener('click', (e) => {
    e.preventDefault();
    const kw = (txt?.value || '').trim();
    openTaoKhachHangMoi(kw);
  });
}

// Hàm gọi Supabase để lấy danh sách KH
async function loadListKH(keyword = '') {
  const tableBody = document.querySelector('#tableKH tbody');
  const createWrap = document.getElementById('khCreateWrap');
  if (!tableBody) return;

  if (createWrap) createWrap.style.display = 'none';

  tableBody.innerHTML = `<tr><td colspan="2" style="padding:8px;">Đang tải...</td></tr>`;

  let query = supabase
    .from('dmkhachhang')
    .select('makh, tenkh')
    .order('makh', { ascending: true })
    .limit(80);

  if (keyword) {
    // tìm theo mã hoặc tên
    query = query.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Lỗi đọc dmkhachhang:', error);
    tableBody.innerHTML = `<tr><td colspan="2" style="padding:8px;color:#b91c1c;">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="2" style="padding:8px;">Không tìm thấy khách hàng.</td></tr>`;

    // Nếu đang tìm theo "mã KH" mà không thấy -> hiện nút tạo mới
    if (createWrap && isMaKhachHangLike(keyword)) {
      createWrap.style.display = 'block';
    }
    return;
  }

  tableBody.innerHTML = data
    .map(
      (kh) => `
        <tr class="chonkh" data-makh="${kh.makh ?? ''}" data-tenkh="${kh.tenkh ?? ''}"
            style="cursor:pointer;">
          <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${kh.makh ?? ''}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${kh.tenkh ?? ''}</td>
        </tr>`
    )
    .join('');

  // click để chọn
  Array.from(tableBody.querySelectorAll('.chonkh')).forEach((row) => {
    row.onclick = () => {
      const makh = row.dataset.makh || '';
      const tenkh = row.dataset.tenkh || '';
      if (typeof currentOnSelect === 'function') {
        currentOnSelect(makh, tenkh);
      }
      const p = document.getElementById('popupTimKH');
      if (p) p.style.display = 'none';
    };
  });
}

// Hàm public để trang khác gọi
export function showPopupTimKH(onSelect) {
  currentOnSelect = onSelect || null;
  ensurePopupDom();

  const popup = document.getElementById('popupTimKH');
  const txt = document.getElementById('txtSearchKH');

  if (popup) popup.style.display = 'flex';
  if (txt) txt.value = '';

  // load lần đầu
  loadListKH('');
  if (txt) txt.focus();
}
