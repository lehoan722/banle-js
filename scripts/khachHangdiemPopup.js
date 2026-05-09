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

  function fmtDate(v) {
    if (!v) return "";
    return new Date(v).toLocaleString("vi-VN");
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

      <div style="font-weight:bold;margin:8px 0;">Lịch sử điểm gần nhất</div>

      <div style="max-height:360px;overflow:auto;border:1px solid #ddd;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f1f1f1;">
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Ngày</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:left;">Số HĐ</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm trước</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm sau</th>
              <th style="border:1px solid #ddd;padding:6px;text-align:right;">Điểm còn lại</th>
            </tr>
          </thead>
          <tbody>
            ${
              logs.length
                ? logs.map(r => `
                  <tr>
                    <td style="border:1px solid #ddd;padding:6px;">${fmtDate(r.ngay)}</td>
                    <td style="border:1px solid #ddd;padding:6px;">${r.sohd || ""}</td>
                    <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(r.diem_truoc)}</td>
                    <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(r.diem_sau)}</td>
                    <td style="border:1px solid #ddd;padding:6px;text-align:right;">${fmtMoney(r.diem_con_lai)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="5" style="padding:12px;text-align:center;color:#777;">Chưa có lịch sử điểm</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
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

    const { data: logs, error: logErr } = await window.supabase
      .from("kh_lichsu_diem")
      .select("ngay, sohd, diem_truoc, diem_sau, diem_con_lai")
      .eq("makh", khach.makh)
      .order("ngay", { ascending: false })
      .limit(limit);

    if (logErr) {
      console.error("❌ Lỗi đọc lịch sử điểm:", logErr);
      renderError(popup, "Không đọc được lịch sử điểm khách hàng.");
      return;
    }

    renderData(popup, khach, logs || []);
  }

  window.moPopupThongTinKhachHangNhanh = openQuickInfo;
}