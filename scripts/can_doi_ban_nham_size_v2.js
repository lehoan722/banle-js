
(function () {
  "use strict";

  let rows = [];

  function byId(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDiadiem() {
    return String(byId("diadiem")?.value || localStorage.getItem("diadiem") || "cs1")
      .trim().toLowerCase();
  }

  function toDateValue(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function setDefaultDateInputs() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    d.setDate(1);
    if (byId("tuNgay") && !byId("tuNgay").value) byId("tuNgay").value = toDateValue(d);
    if (byId("denNgay") && !byId("denNgay").value) byId("denNgay").value = toDateValue(new Date());
  }

  function getRange() {
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

  function setStatus(text) {
    const el = byId("status");
    if (el) el.textContent = text;
  }

  function parseMaspFilter() {
    const raw = String(byId("maUuTien")?.value || "").trim();
    if (!raw) return [];
    return [...new Set(raw.split(/\r?\n/).map(x => x.trim().toUpperCase()).filter(Boolean))];
  }

  function confidenceBadge(c) {
    if (c === "A") return `<span class="badge badge-a">A - Tự động an toàn</span>`;
    if (c === "A_MANUAL") return `<span class="badge badge-a">A* - Đã xác nhận thủ công</span>`;
    if (c === "B") return `<span class="badge badge-b">B - Cần kiểm hàng & chọn đích</span>`;
    return `<span class="badge badge-c">C - Không đủ bằng chứng</span>`;
  }

  function tonText(preview) {
    const list = Array.isArray(preview?.ton_list) ? preview.ton_list : [];
    if (!list.length) return "";
    return list
      .filter(x => Number(x.ton) !== 0)
      .map(x => {
        const n = Number(x.ton);
        const cls = n < 0 ? "neg" : "pos";
        return `<span class="${cls}">${esc(x.size)}:${n > 0 ? "+" : ""}${n}</span>`;
      })
      .join(" &nbsp; ");
  }

  function movesText(r, rowIndex) {
    const moves = Array.isArray(r.moves) ? r.moves : [];
    if (moves.length) {
      return moves.map(m => `
        <div class="move">
          HĐ <b>${esc(m.sohd || "")}</b>:
          <span class="neg">${esc(m.size_from)}</span>
          → <span class="pos">${esc(m.size_to)}</span>
        </div>
      `).join("");
    }

    if (r.confidence === "B") {
      const sources = Array.isArray(r.result_preview?.source_candidates)
        ? r.result_preview.source_candidates : [];
      const targets = Array.isArray(r.result_preview?.target_candidates)
        ? r.result_preview.target_candidates : [];

      if (!sources.length || !targets.length) {
        return `<span class="muted">Thiếu dữ liệu để lập phương án.</span>`;
      }

      const options = targets.map(t =>
        `<option value="${esc(t.size_to)}">${esc(t.size_to)} (đang +${Number(t.capacity)})</option>`
      ).join("");

      return `
        <div class="manual-plan" data-row-index="${rowIndex}">
          ${sources.map((s, j) => `
            <div class="manual-move"
                 data-ct-id="${Number(s.ct_id)}"
                 data-size-from="${esc(s.size_from)}"
                 data-sohd="${esc(s.sohd || "")}">
              HĐ <b>${esc(s.sohd || "")}</b>:
              <span class="neg">${esc(s.size_from)}</span> →
              <select class="targetSelect">
                <option value="">-- chọn size thực tế đã bán --</option>
                ${options}
              </select>
            </div>
          `).join("")}
          <label class="physical-check">
            <input type="checkbox" class="chkPhysical">
            Tôi đã kiểm tra hàng/thực tế và xác nhận các size đích ở trên
          </label>
          <button type="button" class="btnConfirmManual" data-index="${rowIndex}">
            Xác nhận phương án B
          </button>
        </div>
      `;
    }

    return `<span class="muted">Không có kế hoạch tự động.</span>`;
  }
  function render() {
    const tbody = byId("tbodyKetQua");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9">Không có mã nghi bán nhầm trong phạm vi đã chọn.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, i) => {
      const canExecute = !!r.can_execute || r.confidence === "A_MANUAL";
      return `
        <tr data-index="${i}">
          <td>
            <input type="checkbox" class="chkRow"
              ${canExecute ? "" : "disabled"}
              title="${canExecute ? "Plan A có thể thực thi" : "Không cho thực thi tự động"}">
          </td>
          <td>${i + 1}</td>
          <td>
            <b class="cell-masp-click" data-masp="${esc(r.masp)}"
               style="cursor:pointer;color:#0b57d0;text-decoration:underline;">
              ${esc(r.masp)}
            </b>
          </td>
          <td>${tonText(r.result_preview)}</td>
          <td>${confidenceBadge(r.confidence)}</td>
          <td class="reason">${esc(r.ly_do || "")}</td>
          <td>${movesText(r, i)}</td>
          <td>${Number(r.result_preview?.tong_am || 0)}</td>
          <td>
            ${canExecute
              ? `<button class="btnExecOne" data-index="${i}">Cân đối plan này</button>`
              : r.confidence === "B"
                ? `<span class="muted">Xác nhận phương án trước</span>`
                : `<span class="muted">Chỉ xem / kiểm tra</span>`}
          </td>
        </tr>
      `;
    }).join("");

    bindStockQuickForMaspCells();
    document.querySelectorAll(".btnExecOne").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        if (Number.isInteger(idx) && rows[idx]) executePlans([rows[idx]]);
      });
    });
    document.querySelectorAll(".btnConfirmManual").forEach(btn => {
      btn.addEventListener("click", () => confirmManualPlan(Number(btn.dataset.index)));
    });
  }

  function bindStockQuickForMaspCells() {
    document.querySelectorAll(".cell-masp-click[data-masp]").forEach(el => {
      if (el.dataset.stockQuickBound === "1") return;
      const masp = String(el.dataset.masp || "").trim().toUpperCase();
      if (!masp) return;
      el.dataset.stockQuickBound = "1";
      if (window.StockQuick && typeof window.StockQuick.attach === "function") {
        window.StockQuick.attach(el, masp);
      } else if (typeof window.stockQuickPopup === "function") {
        el.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          window.stockQuickPopup(masp);
        });
      }
    });
  }

  async function confirmManualPlan(idx) {
    const r = rows[idx];
    if (!r || r.confidence !== "B") return;

    const wrap = document.querySelector(`.manual-plan[data-row-index="${idx}"]`);
    if (!wrap) return;

    const checked = wrap.querySelector(".chkPhysical")?.checked;
    if (!checked) {
      alert("Bạn phải kiểm tra thực tế và tích xác nhận trước khi lập phương án B.");
      return;
    }

    const moves = [];
    let missing = false;

    wrap.querySelectorAll(".manual-move").forEach(div => {
      const sizeTo = String(div.querySelector(".targetSelect")?.value || "").trim();
      if (!sizeTo) {
        missing = true;
        return;
      }
      moves.push({
        ct_id: Number(div.dataset.ctId),
        sohd: div.dataset.sohd || "",
        size_from: div.dataset.sizeFrom || "",
        size_to: sizeTo,
        qty: 1
      });
    });

    if (missing || !moves.length) {
      alert("Bạn cần chọn size thực tế cho từng dòng hóa đơn nghi sai.");
      return;
    }

    const ok = confirm(
      `Xác nhận phương án thủ công cho ${r.masp}?\n\n` +
      moves.map(m => `HĐ ${m.sohd}: ${m.size_from} → ${m.size_to}`).join("\n") +
      `\n\nServer sẽ mô phỏng lại. Nếu phương án không giảm sai lệch hoặc vượt tồn dương, hệ thống sẽ từ chối.`
    );
    if (!ok) return;

    const manv = String(localStorage.getItem("manv") || byId("manv")?.value || "").trim();
    const { data, error } = await window.supabase.rpc(
      "rpc_xac_nhan_plan_can_doi_ban_nham_size_v2",
      {
        p_plan_id: Number(r.plan_id),
        p_moves: moves,
        p_nguoi_thuc_hien: manv || null
      }
    );

    if (error) {
      alert("Không thể xác nhận phương án:\n" + (error.message || error));
      return;
    }

    r.confidence = "A_MANUAL";
    r.can_execute = true;
    r.moves = moves;
    r.ly_do = (r.ly_do || "") + " Đã xác nhận thủ công và server mô phỏng đạt.";
    render();
    setStatus(`${r.masp}: phương án thủ công đã hợp lệ. Bạn có thể bấm Cân đối plan này.`);
  }

  async function analyzeOne(masp) {
    const range = getRange();
    if (!range) return [];

    const diadiem = getDiadiem();
    const manv = String(localStorage.getItem("manv") || byId("manv")?.value || "").trim();

    const { data, error } = await window.supabase.rpc("rpc_phan_tich_ban_nham_size_v2", {
      p_diadiem: diadiem,
      p_tu_ngay: range.tuNgay,
      p_den_ngay: range.denNgay,
      p_masp: masp || null,
      p_nguoi_thuc_hien: manv || null
    });

    if (error) throw error;
    return Array.isArray(data?.rows) ? data.rows : [];
  }

  async function taiDanhSach() {
    if (!window.supabase) {
      alert("Không tìm thấy window.supabase.");
      return;
    }

    const btn = byId("btnTai");
    const masps = parseMaspFilter();

    try {
      if (btn) btn.disabled = true;
      setStatus("Đang phân tích an toàn V2...");

      if (!masps.length) {
        rows = await analyzeOne(null);
      } else {
        const all = [];
        for (let i = 0; i < masps.length; i++) {
          setStatus(`Đang phân tích ${i + 1}/${masps.length}: ${masps[i]}`);
          const part = await analyzeOne(masps[i]);
          all.push(...part);
        }
        rows = all;
      }

      render();
      const a = rows.filter(r => r.confidence === "A").length;
      const am = rows.filter(r => r.confidence === "A_MANUAL").length;
      const b = rows.filter(r => r.confidence === "B").length;
      const c = rows.filter(r => r.confidence === "C").length;
      setStatus(`V2: ${rows.length} mã nghi sai. A=${a}, A*=${am}, B=${b}, C=${c}. B phải kiểm hàng và xác nhận trước.`);
    } catch (err) {
      console.error(err);
      alert("Lỗi phân tích V2: " + (err?.message || err));
      setStatus("Phân tích thất bại.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function getSelectedExecutableRows() {
    const out = [];
    document.querySelectorAll("#tbodyKetQua tr").forEach(tr => {
      const chk = tr.querySelector(".chkRow");
      if (!chk || !chk.checked || chk.disabled) return;
      const idx = Number(tr.dataset.index);
      const r = rows[idx];
      if (r?.can_execute && (r?.confidence === "A" || r?.confidence === "A_MANUAL")) out.push(r);
    });
    return out;
  }

  async function executePlans(plans) {
    if (!plans?.length) {
      alert("Không có plan mức A nào được chọn.");
      return;
    }

    const msg = plans.map(p =>
      `${p.masp}: ${Array.isArray(p.moves) ? p.moves.length : 0} dòng`
    ).join("\n");

    const ok = confirm(
      `Chỉ các plan mức A mới được thực thi.\n\n${msg}\n\n` +
      `Server sẽ kiểm tra lại tồn kho ngay trước khi sửa. ` +
      `Nếu dữ liệu đã thay đổi, toàn bộ plan đó sẽ bị từ chối.\n\nTiếp tục?`
    );
    if (!ok) return;

    const manv = String(localStorage.getItem("manv") || byId("manv")?.value || "").trim();
    let done = 0, fail = 0;

    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      setStatus(`Đang cân ${i + 1}/${plans.length}: ${p.masp}`);
      const { error } = await window.supabase.rpc("rpc_thuc_hien_can_doi_ban_nham_size_v2", {
        p_plan_id: Number(p.plan_id),
        p_nguoi_thuc_hien: manv || null
      });
      if (error) {
        console.error("Plan lỗi:", p, error);
        fail++;
        alert(`${p.masp}: KHÔNG cân.\n${error.message || error}`);
      } else {
        done++;
      }
    }

    alert(`Hoàn tất V2.\nĐã cân: ${done}\nBị từ chối/lỗi: ${fail}`);
    await taiDanhSach();
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
    byId("btnCanDoi")?.addEventListener("click", () => executePlans(getSelectedExecutableRows()));
    byId("btnChonHet")?.addEventListener("click", chonHet);
    byId("btnBoChon")?.addEventListener("click", boChon);

    // V2 Safe Mode chưa dùng khôi phục V1 trên cùng màn hình.
    // Ẩn hai nút cũ để tránh người dùng nhầm log V1/V2.
    if (byId("btnTaiLichSu")) byId("btnTaiLichSu").style.display = "none";
    if (byId("btnKhoiPhuc")) byId("btnKhoiPhuc").style.display = "none";
  });
})();
