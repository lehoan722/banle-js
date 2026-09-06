// Module YÊU CẦU BÀY MẪU cho trang Tìm kiếm nhanh.
// Chỉ hiện nút BM; dữ liệu chỉ được tải và popup chỉ mở khi người dùng bấm nút.

let moduleContext = null;
let popupOpen = false;
let saving = false;
let taskCache = null;
let taskCacheAt = 0;
let taskRequest = null;
let prefetchTimer = null;
let cacheVersion = 0;
let currentToggleClose = null;

const STYLE_ID = "yeu-cau-bay-mau-style";
const BUTTON_ID = "yeu-cau-bay-mau-btn";
const OVERLAY_ID = "yeu-cau-bay-mau-overlay";

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID}{
      position:fixed;right:10px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:26000;
      width:44px;height:44px;border:1px solid rgba(128,91,0,.55);border-radius:50%;
      background:rgba(255,210,48,.96);color:#513900;font-size:16px;font-weight:900;line-height:1;
      display:flex;align-items:center;justify-content:center;padding:0;
      box-shadow:0 4px 14px rgba(0,0,0,.25);touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    #${BUTTON_ID}:active{transform:scale(.94)}
    #${BUTTON_ID}[disabled]{opacity:.65;cursor:wait}
    #${OVERLAY_ID}{
      position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.24);
      display:flex;align-items:flex-start;justify-content:center;padding:8px 6px;
    }
    #${OVERLAY_ID} .ybm-box{
      width:min(860px,calc(100vw - 12px));height:70vh;height:70dvh;
      max-height:70vh;max-height:70dvh;background:#f7e0b3;border-radius:8px;
      box-shadow:0 8px 28px rgba(0,0,0,.34);overflow:hidden;
      display:flex;flex-direction:column;font-size:16px;color:#172033;
    }
    #${OVERLAY_ID} .ybm-header{
      flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 8px;
      background:#f4c985;border-bottom:1px solid #cda75f;font-weight:800;
    }
    #${OVERLAY_ID} .ybm-title{flex:1;min-width:0;line-height:1.25}
    #${OVERLAY_ID} .ybm-close{
      flex:0 0 38px;width:38px;height:38px;border:0;border-radius:7px;
      background:#fff3d2;color:#a22018;font-size:22px;font-weight:900;padding:0;
    }
    #${OVERLAY_ID} .ybm-body{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}
    #${OVERLAY_ID} table{width:100%;min-width:720px;border-collapse:collapse;background:#fdf1d6}
    #${OVERLAY_ID} th,#${OVERLAY_ID} td{border:1px solid #cfc2a9;padding:4px 5px;vertical-align:middle}
    #${OVERLAY_ID} th{position:sticky;top:0;z-index:2;background:#f4c985;text-align:center}
    #${OVERLAY_ID} tr.ybm-old{background:#ffd6d6}
    #${OVERLAY_ID} tr.ybm-today{background:#fdf1d6}
    /* Dòng đang được người dùng chọn để xem StockQuick */
    #${OVERLAY_ID} tr.ybm-selected>td{background:#fff3b0 !important}
    #${OVERLAY_ID} .ybm-check-cell{text-align:center;width:72px}
    #${OVERLAY_ID} .ybm-check{transform:scale(2);transform-origin:center;margin:0}
    #${OVERLAY_ID} .ybm-code{font-weight:800;color:#075f9f;cursor:pointer;white-space:nowrap}
    #${OVERLAY_ID} .ybm-note{width:100%;min-width:175px;font-size:16px;padding:5px 6px;box-sizing:border-box}
    #${OVERLAY_ID} .ybm-camera{font-size:18px;padding:5px 8px;border:1px solid #b6934e;border-radius:6px;background:#fff3d2}
    #${OVERLAY_ID} .ybm-photo-status{font-size:13px;color:#087b43;margin-top:2px;white-space:nowrap}
    #${OVERLAY_ID} .ybm-empty{margin:auto;background:#fff;padding:18px;border-radius:10px;font-size:17px;font-weight:800}
    @media(max-width:520px){
      #${OVERLAY_ID}{padding-top:6px}
      #${OVERLAY_ID} .ybm-box{width:calc(100vw - 8px);height:70vh;height:70dvh;font-size:16px}
      #${OVERLAY_ID} th,#${OVERLAY_ID} td{padding:3px 4px}
    }
  `;
  document.head.appendChild(style);
}


function bindBayMauFabDrag(button) {
  if (!button || button.dataset.dragBound === "1") return;
  button.dataset.dragBound = "1";

  const STORAGE_KEY = "hoantuyet_fab_pos_bm_v1";
  const DEFAULT_RIGHT = 10;
  const DEFAULT_BOTTOM = 14;
  const MARGIN = 4;
  let drag = null;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

  const applySavedPosition = () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) {}

    const rect = button.getBoundingClientRect();
    const w = rect.width || button.offsetWidth || 48;
    const h = rect.height || button.offsetHeight || 48;

    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const x = clamp(saved.x, MARGIN, window.innerWidth - w - MARGIN);
      const y = clamp(saved.y, MARGIN, window.innerHeight - h - MARGIN);
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.style.right = "auto";
      button.style.bottom = "auto";
    } else {
      button.style.left = "auto";
      button.style.top = "auto";
      button.style.right = DEFAULT_RIGHT + "px";
      button.style.bottom = `calc(${DEFAULT_BOTTOM}px + env(safe-area-inset-bottom))`;
    }
  };

  const saveCurrentPosition = () => {
    const r = button.getBoundingClientRect();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
    } catch (_) {}
  };

  button.addEventListener("pointerdown", e => {
    if (e.button != null && e.button !== 0) return;
    const r = button.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      left: r.left,
      top: r.top,
      moved: false
    };
    try { button.setPointerCapture(e.pointerId); } catch (_) {}
  });

  button.addEventListener("pointermove", e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;
    e.preventDefault();

    const w = button.offsetWidth || 48;
    const h = button.offsetHeight || 48;
    const x = clamp(drag.left + dx, MARGIN, window.innerWidth - w - MARGIN);
    const y = clamp(drag.top + dy, MARGIN, window.innerHeight - h - MARGIN);

    button.style.left = x + "px";
    button.style.top = y + "px";
    button.style.right = "auto";
    button.style.bottom = "auto";
  });

  const endDrag = e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    drag = null;
    try { button.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      button.dataset.suppressClickUntil = String(Date.now() + 350);
      saveCurrentPosition();
    }
  };

  button.addEventListener("pointerup", endDrag);
  button.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", applySavedPosition);
  window.visualViewport?.addEventListener("resize", applySavedPosition);

  applySavedPosition();
}

function getAdminStatus() {
  const truthy = value => ["true", "1", "yes"].includes(String(value || "").toLowerCase());
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem("currentUser") || "null"); } catch (_) {}
  return !!(
    currentUser?.is_admin || truthy(localStorage.getItem("is_admin")) ||
    truthy(localStorage.getItem("sua_hoadon")) || truthy(localStorage.getItem("xoa_hoadon")) ||
    String(localStorage.getItem("role") || "").toLowerCase() === "admin"
  );
}

function buildNoteWithStaff(note, manv) {
  const clean = String(note || "").trim().replace(/\s*\[NV\s*:\s*[^\]]+\]\s*$/i, "").trim();
  const staff = String(manv || "").trim().toUpperCase();
  return clean && staff ? `${clean} [NV:${staff}]` : clean;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh")); };
    image.src = url;
  });
}

function formatTime(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function resizeImage(file, masp, manv, diadiem) {
  const image = await fileToImage(file);
  const landscape = image.width >= image.height;
  const width = landscape ? 480 : 360;
  const height = landscape ? 360 : 480;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = Math.round(image.width * scale);
  const drawHeight = Math.round(image.height * scale);
  ctx.drawImage(image, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight);

  const lines = [
    `MÃ SP: ${String(masp || "").toUpperCase()}`,
    `THỜI GIAN: ${formatTime()}`,
    `NHÂN VIÊN: ${String(manv || "").toUpperCase()}`,
    `CƠ SỞ: ${String(diadiem || "").toUpperCase()}`
  ];
  const fontSize = Math.max(15, Math.round(Math.min(width, height) * .045));
  const pad = 10;
  const lineHeight = Math.round(fontSize * 1.35);
  const boxHeight = lineHeight * lines.length + pad * 2;
  const boxX = 8;
  const boxY = height - boxHeight - 8;
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.fillRect(boxX, boxY, Math.round(width * .82), boxHeight);
  ctx.font = `700 ${fontSize}px Arial,sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffeb3b";
  ctx.strokeStyle = "rgba(0,0,0,.9)";
  ctx.lineWidth = 2;
  lines.forEach((text, index) => {
    const x = boxX + pad;
    const y = boxY + pad + index * lineHeight;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  });
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Không nén được ảnh")),
    "image/jpeg", .62
  ));
}

async function fetchTasks() {
  const { supabase, diadiem } = moduleContext;
  const { data, error } = await supabase.rpc("baymau_get_tasks", {
    p_diadiem: diadiem,
    p_mode: "mt",
    p_manv: null
  });
  if (error) throw error;
  return data || [];
}

async function loadTasks({ force = false } = {}) {
  const cacheIsFresh = Array.isArray(taskCache) && Date.now() - taskCacheAt < 120000;
  if (!force && cacheIsFresh) return taskCache;
  if (taskRequest) return taskRequest;
  const requestCacheVersion = cacheVersion;
  taskRequest = fetchTasks()
    .then(tasks => {
      // Không cho một request cũ ghi đè cache vừa được cập nhật sau khi lưu.
      if (requestCacheVersion === cacheVersion) {
        taskCache = tasks;
        taskCacheAt = Date.now();
      }
      return tasks;
    })
    .finally(() => { taskRequest = null; });
  return taskRequest;
}

function removePopup() {
  document.getElementById(OVERLAY_ID)?.remove();
  popupOpen = false;
  currentToggleClose = null;
}

function showLoadingPopup() {
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  const message = document.createElement("div");
  message.className = "ybm-empty";
  message.textContent = "Đang tải yêu cầu bày mẫu…";
  overlay.appendChild(message);
  document.body.appendChild(overlay);
}

function td(className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  return cell;
}

function th(text, className = "") {
  const cell = document.createElement("th");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

async function saveAndClose(tasks, refs, closeButton) {
  if (saving) return;
  saving = true;
  closeButton.disabled = true;
  closeButton.textContent = "…";
  const { supabase, diadiem, manvDangNhap } = moduleContext;

  try {
    const rowsToFinish = [];
    for (const row of tasks) {
      const ref = refs.get(Number(row.id_ct));
      if (!ref?.done.checked) continue;
      const file = ref.getFile();
      if (row.can_chup_anh_baymau && !file && !row.baymau_image_path) {
        alert(`Mã ${row.masp}: đã tick bày mẫu nhưng chưa chụp ảnh.`);
        return;
      }
      rowsToFinish.push({ row, ref, file });
    }

    for (const item of rowsToFinish) {
      if (!item.file) continue;
      const blob = await resizeImage(item.file, item.row.masp, manvDangNhap, diadiem);
      const date = new Date().toISOString().slice(0, 10);
      const path = `${diadiem}/${manvDangNhap}/${date}/${item.row.id_ct}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("ANHBAYMAU").upload(path, blob, {
        upsert: true, cacheControl: "3600", contentType: "image/jpeg"
      });
      if (uploadError) throw new Error(`Lỗi lưu ảnh mã ${item.row.masp}: ${uploadError.message || uploadError}`);
      const { error: imageError } = await supabase.rpc("baymau_update_image", {
        p_id_ct: Number(item.row.id_ct), p_path: path, p_manv: manvDangNhap
      });
      if (imageError) throw new Error(`Ảnh mã ${item.row.masp} đã tải lên nhưng chưa lưu được đường dẫn.`);
    }

    const doneIds = rowsToFinish.map(item => Number(item.row.id_ct)).filter(Number.isFinite);
    if (doneIds.length) {
      const { error } = await supabase.rpc("baymau_set_done", { p_ids: doneIds, p_manv: manvDangNhap });
      if (error) throw error;
    }

    const noteUpdates = [];
    refs.forEach((ref, id) => {
      const note = ref.note.value.trim();
      if (note && note !== ref.oldNote.trim()) {
        noteUpdates.push({ id_ct: id, note: buildNoteWithStaff(note, manvDangNhap) });
      }
    });

    const confirmIds = getAdminStatus()
      ? [...refs.entries()].filter(([, ref]) => ref.confirm.checked).map(([id]) => id)
      : [];
    if (noteUpdates.length || confirmIds.length) {
      const { error } = await supabase.rpc("baymau_update_note_and_confirm", {
        p_note_updates: noteUpdates,
        p_confirm_ids: confirmIds,
        p_admin: getAdminStatus() ? manvDangNhap : null
      });
      if (error) throw error;
    }
    // Cập nhật cache ngay tại máy để lần mở BM kế tiếp không phải chờ RPC.
    // Những dòng đã hoàn thành được bỏ ngay; ghi chú/xác nhận còn lại được cập nhật
    // theo đúng dữ liệu vừa lưu.
    const doneIdSet = new Set(doneIds);
    cacheVersion += 1;
    taskCache = tasks
      .filter(row => !doneIdSet.has(Number(row.id_ct)))
      .map(row => {
        const ref = refs.get(Number(row.id_ct));
        if (!ref) return row;
        const typedNote = ref.note.value.trim();
        return {
          ...row,
          baymau_note: typedNote
            ? buildNoteWithStaff(typedNote, manvDangNhap)
            : (row.baymau_note || ""),
          baymau_admin_confirm_by:
            row.baymau_admin_confirm_by ||
            (getAdminStatus() && ref.confirm.checked ? manvDangNhap : null)
        };
      });
    taskCacheAt = Date.now();
    removePopup();

    // Chờ request cũ (nếu có) kết thúc rồi đồng bộ lại âm thầm từ máy chủ.
    // Popup đã đóng và cache tại máy vẫn sẵn sàng nên người dùng không phải chờ.
    const pendingRequest = taskRequest;
    Promise.resolve(pendingRequest)
      .catch(() => {})
      .finally(() => setTimeout(() => {
        loadTasks({ force: true }).catch(error => {
          console.warn("Chưa đồng bộ lại được yêu cầu bày mẫu:", error);
        });
      }, 0));
  } catch (error) {
    console.error("Lỗi lưu yêu cầu bày mẫu:", error);
    alert("Không lưu được yêu cầu bày mẫu: " + (error?.message || error));
  } finally {
    saving = false;
    if (closeButton.isConnected) {
      closeButton.disabled = false;
      closeButton.textContent = "✕";
    }
  }
}

function showPopup(tasks) {
  document.getElementById(OVERLAY_ID)?.remove();
  const oldCount = tasks.filter(row => row.task_age !== "TODAY").length;
  const todayCount = tasks.length - oldCount;
  const isAdmin = getAdminStatus();
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  const box = document.createElement("div");
  box.className = "ybm-box";
  const header = document.createElement("div");
  header.className = "ybm-header";
  const title = document.createElement("div");
  title.className = "ybm-title";
  title.innerHTML = `YÊU CẦU BÀY MẪU SP <span style="color:#c00">10 ngày trước: ${oldCount}</span> | <span style="color:#087b43">Hôm nay: ${todayCount}</span>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ybm-close";
  close.textContent = "✕";
  close.title = "Lưu và đóng";
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "ybm-body";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(th("Bày mẫu", "ybm-check-cell"), th("Ảnh"));
  const confirmHead = th("", "ybm-check-cell");
  const confirmAll = document.createElement("input");
  confirmAll.type = "checkbox";
  confirmAll.className = "ybm-check";
  confirmAll.disabled = !isAdmin;
  confirmAll.title = "Duyệt tất cả";
  confirmHead.appendChild(confirmAll);
  headRow.append(th("Mã SP"), th("NV bán"), th("Ghi chú"), confirmHead);
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const refs = new Map();

  // Chỉ giữ đúng 1 dòng được chọn. Dòng được chọn tô vàng để người dùng
  // dễ nhận biết mã đang mở trong StockQuickPopup.
  let selectedRow = null;
  const selectAndOpenStockQuick = (tr, masp, anchorEl) => {
    if (selectedRow && selectedRow !== tr) selectedRow.classList.remove("ybm-selected");
    selectedRow = tr;
    tr.classList.add("ybm-selected");

    const code = String(masp || "").trim().toUpperCase();
    if (!code) return;
    if (typeof window.stockQuickPopup === "function") window.stockQuickPopup(code);
    else if (window.StockQuick?.showFor) window.StockQuick.showFor(anchorEl || tr, code);
  };

  tasks.forEach(row => {
    const rowId = Number(row.id_ct);
    const tr = document.createElement("tr");
    tr.className = row.task_age === "TODAY" ? "ybm-today" : "ybm-old";

    const doneCell = td("ybm-check-cell");
    const done = document.createElement("input");
    done.type = "checkbox";
    done.className = "ybm-check";
    doneCell.appendChild(done);

    const confirmCell = td("ybm-check-cell");
    const confirm = document.createElement("input");
    confirm.type = "checkbox";
    confirm.className = "ybm-check";
    confirm.checked = !!row.baymau_admin_confirm_by;
    confirm.disabled = !isAdmin;
    confirmCell.appendChild(confirm);

    const codeCell = td("ybm-code");
    codeCell.textContent = row.masp || "";
    // Bấm ở bất kỳ vị trí nào trong ô Mã SP đều chọn dòng + mở StockQuick.
    codeCell.onclick = event => {
      event.stopPropagation();
      selectAndOpenStockQuick(tr, row.masp, codeCell);
    };

    const sellerCell = td();
    sellerCell.textContent = row.nvban || "";
    const noteCell = td();
    const note = document.createElement("input");
    note.type = "text";
    note.className = "ybm-note";
    note.value = row.baymau_note || "";
    noteCell.appendChild(note);

    const imageCell = td();
    const camera = document.createElement("button");
    camera.type = "button";
    camera.className = "ybm-camera";
    camera.textContent = "📷";
    camera.style.display = "none";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.capture = "environment";
    fileInput.hidden = true;
    const photoStatus = document.createElement("div");
    photoStatus.className = "ybm-photo-status";
    let selectedFile = null;
    camera.onclick = event => {
      event.stopPropagation();
      fileInput.click();
    };
    fileInput.onchange = event => {
      selectedFile = event.target.files?.[0] || null;
      photoStatus.textContent = selectedFile ? "Đã chọn ảnh" : "";
    };
    done.onchange = () => {
      if (done.checked && row.can_chup_anh_baymau) {
        camera.style.display = "inline-block";
        setTimeout(() => fileInput.click(), 50);
      } else {
        camera.style.display = "none";
        fileInput.value = "";
        selectedFile = null;
        photoStatus.textContent = "";
      }
    };
    imageCell.append(camera, fileInput, photoStatus);

    // Bấm phần trống của cột Ảnh cũng chọn dòng + mở StockQuick.
    // Riêng nút camera / input ảnh vẫn giữ đúng nghiệp vụ chụp ảnh, không mở StockQuick.
    imageCell.addEventListener("click", event => {
      if (event.target === camera || event.target === fileInput || event.target.closest?.(".ybm-camera")) return;
      event.stopPropagation();
      selectAndOpenStockQuick(tr, row.masp, imageCell);
    });

    tr.append(doneCell, imageCell, codeCell, sellerCell, noteCell, confirmCell);
    tbody.appendChild(tr);
    refs.set(rowId, { done, confirm, note, oldNote: row.baymau_note || "", getFile: () => selectedFile });
  });

  confirmAll.onchange = () => {
    if (!isAdmin) return;
    refs.forEach(ref => { if (!ref.confirm.disabled) ref.confirm.checked = confirmAll.checked; });
  };
  table.appendChild(tbody);
  body.appendChild(table);
  box.append(header, body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Click trong hộp không lan ra overlay. Click ra vùng tối bên ngoài hộp sẽ
  // tự động LƯU rồi đóng, giống nút X, để không làm mất ghi chú/tick vừa nhập.
  box.addEventListener("click", event => event.stopPropagation());
  overlay.addEventListener("click", event => {
    if (event.target !== overlay || saving) return;
    saveAndClose(tasks, refs, close);
  });
  const closeCurrentPopup = () => {
    if (saving) return;
    saveAndClose(tasks, refs, close);
  };

  // Nút BM luôn hiện. Khi popup đang mở, bấm BM lần nữa
  // sẽ lưu + đóng đúng như nút X.
  currentToggleClose = closeCurrentPopup;

  close.onclick = event => {
    event.stopPropagation();
    closeCurrentPopup();
  };
}

async function openFromButton(button) {
  if (!moduleContext || popupOpen || saving) return;
  popupOpen = true;
  button.disabled = true;
  showLoadingPopup();
  try {
    const tasks = await loadTasks();
    if (!tasks.length) {
      removePopup();
      alert("Hiện tại không có yêu cầu bày mẫu sản phẩm.");
      return;
    }
    showPopup(tasks);
  } catch (error) {
    removePopup();
    console.error("Lỗi tải yêu cầu bày mẫu:", error);
    alert("Không tải được yêu cầu bày mẫu: " + (error?.message || error));
  } finally {
    button.disabled = false;
  }
}

export function moYeuCauBayMau() {
  if (!moduleContext || saving || popupOpen) return;

  const button = document.getElementById(BUTTON_ID);

  if (!button) {
    console.warn("Yêu cầu bày mẫu chưa được khởi tạo.");
    return;
  }

  openFromButton(button);
}

export function initYeuCauBayMau({ supabase, diadiem, manvDangNhap }) {
  if (!supabase) throw new Error("Thiếu Supabase client cho Yêu cầu bày mẫu.");
  moduleContext = {
    supabase,
    diadiem: String(diadiem || "").trim().toLowerCase(),
    manvDangNhap: String(manvDangNhap || "").trim()
  };
  addStyles();
  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "BM";
    button.title = "Yêu cầu bày mẫu";
    button.setAttribute("aria-label", "Mở yêu cầu bày mẫu");
    document.body.appendChild(button);
  }
  bindBayMauFabDrag(button);

  button.onclick = () => {
    if (Date.now() < Number(button.dataset.suppressClickUntil || 0)) return;
    if (saving) return;

    if (popupOpen) {
      if (typeof currentToggleClose === "function") currentToggleClose();
      else removePopup();
      return;
    }

    openFromButton(button);
  };

  // Tải trước dữ liệu nhưng tuyệt đối không tự mở popup.
  setTimeout(() => loadTasks({ force: true }).catch(error => {
    console.warn("Chưa tải trước được yêu cầu bày mẫu:", error);
  }), 350);
  if (prefetchTimer) clearInterval(prefetchTimer);
  prefetchTimer = setInterval(() => loadTasks({ force: true }).catch(() => {}), 120000);
}
