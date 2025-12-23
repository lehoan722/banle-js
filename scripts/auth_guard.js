// auth_guard.js
// Guard nhẹ ở client để chặn truy cập sai trang. Bảo mật thật sự vẫn phải dựa vào RLS/API server.
//
// Cách dùng (đang tương thích main.js của bạn):
//   const ok = await ensureAccess({ supabase, manv });
//   if (!ok) return;

function getFileNameFromPath(pathname) {
  try {
    const p = (pathname || "/").split("?")[0].split("#")[0];
    const file = p.split("/").filter(Boolean).pop();
    return file || "index.html";
  } catch {
    return "index.html";
  }
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function renderDenied({ title, message }) {
  // Không redirect để người dùng còn bấm "Quay lại" / "Đăng xuất"
  document.title = title || "Không có quyền truy cập";
  const html = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
      <div style="width:min(560px,92vw);background:white;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);padding:28px;">
        <h2 style="margin:0 0 10px 0;font-size:26px;text-align:center;">${title || "Không có quyền truy cập"}</h2>
        <p style="margin:0 0 18px 0;color:#444;text-align:center;line-height:1.4;">${message || ""}</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="btnGoBack" style="padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer;">Quay lại</button>
          <button id="btnLogout" style="padding:10px 14px;border-radius:10px;border:1px solid #ffb4b4;background:#ffecec;color:#b40000;cursor:pointer;">Đăng xuất</button>
        </div>
      </div>
    </div>
  `;
  document.body.innerHTML = html;

  const btnBack = document.getElementById("btnGoBack");
  const btnLogout = document.getElementById("btnLogout");
  if (btnBack) btnBack.onclick = () => history.back();
  if (btnLogout) btnLogout.onclick = () => {
    try {
      localStorage.removeItem("manv");
      localStorage.removeItem("tennv");
      localStorage.removeItem("diadiem");
      localStorage.removeItem("is_admin");
      localStorage.removeItem("token");
      localStorage.removeItem("supabase_access_token");
      localStorage.removeItem("supabase_refresh_token");
    } catch {}
    location.href = "/"; // hoặc login page của bạn
  };
}

/**
 * ensureAccess - kiểm tra quyền mở trang hiện tại.
 * - Admin (localStorage.is_admin = "true") -> luôn được mở TẤT CẢ trang.
 * - Nhân viên thường -> kiểm tra theo bảng app_page / nv_page (nếu có).
 *
 * Trả về: true/false
 */
export async function ensureAccess(arg1, arg2) {
  // Hỗ trợ 2 kiểu gọi:
  // 1) ensureAccess({ supabase, manv, pathname })
  // 2) ensureAccess(supabase, manv, { pathname })
  let supabase, manv, pathname;

  if (arg1 && typeof arg1 === "object" && arg1.supabase) {
    supabase = arg1.supabase;
    manv = arg1.manv;
    pathname = arg1.pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
  } else {
    supabase = arg1;
    manv = arg2;
    pathname = (arguments[2] && arguments[2].pathname) || (typeof window !== "undefined" ? window.location.pathname : "/");
  }

  const page = getFileNameFromPath(pathname);

  // ✅ FIX QUAN TRỌNG: Nếu đã là admin -> BỎ QUA mọi chặn ở client
  const isAdminLocal = toBool(readLocal("is_admin"));
  if (isAdminLocal) return true;

  // Không có manv -> coi như chưa login
  if (!manv) {
    renderDenied({
      title: "Chưa đăng nhập",
      message: "Bạn cần đăng nhập để sử dụng trang này.",
    });
    return false;
  }

  // Nếu không có supabase client -> fail-open (để tránh làm sập trang),
  // vì quyền thực tế vẫn do RLS/API server.
  if (!supabase || !supabase.from) return true;

  // === Kiểm tra quyền theo cấu trúc phổ biến app_page + nv_page
  // Lưu ý: nếu schema/column khác, catch sẽ fail-open.
  try {
    // 1) Nếu app_page có cờ admin_only => nhân viên thường không được mở
    //    Nếu không tìm thấy trong app_page => cho qua (tránh block nhầm).
    const { data: appPage, error: appErr } = await supabase
      .from("app_page")
      .select("*")
      .eq("pagename", page)
      .maybeSingle();

    if (appErr) {
      // Không chắc schema -> cho qua
      return true;
    }

    if (appPage) {
      const active = appPage.active == null ? true : toBool(appPage.active);
      if (!active) {
        renderDenied({
          title: "Trang đang bị khóa",
          message: `Trang "${page}" hiện đang bị vô hiệu hóa.`,
        });
        return false;
      }

      // Nếu trang yêu cầu admin_only mà user không phải admin -> chặn
      const adminOnly =
        toBool(appPage.admin_only) ||
        toBool(appPage.is_admin_only) ||
        toBool(appPage.only_admin);

      if (adminOnly) {
        renderDenied({
          title: "Không có quyền truy cập",
          message: `Tài khoản ${manv} không được mở "${page}".`,
        });
        return false;
      }
    }

    // 2) Nếu có bảng nv_page để phân quyền theo nhân viên
    //    Nếu bảng nv_page không có / không khớp schema -> fail-open.
    //    Nếu có dữ liệu mapping -> chỉ cho phép khi có mapping.
    let hasNvPageTable = true;
    let mapping = null;

    // Thử theo các kiểu column hay gặp
    const tries = [
      () =>
        supabase
          .from("nv_page")
          .select("id")
          .eq("manv", manv)
          .eq("pagename", page)
          .maybeSingle(),
      () =>
        supabase
          .from("nv_page")
          .select("id")
          .eq("manv", manv)
          .eq("page", page)
          .maybeSingle(),
      () =>
        supabase
          .from("nv_page")
          .select("id")
          .eq("manv", manv)
          .eq("url", page)
          .maybeSingle(),
    ];

    for (const fn of tries) {
      const { data, error } = await fn();
      if (error) {
        // Nếu lỗi do table/column không tồn tại -> fail-open
        if (
          String(error.message || "").toLowerCase().includes("does not exist") ||
          String(error.message || "").toLowerCase().includes("column") ||
          String(error.code || "") === "42P01"
        ) {
          hasNvPageTable = false;
          break;
        }
        // lỗi khác -> cũng fail-open
        hasNvPageTable = false;
        break;
      }
      if (data) {
        mapping = data;
        break;
      }
    }

    // Nếu nv_page có hoạt động (schema khớp) thì yêu cầu có mapping
    if (hasNvPageTable) {
      if (!mapping) {
        renderDenied({
          title: "Không có quyền truy cập",
          message: `Tài khoản ${manv} không được mở "${page}".`,
        });
        return false;
      }
    }

    return true;
  } catch (e) {
    // Fail-open để tránh làm sập trang; RLS mới là lớp bảo mật thật.
    console.warn("[ensureAccess] fallback allow due to error:", e);
    return true;
  }
}
