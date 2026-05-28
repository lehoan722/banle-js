// stockQuickVitri.js
// Lưu nhanh vị trí kho, bày mẫu, nhóm hàng.

(function () {
  "use strict";

  async function saveVitriNhanh(maspRaw, cosoRaw, vitriRaw, loaiRaw = "kho") {
    const U = window.StockQuickUtils;
    const masp = String(maspRaw || "").trim().toUpperCase();
    const coso = String(cosoRaw || "").trim().toLowerCase();
    const vitri = String(vitriRaw || "").trim();
    const loai = String(loaiRaw || "kho").trim().toLowerCase();

    if (!masp) return { ok: false, message: "Mã sản phẩm trống" };
    if (!["cs1", "cs2"].includes(coso)) return { ok: false, message: "Cơ sở không hợp lệ" };
    if (!["kho", "baymau", "nhomhang"].includes(loai)) return { ok: false, message: "Loại dữ liệu không hợp lệ" };

    const isAdminNow = U.getIsAdminLocal();

    if (!vitri && !isAdminNow) {
      return {
        ok: false,
        message:
          loai === "baymau"
            ? "Vị trí bày mẫu trống"
            : loai === "nhomhang"
              ? "Nhóm hàng trống"
              : "Vị trí kho trống"
      };
    }

    const client = U.getSupabaseClient();
    if (!client) return { ok: false, message: "Supabase chưa sẵn sàng" };

    try {
      const { data, error } = await client.rpc("rpc_save_vitrikho_nhanh", {
        p_masp: masp,
        p_coso: coso,
        p_vitri: vitri,
        p_loai: loai,
      });

      if (error) {
        console.warn("[StockQuickPopup] rpc_save_vitrikho_nhanh error:", error);
        return { ok: false, message: error.message || "Lỗi gọi RPC" };
      }

      return data || { ok: false, message: "Không nhận được phản hồi từ RPC" };
    } catch (e) {
      console.warn("[StockQuickPopup] saveVitriNhanh exception:", e);
      return { ok: false, message: e.message || "Có lỗi xảy ra khi lưu dữ liệu" };
    }
  }

  function bindVitriActions(popup) {
    if (!popup) return;

    const actionRows = popup.querySelectorAll(".sq-vitri-action-row");

    actionRows.forEach((row) => {
      const btn = row.querySelector(".sq-vitri-save-btn[data-coso]");
      const input = row.querySelector(".sq-vitri-input[data-coso]");
      const msgEl = row.querySelector(".sq-vitri-msg");
      const coso = row.dataset.coso || (btn ? btn.dataset.coso : "");
      const loai = row.dataset.loai || (btn ? btn.dataset.loai : "kho") || "kho";

      if (!btn || !input || !coso) return;

      const runSave = async () => {
        const masp = String(popup.dataset.masp || "").trim().toUpperCase();
        const vitri = String(input.value || "").trim();
        const nhan =
          loai === "baymau"
            ? "vị trí bày mẫu"
            : loai === "nhomhang"
              ? "nhóm hàng"
              : "vị trí";

        const isAdminNow = window.StockQuickUtils.getIsAdminLocal();

        if (!vitri && !isAdminNow) {
          if (msgEl) {
            msgEl.textContent = `Chưa nhập ${nhan}`;
            msgEl.className = "sq-vitri-msg err";
          }
          input.focus();
          input.select();
          return;
        }

        btn.disabled = true;
        const oldBtnText = btn.textContent;
        btn.textContent = "Đang lưu...";

        if (msgEl) {
          msgEl.textContent = "";
          msgEl.className = "sq-vitri-msg";
        }

        const rs = await saveVitriNhanh(masp, coso, vitri, loai);

        if (rs && rs.ok) {
          const vitriMoi = String(
            Object.prototype.hasOwnProperty.call(rs, "vitri_moi") ? rs.vitri_moi : vitri
          ).trim();

          const isAdminNow = window.StockQuickUtils.getIsAdminLocal();
          const btnLabel =
            loai === "baymau"
              ? "Lưu bày mẫu"
              : loai === "nhomhang"
                ? "Lưu nhóm hàng"
                : "Lưu vị trí";

          if (isAdminNow) {
            row.innerHTML = `
      <button type="button" class="sq-vitri-save-btn" data-coso="${coso}" data-loai="${loai}">${btnLabel}</button>
      <span class="sq-vitri-coso">${coso.toUpperCase()}:</span>
      <input type="text" class="sq-vitri-input" data-coso="${coso}" data-loai="${loai}" value="${vitriMoi}" autocomplete="off" />
      <span class="sq-vitri-msg ok">${rs.message || "Đã lưu"}</span>
    `;
            bindVitriActions(popup);
            if (window.StockQuick && typeof window.StockQuick.bindColorLinks === "function") {
              window.StockQuick.bindColorLinks(popup);
            }
            return;
          }

          row.innerHTML = `
    <button type="button" class="sq-vitri-save-btn" disabled>${btnLabel}</button>
    <span class="sq-vitri-coso">${coso.toUpperCase()}:</span>
    <span class="sq-vitri-value-readonly">${vitriMoi || ""}</span>
    <span class="sq-vitri-msg ok">${rs.message || "Đã lưu"}</span>
  `;
          return;
        }

        btn.disabled = false;
        btn.textContent = oldBtnText;

        if (msgEl) {
          msgEl.textContent =
            (rs && rs.message)
              ? rs.message
              : (loai === "baymau"
                ? "Lưu vị trí bày mẫu thất bại"
                : loai === "nhomhang"
                  ? "Lưu nhóm hàng thất bại"
                  : "Lưu vị trí thất bại");
          msgEl.className = "sq-vitri-msg err";
        }

        input.focus();
        input.select();
      };

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        runSave();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          runSave();
        }
      });
    });
  }

  window.StockQuickVitri = {
    saveVitriNhanh,
    bindVitriActions,
  };
})();
