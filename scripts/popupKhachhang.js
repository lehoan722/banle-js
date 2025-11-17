// popupKhachhang.js
import { supabase } from './supabaseClient.js';

let currentOnSelect = null;

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
      <div style="
           background:#fff;
           border-radius:6px;
           padding:8px;
           min-width:340px;
           max-width:480px;
           max-height:420px;
           box-shadow:0 10px 25px rgba(0,0,0,0.25);
           display:flex;
           flex-direction:column;
         ">
        <div style="display:flex;gap:4px;margin-bottom:4px;">
          <input id="txtSearchKH"
                 placeholder="Nhập mã / tên khách..."
                 style="flex:1 1 auto;padding:4px 6px;font-size:13px;border:1px solid #d1d5db;border-radius:4px;">
          <button id="btnSearchKH"
                  style="padding:4px 8px;font-size:13px;border-radius:4px;border:1px solid #d1d5db;cursor:pointer;">
            Tìm
          </button>
        </div>
        <div style="flex:1 1 auto;overflow:auto;border:1px solid #e5e7eb;">
          <table id="tableKH" style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:left;width:90px;">Mã KH</th>
                <th style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:left;">Tên khách</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#6b7280;">
          ESC để đóng popup • Click vào dòng để chọn khách.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);

  // Đóng popup bằng ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const p = document.getElementById('popupTimKH');
      if (p) p.style.display = 'none';
    }
  });

  // Gắn event tìm kiếm
  const txt = document.getElementById('txtSearchKH');
  const btn = document.getElementById('btnSearchKH');
  txt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadListKH(txt.value.trim());
    }
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    loadListKH(txt.value.trim());
  });
}

// Hàm gọi Supabase để lấy danh sách KH
async function loadListKH(keyword = '') {
  const tableBody = document.querySelector('#tableKH tbody');
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="2" style="padding:4px;">Đang tải...</td></tr>`;

  let query = supabase
    .from('dmkhachhang')
    .select('makh, tenkh')
    .order('makh', { ascending: true })
    .limit(200);

  if (keyword) {
    // tìm theo mã hoặc tên chứa keyword
    query = query.or(
      `makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error('Lỗi đọc dmkhachhang:', error);
    tableBody.innerHTML = `<tr><td colspan="2" style="padding:4px;color:#b91c1c;">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="2" style="padding:4px;">Không tìm thấy khách hàng.</td></tr>`;
    return;
  }

  tableBody.innerHTML = data
    .map(
      (kh) => `
        <tr class="chonkh" data-makh="${kh.makh}" data-tenkh="${kh.tenkh}"
            style="cursor:pointer;">
          <td style="padding:4px;border-bottom:1px solid #f3f4f6;">${kh.makh}</td>
          <td style="padding:4px;border-bottom:1px solid #f3f4f6;">${kh.tenkh}</td>
        </tr>`
    )
    .join('');

  Array.from(tableBody.querySelectorAll('.chonkh')).forEach((row) => {
    row.onclick = () => {
      const makh = row.dataset.makh;
      const tenkh = row.dataset.tenkh;
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
