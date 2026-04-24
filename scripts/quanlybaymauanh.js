import { supabase } from "./supabaseClient.js";

const BUCKET_BASE =
  "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/ANHBAYMAU";

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0, 10);
  $("tuNgay").value = today;
  $("denNgay").value = today;

  $("btnLoad").addEventListener("click", loadData);
  $("btnCloseImage").addEventListener("click", closeImage);
  $("imageOverlay").addEventListener("click", (e) => {
    if (e.target.id === "imageOverlay") closeImage();
  });

  loadData();
});

function getPublicUrl(path) {
  if (!path) return "";
  return `${BUCKET_BASE}/${path}`;
}

function openImage(url) {
  $("bigImage").src = url;
  $("imageOverlay").style.display = "flex";
}

function closeImage() {
  $("imageOverlay").style.display = "none";
  $("bigImage").src = "";
}

async function loadData() {
  const params = {
    p_tu_ngay: $("tuNgay").value,
    p_den_ngay: $("denNgay").value,
    p_diadiem: $("diadiem").value || null,
    p_baymau_by: $("baymauBy").value.trim() || null,
    p_masp: $("masp").value.trim().toUpperCase() || null,
    p_status: $("status").value || "wait_confirm"
  };

  if (!params.p_tu_ngay || !params.p_den_ngay) {
    alert("Vui lòng chọn từ ngày và đến ngày.");
    return;
  }

  $("summary").textContent = "Đang tải dữ liệu...";
  $("grid").innerHTML = "";

  const { data, error } = await supabase.rpc("baymau_get_image_tasks", params);

  if (error) {
    console.error("Lỗi baymau_get_image_tasks:", error);
    alert("Lỗi tải dữ liệu ảnh bày mẫu.");
    $("summary").textContent = "Lỗi tải dữ liệu";
    return;
  }

  renderCards(data || []);
}

function renderCards(rows) {
  $("summary").textContent = `Tổng: ${rows.length} dòng`;

  if (!rows.length) {
    $("grid").innerHTML = "<div>Không có dữ liệu phù hợp.</div>";
    return;
  }

  const frag = document.createDocumentFragment();

  rows.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";

    const imgUrl = getPublicUrl(r.baymau_image_path);

    const img = document.createElement("img");
    img.src = imgUrl || "";
    img.alt = r.masp || "";
    img.onerror = () => {
      img.style.display = "none";
    };
    img.addEventListener("click", () => {
      if (imgUrl) openImage(imgUrl);
    });

    const info = document.createElement("div");
    info.className = "info";

    const confirmed = !!r.baymau_admin_confirm_by;
    const statusText = confirmed
      ? `<span class="status-ok">Đã xác nhận</span>`
      : `<span class="status-wait">Chờ xác nhận</span>`;

    info.innerHTML = `
      <div><b>Mã SP:</b> ${r.masp || ""}</div>
      <div><b>Tên SP:</b> ${r.tensp || ""}</div>
      <div><b>Size:</b> ${r.size || ""}</div>
      <div><b>Hóa đơn:</b> ${r.sohd || ""}</div>
      <div><b>Cơ sở:</b> ${(r.diadiem || "").toUpperCase()}</div>
      <div><b>NV bán:</b> ${r.nvban || ""}</div>
      <div><b>Bày mẫu bởi:</b> ${r.baymau_by || ""}</div>
      <div><b>Giờ bày:</b> ${formatTime(r.baymau_at || r.baymau_image_at)}</div>
      <div><b>Trạng thái:</b> ${statusText}</div>
      <div><b>Ghi chú:</b> ${r.baymau_note || ""}</div>
    `;

    const noteInput = document.createElement("input");
    noteInput.className = "note-input";
    noteInput.placeholder = "Ghi chú kiểm ảnh...";
    noteInput.value = r.baymau_note || "";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "6px";
    btnRow.style.marginTop = "7px";
    btnRow.style.flexWrap = "wrap";

    const btnConfirm = document.createElement("button");
    btnConfirm.className = "btn-ok";
    btnConfirm.textContent = confirmed ? "Đã xác nhận" : "Xác nhận đúng";
    btnConfirm.disabled = confirmed;
    btnConfirm.onclick = async () => {
      await confirmImage(r.id_ct, noteInput.value.trim(), card);
    };

    const btnReject = document.createElement("button");
    btnReject.className = "btn-warn";
    btnReject.textContent = "Ghi chú / yêu cầu kiểm lại";
    btnReject.onclick = async () => {
      await saveNoteOnly(r.id_ct, noteInput.value.trim());
    };

    btnRow.appendChild(btnConfirm);
    btnRow.appendChild(btnReject);

    if (imgUrl) card.appendChild(img);
    card.appendChild(info);
    card.appendChild(noteInput);
    card.appendChild(btnRow);

    frag.appendChild(card);
  });

  $("grid").innerHTML = "";
  $("grid").appendChild(frag);
}

async function confirmImage(idCt, note, card) {
  if (!idCt) return;

  const currentManv = localStorage.getItem("manv") || "ADMIN";

  const { error } = await supabase.rpc("baymau_admin_confirm_image", {
    p_id_ct: Number(idCt),
    p_admin: currentManv,
    p_note: note || null
  });

  if (error) {
    console.error("Lỗi xác nhận ảnh:", error);
    alert("Lỗi xác nhận ảnh bày mẫu.");
    return;
  }

  card.style.opacity = "0.45";
  setTimeout(() => card.remove(), 250);
}

async function saveNoteOnly(idCt, note) {
  if (!idCt) return;
  if (!note) {
    alert("Vui lòng nhập ghi chú trước.");
    return;
  }

  const { error } = await supabase.rpc("baymau_admin_save_note", {
    p_id_ct: Number(idCt),
    p_note: note
  });

  if (error) {
    console.error("Lỗi lưu ghi chú:", error);
    alert("Lỗi lưu ghi chú.");
    return;
  }

  alert("Đã lưu ghi chú.");
}

function formatTime(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return value;
  }
}