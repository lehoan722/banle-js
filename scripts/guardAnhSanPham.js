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
// scripts/guardAnhSanPham.js
export function attachRequireImageBeforeSave({
  saveButtonId,
  dispatchTarget = (document.body || document.documentElement),

  // hàm check của bạn (khuyên tách riêng cho rõ)
  // phải return { ok: true } hoặc { ok:false, missing:[...] }
  checkBeforeSave,
}) {
  const btn = document.getElementById(saveButtonId);

  // Cờ cho phép “F2 đi tiếp” đúng 1 lần (tránh loop khi ta tự dispatch lại F2)
  let allowNextF2 = false;

  async function guardRun() {
    // Nếu bạn đang có hàm check riêng thì gọi vào đây
    const res = await checkBeforeSave?.();
    if (!res) return { ok: true };

    if (!res.ok) {
      const list = (res.missing || []).join(", ");
      alert(`⚠️ Các mã chưa có ảnh: ${list}\nVui lòng chụp ảnh sản phẩm trước khi lưu.`);
      return { ok: false };
    }
    return { ok: true };
  }

  // ✅ 1) Chặn CLICK nút Lưu (phòng khi nút không dispatch F2 hoặc trang khác dùng click trực tiếp)
  if (btn) {
    btn.addEventListener("click", async (e) => {
      // nhiều trang của bạn click sẽ dispatch F2 (:contentReference[oaicite:2]{index=2}),
      // nên click cũng phải guard để nhất quán
      e.preventDefault();
      e.stopPropagation();

      const { ok } = await guardRun();
      if (!ok) return;

      // Pass -> bắn F2 để chạy đúng luồng lưu cũ
      allowNextF2 = true;
      dispatchTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    }, true);
  }

  // ✅ 2) Chặn NHẤN F2 TRỰC TIẾP (đây là phần bạn đang thiếu)
  document.addEventListener("keydown", async (e) => {
    if (e.key !== "F2") return;

    // Nếu đây là F2 do chính guard bắn lại -> cho qua đúng 1 lần
    if (allowNextF2) {
      allowNextF2 = false;
      return;
    }

    // Chặn toàn bộ handler F2 phía sau (luồng lưu cũ)
    e.preventDefault();
    e.stopImmediatePropagation();

    const { ok } = await guardRun();
    if (!ok) return;

    // Pass -> bắn lại F2 để hệ thống cũ xử lý lưu như trước
    allowNextF2 = true;
    dispatchTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
  }, true);
}

