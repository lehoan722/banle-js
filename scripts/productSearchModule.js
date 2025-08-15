/*
  productSearchModule.js
  — Module tái sử dụng để: tìm kiếm sản phẩm (mã/tên), gợi ý mã ngay trong ô nhập,
    và lấy dữ liệu sản phẩm từ Supabase. Không chứa key; truyền supabase client từ ngoài vào.

  TÍNH NĂNG CHÍNH
  1) initProductSearch: Gắn tìm kiếm live cho 1 ô input + khu vực danh sách, chọn 2-click/Enter → callback
  2) attachMaspPopup: Popup gợi ý ngay dưới ô MÃ SP (giống trang in tem) → chọn là đổ sang ô tên, auto-fill
  3) fetchProductByCode / fetchProductsByKeyword: API lấy dữ liệu sạch
  4) pushProductToHandsontable: Tiện ích đẩy 1 sản phẩm vào lưới Handsontable (nếu dùng)
  5) LRU Cache 2000 mã để giảm truy vấn lặp lại

  CÁCH DÙNG TỐI THIỂU (ví dụ, trong trang của bạn):
  import {
    initProductSearch,
    attachMaspPopup,
    fetchProductByCode,
    pushProductToHandsontable
  } from './scripts/productSearchModule.js';

  // 1) Tạo supabase client ở trang (bạn đã có):
  //   import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
  //   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options...);

  // 2) Gắn tìm kiếm cho danh sách bên trái (nếu cần):
  //   const cleanupSearch = initProductSearch({
  //     supabase,
  //     inputEl: document.getElementById('search'),
  //     listEl: document.getElementById('productList'),
  //     limit: 100,
  //     onPick: (product) => {
  //       // ví dụ: đẩy vào bảng Handsontable
  //       pushProductToHandsontable(hot, product);
  //     }
  //   });

  // 3) Gắn popup gợi ý cho ô mã (nếu có form thêm/sửa):
  //   const cleanupPopup = attachMaspPopup({
  //     supabase,
  //     maspInput: document.getElementById('maspInput'),
  //     tenspInput: document.getElementById('tenspInput'), // optional
  //     onPick: async (p) => {
  //       // ví dụ: điền thêm form hoặc gọi API khác
  //       const full = await fetchProductByCode(supabase, p.masp);
  //       // ...fill form từ "full"
  //     }
  //   });

  // 4) Khi rời trang: cleanupSearch() và cleanupPopup() để gỡ event listeners.
*/

// ===== LRU CACHE (tối đa 2000 items) =====
class LRUCache {
  constructor(max = 2000) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    // move to tail (most recent)
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.max) {
      // delete least-recently-used (first item)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}

const cacheByCode = new LRUCache(2000);    // cache theo mã (masp)
const cacheByQuery = new LRUCache(500);    // cache theo từ khóa (search list)

// ===== UTIL =====
export function toUpperSafe(s) {
  return (s || '').trim().toUpperCase();
}
export function formatCurrencyVND(val) {
  if (!val || val == 0) return '';
  const n = parseInt(String(val).replace(/\./g, '')) || 0;
  return n.toLocaleString('vi-VN');
}

// ===== DATA API =====
export async function fetchProductByCode(supabase, masp) {
  const key = `code:${toUpperSafe(masp)}`;
  const fromCache = cacheByCode.get(key);
  if (fromCache) return fromCache;
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('*')
    .eq('masp', toUpperSafe(masp))
    .maybeSingle();
  if (error) throw error;
  if (data) cacheByCode.set(key, data);
  return data || null;
}

export async function fetchProductsByKeyword(supabase, keyword, limit = 100) {
  const q = (keyword || '').trim().toLowerCase();
  const key = `q:${q}|${limit}`;
  const cached = cacheByQuery.get(key);
  if (cached) return cached;
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp, dvt, giale, gianhap')
    .or(`masp.ilike.%${q}%,tensp.ilike.%${q}%`)
    .order('masp')
    .limit(limit);
  if (error) throw error;
  const rows = data || [];
  cacheByQuery.set(key, rows);
  return rows;
}

// ===== HANDSONTABLE HELPER =====
export function pushProductToHandsontable(hot, product) {
  if (!hot || !product) return;
  let data = hot.getSourceData();
  // loại dòng trắng cuối bảng
  data = data.filter(row => Array.isArray(row)
    ? row.some(cell => cell !== null && cell !== "")
    : Object.values(row).some(cell => cell !== null && cell !== "")
  );
  const idx = data.findIndex(row => row[1] === product.masp);
  const rowObj = [
    0,                              // STT tạm, cập nhật lại sau
    product.masp,
    product.tensp,
    "0",                           // size mặc định
    1,                              // số lượng mặc định
    product.dvt || 'sp',
    product.gianhap || 1,
    true,
    product.giale || 0
  ];
  if (idx !== -1) data[idx] = rowObj; else data.push(rowObj);
  data.forEach((r, i) => r[0] = i + 1);
  hot.loadData(data);
}

// ===== UI: TÌM KIẾM LIVE (input + list) =====
export function initProductSearch({ supabase, inputEl, listEl, onPick, limit = 100 }) {
  if (!supabase || !inputEl || !listEl) throw new Error('Thiếu supabase/inputEl/listEl');
  let disposed = false;
  let lastController = null;

  async function doSearch() {
    if (disposed) return;
    const val = inputEl.value.trim();
    if (!val) {
      listEl.innerHTML = '';
      return;
    }
    try {
      // huỷ request cũ nếu còn
      if (lastController) lastController.abort?.();
      lastController = new AbortController();
      const rows = await fetchProductsByKeyword(supabase, val, limit);
      renderList(rows);
    } catch (e) {
      console.error(e);
    }
  }

  function renderList(rows) {
    const head = '<table><tr><th>Mã SP</th><th>Tên hàng</th></tr>';
    const body = (rows || []).map(p =>
      `<tr data-masp="${p.masp}" data-tensp="${p.tensp || ''}"><td>${p.masp}</td><td>${p.tensp || ''}</td></tr>`
    ).join('');
    listEl.innerHTML = head + body + '</table>';
    listEl.querySelectorAll('tr[data-masp]').forEach(tr => {
      tr.ondblclick = async () => {
        const p = {
          masp: tr.dataset.masp,
          tensp: tr.dataset.tensp || '',
          dvt: tr.dataset.dvt || '',
        };
        onPick && onPick(p);
      };
      tr.onkeydown = (e) => {
        if (e.key === 'Enter') tr.ondblclick();
      };
    });
  }

  const onInput = () => doSearch();
  inputEl.addEventListener('input', onInput);

  return function cleanup() {
    disposed = true;
    inputEl.removeEventListener('input', onInput);
    listEl.innerHTML = '';
  };
}

// ===== UI: POPUP GỢI Ý CHO Ô MÃ SẢN PHẨM =====
export function attachMaspPopup({ supabase, maspInput, tenspInput = null, onPick, limit = 100 }) {
  if (!supabase || !maspInput) throw new Error('Thiếu supabase hoặc maspInput');
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.zIndex = '9999';
  popup.style.background = 'white';
  popup.style.border = '1px solid #ddd';
  popup.style.maxHeight = '270px';
  popup.style.overflowY = 'auto';
  popup.style.display = 'none';
  popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  popup.style.fontSize = '13px';
  document.body.appendChild(popup);

  function positionPopup() {
    const rect = maspInput.getBoundingClientRect();
    popup.style.top = rect.bottom + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.width = rect.width + 'px';
  }

  let disposed = false;

  async function onType() {
    if (disposed) return;
    const val = (maspInput.value || '').trim().toLowerCase();
    if (!val) {
      popup.style.display = 'none';
      popup.innerHTML = '';
      return;
    }
    try {
      const rows = await fetchProductsByKeyword(supabase, val, limit);
      if (!rows || rows.length === 0) {
        popup.style.display = 'none';
        popup.innerHTML = '';
        return;
      }
      renderPopup(rows);
    } catch (e) {
      console.error(e);
    }
  }

  function renderPopup(rows) {
    const head = '<table style="width:100%;border-collapse:collapse">' +
      '<tr><th style="text-align:left;border-bottom:1px solid #eee;padding:2px 5px">Mã SP</th>' +
      '<th style="text-align:left;border-bottom:1px solid #eee;padding:2px 5px">Tên hàng</th></tr>';
    const body = rows.map(r =>
      `<tr data-masp="${r.masp}" data-tensp="${r.tensp || ''}"` +
      ` style="cursor:pointer"><td style=\"padding:2px 5px\">${r.masp}</td>` +
      `<td style=\"padding:2px 5px\">${r.tensp || ''}</td></tr>`
    ).join('');
    popup.innerHTML = head + body + '</table>';
    popup.style.display = 'block';
    positionPopup();

    popup.querySelectorAll('tr[data-masp]').forEach(tr => {
      tr.onclick = async () => {
        const masp = tr.dataset.masp;
        const tensp = tr.dataset.tensp || '';
        maspInput.value = masp;
        if (tenspInput) tenspInput.value = tensp;
        popup.style.display = 'none';
        // trả ra record đầy đủ nếu có
        let payload = { masp, tensp };
        try { const full = await fetchProductByCode(supabase, masp); payload = full || payload; } catch {}
        onPick && onPick(payload);
      };
    });
  }

  // Ẩn khi click ra ngoài
  function onDocMouseDown(e) {
    if (!popup.contains(e.target) && e.target !== maspInput) {
      popup.style.display = 'none';
    }
  }

  // Reposition on resize/scroll/focus
  const onResize = () => positionPopup();
  const onScroll = () => positionPopup();
  const onFocus = () => { if (popup.innerHTML.trim() !== '') { popup.style.display = 'block'; positionPopup(); } };

  maspInput.addEventListener('input', onType);
  document.addEventListener('mousedown', onDocMouseDown);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll);
  maspInput.addEventListener('focus', onFocus);

  return function cleanup() {
    disposed = true;
    maspInput.removeEventListener('input', onType);
    document.removeEventListener('mousedown', onDocMouseDown);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    maspInput.removeEventListener('focus', onFocus);
    popup.remove();
  };
}
