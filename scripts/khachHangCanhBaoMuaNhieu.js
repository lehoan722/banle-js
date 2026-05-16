export function mountKhachHangCanhBaoMuaNhieu(options = {}) {
  const {
    inputId = "makh",
    boxId = "khCanhBaoMuaNhieu",
    autoHideMs = 5000
  } = options;

  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);

  if (!input || !box) {
    console.warn("⚠️ Không tìm thấy ô mã khách hoặc box cảnh báo mua nhiều.");
    return;
  }

  let timer = null;
  let hideTimer = null;
  let lastMakh = "";

  function chuanHoaMakh(value) {
    return String(value || "").trim().toUpperCase();
  }

  function toDateVNString(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function showMessage(text, isWarning) {
    box.textContent = text;
    box.style.display = "block";
    box.style.color = isWarning ? "red" : "#222";
    box.style.background = isWarning ? "#fff0f0" : "#f7f7f7";

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      box.style.display = "none";
    }, autoHideMs);
  }

  async function kiemTraMuaNhieu() {
    const makh = chuanHoaMakh(input.value);

    if (!makh || makh === "KL" || makh.length < 6) {
      box.style.display = "none";
      return;
    }

    if (!window.supabase) {
      console.warn("⚠️ Chưa khởi tạo Supabase.");
      return;
    }

    if (makh === lastMakh) return;
    lastMakh = makh;

    const today = new Date();
    const ngayHomNay = toDateVNString(today);

    const d10 = new Date(today);
    d10.setDate(d10.getDate() - 9);
    const ngay10Ngay = toDateVNString(d10);

    const { data, error } = await window.supabase
      .from("hoadon_banle")
      .select("sohd, ngay")
      .eq("makh", makh)
      .gte("ngay", ngay10Ngay)
      .or("sohd.ilike.bancs1_%,sohd.ilike.bancs2_%");

    if (error) {
      console.error("❌ Lỗi kiểm tra số lần mua khách hàng:", error);
      showMessage(`Không kiểm tra được số lần mua của mã KH ${makh}`, true);
      return;
    }

    const rows = data || [];

    const soLanHomNayDaLuu = rows.filter(r => String(r.ngay || "") === ngayHomNay).length;
    const soLan10NgayDaLuu = rows.length;

    const soLanHomNayTinhCaLanNay = soLanHomNayDaLuu + 1;
    const soLan10NgayTinhCaLanNay = soLan10NgayDaLuu + 1;

    const isWarning =
      soLanHomNayTinhCaLanNay > 1 ||
      soLan10NgayTinhCaLanNay > 1;

    showMessage(
      `Mã KH ${makh} | Hôm nay: ${soLanHomNayTinhCaLanNay} lần | 10 ngày: ${soLan10NgayTinhCaLanNay} lần`,
      isWarning
    );
  }

  function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(kiemTraMuaNhieu, 350);
  }

  input.addEventListener("change", scheduleCheck);
  input.addEventListener("blur", scheduleCheck);

  window.kiemTraCanhBaoMuaNhieuKhachHang = kiemTraMuaNhieu;
}