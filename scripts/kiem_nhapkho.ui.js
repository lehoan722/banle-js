import {
  byId,
  getState,
  normalizeMasp,
  normalizeSize,
  normalizeNumber,
  makeKey,
  splitKey,
  parseSizeSlText,
  hasRealSizeItems,
  isValidSize,
  escapeHtml,
  phatAmThanhLoi,
  phatAmThanhSize,
  phatAmThanhThanhCong,
  baoLoiNeuMaspKhongCoTrongDanhMuc,
  ensureMaspAtTop,
  buildOrderedMasps,
  capNhatThongKeDauTrang
} from "./kiem_nhapkho.core.js";

let dangChonSizeTrongPopup = false;

export function getAvailableSizesForMasp(masp) {
  masp = normalizeMasp(masp);
  if (!masp) return [];

  const state = getState();
  const sizeMap = new Map();

  Object.keys(state.xuat || {}).forEach((key) => {
    const row = state.xuat[key];
    if (!row) return;
    if (normalizeMasp(row.masp) !== masp) return;

    const size = normalizeSize(row.size);
    const sl = normalizeNumber(row.sl);
    if (!size) return;

    sizeMap.set(size, {
      size,
      slXuat: sl,
      slNhap: 0
    });
  });

  Object.keys(state.nhap || {}).forEach((key) => {
    const row = state.nhap[key];
    if (!row) return;
    if (normalizeMasp(row.masp) !== masp) return;

    const size = normalizeSize(row.size);
    const sl = normalizeNumber(row.sl);
    if (!size) return;

    if (!sizeMap.has(size)) {
      sizeMap.set(size, {
        size,
        slXuat: 0,
        slNhap: sl
      });
    } else {
      sizeMap.get(size).slNhap = sl;
    }
  });

  const arr = Array.from(sizeMap.values());
  arr.sort((a, b) => {
    const na = Number(a.size);
    const nb = Number(b.size);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a.size).localeCompare(String(b.size), "vi");
  });

  return arr;
}

export function hideSizePopup() {
  const popup = byId("popup_size");
  if (!popup) return;
  popup.style.display = "none";
  popup.innerHTML = "";
}

export async function themNhanhTheoSize(size, giuPopup = true) {
  const maspEl = byId("masp");
  const sizeEl = byId("size");
  const slEl = byId("soluong");

  const masp = normalizeMasp(maspEl?.value);
  const sizeVal = normalizeSize(size);
  const sl = normalizeNumber(slEl?.value || 1) || 1;

  if (!masp) return;
  if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

  if (!isValidSize(sizeVal)) {
    phatAmThanhLoi();
    alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
    return;
  }

  const key = makeKey(masp, sizeVal);
  const state = getState();

  const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

  if (!state.nhap[key]) {
    state.nhap[key] = { masp, size: sizeVal, sl };
  } else {
    state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
  }

  if (isNewMasp) {
    state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
  }

  delete state.ketQua[key];
  renderBangKetQua();
  phatAmThanhThanhCong();

  if (sizeEl) sizeEl.value = "";
  if (slEl) slEl.value = "1";

  if (giuPopup && sizeEl) {
    setTimeout(() => {
      sizeEl.focus();
      showSizePopup(masp, "");
    }, 0);
  }
}

export async function themNhanhKhongCanSize() {
  const maspEl = byId("masp");
  const slEl = byId("soluong");

  const masp = normalizeMasp(maspEl?.value);
  const sl = normalizeNumber(slEl?.value || 1) || 1;

  if (!masp) return;
  if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

  const key = makeKey(masp, "0");
  const state = getState();

  const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

  if (!state.nhap[key]) {
    state.nhap[key] = {
      masp,
      size: "0",
      sl
    };
  } else {
    state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
  }

  if (isNewMasp) {
    state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
  }

  delete state.ketQua[key];
  renderBangKetQua();
  phatAmThanhThanhCong();

  if (slEl) slEl.value = "1";

  if (maspEl) {
    maspEl.value = masp;
    maspEl.focus();

    setTimeout(() => {
      try {
        maspEl.select();
      } catch (err) {}
    }, 0);
  }

  hideSizePopup();
}

export function showSizePopup(masp, keyword = "") {
  const popup = byId("popup_size");
  const sizeEl = byId("size");

  if (!popup || !sizeEl) return;

  const list = getAvailableSizesForMasp(masp);
  const kw = normalizeSize(keyword).toLowerCase();

  const filtered = list.filter(item =>
    !kw || String(item.size).toLowerCase().includes(kw)
  );

  if (!filtered.length) {
    hideSizePopup();
    return;
  }

  popup.innerHTML = "";

  filtered.forEach(item => {
    const row = document.createElement("div");
    row.style.padding = "6px 8px";
    row.style.borderBottom = "1px solid #eee";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <b>${escapeHtml(item.size)}</b>
        <span>X:${item.slXuat} | N:${item.slNhap}</span>
      </div>
    `;

    row.addEventListener("mouseenter", () => {
      row.style.background = "#f2f2f2";
    });

    row.addEventListener("mouseleave", () => {
      row.style.background = "#fff";
    });

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    row.addEventListener("click", () => {
      dangChonSizeTrongPopup = true;
      themNhanhTheoSize(item.size, true);

      setTimeout(() => {
        dangChonSizeTrongPopup = false;
      }, 0);
    });

    popup.appendChild(row);
  });

  popup.style.display = "block";
}

export function groupByMasp(mapObj) {
  const out = {};

  for (const key of Object.keys(mapObj || {})) {
    const row = mapObj[key];
    if (!row || !row.masp) continue;

    const masp = normalizeMasp(row.masp);
    const size = normalizeSize(row.size);
    const sl = normalizeNumber(row.sl);

    if (!out[masp]) {
      out[masp] = {
        masp,
        items: []
      };
    }

    out[masp].items.push({ size, sl });
  }

  return out;
}

export function formatSizeSl(items) {
  const arr = (items || []).slice();

  arr.sort((a, b) => {
    const sa = normalizeSize(a.size);
    const sb = normalizeSize(b.size);

    const na = Number(sa);
    const nb = Number(sb);

    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return sa.localeCompare(sb, "vi");
  });

  return arr
    .map(x => `${escapeHtml(normalizeSize(x.size))}/${normalizeNumber(x.sl)}`)
    .join(" ");
}

export function tongSoLuong(items) {
  return (items || []).reduce((sum, x) => sum + normalizeNumber(x.sl), 0);
}

function getSortWeightByTrangThai(trangThai) {
  const t = String(trangThai || "").toLowerCase();
  if (t.includes("thiếu")) return 0;
  if (t.includes("thừa")) return 1;
  if (t.includes("lệch")) return 2;
  if (t.includes("khớp")) return 3;
  return 9;
}

export function buildKetQuaTheoMasp() {
  const state = getState();

  const gNhap = groupByMasp(state.nhap);
  const gXuat = groupByMasp(state.xuat);

  const orderedMasps = buildOrderedMasps(state, gNhap, gXuat);

  return orderedMasps.map(masp => {
    const nhapItems = gNhap[masp]?.items || [];
    const xuatItems = gXuat[masp]?.items || [];

    const nhapTong = tongSoLuong(nhapItems);
    const xuatTong = tongSoLuong(xuatItems);

    const sizeMap = new Map();

    xuatItems.forEach(item => {
      const size = normalizeSize(item.size);
      sizeMap.set(size, {
        size,
        nhap: 0,
        xuat: normalizeNumber(item.sl)
      });
    });

    nhapItems.forEach(item => {
      const size = normalizeSize(item.size);
      if (!sizeMap.has(size)) {
        sizeMap.set(size, {
          size,
          nhap: normalizeNumber(item.sl),
          xuat: 0
        });
      } else {
        sizeMap.get(size).nhap = normalizeNumber(item.sl);
      }
    });

    const sizeRows = Array.from(sizeMap.values()).sort((a, b) => {
      const na = Number(a.size);
      const nb = Number(b.size);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size), "vi");
    });

    const chiTiet = [];
    let trangThai = "Khớp";

    sizeRows.forEach(r => {
      if (r.nhap !== r.xuat) {
        if (r.nhap > r.xuat) {
          trangThai = "Thừa";
        } else if (r.nhap < r.xuat) {
          trangThai = "Thiếu";
        } else {
          trangThai = "Lệch";
        }

        chiTiet.push(`${r.size}: N${r.nhap} / X${r.xuat}`);
      }
    });

    if (nhapTong !== xuatTong && !chiTiet.length) {
      if (nhapTong > xuatTong) trangThai = "Thừa";
      else if (nhapTong < xuatTong) trangThai = "Thiếu";
      else trangThai = "Lệch";
    }

    return {
      masp,
      nhapItems,
      xuatItems,
      nhapTong,
      xuatTong,
      trangThai,
      chiTiet: chiTiet.join(" | ")
    };
  });
}

export function renderBangKetQua() {
  const tbody = byId("tbody_ketqua");
  if (!tbody) return;

  const rows = buildKetQuaTheoMasp();

  rows.sort((a, b) => {
    const wa = getSortWeightByTrangThai(a.trangThai);
    const wb = getSortWeightByTrangThai(b.trangThai);
    if (wa !== wb) return wa - wb;
    return a.masp.localeCompare(b.masp, "vi");
  });

  tbody.innerHTML = rows.map(r => {
    const cls =
      r.trangThai === "Khớp" ? "khop" :
      r.trangThai === "Thiếu" ? "thieu" :
      r.trangThai === "Thừa" ? "thua" : "lech";

    return `
      <tr data-masp="${escapeHtml(r.masp)}" class="${cls}">
        <td class="cell-masp">${escapeHtml(r.masp)}</td>
        <td>${formatSizeSl(r.nhapItems)}</td>
        <td>${r.nhapTong}</td>
        <td>${escapeHtml(r.masp)}</td>
        <td>${formatSizeSl(r.xuatItems)}</td>
        <td>${r.xuatTong}</td>
        <td>${escapeHtml(r.trangThai)}</td>
        <td>${escapeHtml(r.chiTiet || "")}</td>
      </tr>
    `;
  }).join("");

  capNhatThongKeDauTrang();
}

export function docLaiNhapTuBangHTML() {
  const tbody = byId("tbody_ketqua");
  if (!tbody) return;

  const state = getState();
  const mapMoi = {};
  const orderMoi = [];

  const rows = Array.from(tbody.querySelectorAll("tr[data-masp]"));
  rows.forEach((tr) => {
    const masp = normalizeMasp(tr.dataset.masp);
    if (!masp) return;

    const tdSize = tr.children[1];
    const sizeText = String(tdSize?.textContent || "").trim();

    const items = parseSizeSlText(sizeText);
    if (!items.length) {
      mapMoi[makeKey(masp, "0")] = { masp, size: "0", sl: 0 };
    } else {
      items.forEach(item => {
        mapMoi[makeKey(masp, item.size)] = {
          masp,
          size: normalizeSize(item.size),
          sl: normalizeNumber(item.sl)
        };
      });
    }

    if (!orderMoi.includes(masp)) orderMoi.push(masp);
  });

  state.nhap = mapMoi;
  state.nhapOrder = orderMoi;
}

export function themDongNhapBenTrai({ masp, size, sl }) {
  masp = normalizeMasp(masp);
  size = normalizeSize(size);
  sl = normalizeNumber(sl);

  if (!masp || !size) return;

  const state = getState();
  const key = makeKey(masp, size);

  if (!state.nhap[key]) {
    state.nhap[key] = { masp, size, sl };
  } else {
    state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
  }

  state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);

  delete state.ketQua[key];
  renderBangKetQua();
}

export function chuyenSizeSaiThanhMaSanPhamMoi(rawValue) {
  const maspEl = byId("masp");
  const sizeEl = byId("size");

  if (!maspEl || !sizeEl) return;

  const currentMasp = normalizeMasp(maspEl.value);
  const newMasp = normalizeMasp(rawValue);

  if (!newMasp) return;

  maspEl.value = newMasp;
  sizeEl.value = "";
  maspEl.focus();

  setTimeout(() => {
    try {
      maspEl.select();
    } catch (err) {}
  }, 0);
}

export function bindInputEvents() {
  const maspEl = byId("masp");
  const sizeEl = byId("size");
  const slEl = byId("soluong");

  if (slEl && !slEl.value) slEl.value = "1";

  if (maspEl) {
    maspEl.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;

      e.preventDefault();

      const masp = normalizeMasp(maspEl.value);
      if (!masp) return;

      if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

      const state = getState();
      state.selectedMasp = masp;

      const xuatItems = Object.values(state.xuat || {}).filter(
        r => normalizeMasp(r?.masp) === masp
      );

      const canQuanLySize = hasRealSizeItems(xuatItems);

      if (!canQuanLySize) {
        await themNhanhKhongCanSize();
        return;
      }

      if (sizeEl) {
        sizeEl.focus();
        sizeEl.value = "";
        showSizePopup(masp, "");
        phatAmThanhSize();
      }
    });
  }

  if (sizeEl) {
    sizeEl.addEventListener("input", () => {
      const masp = normalizeMasp(maspEl?.value);
      if (!masp) return;
      showSizePopup(masp, sizeEl.value);
    });

    sizeEl.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        hideSizePopup();
        return;
      }

      if (e.key !== "Enter") return;

      e.preventDefault();

      const masp = normalizeMasp(maspEl?.value);
      const raw = normalizeSize(sizeEl.value);

      if (!masp) return;

      if (dangChonSizeTrongPopup) return;

      if (!raw) {
        phatAmThanhLoi();
        return;
      }

      if (!isValidSize(raw)) {
        chuyenSizeSaiThanhMaSanPhamMoi(raw);
        return;
      }

      await themNhanhTheoSize(raw, true);
    });

    sizeEl.addEventListener("blur", () => {
      setTimeout(() => {
        if (!dangChonSizeTrongPopup) {
          hideSizePopup();
        }
      }, 120);
    });
  }

  if (slEl) {
    slEl.addEventListener("focus", () => {
      try {
        slEl.select();
      } catch (err) {}
    });
  }
}

export function chonDongTheoMasp(masp) {
  const tbody = byId("tbody_ketqua");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr[data-masp]"));
  rows.forEach(r => r.classList.remove("row-selected"));

  const row = tbody.querySelector(`tr[data-masp="${CSS.escape(masp)}"]`);
  if (!row) return;

  row.classList.add("row-selected");

  const state = getState();
  state.selectedMasp = masp;
}

export function bindRowSelection() {
  const tbody = byId("tbody_ketqua");
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-masp]");
    if (!tr) return;

    const masp = normalizeMasp(tr.dataset.masp);
    if (!masp) return;

    chonDongTheoMasp(masp);
  });
}

export async function copyDuLieuNhap() {
  const state = getState();
  const grouped = groupByMasp(state.nhap);

  const lines = Object.keys(grouped).map(masp => {
    const txt = formatSizeSl(grouped[masp].items);
    return `${masp}\t${txt}`;
  });

  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    phatAmThanhThanhCong();
  } catch (err) {
    phatAmThanhLoi();
    alert("Không copy được dữ liệu.");
  }
}

export function parseClipboardToNhapMap(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const mapMoi = {};
  const orderMoi = [];

  lines.forEach(line => {
    const [maspRaw, sizeText = ""] = line.split("\t");
    const masp = normalizeMasp(maspRaw);

    if (!masp) return;

    const items = parseSizeSlText(sizeText);

    if (!items.length) {
      mapMoi[makeKey(masp, "0")] = { masp, size: "0", sl: 0 };
    } else {
      items.forEach(item => {
        mapMoi[makeKey(masp, item.size)] = {
          masp,
          size: normalizeSize(item.size),
          sl: normalizeNumber(item.sl)
        };
      });
    }

    if (!orderMoi.includes(masp)) orderMoi.push(masp);
  });

  return { mapMoi, orderMoi };
}

export async function pasteDuLieuNhap() {
  try {
    const text = await navigator.clipboard.readText();
    const { mapMoi, orderMoi } = parseClipboardToNhapMap(text);

    const state = getState();
    state.nhap = mapMoi;
    state.nhapOrder = orderMoi;

    renderBangKetQua();
    phatAmThanhThanhCong();
  } catch (err) {
    phatAmThanhLoi();
    alert("Không dán được dữ liệu.");
  }
}

export function xoaDongDangChon() {
  const state = getState();
  const masp = normalizeMasp(state.selectedMasp);

  if (!masp) {
    alert("Chưa chọn dòng cần sửa/xóa.");
    return;
  }

  const keys = Object.keys(state.nhap || {}).filter(key => {
    const row = state.nhap[key];
    return normalizeMasp(row?.masp) === masp;
  });

  if (!keys.length) return;

  keys.forEach(k => delete state.nhap[k]);
  state.nhapOrder = (state.nhapOrder || []).filter(x => normalizeMasp(x) !== masp);
  state.selectedMasp = "";

  renderBangKetQua();
}

export function setXuatData(rows) {
  const state = getState();

  state.xuat = {};
  state.xuatOrder = [];

  (rows || []).forEach((r) => {
    const masp = normalizeMasp(r.masp);
    const size = normalizeSize(r.size);
    const sl = normalizeNumber(r.sl);

    if (!masp || !size) return;

    const key = makeKey(masp, size);
    state.xuat[key] = { masp, size, sl };

    if (!state.xuatOrder.includes(masp)) {
      state.xuatOrder.push(masp);
    }
  });

  renderBangKetQua();
}
