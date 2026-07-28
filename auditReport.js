import { supabase } from "./scripts/supabaseClient.js";

const $ = id => document.getElementById(id);

const money = value =>
  Number(value || 0).toLocaleString("vi-VN");

let hot = null;
let hoveredRow = -1;

/*
 * Map:
 *   số hóa đơn -> 1: nền xám
 *   số hóa đơn -> 0: nền trắng
 *
 * Map được tính lại sau khi sắp xếp hoặc lọc.
 */
let invoiceBandMap = new Map();

function setDefaultDates() {
  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  $("tuNgay").value =
    start.toISOString().slice(0, 10);

  $("denNgay").value =
    now.toISOString().slice(0, 10);
}

function getInvoiceNumber(row) {
  return String(
    row?.sohd_da_luu ||
    row?.sohd_du_kien ||
    ""
  ).trim();
}

function normalizeRows(rows) {
  return (rows || []).map(row => ({
    bat_dau_at: row.bat_dau_at || null,
    diadiem: row.diadiem || "",
    nhanvien: row.tennv || row.manv || "",
    trangthai: row.trangthai || "",
    sohd: getInvoiceNumber(row),
    tong_tien_cao_nhat:
      Number(row.tong_tien_cao_nhat || 0),
    tong_tien_da_luu:
      Number(row.tong_tien_da_luu || 0),
    gia_tri_da_loai:
      Number(row.gia_tri_da_loai || 0),
    so_lan_xoa:
      Number(row.so_lan_xoa || 0),
    diem_rui_ro:
      Number(row.diem_rui_ro || 0),
    muc_rui_ro: row.muc_rui_ro || "",
    lydo_ket_thuc: row.lydo_ket_thuc || ""
  }));
}

function updateSummary(rows) {
  $("cTong").textContent = rows.length;

  $("cBo").textContent =
    rows.filter(
      row => row.trangthai === "bo_huy"
    ).length;

  $("cLoai").textContent = money(
    rows.reduce(
      (sum, row) =>
        sum + Number(row.gia_tri_da_loai || 0),
      0
    )
  );

  $("cRisk").textContent =
    rows.filter(
      row =>
        row.muc_rui_ro === "cao" ||
        row.muc_rui_ro === "rat_cao"
    ).length;
}

function getVisibleRows() {
  if (!hot) return [];

  const rows = [];

  for (
    let visualRow = 0;
    visualRow < hot.countRows();
    visualRow++
  ) {
    const row = hot.getSourceDataAtRow(
      hot.toPhysicalRow(visualRow)
    );

    if (row) rows.push(row);
  }

  return rows;
}

function rebuildInvoiceBands() {
  invoiceBandMap = new Map();

  if (!hot) return;

  let groupIndex = 0;

  for (
    let visualRow = 0;
    visualRow < hot.countRows();
    visualRow++
  ) {
    const sohd = String(
      hot.getDataAtRowProp(visualRow, "sohd") || ""
    ).trim();

    if (!sohd) continue;

    if (!invoiceBandMap.has(sohd)) {
      /*
       * Nhóm đầu tiên đang hiển thị là màu xám,
       * nhóm tiếp theo màu trắng, rồi lại xám...
       */
      invoiceBandMap.set(
        sohd,
        groupIndex % 2 === 0 ? 1 : 0
      );

      groupIndex++;
    }
  }
}

function decorateCell(td, visualRow, prop) {
  td.classList.remove(
    "invoice-band-gray",
    "audit-row-hover",
    "risk-high",
    "risk-medium"
  );

  const sohd = String(
    hot?.getDataAtRowProp(visualRow, "sohd") || ""
  ).trim();

  if (
    sohd &&
    invoiceBandMap.get(sohd) === 1
  ) {
    td.classList.add("invoice-band-gray");
  }

  if (visualRow === hoveredRow) {
    td.classList.add("audit-row-hover");
  }

  if (prop === "muc_rui_ro") {
    const risk = String(
      hot?.getDataAtRowProp(
        visualRow,
        "muc_rui_ro"
      ) || ""
    );

    if (
      risk === "cao" ||
      risk === "rat_cao"
    ) {
      td.classList.add("risk-high");
    } else if (risk === "trung_binh") {
      td.classList.add("risk-medium");
    }
  }
}

function textRenderer(
  instance,
  td,
  row,
  col,
  prop,
  value,
  cellProperties
) {
  Handsontable.renderers.TextRenderer.apply(
    this,
    arguments
  );

  td.textContent =
    value === null || value === undefined
      ? ""
      : String(value);

  decorateCell(td, row, prop);
}

function dateRenderer(
  instance,
  td,
  row,
  col,
  prop,
  value,
  cellProperties
) {
  Handsontable.renderers.TextRenderer.apply(
    this,
    arguments
  );

  if (!value) {
    td.textContent = "";
  } else {
    const date = new Date(value);

    td.textContent = Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("vi-VN");
  }

  decorateCell(td, row, prop);
}

function moneyRenderer(
  instance,
  td,
  row,
  col,
  prop,
  value,
  cellProperties
) {
  Handsontable.renderers.TextRenderer.apply(
    this,
    arguments
  );

  td.textContent = money(value);
  td.classList.add("htRight");

  decorateCell(td, row, prop);
}

function integerRenderer(
  instance,
  td,
  row,
  col,
  prop,
  value,
  cellProperties
) {
  Handsontable.renderers.TextRenderer.apply(
    this,
    arguments
  );

  td.textContent =
    Number(value || 0).toLocaleString("vi-VN");

  td.classList.add("htRight");

  decorateCell(td, row, prop);
}

function refreshAfterTableChange() {
  rebuildInvoiceBands();

  updateSummary(
    getVisibleRows()
  );

  hot?.render();
}

function createOrUpdateTable(rows) {
  const normalizedRows = normalizeRows(rows);

  if (!window.Handsontable) {
    alert(
      "Không tải được thư viện Handsontable."
    );
    return;
  }

  if (hot) {
    hot.loadData(normalizedRows);
    refreshAfterTableChange();
    return;
  }

  const container = $("auditHot");

  hot = new Handsontable(container, {
    data: normalizedRows,

    columns: [
      {
        data: "bat_dau_at",
        title: "Thời gian",
        renderer: dateRenderer
      },
      {
        data: "diadiem",
        title: "Cơ sở",
        renderer: textRenderer
      },
      {
        data: "nhanvien",
        title: "Nhân viên",
        renderer: textRenderer
      },
      {
        data: "trangthai",
        title: "Trạng thái",
        renderer: textRenderer
      },
      {
        data: "sohd",
        title: "Số HĐ",
        renderer: textRenderer
      },
      {
        data: "tong_tien_cao_nhat",
        title: "Đỉnh phiên",
        type: "numeric",
        renderer: moneyRenderer
      },
      {
        data: "tong_tien_da_luu",
        title: "Đã lưu",
        type: "numeric",
        renderer: moneyRenderer
      },
      {
        data: "gia_tri_da_loai",
        title: "Giá trị loại",
        type: "numeric",
        renderer: moneyRenderer
      },
      {
        data: "so_lan_xoa",
        title: "Số lần xóa",
        type: "numeric",
        renderer: integerRenderer
      },
      {
        data: "diem_rui_ro",
        title: "Điểm",
        type: "numeric",
        renderer: integerRenderer
      },
      {
        data: "muc_rui_ro",
        title: "Mức",
        renderer: textRenderer
      },
      {
        data: "lydo_ket_thuc",
        title: "Lý do",
        renderer: textRenderer
      }
    ],

    colWidths: [
      155, 75, 115, 100,
      145, 105, 105, 110,
      95, 75, 105, 180
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
    manualRowResize: false,

    autoWrapRow: false,
    autoWrapCol: false,

    fixedColumnsStart: 0,

    /*
     * Chỉ dùng khóa này trên nhánh DEV để thử nghiệm.
     * Khi đưa lên production thương mại, cần thay bằng
     * license Handsontable hợp lệ của doanh nghiệp.
     */
    licenseKey:
      window.HANDSONTABLE_LICENSE_KEY ||
      "non-commercial-and-evaluation",

    afterInit() {
      refreshAfterTableChange();
    },

    afterLoadData() {
      setTimeout(
        refreshAfterTableChange,
        0
      );
    },

    afterColumnSort() {
      setTimeout(
        refreshAfterTableChange,
        0
      );
    },

    afterFilter() {
      setTimeout(
        refreshAfterTableChange,
        0
      );
    },

    afterOnCellMouseOver(event, coords) {
      if (
        coords.row < 0 ||
        coords.row === hoveredRow
      ) {
        return;
      }

      hoveredRow = coords.row;
      hot.render();
    }
  });

  container.addEventListener(
    "mouseleave",
    () => {
      if (hoveredRow === -1) return;

      hoveredRow = -1;
      hot.render();
    }
  );
}

async function loadData() {
  const from =
    $("tuNgay").value + "T00:00:00";

  const toDate = new Date(
    $("denNgay").value + "T00:00:00"
  );

  toDate.setDate(
    toDate.getDate() + 1
  );

  $("btnTai").disabled = true;
  $("btnTai").textContent = "Đang tải...";

  try {
    let query = supabase
      .from("v_banle_audit_tonghop")
      .select("*")
      .gte("bat_dau_at", from)
      .lt(
        "bat_dau_at",
        toDate.toISOString()
      )
      .order(
        "bat_dau_at",
        { ascending: false }
      )
      .limit(2000);

    if ($("diadiem").value) {
      query = query.eq(
        "diadiem",
        $("diadiem").value
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    createOrUpdateTable(
      data || []
    );
  } catch (error) {
    console.error(
      "[AUDIT REPORT] Không tải được dữ liệu:",
      error
    );

    alert(
      "Không tải được dữ liệu: " +
      (error?.message || error)
    );
  } finally {
    $("btnTai").disabled = false;
    $("btnTai").textContent = "Tải dữ liệu";
  }
}

$("btnTai").addEventListener(
  "click",
  loadData
);

setDefaultDates();
loadData();
