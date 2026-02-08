// scripts/guardAnhSanPham.js
import { supabase } from "./supabaseClient.js";

// chuẩn hóa masp giống kiểu bạn đang dùng (IN HOA, bỏ (xx) nếu có)
function normalizeMasp(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\(\d+\)\s*$/, "") // bỏ "(12)" cuối mã nếu có
    .trim();
}

function getMaspListFromTable() {
  const tbody = document.querySelector("#bangketqua tbody");
  if (!tbody) return [];
  const set = new Set();
  tbody.querySelectorAll("tr").forEach(tr => {
    const td = tr.querySelector("td");
    if (!td) return;
    const masp = normalizeMasp(td.textContent);
    if (masp) set.add(masp);
  });
  return Array.from(set);
}

// check tồn tại ảnh trong Storage theo quy ước MASP.JPG
async function findMissingImages(maspList) {
  const bucket = supabase.storage.from("anhsanpham");

  // chạy tuần tự (ổn định, ít rủi ro rate-limit). Nếu cần nhanh hơn mình sẽ nâng cấp batch sau.
  const missing = [];
  for (const masp of maspList) {
    // list root với search filename
    const { data, error } = await bucket.list("", { search: `${masp}.JPG` });
    if (error) {
      // nếu lỗi list -> coi như thiếu để tránh lọt
      missing.push(masp);
      continue;
    }
    const ok = Array.isArray(data) && data.some(f => String(f.name).toUpperCase() === `${masp}.JPG`);
    if (!ok) missing.push(masp);
  }
  return missing;
}

// hàm gắn guard vào nút lưu (giữ nguyên luồng F2)
export function attachRequireImageBeforeSave({
  saveButtonId = "btn-luu",
  dispatchTarget = document.body || document.documentElement,
}) {
  const btn = document.getElementById(saveButtonId);
  if (!btn) return;

  // dùng capture để “chặn” listener cũ (đang dispatch F2) của trang
  btn.addEventListener(
    "click",
    async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const maspList = getMaspListFromTable();
      if (!maspList.length) {
        // không có dòng nào => vẫn cho lưu (hoặc bạn muốn chặn thì đổi)
        const ev = new KeyboardEvent("keydown", { key: "F2", bubbles: true });
        dispatchTarget.dispatchEvent(ev);
        return;
      }

      const missing = await findMissingImages(maspList);
      if (missing.length) {
        alert(
          "❌ Chưa thể lưu vì các mã sau CHƯA có ảnh trong hệ thống.\n" +
          "Vui lòng chụp ảnh sản phẩm trước khi lưu:\n\n" +
          missing.join(", ")
        );
        return;
      }

      // đủ ảnh -> chạy luồng cũ (F2)
      const ev = new KeyboardEvent("keydown", { key: "F2", bubbles: true });
      dispatchTarget.dispatchEvent(ev);
    },
    true // capture
  );
}
