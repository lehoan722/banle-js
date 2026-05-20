import {
  supabase,
  getCurrentUserInfo,
  logout
} from "./supabaseClient.js";

const $ = id => document.getElementById(id);

let hot;
let rawData = [];

let selectedMakhs = [];

const columns = [
  {
    data: "makh",
    title: "Mã KH",
    readOnly: true
  },

  {
    data: "tenkh",
    title: "Tên khách",
    readOnly: true
  },

  {
    data: "zalo_action",
    title: "Zalo",
    readOnly: true,
    renderer: zaloActionRenderer
  },

  {
    data: "da_tham_gia_congdong",
    title: "Đã vào nhóm",
    type: "checkbox"
  },

  {
    data: "diem_hientai",
    title: "Điểm hiện tại",
    type: "numeric",
    readOnly: true
  },

  {
    data: "created_by_manv",
    title: "NV tạo",
    readOnly: true
  }
];

function setStatus(msg) {
  $("status").textContent = msg;
}

function taoNoiDungMoiThamGia(rowData) {

  const ten = rowData.tenkh || "anh/chị";
  const diem = Number(rowData.diem_hientai || 0);
  const tienDiem = diem * 1000;

  return `Shop Hoàn Tuyết xin chào anh/chị ${ten}.

Cảm ơn anh/chị đã mua hàng tại shop. Hiện anh/chị đang có ${diem} điểm, tương đương ${tienDiem.toLocaleString("vi-VN")}đ ưu đãi cho lần mua tiếp theo.

Mời anh/chị tham gia cộng đồng khuyến mại của shop để nhận ưu đãi và tích điểm khi mua hàng:
https://zalo.me/g/rz31sxl6fvcidvehzvty

Shop chân thành cảm ơn!`;
}

function zaloActionRenderer(instance, td, row) {

  Handsontable.dom.empty(td);

  const rowData = instance.getSourceDataAtRow(row);

  const phone = String(rowData?.dienthoai || "").trim();

  if (!phone) {
    td.innerHTML = `<span style="color:#999;">Không có SĐT</span>`;
    return td;
  }

  const btn = document.createElement("button");

  btn.textContent = "Chat Zalo";

  btn.style.background = "#0068ff";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.padding = "4px 8px";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";

  btn.onclick = async () => {

    const message = taoNoiDungMoiThamGia(rowData);

    await navigator.clipboard.writeText(message);

    await saveZaloLog(rowData, message);

    await saveZaloStatus(rowData, {
      da_gui_loi_moi: true,
      lan_gui_cuoi: new Date().toISOString()
    });

    window.open(`https://zalo.me/${phone}`, "_blank");

    setStatus(`Đã copy nội dung và mở Zalo cho ${rowData.tenkh}`);
  };

  td.appendChild(btn);

  return td;
}

async function saveZaloLog(rowData, message) {

  try {

    const info = getCurrentUserInfo();

    await supabase
      .from("zalo_message_logs")
      .insert({
        makh: rowData.makh,
        tenkh: rowData.tenkh,
        dienthoai: rowData.dienthoai,

        noi_dung: message,

        nguoi_gui_manv: info.manv,
        nguoi_gui_tennv: info.tennv,
        nguoi_gui_diadiem: info.diadiem,

        loai_gui: "ZALO_WEB"
      });

  } catch (err) {
    console.error(err);
  }
}

async function saveZaloStatus(rowData, patch = {}) {

  const info = getCurrentUserInfo();

  const payload = {
    makh: rowData.makh,
    tenkh: rowData.tenkh,
    dienthoai: rowData.dienthoai,

    updated_by_manv: info.manv,
    updated_by_tennv: info.tennv,
    updated_at: new Date().toISOString(),

    ...patch
  };

  const { error } = await supabase
    .from("zalo_customer_status")
    .upsert(payload, { onConflict: "makh" });

  if (error) {
    console.error(error);
    return false;
  }

  return true;
}

async function loadData() {

  setStatus("Đang tải dữ liệu...");

  const { data, error } = await supabase
    .from("dmkhachhang")
    .select(`
      makh,
      tenkh,
      dienthoai,
      diem_hientai,
      created_by_manv,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(3000);

  if (error) {
    alert(error.message);
    return;
  }

  rawData = Array.isArray(data) ? data : [];

  const makhs = rawData.map(r => r.makh).filter(Boolean);

  const { data: zaloStatus } = await supabase
    .from("zalo_customer_status")
    .select("makh, da_tham_gia_congdong")
    .in("makh", makhs);

  const statusMap = new Map(
    (zaloStatus || []).map(s => [s.makh, s])
  );

  rawData = rawData.map(row => ({
    ...row,
    da_tham_gia_congdong: !!statusMap.get(row.makh)?.da_tham_gia_congdong
  }));

  rawData = rawData.filter(r => !r.da_tham_gia_congdong);

  if (hot) {
    hot.loadData(rawData);
  }

  setStatus(`Đang hiển thị ${rawData.length} khách chưa tham gia nhóm Zalo.`);
}

function initTable() {

  hot = new Handsontable($("hot"), {
    data: rawData,
    columns,

    colHeaders: columns.map(c => c.title),

    rowHeaders: true,

    licenseKey: "non-commercial-and-evaluation",

    width: "100%",
    height: "100%",

    stretchH: "all",

    manualColumnResize: true,

    contextMenu: true,

    afterSelectionEnd(r1, c1, r2) {

      const start = Math.min(r1, r2);
      const end = Math.max(r1, r2);

      selectedMakhs = [];

      for (let i = start; i <= end; i++) {

        const row = hot.getSourceDataAtRow(i);

        if (row?.makh) {
          selectedMakhs.push(row.makh);
        }
      }
    },

    cells(row, col) {

      const cellProperties = {};

      const prop = columns[col]?.data;

      if (prop !== "da_tham_gia_congdong") {
        cellProperties.readOnly = true;
        cellProperties.className = "readonly-cell";
      }

      return cellProperties;
    },

    afterChange(changes, source) {

      if (!changes || source === "loadData") return;

      changes.forEach(async ([rowIndex, prop, oldValue, newValue]) => {

        if (prop !== "da_tham_gia_congdong") return;

        if (oldValue === newValue) return;

        const row = hot.getSourceDataAtRow(rowIndex);

        const ok = await saveZaloStatus(row, {
          da_tham_gia_congdong: !!newValue
        });

        if (ok) {

          rawData = rawData.filter(r => r.makh !== row.makh);

          hot.loadData(rawData);

          setStatus(`${row.tenkh} đã được đánh dấu đã tham gia nhóm Zalo.`);
        }
      });
    }
  });
}

let zaloSendQueue = [];
let zaloCurrentIndex = 0;

function openZaloMultiPopup() {

  if (!selectedMakhs.length) {
    alert("Vui lòng chọn khách hàng.");
    return;
  }

  zaloSendQueue = rawData.filter(r =>
    selectedMakhs.includes(r.makh)
  );

  if (!zaloSendQueue.length) {
    alert("Không có khách phù hợp.");
    return;
  }

  zaloCurrentIndex = 0;

  $("zaloPopupOverlay").style.display = "block";

  renderZaloAssistant();
}

function renderZaloAssistant() {

  const row = zaloSendQueue[zaloCurrentIndex];

  const box = $("zaloCustomerList");

  if (!row) {

    box.innerHTML = `
      <div style="padding:12px;">
        <b>Đã xử lý hết danh sách khách hàng.</b>
      </div>
    `;

    return;
  }

  const msg = taoNoiDungMoiThamGia(row);

  $("zaloMessageContent").value = msg;

  box.innerHTML = `
    <div style="padding:12px; border:1px solid #ddd; border-radius:8px;">

      <p><b>Khách hiện tại:</b> ${row.tenkh} - ${row.dienthoai}</p>

      <p><b>Điểm hiện tại:</b> ${row.diem_hientai || 0}</p>

      <p><b>Tiến độ:</b> ${zaloCurrentIndex + 1}/${zaloSendQueue.length}</p>

      <button id="btnOpenCurrentZalo"
        style="background:#0068ff;color:white;border:none;padding:8px 12px;border-radius:5px;">
        Copy nội dung + mở Zalo
      </button>

      <button id="btnMarkJoinedZalo"
        style="background:#16a34a;color:white;border:none;padding:8px 12px;border-radius:5px;margin-left:6px;">
        Đánh dấu đã vào nhóm
      </button>

      <button id="btnNextZaloCustomer"
        style="padding:8px 12px;border-radius:5px;margin-left:6px;">
        Khách tiếp theo
      </button>

    </div>
  `;

  $("btnOpenCurrentZalo").onclick = async () => {

    const currentMsg = $("zaloMessageContent").value;

    await navigator.clipboard.writeText(currentMsg);

    await saveZaloLog(row, currentMsg);

    await saveZaloStatus(row, {
      da_gui_loi_moi: true,
      lan_gui_cuoi: new Date().toISOString()
    });

    window.open(`https://zalo.me/${row.dienthoai}`, "_blank");
  };

  $("btnMarkJoinedZalo").onclick = async () => {

    const ok = await saveZaloStatus(row, {
      da_tham_gia_congdong: true
    });

    if (ok) {

      rawData = rawData.filter(r => r.makh !== row.makh);

      hot.loadData(rawData);

      zaloCurrentIndex++;

      renderZaloAssistant();
    }
  };

  $("btnNextZaloCustomer").onclick = () => {

    zaloCurrentIndex++;

    renderZaloAssistant();
  };
}

function closeZaloPopup() {
  $("zaloPopupOverlay").style.display = "none";
}

function bindEvents() {

  $("btnLoad").addEventListener("click", loadData);

  $("btnZaloMulti").addEventListener("click", openZaloMultiPopup);

  $("btnCloseZaloPopup").addEventListener("click", closeZaloPopup);

  $("btnLogout").addEventListener("click", logout);

  $("quickSearch").addEventListener("input", e => {

    const keyword = e.target.value.toLowerCase().trim();

    const filtered = rawData.filter(r => {

      return [
        r.makh,
        r.tenkh,
        r.dienthoai
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    hot.loadData(filtered);
  });
}

async function initPage() {  

  const info = getCurrentUserInfo();

  $("adminInfo").textContent = `${info.tennv || ""} (${info.manv || ""})`;

  $("app-container").style.display = "block";

  initTable();

  bindEvents();

  await loadData();
}

initPage();
