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
      $(`#q${sz}`)?.addEventListener('keydown', e => onEnterSize(e, sz))
    })

    $('#btnChuyen1').onclick = handleChuyen1
    $('#btnChuyen2').onclick = handleChuyen2
    $('#btnThemMoi').onclick = clearInputs
    $('#btnLuu').onclick = handleLuu

    // grid change → cập nhật tổng & validate
    window.NTMobile.onGridChanged = onGridChanged

    // khôi phục draft
    restoreDraft()
    // lock/mở size theo mã hiện tại (nếu có)
    await applyQuanLySizeForCurrentMa()
  }

  // ======== SIZE LOCK BY SKU MODE ========
  async function isQuanLySize(masp) {
    if (quanLySizeCache.has(masp)) return quanLySizeCache.get(masp)
    // Tận dụng module của bạn (hoặc RPC) — ở đây gọi hàm giả định trong main.js:
    const flag = await window.AppAPI?.isQuanLySizeTheoCoSo?.(masp, cs) ?? true // mặc định TRUE theo yêu cầu
    quanLySizeCache.set(masp, !!flag)
    return !!flag
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
      const el = $(id); if (!el) return
      el.disabled = !on; el.placeholder = on ? el.placeholder : el.dataset.size
      if (!on) el.value = ''
    }
    // cột C2 (nhập số lượng)
    open('#q0', !qls)
    SIZES.filter(s => s !== 0).forEach(sz => open(`#q${sz}`, qls))
    // cột C1 (hiển thị size tham chiếu)
    open('#sz0', !qls)
    SIZES.filter(s => s !== 0).forEach(sz => open(`#sz${sz}`, qls))
  }

  // ======== ENTER FLOW ========
  async function onEnterMa(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const box = $('#unknownSku');
    const masp = $('#inpMa').value.trim().toUpperCase();
    if (!masp) { box.style.display = 'none'; return; }

    // 1) Ưu tiên danh mục đã nạp
    if (window.sanPhamData && window.sanPhamData[masp]) {
      box.style.display = 'none';
    } else {
      // 2) Nếu chưa có → thử nạp nhanh 1 mã
      try {
        await window.AppAPI?.ensureSanPhamDataFor?.([masp]); // bạn đã có hàm tương tự trong nhapmoi
      } catch (e) { }
      if (window.sanPhamData && window.sanPhamData[masp]) box.style.display = 'none';
      else { box.style.display = 'block'; box.textContent = 'Mã không có trong danh mục: ' + masp; return; }
    }

    await applyQuanLySizeForCurrentMa();
    // nhảy tới size đầu hợp lệ
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
  }
  function clearInputsKeepMa() {
    SIZES.forEach(sz => { const el = $(`#q${sz}`); if (el) { el.value = '' } })
    $('#inpMa').focus(); $('#inpMa').select()
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
})()
