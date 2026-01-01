// popupKhachhang.js (UPGRADED)
// Version stamp: 2026-01-01_01
import { supabase } from './supabaseClient.js';

let currentOnSelect = null;

const CREATE_URL_BASE = 'https://banle-js.vercel.app/nhapdmkhachhang.html';

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
           border-radius:8px;
           padding:10px;
           min-width:360px;
           max-width:520px;
           max-height:520px;
           box-shadow:0 10px 25px rgba(0,0,0,0.25);
           display:flex;
           flex-direction:column;
         ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-weight:700;font-size:13px;color:#111827;">Tìm khách hàng</div>
          <div style="font-size:11px;color:#9ca3af;">v2026-01-01_01</div>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input id="txtSearchKH"
                 placeholder="Nhập mã KH / tên / SĐT..."
                 autocomplete="off"
                 style="flex:1 1 auto;padding:6px 8px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;">
          <button id="btnSearchKH"
                  style="padding:6px 10px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;cursor:pointer;background:#fff;">
            Tìm
          </button>
        </div>

        <div id="khCreateWrap" style="display:none;margin-bottom:6px;">
          <button id="btnCreateKH"
                  style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #16a34a;background:#16a34a;color:#fff;font-weight:700;cursor:pointer;">
            Tạo khách hàng mới
          </button>
          <div id="khCreateHint" style="margin-top:4px;font-size:11px;color:#6b7280;"></div>
        </div>

        <div style="flex:1 1 auto;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;">
          <table id="tableKH" style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:left;width:110px;">Mã KH</th>
                <th style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:left;">Tên khách</th>
                <th style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:left;width:110px;">SĐT</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div style="margin-top:6px;font-size:11px;color:#6b7280;display:flex;justify-content:space-between;gap:10px;">
          <div>Enter để tìm • Click dòng để chọn</div>
          <div>ESC để đóng</div>
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

  const txt = document.getElementById('txtSearchKH');
  const btn = document.getElementById('btnSearchKH');
  const btnCreate = document.getElementById('btnCreateKH');

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

  btnCreate.addEventListener('click', (e) => {
    e.preventDefault();
    openCreateKHFromSearch();
  });

  console.log('[popupKhachhang] loaded version 2026-01-01_01');
}

function showCreateBlock(show, { q = '', reason = '' } = {}) {
  const wrap = document.getElementById('khCreateWrap');
  const hint = document.getElementById('khCreateHint');
  if (!wrap || !hint) return;

  if (!show) {
    wrap.style.display = 'none';
    hint.textContent = '';
    wrap.dataset.query = '';
    return;
  }

  wrap.style.display = 'block';
  wrap.dataset.query = q || '';
  hint.textContent = reason || (q ? `Không tìm thấy "${q}". Bạn có muốn tạo khách hàng mới?` : 'Bạn có muốn tạo khách hàng mới?');
}

function normalizePhone10(s) {
  if (!s) return '';
  const digits = String(s).replace(/\D+/g, '');
  // Nếu 84xxxxxxxxx -> đổi về 0xxxxxxxxx (VN)
  if (digits.startsWith('84') && digits.length >= 11) {
    return '0' + digits.slice(2, 11);
  }
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(0, 10);
  if (digits.length === 10) return digits;
  return digits.slice(0, 10);
}

function guessCreateParamsFromQuery(q) {
  const qq = (q || '').trim();
  if (!qq) return {};
  // Ưu tiên nếu người dùng gõ số -> coi như SĐT
  const phone = normalizePhone10(qq);
  if (/^\d{9,11}$/.test(qq.replace(/\D+/g, '')) && phone.length === 10) {
    return { phone };
  }
  // Còn lại coi như makh
  return { makh: qq };
}

function buildCreateUrlFromQuery(q) {
  const params = guessCreateParamsFromQuery(q);
  const url = new URL(CREATE_URL_BASE);
  if (params.phone) url.searchParams.set('phone', params.phone);
  if (params.makh) url.searchParams.set('makh', params.makh);
  // Thêm flag để trang biết đang mở từ popup
  url.searchParams.set('from', 'popup');
  return url.toString();
}

function openCreateKHFromSearch() {
  const wrap = document.getElementById('khCreateWrap');
  const q = (wrap && wrap.dataset && wrap.dataset.query) ? wrap.dataset.query : '';
  const url = buildCreateUrlFromQuery(q);
  window.open(url, '_blank', 'noopener');
}

// ===== Supabase query =====
async function loadListKH(keyword = '') {
  const tableBody = document.querySelector('#tableKH tbody');
  if (!tableBody) return;

  showCreateBlock(false);

  tableBody.innerHTML = `<tr><td colspan="3" style="padding:8px;">Đang tải...</td></tr>`;

  // NOTE: bạn có thể chỉnh thêm điều kiện tìm theo SĐT nếu muốn
  let query = supabase
    .from('dmkhachhang')
    .select('makh, tenkh, dienthoai')
    .order('makh', { ascending: true })
    .limit(200);

  if (keyword) {
    const q = keyword.replace(/%/g, '\\%').replace(/,/g, '\\,');
    query = query.or(
      `makh.ilike.%${q}%,tenkh.ilike.%${q}%,dienthoai.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error('Lỗi đọc dmkhachhang:', error);
    tableBody.innerHTML = `<tr><td colspan="3" style="padding:8px;color:#b91c1c;">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" style="padding:8px;">Không tìm thấy khách hàng.</td></tr>`;
    if (keyword && keyword.trim()) {
      showCreateBlock(true, { q: keyword.trim() });
    }
    return;
  }

  tableBody.innerHTML = data
    .map(
      (kh) => `
        <tr class="chonkh"
            data-makh="${(kh.makh || '').replace(/"/g, '&quot;')}"
            data-tenkh="${(kh.tenkh || '').replace(/"/g, '&quot;')}"
            style="cursor:pointer;">
          <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${kh.makh || ''}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${kh.tenkh || ''}</td>
          <td style="padding:6px;border-bottom:1px solid #f3f4f6;">${kh.dienthoai || ''}</td>
        </tr>`
    )
    .join('');

  Array.from(tableBody.querySelectorAll('.chonkh')).forEach((row) => {
    row.onclick = () => {
      const makh = row.dataset.makh || '';
      const tenkh = row.dataset.tenkh || '';
      if (typeof currentOnSelect === 'function') currentOnSelect(makh, tenkh);
      const p = document.getElementById('popupTimKH');
      if (p) p.style.display = 'none';
    };
  });
}

// ===== Public API =====
export function showPopupTimKH(onSelect) {
  currentOnSelect = onSelect || null;
  ensurePopupDom();
  const popup = document.getElementById('popupTimKH');
  const txt = document.getElementById('txtSearchKH');

  if (popup) popup.style.display = 'flex';
  if (txt) txt.value = '';

  // load lần đầu (hiển thị 200 KH đầu)
  loadListKH('');
  if (txt) txt.focus();
}
