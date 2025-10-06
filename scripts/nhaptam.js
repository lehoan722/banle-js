// ================== NHAP TAM MODULE ==================

// dùng client supabase đã có sẵn trên trang
const supabase = window.supabase;

// ======= Helpers =======
const $ = (sel) => document.querySelector(sel);
const U = (s) => (s || "").toString().trim().toUpperCase();
const pad5 = (n) => String(n).padStart(5, "0");
const getCS = () => (localStorage.getItem("diadiem") || "cs1").toLowerCase();

// Hỏi DB lấy số chứng từ mới nhất theo cơ sở, rồi cộng 1
async function getNextSoctFromDB(coso) {
  const { data: last, error } = await supabase
    .from("nhaptam_hd")
    .select("soct")
    .ilike("soct", `nt${coso}_%`)
    .order("soct", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  let next = 1;
  if (last?.soct) {
    const n = parseInt(last.soct.split("_")[1], 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `nt${coso}_${pad5(next)}`;
}

// Parse số hiện tại trong ô #socttam → { prefix, num }
function parseSoctInput() {
  const v = $("#socttam")?.value?.trim();
  if (!v) return null;
  const [prefix, numStr] = v.split("_");
  return { prefix, num: parseInt(numStr, 10) || 0 };
}

let __isLoading = false; // cờ tránh load song song

// Xóa toàn bộ lưới
function clearGrid() {
  const tbody = document.querySelector("#bangketqua tbody");
  if (tbody) tbody.innerHTML = "";
}

// Đổ dữ liệu từ DB lên lưới (gồm cả Tổng nhập)
async function fillGrid(rows) {
  try {
    // ✅ Xóa lưới cũ trước khi nạp dữ liệu mới (tránh chồng)
    if (typeof clearGrid === "function") clearGrid();

    const SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45];

    if (!rows || !rows.length) {
      if (typeof MobileKQ?.render === "function") MobileKQ.render();
      return;
    }

    // Đảm bảo MobileKQ sẵn sàng
    const ready = () =>
      window.MobileKQ &&
      typeof MobileKQ.upsertRow === "function" &&
      typeof MobileKQ.setQty === "function";

    if (!ready()) {
      let cnt = 0;
      await new Promise((res) => {
        const tm = setInterval(() => {
          if (ready() || ++cnt > 30) {
            clearInterval(tm);
            res();
          }
        }, 200);
      });
      if (!ready()) return;
    }

    // 1) Đổ size
    for (const d of rows) {
      const masp = (d.masp || "").toString().trim().toUpperCase();
      if (!masp) continue;

      await MobileKQ.upsertRow(masp);

      for (const s of SIZES) {
        const key = `s${s}`;
        const val = Number(d[key] ?? 0) || 0;
        MobileKQ.setQty(masp, s, val);
      }
    }

    // 2) Vẽ để cập nhật "Tổng"
    if (typeof MobileKQ.render === "function") MobileKQ.render();

    // 3) Gán "Tổng nhập" từ DB
    const tbody = document.querySelector("#bangketqua tbody");
    for (const d of rows) {
      const masp = (d.masp || "").toString().trim().toUpperCase();
      if (!masp) continue;
      const tn = Number(d.tong_nhap ?? 0) || 0;

      if (typeof MobileKQ.setTongNhapByMasp === "function") {
        MobileKQ.setTongNhapByMasp(masp, tn);
        continue;
      }

      if (tbody) {
        for (const tr of tbody.rows) {
          const cellMasp = (tr.cells[0]?.innerText || tr.cells[0]?.textContent || "")
            .trim()
            .toUpperCase();
          if (cellMasp === masp && tr.cells[11]) {
            tr.cells[11].textContent = String(tn);
            break;
          }
        }
      }
    }

    // 4) Vẽ lại lần nữa nếu cần
    if (typeof MobileKQ.render === "function") MobileKQ.render();
  } catch (err) {
    console.error("fillGrid error:", err);
  }
}

// =============== LOAD / SAVE ===============

window.loadNhapTam = async function (soct) {
  try {
    if (__isLoading) return;
    __isLoading = true;

    // khóa nút điều hướng khi đang tải
    $("#btn-quaylai-nt")?.setAttribute("disabled", "disabled");
    $("#tieptuc")?.setAttribute("disabled", "disabled");

    const { data, error } = await supabase
      .from("nhaptam_ct")
      .select("masp,dvt,vitrikho,s0,s38,s39,s40,s41,s42,s43,s44,s45,tong,tong_nhap")
      .eq("soct", soct)
      .order("masp", { ascending: true });

    if (error) throw error;

    if (!data || !data.length) {
      alert("⚠️ Không tìm thấy hóa đơn nhập tạm!");
      return;
    }

    await fillGrid(data);
    if ($("#socttam")) $("#socttam").value = soct;
  } catch (e) {
    console.error(e);
    alert("❌ Lỗi khi tải hóa đơn nhập tạm!");
  } finally {
    __isLoading = false;
    $("#btn-quaylai-nt")?.removeAttribute("disabled");
    $("#tieptuc")?.removeAttribute("disabled");
  }
};

window.saveNhapTam = async function () {
  try {
    const soct = $("#socttam")?.value?.trim();
    if (!soct) return alert("⚠️ Chưa có số chứng từ!");

    const rows = (typeof MobileKQ.getAll === "function") ? MobileKQ.getAll() : [];
    if (!rows.length) return alert("⚠️ Không có dữ liệu để lưu!");

    const hd = {
      soct,
      diadiem: getCS(),
      ngay: new Date().toISOString().split("T")[0],
      nhanvien: $("#manv")?.value || "",
      ghichu: $("#ghichu")?.value || "",
    };

    const details = rows.map((r) => ({
      soct,
      masp: (r.masp || "").toUpperCase(),
      s0: +(r.s0 ?? 0),
      s38: +(r.s38 ?? 0),
      s39: +(r.s39 ?? 0),
      s40: +(r.s40 ?? 0),
      s41: +(r.s41 ?? 0),
      s42: +(r.s42 ?? 0),
      s43: +(r.s43 ?? 0),
      s44: +(r.s44 ?? 0),
      s45: +(r.s45 ?? 0),
      tong_nhap: +(r.tong_nhap ?? 0),
    }));

    const { error: errHd } = await supabase.from("nhaptam_hd").upsert(hd);
    if (errHd) throw errHd;

    const { error: errCt } = await supabase.from("nhaptam_ct").upsert(details);
    if (errCt) throw errCt;

    alert("✅ Đã lưu dữ liệu thành công!");
  } catch (error) {
    console.error(error);
    alert("❌ Lỗi khi lưu dữ liệu!");
  }
};

// =============== CHUYỂN HÓA ĐƠN ===============

async function openPrevDoc() {
  const parsed = parseSoctInput();
  if (!parsed) return alert("⚠️ Chưa có số chứng từ hiện tại!");
  if (parsed.num <= 1) return alert("⚠️ Đây là hóa đơn đầu tiên!");
  const prevSoct = `${parsed.prefix}_${pad5(parsed.num - 1)}`;
  await window.loadNhapTam(prevSoct);
}

async function openNextDoc() {
  const parsed = parseSoctInput();
  if (!parsed) return alert("⚠️ Chưa có số chứng từ hiện tại!");
  const nextSoct = `${parsed.prefix}_${pad5(parsed.num + 1)}`;
  await window.loadNhapTam(nextSoct);
}

async function newDoc() {
  if (confirm("🆕 Tạo hóa đơn nhập tạm mới?")) {
    if (typeof clearGrid === "function") clearGrid();
    const soct = await getNextSoctFromDB(getCS());
    if ($("#socttam")) $("#socttam").value = soct;
  }
}

// =============== GẮN SỰ KIỆN ===============
document.addEventListener("DOMContentLoaded", () => {
  $("#btn-luu-nt")?.addEventListener("click", () => window.saveNhapTam());
  $("#btn-quaylai-nt")?.addEventListener("click", () => openPrevDoc());
  $("#tieptuc")?.addEventListener("click", () => openNextDoc());
  $("#them")?.addEventListener("click", () => newDoc());
});

console.log("✅ nhaptam.js loaded");
