// stockQuickSimilar.js - Tìm sản phẩm cùng nhóm cùng size

(function () {
  const DISCOUNT_SIZE_SUMMARY_CACHE = new Map();
  const DISCOUNT_SIZE_SUMMARY_TTL_MS = 2 * 60 * 1000;

  function getSupabaseClient() {
    const client = window.supabase;
    if (!client || typeof client.from !== "function" || typeof client.rpc !== "function") {
      alert("Supabase chưa sẵn sàng");
      return null;
    }
    return client;
  }

  function normText(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  function normalizeSize(v) {
    const s = String(v || "").trim();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : s;
  }

  function detectBranch() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("cs1")) return "cs1";
    if (path.includes("cs2")) return "cs2";
    return "";
  }

  async function pickBranchIfNeeded() {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.style = `
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center; z-index:999999;
      `;
      div.innerHTML = `
        <div style="background:#fff;padding:16px 18px;border-radius:10px;text-align:center;min-width:220px">
          <div style="margin-bottom:12px;font-weight:700">Chọn cơ sở ưu tiên sắp xếp</div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button id="sqPickCS1" type="button">CS1</button>
            <button id="sqPickCS2" type="button">CS2</button>
            <button id="sqPickCancel" type="button">Hủy</button>
          </div>
        </div>
      `;
      document.body.appendChild(div);

      div.querySelector("#sqPickCS1").onclick = () => { div.remove(); resolve("cs1"); };
      div.querySelector("#sqPickCS2").onclick = () => { div.remove(); resolve("cs2"); };
      div.querySelector("#sqPickCancel").onclick = () => { div.remove(); resolve(null); };
    });
  }

  async function fetchGroupMasterProducts(nhomhang) {
    const client = getSupabaseClient();
    if (!client) return [];

    const groupNorm = normText(nhomhang);

    const { data, error } = await client
      .from("dmhanghoa")
      .select("masp, giale, nhomhang, giam_gia_pct")
      .ilike("nhomhang", `%${String(nhomhang || "").trim()}%`)
      .order("masp", { ascending: true });

    if (error) {
      alert("Lỗi đọc danh mục nhóm hàng: " + error.message);
      return [];
    }

    return (data || []).filter(x => normText(x.nhomhang) === groupNorm);
  }


  async function fetchMasterProductsByGroups(groupList) {
    const client = getSupabaseClient();
    if (!client) return [];

    const groups = Array.from(
      new Set(
        (groupList || [])
          .map(normText)
          .filter(Boolean)
      )
    );

    if (!groups.length) return [];

    const all = [];
    const chunkSize = 20;

    for (let i = 0; i < groups.length; i += chunkSize) {
      const chunk = groups.slice(i, i + chunkSize);

      const { data, error } = await client
        .from("dmhanghoa")
        .select("masp, giale, nhomhang, giam_gia_pct")
        .in("nhomhang", chunk)
        .order("masp", { ascending: true });

      if (error) {
        console.warn("[StockQuickSimilar] Lỗi đọc nhiều nhóm hàng:", error);
        return all;
      }

      all.push(...(data || []));
    }

    const allowed = new Set(groups);

    return all.filter(row =>
      allowed.has(normText(row.nhomhang))
    );
  }

  async function fetchGroupStockRows(maspList, denNgay) {
    const client = getSupabaseClient();
    if (!client || !Array.isArray(maspList) || !maspList.length) return [];

    const all = [];
    const chunkSize = 80;

    for (let i = 0; i < maspList.length; i += chunkSize) {
      const chunk = maspList.slice(i, i + chunkSize);

      const { data, error } = await client.rpc("xntnhanh", {
        p_masps: chunk,
        p_den_ngay: denNgay,
        p_tonghop_size: false,
      });

      if (error) {
        alert("Lỗi đọc tồn nhóm hàng: " + error.message);
        return all;
      }

      all.push(...(data || []));
    }

    return all;
  }

  function buildListFromGroupData({ sourceMasp, size, branch, masters, stockRows }) {
    const sizeNorm = normalizeSize(size);
    const source = normText(sourceMasp);

    const masterMap = new Map();
    masters.forEach(m => {
      masterMap.set(normText(m.masp), {
        giale: Number(m.giale || 0),
        nhomhang: m.nhomhang || "",
        giam_gia_pct: m.giam_gia_pct == null ? null : Number(m.giam_gia_pct),
      });
    });

    const byMasp = new Map();

    stockRows.forEach(r => {
      const masp = normText(r.masp);
      if (!masp || masp === source) return;

      const rowSize = normalizeSize(r.size);
      if (rowSize !== sizeNorm) return;

      const toncs1 = Number(r.ton_cs1 || 0);
      const toncs2 = Number(r.ton_cs2 || 0);

      // Chỉ lấy mã còn tồn tại cơ sở đã chọn
      if (branch === "cs1" && toncs1 <= 0) return;
      if (branch === "cs2" && toncs2 <= 0) return;

      const item = byMasp.get(masp) || {
        masp,
        giale: masterMap.get(masp)?.giale || 0,
        toncs1: 0,
        toncs2: 0,
        ban_nhanh: false,
        giam_gia_pct: masterMap.get(masp)?.giam_gia_pct ?? null,
      };

      item.toncs1 += toncs1;
      item.toncs2 += toncs2;

      byMasp.set(masp, item);
    });

    return Array.from(byMasp.values()).sort((a, b) => {
      const ta = branch === "cs2" ? a.toncs2 : a.toncs1;
      const tb = branch === "cs2" ? b.toncs2 : b.toncs1;

      if (tb !== ta) return tb - ta;
      return (b.toncs1 + b.toncs2) - (a.toncs1 + a.toncs2);
    });
  }



  function buildListFromMultiFilterData({
    sourceMasp,
    sizes,
    branch,
    masters,
    stockRows
  }) {
    const source = normText(sourceMasp);
    const sizeSet = new Set(
      (sizes || []).map(normalizeSize).filter(Boolean)
    );

    const masterMap = new Map();

    (masters || []).forEach(m => {
      masterMap.set(normText(m.masp), {
        giale: Number(m.giale || 0),
        nhomhang: m.nhomhang || "",
        giam_gia_pct:
          m.giam_gia_pct == null
            ? null
            : Number(m.giam_gia_pct)
      });
    });

    const byMasp = new Map();

    (stockRows || []).forEach(r => {
      const masp = normText(r.masp);

      if (!masp || masp === source) return;

      const rowSize = normalizeSize(r.size);

      if (!sizeSet.has(rowSize)) return;

      const toncs1 = Number(r.ton_cs1 || 0);
      const toncs2 = Number(r.ton_cs2 || 0);

      if (branch === "cs1" && toncs1 <= 0) return;
      if (branch === "cs2" && toncs2 <= 0) return;

      const item = byMasp.get(masp) || {
        masp,
        giale: masterMap.get(masp)?.giale || 0,
        toncs1: 0,
        toncs2: 0,
        ban_nhanh: false,
        giam_gia_pct:
          masterMap.get(masp)?.giam_gia_pct ?? null,
        matched_sizes: []
      };

      item.toncs1 += toncs1;
      item.toncs2 += toncs2;

      if (!item.matched_sizes.includes(rowSize)) {
        item.matched_sizes.push(rowSize);
      }

      byMasp.set(masp, item);
    });

    return Array.from(byMasp.values()).sort((a, b) => {
      const ta =
        branch === "cs2"
          ? Number(a.toncs2 || 0)
          : Number(a.toncs1 || 0);

      const tb =
        branch === "cs2"
          ? Number(b.toncs2 || 0)
          : Number(b.toncs1 || 0);

      if (tb !== ta) return tb - ta;

      return String(a.masp || "").localeCompare(
        String(b.masp || ""),
        "vi",
        { numeric: true }
      );
    });
  }

  function buildDiscountListFromGroupData({ sourceMasp, size, branch, masters, stockRows }) {
    const discountMasters = (masters || []).filter(m =>
      [10, 20, 30, 50].includes(Number(m.giam_gia_pct))
    );

    const allowed = new Set(
      discountMasters.map(m => normText(m.masp)).filter(Boolean)
    );

    const list = buildListFromGroupData({
      sourceMasp,
      size,
      branch,
      masters: discountMasters,
      stockRows: (stockRows || []).filter(r => allowed.has(normText(r.masp)))
    });

    return list.sort((a, b) => {
      const da = Number(a.giam_gia_pct || 0);
      const db = Number(b.giam_gia_pct || 0);

      if (db !== da) return db - da;

      const ta = branch === "cs2" ? Number(a.toncs2 || 0) : Number(a.toncs1 || 0);
      const tb = branch === "cs2" ? Number(b.toncs2 || 0) : Number(b.toncs1 || 0);

      if (tb !== ta) return tb - ta;
      return String(a.masp || "").localeCompare(String(b.masp || ""), "vi", { numeric: true });
    });
  }

  function openViewer({ list, masp, size, branch, nhomhang, mode = "similar" }) {
    if (!list.length) {
      alert(mode === "discount" ? `Không có sản phẩm giảm giá cùng nhóm còn size ${size}` : `Không có sản phẩm cùng nhóm còn size ${size}`);
      return;
    }

    sessionStorage.setItem("XNT14_MASP_LIST", JSON.stringify(list));
    sessionStorage.setItem("XNT14_CONTEXT", JSON.stringify({
      source_masp: masp,
      source_size: size,
      branch,
      nhomhang,
      mode
    }));

    window.open("xemanhxnt14.html", "_blank");
  }

  async function openFromPopup({ masp, size, nhomhang, denNgay }) {
    const sourceMasp = normText(masp);
    const sourceGroup = String(nhomhang || "").trim();
    const sizeNorm = normalizeSize(size);

    if (!sourceMasp || !sourceGroup || !sizeNorm) {
      alert("Thiếu dữ liệu để tìm sản phẩm cùng nhóm");
      return;
    }

    let branch = detectBranch();
    if (!branch) {
      branch = await pickBranchIfNeeded();
      if (!branch) return;
    }

    const masters = await fetchGroupMasterProducts(sourceGroup);
    const maspList = masters.map(x => normText(x.masp)).filter(Boolean);

    const stockRows = await fetchGroupStockRows(maspList, denNgay);

    const list = buildListFromGroupData({
      sourceMasp,
      size: sizeNorm,
      branch,
      masters,
      stockRows
    });

    openViewer({
      list,
      masp: sourceMasp,
      size: sizeNorm,
      branch,
      nhomhang: sourceGroup
    });
  }


  async function openDiscountFromPopup({ masp, size, nhomhang, denNgay }) {
    const sourceMasp = normText(masp);
    const sourceGroup = String(nhomhang || "").trim();
    const sizeNorm = normalizeSize(size);

    if (!sourceMasp || !sourceGroup || !sizeNorm) {
      alert("Thiếu dữ liệu để tìm hàng giảm giá cùng nhóm");
      return;
    }

    let branch = detectBranch();
    if (!branch) {
      branch = await pickBranchIfNeeded();
      if (!branch) return;
    }

    const masters = await fetchGroupMasterProducts(sourceGroup);
    const discountMasters = masters.filter(m =>
      [10, 20, 30, 50].includes(Number(m.giam_gia_pct))
    );

    if (!discountMasters.length) {
      alert("Nhóm hàng này chưa có sản phẩm nào được đánh dấu giảm giá.");
      return;
    }

    const maspList = discountMasters
      .map(x => normText(x.masp))
      .filter(Boolean);

    const stockRows = await fetchGroupStockRows(maspList, denNgay);

    const list = buildDiscountListFromGroupData({
      sourceMasp,
      size: sizeNorm,
      branch,
      masters: discountMasters,
      stockRows
    });

    openViewer({
      list,
      masp: sourceMasp,
      size: sizeNorm,
      branch,
      nhomhang: sourceGroup,
      mode: "discount"
    });
  }


  async function fetchSourceMaster(maspRaw) {
    const client = getSupabaseClient();
    if (!client) return null;
    const masp = normText(maspRaw);
    if (!masp) return null;
    const { data, error } = await client
      .from("dmhanghoa")
      .select("masp, giale, nhomhang, giam_gia_pct")
      .eq("masp", masp)
      .maybeSingle();
    if (error) {
      console.warn("[StockQuickSimilar] Không đọc được mã gốc:", error);
      return null;
    }
    return data || null;
  }

  async function getRecommendationList({
    masp, size, nhomhang, denNgay, branch, mode = "similar"
  }) {
    const sourceMasp = normText(masp);
    const sizeNorm = normalizeSize(size);
    if (!sourceMasp || !sizeNorm) return { ok:false, message:"Thiếu mã gốc hoặc size", list:[] };

    let useBranch = String(branch || "").trim().toLowerCase();
    if (!["cs1","cs2"].includes(useBranch)) useBranch = detectBranch();
    if (!["cs1","cs2"].includes(useBranch)) {
      useBranch = await pickBranchIfNeeded();
      if (!useBranch) return { ok:false, canceled:true, list:[] };
    }

    const sourceFresh = await fetchSourceMaster(sourceMasp);
    const sourceGroup = String(sourceFresh?.nhomhang || nhomhang || "").trim();
    if (!sourceGroup) return { ok:false, message:"Không đọc được nhóm hàng mã gốc", list:[] };

    const masters = await fetchGroupMasterProducts(sourceGroup);
    const sourceMaster = sourceFresh || masters.find(x => normText(x.masp) === sourceMasp);
    const sourcePrice = Number(sourceMaster?.giale || 0);
    let filtered = masters.filter(x => normText(x.masp) !== sourceMasp);

    if (mode === "discount") filtered = filtered.filter(x => [10,20,30,50].includes(Number(x.giam_gia_pct)));
    if (mode === "cheaper") filtered = filtered.filter(x => Number(x.giale||0)>0 && Number(x.giale||0)<sourcePrice);
    if (mode === "premium") filtered = filtered.filter(x => Number(x.giale||0)>sourcePrice);

    if (!filtered.length) return { ok:true, source_price:sourcePrice, source_group:sourceGroup, branch:useBranch, list:[] };

    const stockRows = await fetchGroupStockRows(filtered.map(x => normText(x.masp)).filter(Boolean), denNgay);
    let list = buildListFromGroupData({ sourceMasp, size:sizeNorm, branch:useBranch, masters:filtered, stockRows });

    if (mode === "discount") {
      list = list.filter(x => [10,20,30,50].includes(Number(x.giam_gia_pct))).sort((a,b) => Number(b.giam_gia_pct||0)-Number(a.giam_gia_pct||0));
    } else if (mode === "cheaper") {
      list.sort((a,b) => (sourcePrice-Number(a.giale||0))-(sourcePrice-Number(b.giale||0)));
    } else if (mode === "premium") {
      list.sort((a,b) => (Number(a.giale||0)-sourcePrice)-(Number(b.giale||0)-sourcePrice));
    }

    return { ok:true, source_price:sourcePrice, source_group:sourceGroup, branch:useBranch, list };
  }


  async function getRecommendationListByFilters({
    masp,
    sizes,
    nhomhangs,
    denNgay,
    branch,
    mode = "similar"
  }) {
    const sourceMasp = normText(masp);

    const sizeList = Array.from(
      new Set(
        (sizes || [])
          .map(normalizeSize)
          .filter(Boolean)
      )
    );

    const groupList = Array.from(
      new Set(
        (nhomhangs || [])
          .map(normText)
          .filter(Boolean)
      )
    );

    let useBranch = String(branch || "").trim().toLowerCase();

    if (!["cs1", "cs2"].includes(useBranch)) {
      useBranch = detectBranch();
    }

    if (!["cs1", "cs2"].includes(useBranch)) {
      useBranch = await pickBranchIfNeeded();

      if (!useBranch) {
        return {
          ok: false,
          canceled: true,
          message: "Đã hủy chọn cơ sở",
          list: []
        };
      }
    }

    if (!sizeList.length) {
      return {
        ok: false,
        message: "Chưa chọn size",
        list: []
      };
    }

    if (!groupList.length) {
      return {
        ok: false,
        message: "Chưa chọn nhóm hàng",
        list: []
      };
    }

    const sourceFresh = sourceMasp
      ? await fetchSourceMaster(sourceMasp)
      : null;

    const sourcePrice = Number(sourceFresh?.giale || 0);

    let masters = await fetchMasterProductsByGroups(groupList);

    masters = masters.filter(
      x => normText(x.masp) !== sourceMasp
    );

    if (mode === "discount") {
      masters = masters.filter(x =>
        [10, 20, 30, 50].includes(
          Number(x.giam_gia_pct)
        )
      );
    } else if (mode === "cheaper") {
      if (!sourcePrice) {
        return {
          ok: false,
          message:
            "Không đọc được giá mã gốc để tìm hàng rẻ hơn",
          list: []
        };
      }

      masters = masters.filter(x =>
        Number(x.giale || 0) > 0 &&
        Number(x.giale || 0) < sourcePrice
      );
    } else if (mode === "premium") {
      if (!sourcePrice) {
        return {
          ok: false,
          message:
            "Không đọc được giá mã gốc để tìm hàng cao cấp hơn",
          list: []
        };
      }

      masters = masters.filter(x =>
        Number(x.giale || 0) > sourcePrice
      );
    }

    if (!masters.length) {
      return {
        ok: true,
        source_price: sourcePrice,
        branch: useBranch,
        list: []
      };
    }

    const maspList = masters
      .map(x => normText(x.masp))
      .filter(Boolean);

    const stockRows = await fetchGroupStockRows(
      maspList,
      denNgay
    );

    let list = buildListFromMultiFilterData({
      sourceMasp,
      sizes: sizeList,
      branch: useBranch,
      masters,
      stockRows
    });

    if (mode === "discount") {
      list = list
        .filter(x =>
          [10, 20, 30, 50].includes(
            Number(x.giam_gia_pct)
          )
        )
        .sort((a, b) => {
          const pctDiff =
            Number(b.giam_gia_pct || 0) -
            Number(a.giam_gia_pct || 0);

          if (pctDiff !== 0) return pctDiff;

          const ta =
            useBranch === "cs2"
              ? Number(a.toncs2 || 0)
              : Number(a.toncs1 || 0);

          const tb =
            useBranch === "cs2"
              ? Number(b.toncs2 || 0)
              : Number(b.toncs1 || 0);

          return tb - ta;
        });
    } else if (mode === "cheaper") {
      list.sort((a, b) => {
        const da =
          sourcePrice - Number(a.giale || 0);

        const db =
          sourcePrice - Number(b.giale || 0);

        return da - db;
      });
    } else if (mode === "premium") {
      list.sort((a, b) => {
        const da =
          Number(a.giale || 0) - sourcePrice;

        const db =
          Number(b.giale || 0) - sourcePrice;

        return da - db;
      });
    }

    return {
      ok: true,
      source_price: sourcePrice,
      branch: useBranch,
      list
    };
  }


  function isoDateShift(dateText, daysBack) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))
      ? new Date(String(dateText) + "T12:00:00")
      : new Date();
    base.setDate(base.getDate() - Number(daysBack || 0));
    return base.toISOString().slice(0, 10);
  }

  function aggregateSalesForSelectedSizes(rows, sizes) {
    const sizeSet = new Set((sizes || []).map(normalizeSize).filter(Boolean));
    const map = new Map();

    (rows || []).forEach(row => {
      const masp = normText(row.masp);
      const size = normalizeSize(row.size);
      if (!masp || !sizeSet.has(size)) return;

      const sold = Number(row.ban_cs1 || 0) + Number(row.ban_cs2 || 0);
      map.set(masp, Number(map.get(masp) || 0) + sold);
    });

    return map;
  }

  async function getBestSellerListByFilters({
    sizes,
    nhomhangs,
    denNgay,
    branch
  }) {
    const sizeList = Array.from(new Set((sizes || []).map(normalizeSize).filter(Boolean)));
    const groupList = Array.from(new Set((nhomhangs || []).map(normText).filter(Boolean)));
    const useBranch = ["cs1", "cs2"].includes(String(branch || "").toLowerCase())
      ? String(branch).toLowerCase()
      : "cs1";

    if (!sizeList.length) return { ok:false, message:"Chưa chọn size", list:[] };
    if (!groupList.length) return { ok:false, message:"Chưa chọn nhóm hàng", list:[] };

    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(denNgay || ""))
      ? String(denNgay)
      : new Date().toISOString().slice(0, 10);
    const before10 = isoDateShift(endDate, 10);
    const before30 = isoDateShift(endDate, 30);

    const masters = await fetchMasterProductsByGroups(groupList);
    if (!masters.length) return { ok:true, branch:useBranch, list:[] };

    const masps = masters.map(x => normText(x.masp)).filter(Boolean);
    const [rowsNow, rowsBefore10, rowsBefore30] = await Promise.all([
      fetchGroupStockRows(masps, endDate),
      fetchGroupStockRows(masps, before10),
      fetchGroupStockRows(masps, before30)
    ]);

    const soldNow = aggregateSalesForSelectedSizes(rowsNow, sizeList);
    const sold10Base = aggregateSalesForSelectedSizes(rowsBefore10, sizeList);
    const sold30Base = aggregateSalesForSelectedSizes(rowsBefore30, sizeList);

    const masterMap = new Map(masters.map(m => [normText(m.masp), m]));
    const list = [];

    masps.forEach(masp => {
      const cumulativeNow = Number(soldNow.get(masp) || 0);
      const cumulative10 = Number(sold10Base.get(masp) || 0);
      const cumulative30 = Number(sold30Base.get(masp) || 0);
      const ban10 = Math.max(0, cumulativeNow - cumulative10);
      const ban30 = Math.max(0, cumulativeNow - cumulative30);
      const ban11To30 = Math.max(0, ban30 - ban10);
      const score = ban10 * 2 + ban11To30;

      if (ban30 <= 0) return;
      const m = masterMap.get(masp) || {};
      list.push({
        masp,
        giale: Number(m.giale || 0),
        giam_gia_pct: m.giam_gia_pct == null ? null : Number(m.giam_gia_pct),
        toncs1: 0,
        toncs2: 0,
        ban_10_ngay: ban10,
        ban_30_ngay: ban30,
        ban_11_30_ngay: ban11To30,
        diem_ban_chay: score,
        ban_nhanh: true
      });
    });

    list.sort((a, b) =>
      Number(b.diem_ban_chay || 0) - Number(a.diem_ban_chay || 0) ||
      Number(b.ban_10_ngay || 0) - Number(a.ban_10_ngay || 0) ||
      Number(b.ban_30_ngay || 0) - Number(a.ban_30_ngay || 0) ||
      String(a.masp || "").localeCompare(String(b.masp || ""), "vi", { numeric:true })
    );

    return {
      ok:true,
      branch:useBranch,
      den_ngay:endDate,
      moc_10_ngay:before10,
      moc_30_ngay:before30,
      list
    };
  }

  async function getDiscountSizeSummary({
    masp,
    nhomhang,
    denNgay,
    branch,
    forceRefresh = false
  }) {
    const sourceMasp = normText(masp);
    const sourceGroup = String(nhomhang || "").trim();
    const useBranch = String(branch || "").trim().toLowerCase();

    if (!sourceMasp || !sourceGroup || !["cs1", "cs2"].includes(useBranch)) {
      return {
        ok: false,
        message: "Thiếu mã, nhóm hàng hoặc cơ sở",
        summary: {}
      };
    }

    const cacheKey = [
      normText(sourceGroup),
      useBranch,
      String(denNgay || "")
    ].join("|");

    const cached = DISCOUNT_SIZE_SUMMARY_CACHE.get(cacheKey);

    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.savedAt < DISCOUNT_SIZE_SUMMARY_TTL_MS
    ) {
      return {
        ok: true,
        cached: true,
        summary: cached.summary
      };
    }

    const masters = await fetchGroupMasterProducts(sourceGroup);

    const discountMasters = (masters || []).filter(m => {
      const code = normText(m.masp);
      const pct = Number(m.giam_gia_pct || 0);

      return (
        code &&
        code !== sourceMasp &&
        [10, 20, 30, 50].includes(pct)
      );
    });

    if (!discountMasters.length) {
      const empty = {};

      DISCOUNT_SIZE_SUMMARY_CACHE.set(cacheKey, {
        savedAt: Date.now(),
        summary: empty
      });

      return {
        ok: true,
        summary: empty
      };
    }

    const allowedMasps = new Set(
      discountMasters.map(x => normText(x.masp)).filter(Boolean)
    );

    const stockRows = await fetchGroupStockRows(
      Array.from(allowedMasps),
      denNgay
    );

    const sizeSets = new Map();

    (stockRows || []).forEach(r => {
      const code = normText(r.masp);
      if (!allowedMasps.has(code)) return;

      const size = normalizeSize(r.size);
      if (!size) return;

      const ton = useBranch === "cs2"
        ? Number(r.ton_cs2 || 0)
        : Number(r.ton_cs1 || 0);

      if (ton <= 0) return;

      if (!sizeSets.has(size)) {
        sizeSets.set(size, new Set());
      }

      sizeSets.get(size).add(code);
    });

    const summary = {};

    sizeSets.forEach((set, size) => {
      summary[size] = set.size;
    });

    DISCOUNT_SIZE_SUMMARY_CACHE.set(cacheKey, {
      savedAt: Date.now(),
      summary
    });

    return {
      ok: true,
      cached: false,
      summary
    };
  }

  function clearDiscountSizeSummaryCache() {
    DISCOUNT_SIZE_SUMMARY_CACHE.clear();
  }

  window.StockQuickSimilar = {
    openFromPopup,
    openDiscountFromPopup,
    getRecommendationList,
    getRecommendationListByFilters,
    getBestSellerListByFilters,
    getDiscountSizeSummary,
    clearDiscountSizeSummaryCache
  };
})();
