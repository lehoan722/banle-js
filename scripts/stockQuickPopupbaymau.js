// stockQuickPopupbaymau.js
(function () {
  function getSupabase() {
    return window.supabase && typeof window.supabase.from === "function"
      ? window.supabase
      : null;
  }

  function getCurrentManv() {
    return (
      sessionStorage.getItem("manv") ||
      localStorage.getItem("manv") ||
      window.manv ||
      sessionStorage.getItem("tennv") ||
      localStorage.getItem("tennv") ||
      window.tennv ||
      ""
    ).trim().toUpperCase();
  }

  function formatDateShort(v) {
    if (!v) return "--";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  }

  async function fetchLastSale(masp, coso) {
    const supabase = getSupabase();
    if (!supabase || !masp) return null;

    const prefix = coso === "cs2" ? "bancs2_%" : "bancs1_%";

    const { data, error } = await supabase
      .from("ct_hoadon_banle")
      .select("id, sohd, masp, diadiem, ngay, created_at, baymau_by, baymau_at")
      .ilike("masp", masp)
      .eq("diadiem", coso)
      .ilike("sohd", prefix)
      .order("ngay", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[StockQuickBayMau] fetchLastSale error:", error);
      return null;
    }

    return data || null;
  }

  async function markBayMau(rowId, manv) {
    const supabase = getSupabase();
    if (!supabase || !rowId || !manv) {
      return { ok: false, message: "Thiếu Supabase, dòng bán hoặc mã nhân viên" };
    }

    const { error } = await supabase
      .from("ct_hoadon_banle")
      .update({
        baymau_by: manv,
        baymau_at: new Date().toISOString()
      })
      .eq("id", rowId)
      .is("baymau_by", null);

    if (error) {
      console.warn("[StockQuickBayMau] update error:", error);
      return { ok: false, message: error.message || "Lưu bày mẫu lỗi" };
    }

    return { ok: true };
  }

  function buildRowHtml(coso, sale) {
    const checked = !!sale?.baymau_by;
    const dateText = sale ? formatDateShort(sale.ngay || sale.created_at) : "--";
    const nameText = sale?.baymau_by ? sale.baymau_by : "xx";
    const disabled = checked || !sale ? "disabled" : "";

    return `
      <div class="sq-baymau-info-row" data-coso="${coso}" data-row-id="${sale?.id || ""}">
        <input type="checkbox" class="sq-baymau-check" ${checked ? "checked" : ""} ${disabled}>
        <span class="sq-baymau-text">${dateText}, ${nameText}</span>
        <span class="sq-baymau-msg"></span>
      </div>
    `;
  }

  async function renderForCoso(popup, masp, coso) {
    const anchor = popup.querySelector(`.sq-vitri-action-row[data-coso="${coso}"][data-loai="baymau"]`);
    if (!anchor) return;

    const old = popup.querySelector(`.sq-baymau-info-row[data-coso="${coso}"]`);
    if (old) old.remove();

    const sale = await fetchLastSale(masp, coso);
    anchor.insertAdjacentHTML("afterend", buildRowHtml(coso, sale));

    const row = popup.querySelector(`.sq-baymau-info-row[data-coso="${coso}"]`);
    const chk = row?.querySelector(".sq-baymau-check");
    const msg = row?.querySelector(".sq-baymau-msg");
    const text = row?.querySelector(".sq-baymau-text");

    if (!row || !chk || !sale || sale.baymau_by) return;

    chk.addEventListener("change", async function (e) {
      e.stopPropagation();

      if (!chk.checked) return;

      const manv = getCurrentManv();
      if (!manv) {
        chk.checked = false;
        if (msg) msg.textContent = " Chưa có mã NV";
        return;
      }

      chk.disabled = true;
      if (msg) msg.textContent = " Đang lưu...";

      const rs = await markBayMau(sale.id, manv);

      if (rs.ok) {
        if (text) text.textContent = `${formatDateShort(sale.ngay || sale.created_at)}, ${manv}`;
        if (msg) msg.textContent = " Đã lưu";
      } else {
        chk.checked = false;
        chk.disabled = false;
        if (msg) msg.textContent = " " + (rs.message || "Lỗi lưu");
      }
    });
  }

  async function attach(popup) {
    if (!popup) return;

    const masp = String(popup.dataset.masp || "").trim().toUpperCase();
    if (!masp) return;

    await Promise.all([
      renderForCoso(popup, masp, "cs1"),
      renderForCoso(popup, masp, "cs2")
    ]);
  }

  window.StockQuickBayMau = {
    attach
  };
})();
