// public/scripts/khachHangdiemPopup.js

export function mountKhachHangQuickInfoPopup(options = {}) {
  const {
    inputId = "makh",
    buttonId = "btnPopupKH",
    popupId = "popupThongTinKhachHangNhanh",
    limit = 10
  } = options;

  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);

  if (!input || !button) {
    console.warn("⚠️ Không tìm thấy ô mã khách hoặc nút kính lúp.");
    return;
  }

  function fmtMoney(v) {
    return Number(v || 0).toLocaleString("vi-VN");
  }

  // UI chỉ hiện nút điều chỉnh cho ADMIN hoặc người có quyền sửa hóa đơn.
  // Lưu ý: đây là lớp giao diện; RPC vẫn yêu cầu phiên Supabase authenticated và ghi audit.
  function coQuyenDieuChinhDiem() {
    return (
      localStorage.getItem("is_admin") === "true" ||
      localStorage.getItem("sua_hoadon") === "true" ||
      localStorage.getItem("quyen_sua_hoadon") === "true"
    );
  }

  function parseNgayVN(v) {
    if (!v) return null;

    const s = String(v);

    // Nếu Supabase trả về dạng không có Z, coi nó là giờ UTC rồi cộng sang VN
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
      return new Date(s + "Z");
    }

    return new Date(s);
  }

  function fmtDate(v) {
    const d = parseNgayVN(v);
    if (!d || isNaN(d.getTime())) return "";

    return d.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false
    });
  }

  function ensurePopup() {
    let popup = document.getElementById(popupId);
    if (popup) return popup;

    popup = document.createElement("div");
    popup.id = popupId;
    popup.style.cssText = `
      display:none;
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.35);
      z-index:999999;
      align-items:center;
      justify-content:center;
    `;

    popup.innerHTML = `
      <div style="
        width:760px;
        max-width:96vw;
        max-height:86vh;
        background:white;
        border-radius:12px;
        box-shadow:0 8px 30px #0006;
        overflow:hidden;
        font-family:Arial,sans-serif;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:10px 14px;
          background:#0078d7;
          color:white;
          font-weight:bold;
          font-size:18px;
        ">
          <div>Thông tin mua hàng & tích điểm khách hàng</div>
          <button id="btnCloseQuickKH" type="button" style="
            border:none;
            background:white;
            color:#0078d7;
            font-weight:bold;
            border-radius:6px;
            padding:5px 10px;
            cursor:pointer;
          ">Đóng</button>
        </div>

        <div id="quickKHBody" style="padding:12px;"></div>
      </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector("#btnCloseQuickKH").onclick = () => {
      popup.style.display = "none";
    };

    popup.addEventListener("mousedown", (e) => {
      if (e.target === popup) popup.style.display = "none";
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popup.style.display !== "none") {
        popup.style.display = "none";
      }
    });

    return popup;
  }

  function renderLoading(popup) {
    popup.querySelector("#quickKHBody").innerHTML = `
      <div style="padding:20px;text-align:center;color:#666;">
        Đang tải thông tin khách hàng...
      </div>
    `;
  }

  function renderError(popup, msg) {
    popup.querySelector("#quickKHBody").innerHTML = `
      <div style="padding:20px;color:red;font-weight:bold;">
        ${msg}
      </div>
    `;
  }

  function renderData(popup, khach, logs) {
    const body = popup.querySelector("#quickKHBody");
    const canAdjust = coQuyenDieuChinhDiem();

    body.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:8px;
        margin-bottom:12px;
      ">
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Mã KH / SĐT</div>
          <b>${khach.makh || ""}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Tên khách</div>
          <b>${khach.tenkh || ""}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Điểm hiện tại</div>
          <b style="color:#0a7a2f;">${fmtMoney(khach.diem_hientai)}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Hạng khách</div>
          <b>${khach.hang_khach || "THUONG"}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Tổng chi tiêu</div>
          <b>${fmtMoney(khach.tong_chi_tieu)}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Số lần mua</div>
          <b>${fmtMoney(khach.so_lan_mua)}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Điện thoại</div>
          <b>${khach.dienthoai || khach.makh || ""}</b>
        </div>
        <div style="border:1px solid #ddd;padding:8px;border-radius:6px;">
          <div style="color:#777;">Dòng gần nhất</div>
          <b>${logs.length}</b>
        </div>
      </div>

      ${canAdjust ? `
        <div style="
          margin:0 0 10px 0;
          padding:8px 10px;
          background:#fff8e1;
          border:1px solid #f0c36d;
          border-radius:6px;
          font-size:13px;
        ">
          <b>Điều chỉnh điểm hóa đơn:</b>
          nhập số điểm mới tại cột <b>Điểm dùng</b> rồi bấm <b>Lưu điểm</b>.
          Chức năng này sẽ tự tính lại tiền giảm, thanh toán, điểm tích và số dư điểm.
        </div>
      ` : ""}

      <div style="font-weight:bold;margin:8px 0;">Lịch sử điểm gần nhất</div>

      <div style="max-height:360px;overflow:auto;border:1px solid #ddd;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f1f1f1;">
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Ngày</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Số HĐ</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm trước</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm dùng</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm tích</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm còn lại</th>
              ${canAdjust ? `<th style="border:1px solid #ddd;padding:6px;text-align:center;">Điều chỉnh</th>` : ""}
            </tr>
          </thead>
          <tbody>
            ${logs.length
              ? logs.map(r => `
                <tr>
                  <td style="border:1px solid #ddd;padding:6px;">${fmtDate(r.ngay)}</td>
                  <td
                    class="quick-kh-sohd"
                    data-sohd="${r.sohd || ""}"
                    title="Kích đúp để xem chi tiết hóa đơn"
                    style="
                      border:1px solid #ddd;
                      padding:6px;
                      color:#0066cc;
                      font-weight:bold;
                      text-decoration:underline;
                      cursor:pointer;
                      user-select:text;
                    "
                  >${r.sohd || ""}</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(r.diem_truoc)}</td>
                  <td style="border:1px solid #ddd;padding:4px;text-align:right;color:#b91c1c;">
                    ${canAdjust
                      ? `<input
                          class="quick-kh-diem-adjust"
                          data-sohd="${r.sohd || ""}"
                          data-old="${Number(r.diem_dung || 0)}"
                          type="number"
                          min="0"
                          step="1"
                          value="${Number(r.diem_dung || 0)}"
                          style="width:64px;text-align:right;padding:4px;border:1px solid #bbb;border-radius:4px;"
                        />`
                      : fmtMoney(r.diem_dung)
                    }
                  </td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:right;color:#15803d;">${fmtMoney(r.diem_tich)}</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:right;font-weight:bold;">${fmtMoney(r.diem_con_lai)}</td>
                  ${canAdjust ? `
                    <td style="border:1px solid #ddd;padding:4px;text-align:center;">
                      <button
                        type="button"
                        class="quick-kh-save-points"
                        data-sohd="${r.sohd || ""}"
                        style="
                          border:1px solid #b7791f;
                          background:#fff3cd;
                          color:#7a4b00;
                          font-weight:bold;
                          border-radius:5px;
                          padding:4px 7px;
                          cursor:pointer;
                          white-space:nowrap;
                        "
                      >Lưu điểm</button>
                    </td>
                  ` : ""}
                </tr>
              `).join("")
              : `<tr><td colspan="${canAdjust ? 7 : 6}" style="padding:12px;text-align:center;color:#777;">Chưa có lịch sử điểm</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    // ===== ĐIỀU CHỈNH ĐIỂM TRỰC TIẾP TRÊN HÓA ĐƠN =====
    if (canAdjust) {
      body.querySelectorAll(".quick-kh-save-points").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const sohd = String(btn.dataset.sohd || "").trim();
          const inputDiem = body.querySelector(`.quick-kh-diem-adjust[data-sohd="${CSS.escape(sohd)}"]`);
          const diemMoi = Number(inputDiem?.value || 0);
          const diemCu = Number(inputDiem?.dataset.old || 0);

          if (!sohd) {
            alert("❌ Không xác định được số hóa đơn.");
            return;
          }

          if (!Number.isInteger(diemMoi) || diemMoi < 0) {
            alert("❌ Điểm dùng mới phải là số nguyên từ 0 trở lên.");
            inputDiem?.focus();
            return;
          }

          if (diemMoi === diemCu) {
            alert("ℹ️ Điểm dùng không thay đổi.");
            return;
          }

          const lydo = prompt(
            `Lý do điều chỉnh điểm cho hóa đơn ${sohd}:\n` +
            `(Điểm dùng: ${diemCu} → ${diemMoi})`
          );

          if (lydo === null) return;
          if (!String(lydo).trim()) {
            alert("❌ Bắt buộc nhập lý do điều chỉnh.");
            return;
          }

          const ok = confirm(
            `XÁC NHẬN ĐIỀU CHỈNH ĐIỂM\n\n` +
            `Hóa đơn: ${sohd}\n` +
            `Khách: ${khach.tenkh || khach.makh}\n` +
            `Điểm dùng: ${diemCu} → ${diemMoi}\n\n` +
            `Hệ thống sẽ tự hoàn tác điểm cũ và tính lại:\n` +
            `- Tiền giảm từ điểm\n` +
            `- Khách thanh toán\n` +
            `- Điểm tích của hóa đơn\n` +
            `- Điểm hiện tại của khách\n\n` +
            `Tiếp tục?`
          );

          if (!ok) return;

          btn.disabled = true;
          const oldText = btn.textContent;
          btn.textContent = "Đang lưu...";

          try {
            const manv = String(document.getElementById("manv")?.value || localStorage.getItem("manv") || "").trim();
            const tennv = String(document.getElementById("tennv")?.value || localStorage.getItem("tennv") || "").trim();
            const diadiem = String(document.getElementById("diadiem")?.value || localStorage.getItem("diadiem") || "").trim();

            const { data, error } = await window.supabase.rpc(
              "rpc_admin_adjust_invoice_points",
              {
                p_sohd: sohd,
                p_diem_tru_moi: diemMoi,
                p_lydo: String(lydo).trim(),
                p_manv: manv || null,
                p_tennv: tennv || null,
                p_diadiem: diadiem || null
              }
            );

            if (error || !data?.ok) {
              console.error("❌ Điều chỉnh điểm hóa đơn thất bại:", { error, data });
              throw new Error(error?.message || data?.message || "Không rõ lỗi");
            }

            // Nếu hóa đơn đang được mở trên màn hình, cập nhật ngay các ô chính.
            const sohdDangMo = String(document.getElementById("sohd")?.value || "").trim();
            if (sohdDangMo === sohd) {
              const setVal = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value ?? "";
              };

              setVal("diem_tru", data.diem_tru_moi ?? diemMoi);
              setVal("tien_doi_diem", fmtMoney(data.tien_doi_diem_moi));
              setVal("km_diem_hienthi", fmtMoney(data.tien_doi_diem_moi));
              setVal("phaithanhtoan", fmtMoney(data.thanhtoan_moi));
              setVal("khachtra", fmtMoney(data.thanhtoan_moi));
              setVal("conlai", "0");
              setVal("diem_hientai", data.diem_sau ?? "");
              if (data.hang_khach) setVal("hang_khach", data.hang_khach);
            }

            alert(
              `✅ Đã điều chỉnh điểm hóa đơn ${sohd}\n\n` +
              `Điểm dùng: ${data.diem_tru_cu ?? diemCu} → ${data.diem_tru_moi ?? diemMoi}\n` +
              `Tiền giảm mới: ${fmtMoney(data.tien_doi_diem_moi)}đ\n` +
              `Thanh toán mới: ${fmtMoney(data.thanhtoan_moi)}đ\n` +
              `Điểm tích mới: ${fmtMoney(data.diem_cong_moi)}\n` +
              `Điểm KH sau điều chỉnh: ${fmtMoney(data.diem_sau)}`
            );

            // Nạp lại popup từ CSDL để tránh hiển thị dữ liệu cũ.
            await openQuickInfo(khach.makh);
          } catch (err) {
            alert("❌ Không điều chỉnh được điểm:\n" + (err?.message || err));
          } finally {
            btn.disabled = false;
            btn.textContent = oldText;
          }
        });
      });
    }

    // ===== DOUBLE CLICK SỐ HÓA ĐƠN => MỞ HÓA ĐƠN CŨ =====
    body.querySelectorAll(".quick-kh-sohd").forEach((cell) => {
      cell.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const sohd = String(cell.dataset.sohd || "").trim();

        if (!sohd) {
          alert("❌ Không xác định được số hóa đơn.");
          return;
        }

        const sohdEl = document.getElementById("sohd");

        if (!sohdEl) {
          alert("❌ Không tìm thấy ô số hóa đơn trên trang bán lẻ.");
          return;
        }

        popup.style.display = "none";
        sohdEl.value = sohd;
        sohdEl.dispatchEvent(new Event("input", { bubbles: true }));
        sohdEl.dispatchEvent(new Event("change", { bubbles: true }));
        sohdEl.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          })
        );
      });
    });
  }

  async function openQuickInfo(makhInputValue = "") {
    const makh = String(makhInputValue || input.value || "").trim();

    if (!makh) {
      alert("Bạn chưa nhập mã khách / số điện thoại.");
      input.focus();
      return;
    }

    if (!window.supabase) {
      alert("Chưa khởi tạo Supabase.");
      return;
    }

    const popup = ensurePopup();
    popup.style.display = "flex";
    renderLoading(popup);

    const { data: khach, error: khErr } = await window.supabase
      .from("dmkhachhang")
      .select("makh, tenkh, dienthoai, diem_hientai, hang_khach, tong_chi_tieu, so_lan_mua")
      .or(`makh.eq.${makh},dienthoai.eq.${makh}`)
      .maybeSingle();

    if (khErr) {
      console.error("❌ Lỗi đọc khách hàng:", khErr);
      renderError(popup, "Không đọc được thông tin khách hàng.");
      return;
    }

    if (!khach) {
      renderError(popup, "Không tìm thấy khách hàng này.");
      return;
    }

    const { count: soLanMuaThucTe, error: countErr } = await window.supabase
      .from("hoadon_banle")
      .select("sohd", { count: "exact", head: true })
      .eq("makh", khach.makh)
      .in("loaihd", ["bancs1", "bancs2"])
      .gt("thanhtoan", 0);

    if (!countErr) {
      khach.so_lan_mua = soLanMuaThucTe || 0;
    }

    const { data: rawLogs, error: logErr } = await window.supabase
      .from("kh_lichsu_diem")
      .select("ngay, sohd, diem_truoc, diem_sau, diem_con_lai")
      .eq("makh", khach.makh)
      .order("ngay", { ascending: false })
      .limit(100);

    if (logErr) {
      console.error("❌ Lỗi đọc lịch sử điểm:", logErr);
      renderError(popup, "Không đọc được lịch sử điểm khách hàng.");
      return;
    }

    const sohdList = [...new Set((rawLogs || []).map(r => r.sohd).filter(Boolean))];

    let hoaDonMap = new Map();

    if (sohdList.length) {
      const { data: hoaDonHopLe, error: hdErr } = await window.supabase
        .from("hoadon_banle")
        .select("sohd, makh, diem_tru, diem_cong, diem_sau_hoa_don, updated_at, created_at")
        .in("sohd", sohdList)
        .eq("makh", khach.makh);

      if (hdErr) {
        console.error("❌ Lỗi kiểm tra hóa đơn hiện tại:", hdErr);
      }

      hoaDonMap = new Map((hoaDonHopLe || []).map(h => [h.sohd, h]));
    }

    const rawLogsHopLe = (rawLogs || []).filter(r => hoaDonMap.has(r.sohd));

    const mapHoaDon = new Map();

    rawLogsHopLe.forEach(r => {
      const sohd = r.sohd || "";
      if (!sohd) return;

      if (!mapHoaDon.has(sohd)) {
        mapHoaDon.set(sohd, []);
      }

      mapHoaDon.get(sohd).push(r);
    });

    const logs = Array.from(mapHoaDon.entries()).map(([sohd, arr]) => {
      arr.sort((a, b) => parseNgayVN(a.ngay) - parseNgayVN(b.ngay));

      const first = arr[0];
      const last = arr[arr.length - 1];

      const diemTruoc = Number(first.diem_truoc || 0);
      const diemConLai = Number(last.diem_sau || last.diem_con_lai || 0);

      const hd = hoaDonMap.get(sohd) || {};

      const diemDung = Number(hd.diem_tru || 0);
      const diemTich = Number(hd.diem_cong || 0);

      return {
        ngay: hd.updated_at || hd.created_at || last.ngay,
        sohd,
        diem_truoc: diemTruoc,
        diem_dung: diemDung,
        diem_tich: diemTich,
        diem_con_lai: Number(hd.diem_sau_hoa_don ?? diemConLai ?? 0)
      };
    })
      .sort((a, b) => parseNgayVN(b.ngay) - parseNgayVN(a.ngay))
      .slice(0, limit);

    renderData(popup, khach, logs);
  }

  window.moPopupThongTinKhachHangNhanh = openQuickInfo;
}
