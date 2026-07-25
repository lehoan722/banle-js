import { supabase } from "./scripts/supabaseClient.js";

const $ = id => document.getElementById(id);
const money = value => Number(value || 0).toLocaleString("vi-VN");

let hot = null;
let hoveredRow = -1;
let currentRows = [];

function setDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  $("tuNgay").value = start.toISOString().slice(0, 10);
  $("denNgay").value = now.toISOString().slice(0, 10);
}

function normalizeRows(rows) {
  return (rows || []).map(row => ({
    bat_dau_at: row.bat_dau_at || null,
    luu_at: row.luu_at || null,
    diadiem: row.diadiem || "",
    nhanvien: row.tennv || row.manv || "",
    trangthai: row.trangthai || "",
    sohd: row.sohd || "",
    tong_tien_dinh: Number(row.tong_tien_dinh || 0),
    tong_tien_da_luu: Number(row.tong_tien_da_luu || 0),
    giam_tu_dinh: Number(row.giam_tu_dinh || 0),
    ty_le_giam: Number(row.ty_le_giam || 0),
    so_lan_them: Number(row.so_lan_them || 0),
    so_lan_sua: Number(row.so_lan_sua || 0),
    so_lan_xoa: Number(row.so_lan_xoa || 0),
    so_lan_bo_phien: Number(row.so_lan_bo_phien || 0),
    so_lan_xem_lai: Number(row.so_lan_xem_lai || 0),
    so_su_kien_sau_luu: Number(row.so_su_kien_sau_luu || 0),
    diem_rui_ro: Number(row.diem_rui_ro || 0),
    muc_rui_ro: row.muc_rui_ro || "thap",
    dau_hieu: row.dau_hieu || ""
  }));
}

function updateSummary(rows) {
  $("cTong").textContent = rows.length;
  $("cBo").textContent = rows.filter(x => x.trangthai === "bo_huy").length;
  $("cLoai").textContent = money(
    rows.reduce((sum, x) => sum + Number(x.giam_tu_dinh || 0), 0)
  );
  $("cRisk").textContent = rows.filter(x =>
    ["cao", "rat_cao"].includes(x.muc_rui_ro)
  ).length;
}

function getVisibleRows() {
  if (!hot) return [];
  const rows = [];
  for (let visualRow = 0; visualRow < hot.countRows(); visualRow++) {
    const physicalRow = hot.toPhysicalRow(visualRow);
    const row = hot.getSourceDataAtRow(physicalRow);
    if (row) rows.push(row);
  }
  return rows;
}

function decorateCell(td, visualRow, prop) {
  td.classList.remove(
    "audit-row-hover",
    "risk-high",
    "risk-medium",
    "risk-very-high"
  );

  if (visualRow === hoveredRow) td.classList.add("audit-row-hover");

  if (prop === "muc_rui_ro") {
    const risk = String(hot?.getDataAtRowProp(visualRow, "muc_rui_ro") || "");
    if (risk === "rat_cao") td.classList.add("risk-very-high");
    else if (risk === "cao") td.classList.add("risk-high");
    else if (risk === "trung_binh") td.classList.add("risk-medium");
  }
}

function textRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = value == null ? "" : String(value);
  decorateCell(td, row, prop);
}

function dateRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  if (!value) td.textContent = "";
  else {
    const date = new Date(value);
    td.textContent = Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("vi-VN");
  }
  decorateCell(td, row, prop);
}

function moneyRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = money(value);
  td.classList.add("htRight");
  decorateCell(td, row, prop);
}

function integerRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = Number(value || 0).toLocaleString("vi-VN");
  td.classList.add("htRight");
  decorateCell(td, row, prop);
}

function percentRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = `${Number(value || 0).toLocaleString("vi-VN", {
    maximumFractionDigits: 2
  })}%`;
  td.classList.add("htRight");
  decorateCell(td, row, prop);
}

function refreshAfterTableChange() {
  updateSummary(getVisibleRows());
  hot?.render();
}

function createOrUpdateTable(rows) {
  currentRows = normalizeRows(rows);

  if (hot) {
    hot.loadData(currentRows);
    refreshAfterTableChange();
    return;
  }

  hot = new Handsontable($("auditHot"), {
    data: currentRows,
    columns: [
      { data: "bat_dau_at", title: "Bắt đầu", renderer: dateRenderer },
      { data: "luu_at", title: "Lưu lúc", renderer: dateRenderer },
      { data: "diadiem", title: "Cơ sở", renderer: textRenderer },
      { data: "nhanvien", title: "Nhân viên", renderer: textRenderer },
      { data: "trangthai", title: "Trạng thái", renderer: textRenderer },
      { data: "sohd", title: "Số HĐ", renderer: textRenderer },
      { data: "tong_tien_dinh", title: "Đỉnh hóa đơn", type: "numeric", renderer: moneyRenderer },
      { data: "tong_tien_da_luu", title: "Đã lưu", type: "numeric", renderer: moneyRenderer },
      { data: "giam_tu_dinh", title: "Giảm từ đỉnh", type: "numeric", renderer: moneyRenderer },
      { data: "ty_le_giam", title: "% giảm", type: "numeric", renderer: percentRenderer },
      { data: "so_lan_them", title: "Thêm", type: "numeric", renderer: integerRenderer },
      { data: "so_lan_sua", title: "Sửa", type: "numeric", renderer: integerRenderer },
      { data: "so_lan_xoa", title: "Xóa", type: "numeric", renderer: integerRenderer },
      { data: "so_lan_bo_phien", title: "Bỏ phiên", type: "numeric", renderer: integerRenderer },
      { data: "so_lan_xem_lai", title: "Xem lại", type: "numeric", renderer: integerRenderer },
      { data: "so_su_kien_sau_luu", title: "Sau lưu", type: "numeric", renderer: integerRenderer },
      { data: "diem_rui_ro", title: "Điểm", type: "numeric", renderer: integerRenderer },
      { data: "muc_rui_ro", title: "Mức", renderer: textRenderer },
      { data: "dau_hieu", title: "Dấu hiệu", renderer: textRenderer }
    ],
    colWidths: [
      145, 145, 70, 105, 95, 145,
      115, 105, 115, 80, 70, 70,
      70, 80, 80, 80, 70, 95, 280
    ],
    rowHeaders: true,
    rowHeaderWidth: 45,
    readOnly: true,
    stretchH: "all",
    height: "100%",
    width: "100%",
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    manualColumnResize: true,
    autoWrapRow: false,
    autoWrapCol: false,
    licenseKey: window.HANDSONTABLE_LICENSE_KEY || "non-commercial-and-evaluation",
    afterInit: refreshAfterTableChange,
    afterLoadData() { setTimeout(refreshAfterTableChange, 0); },
    afterColumnSort() { setTimeout(refreshAfterTableChange, 0); },
    afterFilter() { setTimeout(refreshAfterTableChange, 0); },
    afterOnCellMouseOver(event, coords) {
      if (coords.row < 0 || coords.row === hoveredRow) return;
      hoveredRow = coords.row;
      hot.render();
    },
    afterOnCellDblClick(event, coords) {
      if (coords.row < 0) return;
      const row = hot.getSourceDataAtRow(hot.toPhysicalRow(coords.row));
      if (row?.sohd) openTimeline(row);
    }
  });

  $("auditHot").addEventListener("mouseleave", () => {
    if (hoveredRow === -1) return;
    hoveredRow = -1;
    hot.render();
  });
}

function ensureTimelineModal() {
  if ($("auditTimelineModal")) return;

  const modal = document.createElement("div");
  modal.id = "auditTimelineModal";
  modal.innerHTML = `
    <div class="audit-modal-backdrop"></div>
    <div class="audit-modal-panel">
      <div class="audit-modal-header">
        <strong id="auditTimelineTitle">Chi tiết hóa đơn</strong>
        <button id="auditTimelineClose" type="button">Đóng</button>
      </div>
      <div id="auditTimelineSummary" class="audit-timeline-summary"></div>
      <div class="audit-timeline-table-wrap">
        <table class="audit-timeline-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Hành động</th>
              <th>Mã SP</th>
              <th>Size</th>
              <th>SL trước</th>
              <th>SL sau</th>
              <th>Tổng tại thời điểm</th>
              <th>Điểm</th>
              <th>Lý do/Nguồn</th>
            </tr>
          </thead>
          <tbody id="auditTimelineBody"></tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => { modal.style.display = "none"; };
  $("auditTimelineClose").addEventListener("click", close);
  modal.querySelector(".audit-modal-backdrop").addEventListener("click", close);
}

async function openTimeline(row) {
  ensureTimelineModal();
  const modal = $("auditTimelineModal");
  modal.style.display = "block";
  $("auditTimelineTitle").textContent = `Lịch sử: ${row.sohd}`;
  $("auditTimelineSummary").textContent = "Đang tải dữ liệu...";
  $("auditTimelineBody").innerHTML = "";

  const { data, error } = await supabase
    .from("v_banle_audit_timeline")
    .select("*")
    .eq("sohd", row.sohd)
    .eq("diadiem", row.diadiem)
    .order("event_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    $("auditTimelineSummary").textContent = `Không tải được timeline: ${error.message}`;
    return;
  }

  $("auditTimelineSummary").innerHTML = `
    <b>Đỉnh hóa đơn:</b> ${money(row.tong_tien_dinh)} &nbsp;|&nbsp;
    <b>Đã lưu:</b> ${money(row.tong_tien_da_luu)} &nbsp;|&nbsp;
    <b>Giảm:</b> ${money(row.giam_tu_dinh)} (${row.ty_le_giam}%) &nbsp;|&nbsp;
    <b>Điểm:</b> ${row.diem_rui_ro} — ${row.muc_rui_ro}
  `;

  $("auditTimelineBody").innerHTML = (data || []).map(x => `
    <tr>
      <td>${new Date(x.event_at).toLocaleString("vi-VN")}</td>
      <td><b>${x.hanhdong || ""}</b></td>
      <td>${x.masp || ""}</td>
      <td>${x.size || ""}</td>
      <td>${x.soluong_truoc ?? ""}</td>
      <td>${x.soluong_sau ?? ""}</td>
      <td class="num">${money(x.tong_tien_tai_su_kien)}</td>
      <td class="num">${Number(x.diem_rui_ro_phat_sinh || 0)}</td>
      <td>${[x.lydo, x.source].filter(Boolean).join(" — ")}</td>
    </tr>
  `).join("");
}

async function loadData() {
  const from = $("tuNgay").value + "T00:00:00";
  const toDate = new Date($("denNgay").value + "T00:00:00");
  toDate.setDate(toDate.getDate() + 1);

  $("btnTai").disabled = true;
  $("btnTai").textContent = "Đang tải...";

  try {
    let query = supabase
      .from("v_banle_audit_hoadon")
      .select("*")
      .gte("bat_dau_at", from)
      .lt("bat_dau_at", toDate.toISOString())
      .order("bat_dau_at", { ascending: false })
      .limit(2000);

    if ($("diadiem").value) {
      query = query.eq("diadiem", $("diadiem").value);
    }

    const { data, error } = await query;
    if (error) throw error;
    createOrUpdateTable(data || []);
  } catch (error) {
    console.error("[AUDIT REPORT] Không tải được dữ liệu:", error);
    alert("Không tải được dữ liệu: " + (error?.message || error));
  } finally {
    $("btnTai").disabled = false;
    $("btnTai").textContent = "Tải dữ liệu";
  }
}

$("btnTai").addEventListener("click", loadData);
setDefaultDates();
loadData();
