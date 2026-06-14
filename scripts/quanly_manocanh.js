import {
  khoiTaoDangNhapDungChung,
  dangXuatDungChung,
  getCurrentUserInfo,
  getSupabaseClient
} from "./authModule.js";

const TABLE = "manocanh";

const $ = (id) => document.getElementById(id);

let supabase = null;
let currentCoso = "cs1";
let currentNhanVien = "";
let allRows = [];
let duplicateRow = null;

function normalizeMasp(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeSize(v) {
  return String(v || "").trim();
}

function setMsg(text, type = "") {
  const el = $("message");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg" + (type ? " " + type : "");
}

function hideDuplicateBox() {
  duplicateRow = null;
  const box = $("duplicate-box");
  if (box) box.style.display = "none";
}

function showDuplicateBox(row) {
  duplicateRow = row;
  const box = $("duplicate-box");
  const txt = $("duplicate-text");
  if (!box || !txt || !row) return;

  txt.textContent = `Sản phẩm ${row.masp} size ${row.size} đang có trên manocanh. Bạn muốn xóa/gỡ sản phẩm này không?`;
  box.style.display = "block";
}

function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getAuthInfo() {
  const info = getCurrentUserInfo ? getCurrentUserInfo() : {};
  currentCoso = String(info.diadiem || localStorage.getItem("diadiem") || "cs1").trim().toLowerCase();
  if (!["cs1", "cs2"].includes(currentCoso)) currentCoso = "cs1";

  currentNhanVien = String(
    info.manv ||
    info.tennv ||
    localStorage.getItem("manv") ||
    localStorage.getItem("tennv") ||
    ""
  ).trim();

  $("lbl-coso").textContent = currentCoso;
  $("lbl-nhanvien").textContent = currentNhanVien || "--";
  $("coso").value = currentCoso;
  $("nhanvien").value = currentNhanVien;
}

function clearInput({ keepMasp = false } = {}) {
  if (!keepMasp) $("masp").value = "";
  $("size").value = "";
  hideDuplicateBox();
  setTimeout(() => $("masp")?.focus(), 50);
}

function renderRows(rows, highlightId = null) {
  const body = $("data-body");
  const empty = $("empty-state");
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    if (highlightId && String(r.id) === String(highlightId)) {
      tr.classList.add("row-highlight");
    }

    tr.innerHTML = `
      <td>${r.masp || ""}</td>
      <td class="size">${r.size || ""}</td>
      <td>${r.coso || ""}</td>
      <td>${r.nhanvien || ""}</td>
      <td>${formatDate(r.created_at)}</td>
      <td class="xoa"><input type="checkbox" class="chk-delete" data-id="${r.id}"></td>
    `;

    body.appendChild(tr);
  });
}

async function loadData(highlightId = null) {
  if (!supabase) supabase = getSupabaseClient();
  getAuthInfo();
  hideDuplicateBox();

  setMsg("Đang tải dữ liệu...", "warn");

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, masp, size, coso, nhanvien, created_at")
    .eq("coso", currentCoso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setMsg("Lỗi tải dữ liệu manocanh: " + error.message, "err");
    return;
  }

  allRows = Array.isArray(data) ? data : [];

  if (highlightId) {
    const idx = allRows.findIndex((r) => String(r.id) === String(highlightId));
    if (idx > 0) {
      const [found] = allRows.splice(idx, 1);
      allRows.unshift(found);
    }
  }

  renderRows(allRows, highlightId);
  setMsg(`Đã tải ${allRows.length} sản phẩm manocanh ${currentCoso}.`, "ok");
}

function findDuplicateLocal(masp, size) {
  return allRows.find((r) =>
    normalizeMasp(r.masp) === normalizeMasp(masp) &&
    normalizeSize(r.size) === normalizeSize(size) &&
    String(r.coso || "").toLowerCase() === currentCoso
  ) || null;
}

async function checkMaspTonTaiTrongDanhMuc(masp) {
  if (!supabase) supabase = getSupabaseClient();

  const code = normalizeMasp(masp);
  if (!code) return false;

  const { data, error } = await supabase
    .from("dmhanghoa")
    .select("masp")
    .eq("masp", code)
    .maybeSingle();

  if (error) {
    console.error("[manocanh] Lỗi kiểm tra mã sản phẩm:", error);
    setMsg("Lỗi kiểm tra mã sản phẩm: " + error.message, "err");
    return false;
  }

  return !!data;
}

async function saveCurrentInput() {
  if (!supabase) supabase = getSupabaseClient();
  getAuthInfo();

  const masp = normalizeMasp($("masp").value);
  const size = normalizeSize($("size").value);

  if (!masp) {
    setMsg("Chưa nhập mã sản phẩm.", "err");
    $("masp").focus();
    return;
  }
  if (!size) {
    setMsg("Chưa chọn size.", "err");
    $("size").focus();
    return;
  }

  setMsg("Đang kiểm tra mã sản phẩm...", "warn");

  const maspTonTai = await checkMaspTonTaiTrongDanhMuc(masp);

  if (!maspTonTai) {
    setMsg(`Mã sản phẩm ${masp} không đúng hoặc chưa có trong danh mục hàng hóa.`, "err");
    $("masp").focus();
    $("masp").select();
    return;
  }

  const dup = findDuplicateLocal(masp, size);
  if (dup) {
    await loadData(dup.id);
    const freshDup = allRows.find((r) => String(r.id) === String(dup.id)) || dup;
    showDuplicateBox(freshDup);
    setMsg("Sản phẩm trùng đang được đưa lên đầu bảng.", "warn");
    return;
  }

  hideDuplicateBox();
  setMsg("Đang lưu...", "warn");

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      masp,
      size,
      coso: currentCoso,
      nhanvien: currentNhanVien
    })
    .select("id, masp, size, coso, nhanvien, created_at")
    .single();

  if (error) {
    if (String(error.code) === "23505" || String(error.message || "").toLowerCase().includes("duplicate")) {
      await loadData();
      const dup2 = findDuplicateLocal(masp, size);
      if (dup2) {
        await loadData(dup2.id);
        showDuplicateBox(dup2);
        setMsg("Sản phẩm này đã có trên manocanh.", "warn");
        return;
      }
    }

    console.error(error);
    setMsg("Lỗi lưu dữ liệu: " + error.message, "err");
    return;
  }

  await loadData(data?.id || null);
  setMsg(`Đã thêm ${masp} size ${size} vào manocanh.`, "ok");
  clearInput();
}

async function deleteIds(ids) {
  if (!ids.length) {
    setMsg("Chưa chọn sản phẩm cần xóa.", "err");
    return;
  }

  if (!supabase) supabase = getSupabaseClient();
  setMsg("Đang xóa...", "warn");

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .in("id", ids);

  if (error) {
    console.error(error);
    setMsg("Lỗi xóa dữ liệu: " + error.message, "err");
    return;
  }

  await loadData();
  setMsg(`Đã xóa/gỡ ${ids.length} sản phẩm khỏi manocanh.`, "ok");
  clearInput();
}

function getCheckedIds() {
  return Array.from(document.querySelectorAll(".chk-delete:checked"))
    .map((el) => Number(el.dataset.id))
    .filter(Boolean);
}

function bindEvents() {
  $("btn-save")?.addEventListener("click", saveCurrentInput);

  $("btn-delete")?.addEventListener("click", async () => {
    const ids = getCheckedIds();
    await deleteIds(ids);
  });

  $("btn-refresh")?.addEventListener("click", () => loadData());

  $("btn-logout")?.addEventListener("click", () => {
    dangXuatDungChung({ reloadPage: true });
  });

  $("btn-scan")?.addEventListener("click", () => {
    if (!window.MaspScanner || typeof window.MaspScanner.openForInput !== "function") {
      setMsg("Chưa tải được module quét mã sản phẩm.", "err");
      return;
    }

    window.MaspScanner.openForInput("masp", {
      onResult: () => {
        setTimeout(() => $("size")?.focus(), 100);
      }
    });
  });

  $("masp")?.addEventListener("input", (e) => {
    e.target.value = normalizeMasp(e.target.value);
    hideDuplicateBox();
  });

  $("masp")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("size")?.focus();
    }
  });

  $("size")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCurrentInput();
    }
  });

  $("size")?.addEventListener("change", () => {
    hideDuplicateBox();
  });

  $("dup-yes")?.addEventListener("click", async () => {
    if (!duplicateRow?.id) return;
    await deleteIds([duplicateRow.id]);
  });

  $("dup-no")?.addEventListener("click", () => {
    hideDuplicateBox();
    setMsg("Đã giữ nguyên sản phẩm trên manocanh.", "ok");
    clearInput();
  });
}

function init() {
  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: "cs1",
    onLoginSuccess: async () => {
      supabase = getSupabaseClient();
      getAuthInfo();
      bindEvents();
      await loadData();

      const urlMasp = new URLSearchParams(location.search).get("masp");
      if (urlMasp) {
        $("masp").value = normalizeMasp(urlMasp);
        setTimeout(() => $("size")?.focus(), 100);
      } else {
        setTimeout(() => $("masp")?.focus(), 100);
      }
      return true;
    }
  });
}

init();
