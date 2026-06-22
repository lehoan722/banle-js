(function () {
  "use strict";

  let rows = [];

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
      const disabled = !r.ct_id || r.trangthai !== "cho_xu_ly" ? "disabled" : "";
      const cls = r.trangthai === "cho_xu_ly" ? "ok" : "bad";

      return `
        <tr data-index="${i}">
          <td><input type="checkbox" class="chkRow" ${disabled}></td>
          <td>${i + 1}</td>
          <td><b>${esc(r.masp)}</b></td>
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
  }

  async function taiDanhSach() {
    if (!window.supabase) {
      alert("Không tìm thấy window.supabase.");
      return;
    }

    const btn = byId("btnTai");
    const diadiem = getDiadiem();

    try {
      if (btn) btn.disabled = true;
      setStatus("Đang tải danh sách...");

      const { data, error } = await window.supabase.rpc("rpc_tim_ban_nham_size", {
        p_diadiem: diadiem
      });

      if (error) {
        console.error(error);
        alert("Lỗi tải danh sách: " + (error.message || error));
        return;
      }

      rows = Array.isArray(data?.rows) ? data.rows : [];
      render();

      const coTheXuLy = rows.filter(r => r.ct_id && r.trangthai === "cho_xu_ly").length;
      setStatus(`Tìm thấy ${rows.length} mã, có thể xử lý ${coTheXuLy} mã.`);
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

  function chonHet() {
    document.querySelectorAll(".chkRow:not(:disabled)").forEach(chk => chk.checked = true);
  }

  function boChon() {
    document.querySelectorAll(".chkRow").forEach(chk => chk.checked = false);
  }

  document.addEventListener("DOMContentLoaded", () => {
    byId("btnTai")?.addEventListener("click", taiDanhSach);
    byId("btnCanDoi")?.addEventListener("click", canDoiDaChon);
    byId("btnChonHet")?.addEventListener("click", chonHet);
    byId("btnBoChon")?.addEventListener("click", boChon);
  });
})();