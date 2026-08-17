(function () {
  "use strict";

  let rows = [];
  let currentMode = "danhsach"; // danhsach | lichsu

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDiadiem() {
    return String(byId("diadiem")?.value || localStorage.getItem("diadiem") || "cs1")
      .trim()
      .toLowerCase();
  }

  function getMaUuTien() {
    const raw = String(byId("maUuTien")?.value || "");

    const out = [];
    const seen = new Set();

    raw.split(/\r?\n/).forEach(line => {
      const masp = String(line || "").trim().toUpperCase();
      if (!masp || seen.has(masp)) return;
      seen.add(masp);
      out.push(masp);
    });

    return out;
  }

  function locVaSapXepTheoMaUuTien(list) {
    const maUuTien = getMaUuTien();

    // Nếu ô mã ưu tiên trống: giữ nguyên hoạt động cũ.
    if (!maUuTien.length) return list;

    const thuTu = new Map(maUuTien.map((masp, index) => [masp, index]));

    // Nếu có nhập mã: chỉ giữ những dòng có mã nằm trong textarea,
    // đồng thời sắp xếp theo đúng thứ tự mã người dùng nhập.
    return list
      .map((row, originalIndex) => ({
        row,
        originalIndex,
        maspChuan: String(row?.masp || "").trim().toUpperCase()
      }))
      .filter(item => thuTu.has(item.maspChuan))
      .sort((a, b) => {
        const pa = thuTu.get(a.maspChuan);
        const pb = thuTu.get(b.maspChuan);
        if (pa !== pb) return pa - pb;
        return a.originalIndex - b.originalIndex;
      })
      .map(item => item.row);
  }

  function setStatus(text) {
    const el = byId("status");
    if (el) el.textContent = text;
  }

  function formatDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("vi-VN");
  }

  function render() {
    const tbody = byId("tbodyKetQua");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10">Không có dữ liệu</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, i) => {
      let disabled = "";

      if (currentMode === "danhsach") {
        disabled = !r.ct_id || r.trangthai !== "cho_xu_ly" ? "disabled" : "";
      } else {
        disabled = !r.log_id || r.trangthai === "da_khoi_phuc" ? "disabled" : "";
      }

      const cls =
        r.trangthai === "cho_xu_ly" || r.trangthai === "da_xu_ly"
          ? "ok"
          : "bad";

      return `
        <tr data-index="${i}">
          <td><input type="checkbox" class="chkRow" ${disabled}></td>
          <td>${i + 1}</td>
          <td>
  <b class="cell-masp-click"
     data-masp="${esc(r.masp)}"
     style="cursor:pointer; color:#0b57d0; text-decoration:underline;">
    ${esc(r.masp)}
  </b>
</td>
          <td class="bad">${esc(r.size_from)}</td>
          <td class="ok">${esc(r.size_to)}</td>
          <td>${esc(r.size_from)} → ${esc(r.size_to)}</td>
          <td>${esc(r.sohd || "")}</td>
          <td>${esc(formatDate(r.ngay))}</td>
          <td>${esc(r.tennv || "")}</td>
          <td class="${cls}">${esc(r.trangthai || "")}</td>
        </tr>
      `;
    }).join("");

    bindStockQuickForMaspCells();
  }

  function bindStockQuickForMaspCells() {
    document.querySelectorAll(".cell-masp-click[data-masp]").forEach((el) => {
      if (el.dataset.stockQuickBound === "1") return;

      const masp = String(el.dataset.masp || "").trim().toUpperCase();
      if (!masp) return;

      el.dataset.stockQuickBound = "1";

      if (window.StockQuick && typeof window.StockQuick.attach === "function") {
        window.StockQuick.attach(el, masp);
      } else if (typeof window.stockQuickPopup === "function") {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.stockQuickPopup(masp);
        });
      }
    });
  }

  function toDateValue(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getDefaultTuNgay() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    d.setDate(1);
    return toDateValue(d);
  }

  function getDefaultDenNgay() {
    return toDateValue(new Date());
  }

  function setDefaultDateInputs() {
    const tu = byId("tuNgay");
    const den = byId("denNgay");

    if (tu && !tu.value) tu.value = getDefaultTuNgay();
    if (den && !den.value) den.value = getDefaultDenNgay();
  }

  function getDateRange() {
    const tuNgay = String(byId("tuNgay")?.value || "").trim();
    const denNgay = String(byId("denNgay")?.value || "").trim();

    if (!tuNgay || !denNgay) {
      alert("Bạn cần nhập Từ ngày và Đến ngày.");
      return null;
    }

    if (tuNgay > denNgay) {
      alert("Từ ngày không được lớn hơn Đến ngày.");
      return null;
    }

    return { tuNgay, denNgay };
  }

  async function taiDanhSach() {
    if (!window.supabase) {
      alert("Không tìm thấy window.supabase.");
      return;
    }

    const btn = byId("btnTai");
    const diadiem = getDiadiem();
    const range = getDateRange();
    if (!range) return;
    currentMode = "danhsach";

    try {
      if (btn) btn.disabled = true;
      setStatus("Đang tải danh sách...");

      const { data, error } = await window.supabase.rpc("rpc_tim_ban_nham_size", {
        p_diadiem: diadiem,
        p_tu_ngay: range.tuNgay,
        p_den_ngay: range.denNgay
      });

      if (error) {
        console.error(error);
        alert("Lỗi tải danh sách: " + (error.message || error));
        return;
      }

      const allRows = Array.isArray(data?.rows) ? data.rows : [];
      const maUuTien = getMaUuTien();

      rows = locVaSapXepTheoMaUuTien(allRows);
      render();

      const coTheXuLy = rows.filter(r => r.ct_id && r.trangthai === "cho_xu_ly").length;

      if (maUuTien.length) {
        const maTimThay = new Set(
          rows.map(r => String(r?.masp || "").trim().toUpperCase())
        );
        const maKhongTimThay = maUuTien.filter(masp => !maTimThay.has(masp));

        setStatus(
          maKhongTimThay.length
            ? `Theo mã nhập: tìm thấy ${rows.length} dòng, có thể xử lý ${coTheXuLy} dòng. Không tìm thấy: ${maKhongTimThay.join(", ")}`
            : `Theo mã nhập: tìm thấy ${rows.length} dòng, có thể xử lý ${coTheXuLy} dòng.`
        );
      } else {
        setStatus(`Tìm thấy ${rows.length} mã, có thể xử lý ${coTheXuLy} mã.`);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi hệ thống khi tải danh sách.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function layDongDaChon() {
    const out = [];
    document.querySelectorAll("#tbodyKetQua tr").forEach(tr => {
      const idx = Number(tr.getAttribute("data-index"));
      const chk = tr.querySelector(".chkRow");
      if (!chk || !chk.checked) return;
      const r = rows[idx];
      if (r && r.ct_id && r.trangthai === "cho_xu_ly") out.push({ index: idx, row: r });
    });
    return out;
  }

  async function canDoiDaChon() {
    if (!window.supabase) {
      alert("Không tìm thấy window.supabase.");
      return;
    }

    const selected = layDongDaChon();
    if (!selected.length) {
      alert("Bạn chưa chọn dòng nào để cân đối.");
      return;
    }

    const ok = confirm(
      `Bạn có chắc muốn cân đối ${selected.length} dòng đã chọn?\n\n` +
      `Hệ thống sẽ sửa size trong hóa đơn bán cũ và ghi chú vào hóa đơn.`
    );
    if (!ok) return;

    const btn = byId("btnCanDoi");
    const diadiem = getDiadiem();
    const manv = String(localStorage.getItem("manv") || byId("manv")?.value || "").trim();

    let done = 0;
    let fail = 0;

    try {
      if (btn) btn.disabled = true;

      for (const item of selected) {
        const r = item.row;
        setStatus(`Đang xử lý ${done + fail + 1}/${selected.length}: ${r.masp}`);

        const { data, error } = await window.supabase.rpc("rpc_can_doi_ban_nham_size", {
          p_ct_id: Number(r.ct_id),
          p_masp: r.masp,
          p_size_from: String(r.size_from),
          p_size_to: String(r.size_to),
          p_diadiem: diadiem,
          p_nguoi_thuc_hien: manv || null
        });

        if (error) {
          console.error("Lỗi dòng:", r, error);
          r.trangthai = "loi: " + (error.message || "không rõ");
          fail++;
        } else {
          r.trangthai = "da_xu_ly";
          r.note = data?.note || "";
          done++;
        }

        render();
      }

      alert(`Hoàn tất.\nĐã xử lý: ${done}\nLỗi/bỏ qua: ${fail}`);
      setStatus(`Hoàn tất: xử lý ${done}, lỗi ${fail}.`);

      await taiDanhSach();
    } catch (err) {
      console.error(err);
      alert("Lỗi hệ thống khi cân đối.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function taiLichSu() {
    if (!window.supabase) {
      alert("Không tìm thấy window.supabase.");
      return;
    }

    const btn = byId("btnTaiLichSu");
    const diadiem = getDiadiem();
    const range = getDateRange();
    if (!range) return;

    try {
      if (btn) btn.disabled = true;

      currentMode = "lichsu";
      setStatus("Đang tải lịch sử...");

      const { data, error } = await window.supabase.rpc("rpc_tai_log_can_doi_ban_nham_size", {
        p_diadiem: diadiem,
        p_tu_ngay: range.tuNgay,
        p_den_ngay: range.denNgay
      });

      if (error) {
        console.error(error);
        alert("Lỗi tải lịch sử: " + (error.message || error));
        return;
      }

      rows = Array.isArray(data?.rows) ? data.rows : [];
      render();

      const coTheKhoiPhuc = rows.filter(r => r.log_id && r.trangthai !== "da_khoi_phuc").length;
      setStatus(`Lịch sử: ${rows.length} dòng, có thể khôi phục ${coTheKhoiPhuc} dòng.`);
    } catch (err) {
      console.error(err);
      alert("Lỗi hệ thống khi tải lịch sử.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function khoiPhucDaChon() {
    if (currentMode !== "lichsu") {
      alert("Bạn cần bấm Tải lịch sử trước, sau đó mới chọn dòng để khôi phục.");
      return;
    }

    const selected = [];

    document.querySelectorAll("#tbodyKetQua tr").forEach(tr => {
      const idx = Number(tr.getAttribute("data-index"));
      const chk = tr.querySelector(".chkRow");
      if (!chk || !chk.checked) return;

      const r = rows[idx];
      if (r && r.log_id && r.trangthai !== "da_khoi_phuc") {
        selected.push({ index: idx, row: r });
      }
    });

    if (!selected.length) {
      alert("Bạn chưa chọn dòng lịch sử nào để khôi phục.");
      return;
    }

    const ok = confirm(
      `Bạn có chắc muốn KHÔI PHỤC ${selected.length} dòng đã chọn?\n\n` +
      `Hệ thống sẽ đổi size ngược lại theo log.`
    );
    if (!ok) return;

    const btn = byId("btnKhoiPhuc");
    const manv = String(localStorage.getItem("manv") || byId("manv")?.value || "").trim();

    let done = 0;
    let fail = 0;

    try {
      if (btn) btn.disabled = true;

      for (const item of selected) {
        const r = item.row;
        setStatus(`Đang khôi phục ${done + fail + 1}/${selected.length}: ${r.masp}`);

        const { error } = await window.supabase.rpc("rpc_khoi_phuc_can_doi_ban_nham_size", {
          p_log_id: Number(r.log_id),
          p_nguoi_thuc_hien: manv || null
        });

        if (error) {
          console.error("Lỗi khôi phục:", r, error);
          r.trangthai = "loi: " + (error.message || "không rõ");
          fail++;
        } else {
          r.trangthai = "da_khoi_phuc";
          done++;
        }

        render();
      }

      alert(`Hoàn tất khôi phục.\nĐã khôi phục: ${done}\nLỗi: ${fail}`);
      setStatus(`Hoàn tất khôi phục: ${done}, lỗi ${fail}.`);

      await taiLichSu();
    } catch (err) {
      console.error(err);
      alert("Lỗi hệ thống khi khôi phục.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function chonHet() {
    document.querySelectorAll(".chkRow:not(:disabled)").forEach(chk => chk.checked = true);
  }

  function boChon() {
    document.querySelectorAll(".chkRow").forEach(chk => chk.checked = false);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setDefaultDateInputs();

    byId("btnTai")?.addEventListener("click", taiDanhSach);
    byId("btnCanDoi")?.addEventListener("click", canDoiDaChon);
    byId("btnTaiLichSu")?.addEventListener("click", taiLichSu);
    byId("btnKhoiPhuc")?.addEventListener("click", khoiPhucDaChon);
    byId("btnChonHet")?.addEventListener("click", chonHet);
    byId("btnBoChon")?.addEventListener("click", boChon);
  });
})();
