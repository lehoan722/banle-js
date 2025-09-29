// public/scripts/nhaptammobile.controller.js
; (() => {
  const SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45]
  const STORAGE_KEY = 'nhaptammobilecs1_draft_v1'
  const cs = 'cs1'

  const $ = s => document.querySelector(s)
  const $$ = s => Array.from(document.querySelectorAll(s))

  let lastSnapshot = null // for Undo (1 bước)
  let cacheSKU = new Set() // 2.000 mã
  let quanLySizeCache = new Map() // masp -> boolean

  // ======== INIT ========
  async function init() {
    // tên NV, địa điểm, ngày giờ, số HĐ
    $('#lblDiaDiem').textContent = 'CS1'
    $('#lblNgayGio').textContent = new Date().toLocaleString()
    const user = window.AppUser || {} // tùy main.js của bạn set
    $('#lblTenNV').textContent = user.ten || user.email || '-'

    // số HĐ tạm (sẽ cập nhật khi lưu)
    try {
      const so = await window.SoHoaDon?.goiSoDuKien?.('nhaptamcs1')
      if (so) $('#lblSoHD').textContent = so
    } catch (e) { }

    // cache 2000 mã
    cacheSKU = await loadSKUCache()

    // hook events
    $('#inpMa').addEventListener('keydown', onEnterMa)

    SIZES.forEach(sz => {
      const el = $(`#q${sz}`);
      if (!el) return;
      el.addEventListener('keydown', e => onEnterSize(e, sz));
      el.addEventListener('input', recalcNhapHienTai); // <-- thêm dòng này
    });


    $('#btnChuyen1').onclick = handleChuyen1
    $('#btnChuyen2').onclick = handleChuyen2
    $('#btnThemMoi').onclick = clearInputs
    $('#btnLuu').onclick = handleLuu
    $('#btnXoaBang').onclick = () => { NTGrid.replaceState({}); localStorage.removeItem(STORAGE_KEY); onGridChanged(); }

    // grid change → cập nhật tổng & validate
    window.NTMobile.onGridChanged = onGridChanged

    // khôi phục draft
    restoreDraft()
    // lock/mở size theo mã hiện tại (nếu có)
    await applyQuanLySizeForCurrentMa()
  }

  function recalcNhapHienTai() {
    let s = 0;
    SIZES.forEach(sz => {
      const v = parseInt($(`#q${sz}`)?.value || '0', 10) || 0;
      s += v;
    });
    $('#inpTongNhapHienTai').value = s;
  }


  // ======== SIZE LOCK BY SKU MODE ========
  async function isQuanLySize(masp) {
    // 1) Ưu tiên dữ liệu đã cache
    const sp = (window.sanPhamData || {})[masp];
    if (sp) {
      // chủng loại GD (giày dép) → quản size
      if (String(sp.chungloai || '').toUpperCase() === 'GD') return true;
      // nếu DM có cờ quanlysize (nếu bạn có) → dùng trực tiếp
      if (sp.quanlysize !== undefined) return !!sp.quanlysize;
    }
    // 2) Hỏi API theo nhóm/địa điểm (nếu có), nếu không có → mặc định FALSE
    try {
      const flag = await window.AppAPI?.isQuanLySizeTheoCoSo?.(masp, cs);
      if (typeof flag === 'boolean') return flag;
    } catch (e) { }
    return false; // ⬅ mặc định KHÔNG quản size
  }
  async function applyQuanLySizeForCurrentMa() {
    const masp = $('#inpMa').value.trim().toUpperCase()
    if (!masp) return
    const qls = await isQuanLySize(masp)
    // nếu QLS: mở 38..45, khóa 0; ngược lại mở 0, khóa 38..45
    toggleSizeInputs(qls)
  }
  function toggleSizeInputs(qls) {
    const open = (id, on) => {
      const el = document.querySelector(id); if (!el) return;
      el.disabled = !on;
      if (!on) { el.value = ''; }      // tắt thì xóa giá trị
    };
    // C2 (ô nhập)
    open('#q0', !qls);
    [38, 39, 40, 41, 42, 43, 44, 45].forEach(sz => open(`#q${sz}`, qls));
    // C1 (cột “nhãn size”)
    open('#sz0', !qls);
    [38, 39, 40, 41, 42, 43, 44, 45].forEach(sz => open(`#sz${sz}`, qls));
  }

  // ======== ENTER FLOW ========
  async function onEnterMa(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const box = $('#unknownSku');
    const masp = $('#inpMa').value.trim().toUpperCase();
    if (!masp) { box.style.display = 'none'; return; }

    // Ưu tiên cache hiện có
    let ok = !!(window.sanPhamData && window.sanPhamData[masp]);
    if (!ok) {
      // Fallback: nếu không có AppAPI → hỏi thẳng Supabase
      try {
        if (window.AppAPI?.ensureSanPhamDataFor) {
          await window.AppAPI.ensureSanPhamDataFor([masp]);
        } else if (window.supabase) {
          const { data, error } = await window.supabase.from('dmhanghoa')
            .select('masp,ten,chungloai,nhomhang,gianhap')
            .eq('masp', masp).maybeSingle();
          if (!error && data) {
            window.sanPhamData = Object.assign(window.sanPhamData || {}, { [masp]: data });
          }
        }
      } catch (_) { }
      ok = !!(window.sanPhamData && window.sanPhamData[masp]);
    }

    if (!ok) { box.style.display = 'block'; box.textContent = 'Mã không có trong danh mục: ' + masp; return; }
    box.style.display = 'none';

    await applyQuanLySizeForCurrentMa();
    // Nhảy đến size đầu hợp lệ
    if ($('#q0') && !$('#q0').disabled) { $('#q0').focus(); $('#q0').select(); }
    else { $('#q38').focus(); $('#q38').select(); }
  }

  function onEnterSize(e, sz) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const index = SIZES.indexOf(sz)
    // tìm size tiếp theo còn mở
    for (let i = index + 1; i < SIZES.length; i++) {
      const nxt = SIZES[i]; const el = $(`#q${nxt}`)
      if (el && !el.disabled) { el.focus(); el.select(); return }
    }
    // nếu đang ở size cuối cùng đang mở → quay về mã
    $('#inpMa').focus(); $('#inpMa').select()
  }

  // ======== CHUYỂN 1 ========
  function handleChuyen1() {
    const masp = $('#inpMa').value.trim().toUpperCase()
    if (!masp) return
    snapshot()
    const patch = { qty: {} }
    SIZES.forEach(sz => {
      const v = parseInt($(`#q${sz}`)?.value || '0', 10) || 0
      if (v > 0) patch.qty[sz] = v
    })
    if (Object.keys(patch.qty).length === 0) { return }
    NTGrid.setRow(masp, patch)
    clearInputsKeepMa()
    fetchVitriTonBatch([masp]) // nền
    saveDraft()

    NTGrid.setRow(masp, patch);
    clearInputsKeepMa();
    $('#inpTongNhapHienTai').value = 0;   // reset tổng đang nhập
  }

  // ======== CHUYỂN 2 (textarea) ========
  function handleChuyen2() {
    const txt = $('#taQuick').value.trim();
    if (!txt) return;
    snapshot();

    const push = new Map();   // masp -> {size:qty}
    const unknown = new Set();

    txt.split(/\r?\n/).forEach(line => {
      const t = line.trim().split(/\s+/);
      if (t.length < 2) return;
      const masp = t[0].toUpperCase();
      if (masp.length < 4) return;

      // kiểm danh mục (ưu tiên sanPhamData)
      if (!(window.sanPhamData && window.sanPhamData[masp])) unknown.add(masp);

      if (!push.has(masp)) push.set(masp, {});
      for (let i = 1; i < t.length; i++) {
        const n = parseInt(t[i], 10);
        if ([0, 38, 39, 40, 41, 42, 43, 44, 45].includes(n)) {
          push.get(masp)[n] = (push.get(masp)[n] || 0) + 1;
        }
      }
    });

    // đổ xuống lưới
    const list = [];
    push.forEach((qty, masp) => { NTGrid.setRow(masp, { qty }); list.push(masp); });
    if (list.length) fetchVitriTonBatch(list);

    // cảnh báo mã chưa có thật sự (không chặn)
    const lack = [...unknown].filter(m => !(window.sanPhamData && window.sanPhamData[m]));
    const box = $('#unknownSku');
    if (lack.length) { box.style.display = 'block'; box.textContent = 'Mã chưa có DM: ' + lack.join(', '); }
    else { box.style.display = 'none'; }
  }

  // ======== VITRÍ & TỒN (batch) ========
  async function fetchVitriTonBatch(masps) {
    try {
      const info = await window.AppAPI?.getVitriTonBatch?.(masps, cs) // trả [{masp, vitri, ton1, ton2}]
      if (Array.isArray(info)) {
        info.forEach(row => NTGrid.setRow(row.masp, { vitri: row.vitri, ton1: row.ton1, ton2: row.ton2 }))
      }
    } catch (e) { }
  }

  // ======== VALIDATOR & TỔNG ========
  function onGridChanged() {
    const { tongMH, tongSL } = NTGrid.computeTotals()
    $('#lblTongMatHang').textContent = String(tongMH)
    $('#lblTongSoLuong').textContent = String(tongSL)
    // validate
    const errors = validate()
    NTGrid.markViolations(errors.cells)
    renderBanner(errors)
    $('#btnLuu').disabled = !errors.ok || tongSL <= 0
    saveDraft()
  }

  function validate() {
    const st = NTGrid.getState()
    const cells = []
    let ok = true
    for (const [masp, row] of Object.entries(st)) {
      const qls = quanLySizeCache.get(masp) ?? true
      const has0 = (row.qty[0] || 0) > 0
      const has45 = [38, 39, 40, 41, 42, 43, 44, 45].some(sz => (row.qty[sz] || 0) > 0)
      if (qls) {
        if (has0) { ok = false; cells.push({ masp, size: 0 }) }
        if (!has45) { ok = false; cells.push({ masp, size: 38 }) } // đánh dấu một ô gợi ý
      } else {
        if (!has0 && has45) { ok = false }
        [38, 39, 40, 41, 42, 43, 44, 45].forEach(sz => {
          if ((row.qty[sz] || 0) > 0) { ok = false; cells.push({ masp, size: sz }) }
        })
      }
    }
    return { ok, cells, msg: ok ? '' : 'Có dòng vi phạm quy tắc quản-size. Vui lòng sửa ô tô màu đỏ.' }
  }
  function renderBanner({ ok, msg }) {
    const b = $('#banner')
    if (ok) { b.classList.remove('show'); b.textContent = ''; return }
    b.textContent = msg
    b.classList.add('show')
  }

  // ======== UNDO ========
  function snapshot() { lastSnapshot = NTGrid.getState() }
  function undo() { if (lastSnapshot) NTGrid.replaceState(lastSnapshot) }
  window.NTMobile = Object.assign(window.NTMobile || {}, { undo, onGridChanged: null })

  // ======== INPUT HELPERS ========
  function clearInputs() {
    $('#inpMa').value = ''
    SIZES.forEach(sz => { const el = $(`#q${sz}`); if (el) { el.value = '' } })
    $('#taQuick').value = ''
    saveDraft()
    $('#inpTongNhapHienTai').value = 0;
  }

  function clearInputsKeepMa() {
    SIZES.forEach(sz => { const el = $(`#q${sz}`); if (el) { el.value = '' } })
    $('#inpMa').focus(); $('#inpMa').select()
    $('#inpTongNhapHienTai').value = 0;
  }

  // ======== OFFLINE DRAFT ========
  const saveDraft = debounce(() => {
    const draft = {
      grid: NTGrid.getState(),
      ma: $('#inpMa').value,
      q: Object.fromEntries(SIZES.map(sz => [sz, $(`#q${sz}`)?.value || ''])),
      ta: $('#taQuick').value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  }, 600)
  function restoreDraft() {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (!s) return
      const d = JSON.parse(s)
      NTGrid.replaceState(d.grid || {})
      $('#inpMa').value = d.ma || ''
      SIZES.forEach(sz => { const el = $(`#q${sz}`); if (el) el.value = d.q?.[sz] || '' })
      $('#taQuick').value = d.ta || ''
    } catch (e) { }
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

  // ======== LƯU HÓA ĐƠN ========
  async function handleLuu() {
    const v = validate()
    if (!v.ok) { window.AppAudio?.warn?.(); return }
    const st = NTGrid.getState()
    const chitiet = []
    Object.entries(st).forEach(([masp, row]) => {
      SIZES.forEach(sz => {
        const sl = row.qty[sz] || 0
        if (sl > 0) chitiet.push({ masp, size: sz, soluong: sl })
      })
    })
    if (!chitiet.length) return
    $('#btnLuu').disabled = true
    try {
      const rs = await window.LuuHoaDon?.luuHoaDonNhapTamCs1?.(chitiet) // bạn sẽ thêm hàm này ở luuhoadon.js
      if (rs?.ok) {
        localStorage.removeItem(STORAGE_KEY)
        alert('Đã lưu hóa đơn nhập tạm CS1.')
        location.reload()
      } else {
        alert('Lưu thất bại: ' + (rs?.message || ''))
      }
    } catch (e) {
      alert('Lỗi lưu: ' + e.message)
    } finally {
      $('#btnLuu').disabled = false
    }
  }

  // ======== SKU CACHE ========
  async function loadSKUCache() {
    try {
      const arr = await window.AppAPI?.getTopSKUs?.(2000) // trả về mảng mã
      return new Set(arr || [])
    } catch (e) { return new Set() }
  }

  // go!
  document.addEventListener('DOMContentLoaded', init)

   // AUTOCOMPLETE CHO #inpMa
  (function () {
    const box = document.createElement('div');
    box.id = 'ac-ma'; box.style.cssText =
      'position:absolute;z-index:9999;background:#fff;border:1px solid #ccc;display:none;max-height:180px;overflow:auto;';
    document.body.appendChild(box);

    const inp = document.querySelector('#inpMa');
    let list = []; // [{masp,ten}]
    function rebuildList() {
      // Ưu tiên cache nội bộ
      const d = window.sanPhamData || {};
      list = Object.keys(d).slice(0, 2000).map(k => ({ masp: k, ten: d[k].ten || '' }));
    }
    rebuildList();

    function show(items) {
      if (!items.length) { box.style.display = 'none'; return; }
      const r = inp.getBoundingClientRect();
      box.style.left = `${r.left + window.scrollX}px`;
      box.style.top = `${r.bottom + window.scrollY}px`;
      box.style.width = `${r.width}px`;
      box.innerHTML = items.map(it => `<div data-m="${it.masp}" style="padding:6px;cursor:pointer">
      <b>${it.masp}</b> – ${it.ten}</div>`).join('');
      box.style.display = '';
      Array.from(box.children).forEach(div => {
        div.onclick = () => { inp.value = div.dataset.m; box.style.display = 'none'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
      });
    }

    inp.addEventListener('input', () => {
      const q = inp.value.trim().toUpperCase();
      if (q.length < 2) { box.style.display = 'none'; return; }
      // nếu chưa có danh mục → thử kéo về
      if (!window.sanPhamData || !Object.keys(window.sanPhamData).length) {
        loadSKUCache().then(() => { rebuildList(); });
      }
      const items = list.filter(it => it.masp.includes(q) || (it.ten || '').toUpperCase().includes(q)).slice(0, 50);
      show(items);
    });
    document.addEventListener('click', (e) => { if (e.target !== inp && !box.contains(e.target)) box.style.display = 'none'; });
  });

})()

 
