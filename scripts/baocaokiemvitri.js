import { supabase } from './supabaseClient.js';
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}

let hot;
let currentTab = 'nhieu_vitri';
let currentRows = [];

let selectedPhienIds = [];

async function moPopupChonPhien() {
  document.getElementById('popup-phien').style.display = 'block';

  const { coso, loai } = getFilters();

  const { data, error } = await supabase
    .from('kiem_vitri_phien')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    alert(error.message);
    return;
  }

  renderListPhien(data);
}

function renderListPhien(list) {
  const box = document.getElementById('list-phien');

  box.innerHTML = list.map(p => `
    <div>
      <label>
        <input type="checkbox" value="${p.ma_phien}">
        ${p.ma_phien}
      </label>
    </div>
  `).join('');
}

document.getElementById('search-phien')?.addEventListener('input', e => {
  const kw = e.target.value.toLowerCase();

  document.querySelectorAll('#list-phien div').forEach(div => {
    const text = div.innerText.toLowerCase();
    div.style.display = text.includes(kw) ? '' : 'none';
  });
});

document.getElementById('btn-chon-phien')?.addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('#list-phien input:checked'));

  selectedPhienIds = checked.map(i => i.value);

  if (selectedPhienIds.length === 0) {
    alert('Bạn phải chọn ít nhất 1 phiên');
    return;
  }

  document.getElementById('popup-phien').style.display = 'none';

  await loadChiTietTheoPhien();
});

function getFilters() {
  return {
    coso: document.getElementById('filter-coso')?.value || 'cs1',
    loai: document.getElementById('filter-loai')?.value || 'treomau',
    masp: (document.getElementById('filter-masp')?.value || '').trim().toUpperCase()
  };
}

function setPreview(html) {
  const el = document.getElementById('preview');
  if (el) el.innerHTML = html;
}

function getTodayYMD() {
  return new Date().toISOString().slice(0, 10);
}

async function layTonNhanhTheoMasps(masps) {
  const unique = Array.from(
    new Set((masps || []).map(x => String(x || '').trim().toUpperCase()).filter(Boolean))
  );

  if (unique.length === 0) return {};

  const result = {};
  const chunkSize = 200;
  const denNgay = getTodayYMD();

  for (let i = 0; i < unique.length; i += chunkSize) {
    const arr = unique.slice(i, i + chunkSize);

    const { data, error } = await supabase.rpc('xntnhanh', {
      p_masps: arr,
      p_den_ngay: denNgay,
      p_tonghop_size: true
    });

    if (error) throw error;

    (data || []).forEach(r => {
      const masp = String(r.masp || '').trim().toUpperCase();
      result[masp] = {
        ton_cs1: Number(r.ton_cs1 || 0),
        ton_cs2: Number(r.ton_cs2 || 0),
        tong_ton: Number(r.tong_ton || 0)
      };
    });
  }

  return result;
}

function initTable() {
  const container = document.getElementById('hot');

  hot = new Handsontable(container, {
    data: [],
    colHeaders: true,
    rowHeaders: true,
    width: '100%',
    height: 520,
    stretchH: 'all',
    manualColumnResize: true,
    afterOnCellMouseDown: function (event, coords) {
      if (!coords || coords.row < 0) return;

      // Chỉ cho mở popup khi bấm vào cột mã sản phẩm
      if (coords.col !== 0) return;

      const row = currentRows[coords.row];
      const masp = String(row?.masp || '').trim().toUpperCase();

      if (!masp) return;

      event?.preventDefault?.();
      event?.stopPropagation?.();

      setTimeout(() => {
        if (typeof window.stockQuickPopup === 'function') {
          window.stockQuickPopup(masp);
        } else if (window.StockQuick?.showFor) {
          window.StockQuick.showFor(document.body, masp);
        } else {
          alert('Chưa tải được stockQuickPopup.js');
        }
      }, 50);
    },
    licenseKey: 'non-commercial-and-evaluation',
    columns: []
  });
}

function renderTable(rows, columns, headers) {
  currentRows = rows || [];

  hot.updateSettings({
    data: currentRows,
    columns,
    colHeaders: headers
  });

  hot.render();
}

async function loadNhieuViTri() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_nhieu_vitri')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('lan_kiem_cuoi', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'so_vitri' },
    { data: 'ds_vitri' },
    { data: 'lan_kiem_cuoi' }
  ], [
    'Mã sản phẩm',
    'Số vị trí',
    'Danh sách vị trí',
    'Lần kiểm cuối'
  ]);

  setPreview(`🔴 Có <b>${data.length}</b> mã đang nằm nhiều vị trí.`);
}

async function loadSaiChuan() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_sai_vitri_chuan')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('created_at', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'vitri_thucte' },
    { data: 'vitri_chuan' },
    { data: 'khu_vuc' },
    { data: 'ketqua' },
    { data: 'created_at' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Vị trí thực tế',
    'Vị trí chuẩn',
    'Khu vực kiểm',
    'Kết quả',
    'Ngày kiểm'
  ]);

  setPreview(`🟠 Có <b>${data.length}</b> dòng sai hoặc chưa có vị trí chuẩn.`);
}

async function loadCanCapNhat() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_can_treo_mau')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('lan_kiem_cuoi', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'vitri_thucte' },
    { data: 'vitri_chuan' },
    { data: 'so_lan_thay' },
    { data: 'lan_kiem_cuoi' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Vị trí thực tế',
    'Vị trí chuẩn',
    'Số lần thấy',
    'Lần kiểm cuối'
  ]);

  setPreview(`🟡 Có <b>${data.length}</b> mã thực tế đã thấy nhưng danh mục chưa có vị trí chuẩn.`);
}

async function loadChuaTreoTheoPhien() {
  const { coso, masp } = getFilters();

  if (!selectedPhienIds || selectedPhienIds.length === 0) {
    alert("Bạn cần chọn ít nhất 1 phiên kiểm.");
    return;
  }

  setPreview("⏳ Đang kiểm tra ĐÚNG / THỪA / THIẾU theo khu vực phiên đã chọn...");

  const fieldTreo = coso === "cs2" ? "treomaucs2" : "treomaucs1";

  // 1. Lấy thông tin phiên để biết khu vực đã kiểm
  const { data: phienInfo, error: phienErr } = await supabase
    .from("kiem_vitri_phien")
    .select("ma_phien, khu_vuc, coso, loai_kiem")
    .in("ma_phien", selectedPhienIds)
    .eq("coso", coso)
    .eq("loai_kiem", "treomau");

  if (phienErr) throw phienErr;

  const khuVucSet = new Set(
    (phienInfo || [])
      .map(p => String(p.khu_vuc || "").trim().toUpperCase())
      .filter(Boolean)
  );

  if (khuVucSet.size === 0) {
    alert("Các phiên đã chọn chưa có khu vực kiểm hợp lệ.");
    return;
  }

  // 2. Lấy dữ liệu thực tế từ các phiên đã chọn
  const { data: thucTeRows, error: ctErr } = await supabase
    .from("kiem_vitri_chitiet")
    .select("ma_phien, masp, vitri_thucte, khu_vuc, coso, loai_kiem")
    .in("ma_phien", selectedPhienIds)
    .eq("coso", coso)
    .eq("loai_kiem", "treomau");

  if (ctErr) throw ctErr;

  // Chỉ lấy dòng thực tế thuộc đúng khu vực đã kiểm
  const thucTeTrongKhuVuc = (thucTeRows || [])
    .map(r => {
      const ma = String(r.masp || "").trim().toUpperCase();
      const vt = String(r.vitri_thucte || r.khu_vuc || "").trim().toUpperCase();
      return {
        ...r,
        masp_norm: ma,
        vitri_thucte_norm: vt
      };
    })
    .filter(r => {
      if (!r.masp_norm) return false;
      if (masp && !r.masp_norm.includes(masp)) return false;
      return khuVucSet.has(r.vitri_thucte_norm);
    });

  const thucTeMasps = new Set(thucTeTrongKhuVuc.map(r => r.masp_norm));

  // 3. Lấy danh sách chuẩn trong đúng khu vực đã kiểm
  // Dùng phân trang để không bị giới hạn 1000 dòng mặc định của Supabase
  const chuanRows = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("dmhanghoa")
      .select(`masp, tensp, ${fieldTreo}`)
      .not(fieldTreo, "is", null)
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    chuanRows.push(...data);

    if (data.length < step) break;
    from += step;
  }

  const chuanTrongKhuVuc = chuanRows
    .map(r => {
      const ma = String(r.masp || "").trim().toUpperCase();
      const vt = String(r[fieldTreo] || "").trim().toUpperCase();
      return {
        ...r,
        masp_norm: ma,
        vitri_chuan_norm: vt
      };
    })
    .filter(r => {
      if (!r.masp_norm || !r.vitri_chuan_norm) return false;
      if (masp && !r.masp_norm.includes(masp)) return false;
      return khuVucSet.has(r.vitri_chuan_norm);
    });

  const chuanMap = new Map();
  for (const r of chuanTrongKhuVuc) {
    if (!chuanMap.has(r.masp_norm)) {
      chuanMap.set(r.masp_norm, r);
    }
  }

  // 4. Lấy vị trí chuẩn thật của toàn bộ mã thực tế để xác định THỪA / SAI VỊ TRÍ
  const uniqueMaspThucTe = Array.from(new Set(thucTeTrongKhuVuc.map(r => r.masp_norm)));

  const dmThucTeMap = new Map();

  for (let i = 0; i < uniqueMaspThucTe.length; i += 500) {
    const arr = uniqueMaspThucTe.slice(i, i + 500);

    const { data, error } = await supabase
      .from("dmhanghoa")
      .select(`masp, tensp, ${fieldTreo}`)
      .in("masp", arr);

    if (error) throw error;

    (data || []).forEach(r => {
      const ma = String(r.masp || "").trim().toUpperCase();
      if (ma) dmThucTeMap.set(ma, r);
    });
  }

  let soDung = 0;
  let soThua = 0;
  let soThieu = 0;

  // 5. THỰC TẾ: mã quét được
  // - Có trong chuẩn khu vực => ĐÚNG, không hiển thị
  // - Không có trong chuẩn khu vực => THỪA / SAI VỊ TRÍ, hiển thị
  const rowsThuaSai = [];

  for (const r of thucTeTrongKhuVuc) {
    const ma = r.masp_norm;

    if (chuanMap.has(ma)) {
      soDung++;
      continue;
    }

    soThua++;

    const dmRow = dmThucTeMap.get(ma);
    const vtChuan = dmRow ? String(dmRow[fieldTreo] || "").trim().toUpperCase() : "";

    rowsThuaSai.push({
      masp: ma,
      tensp: dmRow?.tensp || "",
      ton: null,
      vitri_chuan: vtChuan || "KHÔNG CÓ TRONG DM",
      vitri_thucte: r.vitri_thucte_norm,
      trang_thai: vtChuan ? "SAI_VI_TRI" : "MA_KHONG_TON_TAI",
      khu_vuc_kiem: r.vitri_thucte_norm
    });
  }

  // 6. THIẾU: có trong chuẩn khu vực nhưng không có trong thực tế
  const rowsThieuRaw = [];

  for (const [ma, r] of chuanMap.entries()) {
    if (thucTeMasps.has(ma)) continue;

    rowsThieuRaw.push({
      masp: ma,
      tensp: r.tensp || "",
      vitri_chuan: r.vitri_chuan_norm,
      vitri_thucte: "",
      trang_thai: "CHUA_BAY_MAU",
      khu_vuc_kiem: r.vitri_chuan_norm
    });
  }

  // 7. Lọc tồn kho > 0 cho dòng thiếu; dòng sai vị trí vẫn hiển thị để xử lý
  const tonMap = await layTonNhanhTheoMasps([
    ...rowsThieuRaw.map(r => r.masp),
    ...rowsThuaSai.map(r => r.masp)
  ]);

  const rowsThieu = rowsThieuRaw
    .map(r => {
      const ton = tonMap[r.masp] || {};
      return {
        ...r,
        ton: coso === "cs2" ? Number(ton.ton_cs2 || 0) : Number(ton.ton_cs1 || 0)
      };
    })
    .filter(r => Number(r.ton || 0) > 0);

  soThieu = rowsThieu.length;

  const rowsThuaSaiCoTon = rowsThuaSai.map(r => {
    const ton = tonMap[r.masp] || {};
    return {
      ...r,
      ton: coso === "cs2" ? Number(ton.ton_cs2 || 0) : Number(ton.ton_cs1 || 0)
    };
  });

  const final = [
    ...rowsThuaSaiCoTon,
    ...rowsThieu
  ];

  renderTable(final, [
    { data: "masp" },
    { data: "ton" },
    { data: "vitri_chuan" },
    { data: "khu_vuc_kiem" },
    { data: "trang_thai" }
  ], [
    "Mã sản phẩm",
    "Tồn cơ sở",
    "Vị trí chuẩn",
    "Khu vực kiểm",
    "Trạng thái"
  ]);

  setPreview(
    `✅ Kiểm tra xong theo phiên đã chọn. ` +
    `Đúng: <b>${soDung}</b> &nbsp; ` +
    `Sai/Thừa: <b style="color:#2e7d32;">${soThua}</b> &nbsp; ` +
    `Chưa bày mẫu/Thiếu: <b style="color:#ef6c00;">${soThieu}</b>. ` +
    `Khu vực kiểm: <b>${Array.from(khuVucSet).join(", ")}</b>.`
  );

  console.log("Phiên đã chọn:", selectedPhienIds);
  console.log("Khu vực đã kiểm:", Array.from(khuVucSet));
  console.log("Chuẩn trong khu vực:", chuanMap.size);
  console.log("Thực tế trong khu vực:", thucTeTrongKhuVuc.length);
  console.log("Đúng:", soDung, "Sai/Thừa:", soThua, "Thiếu:", soThieu);
}

async function loadChiTietTheoPhien() {
  const { coso, loai, masp } = getFilters();

  if (!selectedPhienIds || selectedPhienIds.length === 0) {
    alert("Bạn cần chọn ít nhất 1 phiên kiểm.");
    return;
  }

  setPreview("⏳ Đang tải dữ liệu chi tiết phiên kiểm...");

  let q = supabase
    .from("kiem_vitri_chitiet")
    .select("*")
    .in("ma_phien", selectedPhienIds)
    .eq("coso", coso)
    .eq("loai_kiem", loai)
    .order("created_at", { ascending: true });

  if (masp) {
    q = q.ilike("masp", `%${masp}%`);
  }

  const { data, error } = await q;

  if (error) throw error;

  renderTable(data || [], [
    { data: "ma_phien" },
    { data: "masp" },
    { data: "vitri_thucte" },
    { data: "khu_vuc" },
    { data: "coso" },
    { data: "loai_kiem" },
    { data: "created_at" }
  ], [
    "Mã phiên",
    "Mã sản phẩm",
    "Vị trí thực tế",
    "Khu vực kiểm",
    "Cơ sở",
    "Loại kiểm",
    "Ngày kiểm"
  ]);

  setPreview(
    `✅ Đã tải <b>${data?.length || 0}</b> dòng chi tiết từ phiên kiểm: <b>${selectedPhienIds.join(", ")}</b>.`
  );
}

async function loadReport() {
  try {
    setPreview('⏳ Đang tải báo cáo...');

    if (currentTab === 'nhieu_vitri') await loadNhieuViTri();
    if (currentTab === 'sai_chuan') await loadSaiChuan();
    if (currentTab === 'can_cap_nhat') await loadCanCapNhat();
    if (currentTab === 'chua_treo') {
      moPopupChonPhien(); // KHÔNG load ngay
      return;
    }

  } catch (err) {
    console.error(err);
    setPreview(`<span style="color:red;">❌ Lỗi tải báo cáo: ${err.message || err}</span>`);
  }

}

function getSelectedRow() {
  const sel = hot.getSelectedLast();
  if (!sel) return null;

  const rowIndex = sel[0];
  if (rowIndex < 0) return null;

  return currentRows[rowIndex] || null;
}

function getFieldCanUpdate(row) {
  const { coso, loai } = getFilters();

  if (loai === 'treomau' && coso === 'cs1') return 'treomaucs1';
  if (loai === 'treomau' && coso === 'cs2') return 'treomaucs2';
  if (loai === 'vitrikho' && coso === 'cs1') return 'vitrikho1';
  if (loai === 'vitrikho' && coso === 'cs2') return 'vitrikho2';

  return null;
}

async function capNhatViTriChuan() {
  const row = getSelectedRow();

  if (!row) {
    alert('Bạn cần chọn 1 dòng trước.');
    return;
  }

  const masp = (row.masp || '').toString().trim().toUpperCase();
  const vitri = (row.vitri_thucte || '').toString().trim().toUpperCase();
  const field = getFieldCanUpdate(row);

  if (!masp || !vitri || !field) {
    alert('Dòng này chưa đủ dữ liệu để cập nhật.');
    return;
  }

  if (!confirm(`Cập nhật ${field} của mã ${masp} = ${vitri}?`)) {
    return;
  }

  const { error } = await supabase
    .from('dmhanghoa')
    .update({ [field]: vitri })
    .eq('masp', masp);

  if (error) {
    alert('Lỗi cập nhật danh mục: ' + error.message);
    return;
  }

  await supabase
    .from('kiem_vitri_xuly')
    .insert([{
      coso: getFilters().coso,
      loai_kiem: getFilters().loai,
      masp,
      vitri_thucte: vitri,
      vitri_chuan: row.vitri_chuan || null,
      hanh_dong: 'DA_CAP_NHAT',
      ghichu: `Cập nhật ${field} = ${vitri}`,
      manv: localStorage.getItem('manv') || sessionStorage.getItem('manv') || null,
      tennv: localStorage.getItem('tennv') || sessionStorage.getItem('tennv') || null
    }]);

  alert('Đã cập nhật vị trí chuẩn và ghi lịch sử xử lý.');
  await loadReport();
}

async function boQuaTam() {
  const row = getSelectedRow();

  if (!row) {
    alert('Bạn cần chọn 1 dòng trước.');
    return;
  }

  const { coso, loai } = getFilters();

  const masp = (row.masp || '').toString().trim().toUpperCase();
  const vitriThucTe = (row.vitri_thucte || '').toString().trim().toUpperCase();
  const vitriChuan = (row.vitri_chuan || '').toString().trim().toUpperCase();

  if (!masp) {
    alert('Dòng này không có mã sản phẩm.');
    return;
  }

  if (!confirm(`Bỏ qua tạm mã ${masp}?`)) {
    return;
  }

  const { error } = await supabase
    .from('kiem_vitri_xuly')
    .insert([{
      coso,
      loai_kiem: loai,
      masp,
      vitri_thucte: vitriThucTe || null,
      vitri_chuan: vitriChuan || null,
      hanh_dong: 'BO_QUA',
      ghichu: null,
      manv: localStorage.getItem('manv') || sessionStorage.getItem('manv') || null,
      tennv: localStorage.getItem('tennv') || sessionStorage.getItem('tennv') || null
    }]);

  if (error) {
    alert('Lỗi lưu trạng thái bỏ qua: ' + error.message);
    return;
  }

  alert('Đã đánh dấu bỏ qua tạm.');
}

function attachEvents() {
  document.getElementById('btn-load')?.addEventListener('click', loadReport);
  document.getElementById('btn-cap-nhat')?.addEventListener('click', capNhatViTriChuan);
  document.getElementById('btn-tai-phien')?.addEventListener('click', moPopupChonPhien);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await loadReport();
    });
  });

  document.getElementById('filter-masp')?.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await loadReport();
    }
  });

  document.getElementById('filter-coso')?.addEventListener('change', loadReport);
  document.getElementById('filter-loai')?.addEventListener('change', loadReport);
}

document.addEventListener('DOMContentLoaded', async () => {
  initTable();
  attachEvents();
  await loadReport();
});
