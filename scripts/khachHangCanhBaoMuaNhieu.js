export function mountKhachHangCanhBaoMuaNhieu(options = {}) {
  const {
    inputId = "makh",
    boxId = "khCanhBaoMuaNhieu"
  } = options;

  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);

  if (!input || !box) {
    console.warn("⚠️ Không tìm thấy ô mã khách hoặc box cảnh báo mua nhiều.");
    return;
  }

  let timer = null;
  let lastCheckedMakh = "";
  let currentRequestId = 0;

  function chuanHoaMakh(value) {
    return String(value || "").trim().toUpperCase();
  }

  function clearMessage() {
    box.textContent = "";
    box.style.display = "none";
    box.dataset.makh = "";
  }

  function toDateVNString(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function showMessage(makh, text, isWarning) {
    const currentMakh = chuanHoaMakh(input.value);

    // Nếu trong lúc tải dữ liệu mà người dùng đã đổi mã KH thì không hiển thị dữ liệu cũ
    if (currentMakh !== makh) {
      clearMessage();
      return;
    }

    box.dataset.makh = makh;
    box.textContent = text;
    box.style.display = "block";
    box.style.color = isWarning ? "red" : "#222";
    box.style.background = isWarning ? "#fff0f0" : "#f7f7f7";
  }

  async function kiemTraMuaNhieu(force = false) {
    const makh = chuanHoaMakh(input.value);

    if (!makh || makh === "KL" || makh.length < 6) {
      lastCheckedMakh = "";
      clearMessage();
      return;
    }

    if (!window.supabase) {
      clearMessage();
      return;
    }

    if (!force && makh === lastCheckedMakh && box.dataset.makh === makh) {
      return;
    }

    lastCheckedMakh = makh;
    const requestId = ++currentRequestId;

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

    // Nếu request cũ trả về sau request mới thì bỏ qua
    if (requestId !== currentRequestId) return;

    // Nếu mã khách hiện tại đã đổi thì bỏ qua
    if (chuanHoaMakh(input.value) !== makh) {
      clearMessage();
      return;
    }

    if (error) {
      console.error("❌ Lỗi kiểm tra số lần mua khách hàng:", error);
      showMessage(makh, `Không kiểm tra được số lần mua của mã KH ${makh}`, true);
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
      makh,
      `Mã KH ${makh} | Hôm nay: ${soLanHomNayTinhCaLanNay} lần | 10 ngày: ${soLan10NgayTinhCaLanNay} lần`,
      isWarning
    );
  }

  function scheduleCheck() {
    clearTimeout(timer);

    const makh = chuanHoaMakh(input.value);

    if (!makh || makh === "KL" || makh.length < 6) {
      lastCheckedMakh = "";
      clearMessage();
      return;
    }

    timer = setTimeout(() => {
      kiemTraMuaNhieu(false);
    }, 300);
  }

  input.addEventListener("input", scheduleCheck);
  input.addEventListener("change", () => kiemTraMuaNhieu(true));
  input.addEventListener("blur", () => kiemTraMuaNhieu(true));

  window.kiemTraCanhBaoMuaNhieuKhachHang = () => kiemTraMuaNhieu(true);
}
