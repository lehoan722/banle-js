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

  function buildListFromGroupData({ sourceMasp, size, branch, masters, stockRows, includeSource = false }) {
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
      if (!masp || (!includeSource && masp === source)) return;

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
    stockRows,
    includeSource = false
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

      if (!masp || (!includeSource && masp === source)) return;

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
      stockRows: (stockRows || []).filter(r => allowed.has(normText(r.masp))),
      includeSource: true
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

  function openViewer({ list, masp, size, branch, nhomhang, sourcePrice = 0, mode = "similar" }) {
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
      source_price: Number(sourcePrice || 0),
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
    const sourceMaster = masters.find(x => normText(x.masp) === sourceMasp);
    const sourcePrice = Number(sourceMaster?.giale || 0);
    const maspList = masters.map(x => normText(x.masp)).filter(Boolean);

    const stockRows = await fetchGroupStockRows(maspList, denNgay);

    const list = buildListFromGroupData({
      sourceMasp,
      size: sizeNorm,
      branch,
      masters,
      stockRows,
      includeSource: true
    });

    list.sort((a, b) => {
      const aSource = normText(a.masp) === sourceMasp ? 1 : 0;
      const bSource = normText(b.masp) === sourceMasp ? 1 : 0;
      return bSource - aSource;
    });

    openViewer({
      list,
      masp: sourceMasp,
      size: sizeNorm,
      branch,
      nhomhang: sourceGroup,
      sourcePrice
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
    const sourceMaster = masters.find(x => normText(x.masp) === sourceMasp);
    const sourcePrice = Number(sourceMaster?.giale || 0);
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
      sourcePrice,
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
    let filtered = masters.slice();

    if (mode === "discount") filtered = filtered.filter(x => [10,20,30,50].includes(Number(x.giam_gia_pct)));
    if (mode === "cheaper") filtered = filtered.filter(x => Number(x.giale||0)>0 && Number(x.giale||0)<=sourcePrice);
    if (mode === "premium") filtered = filtered.filter(x => Number(x.giale||0)>=sourcePrice);

    if (!filtered.length) return { ok:true, source_price:sourcePrice, source_group:sourceGroup, branch:useBranch, list:[] };

    const stockRows = await fetchGroupStockRows(filtered.map(x => normText(x.masp)).filter(Boolean), denNgay);
    let list = buildListFromGroupData({ sourceMasp, size:sizeNorm, branch:useBranch, masters:filtered, stockRows, includeSource:true });

    if (mode === "discount") {
      list = list.filter(x => [10,20,30,50].includes(Number(x.giam_gia_pct))).sort((a,b) => Number(b.giam_gia_pct||0)-Number(a.giam_gia_pct||0));
    } else if (mode === "cheaper") {
      list.sort((a,b) => (sourcePrice-Number(a.giale||0))-(sourcePrice-Number(b.giale||0)));
    } else if (mode === "premium") {
      list.sort((a,b) => (Number(a.giale||0)-sourcePrice)-(Number(b.giale||0)-sourcePrice));
    }

    if (sourceMasp) {
      list.sort((a, b) => {
        const aSource = normText(a.masp) === sourceMasp ? 1 : 0;
        const bSource = normText(b.masp) === sourceMasp ? 1 : 0;
        return bSource - aSource;
      });
    }

    return { ok:true, source_price:sourcePrice, source_group:sourceGroup, branch:useBranch, list };
  }


  async function getRecommendationListByFilters({
    masp,
    sizes,
    nhomhangs,
    denNgay,
    branch,
    referencePrice = 0,
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

    const sourcePrice = Number(referencePrice || sourceFresh?.giale || 0);

    let masters = await fetchMasterProductsByGroups(groupList);

    // Giữ mã gốc trong tập ứng viên. Nếu mã gốc thỏa điều kiện
    // size, nhóm, giá và tồn tại cơ sở đang xem thì sẽ được xếp đầu.

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
        Number(x.giale || 0) <= sourcePrice
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
        Number(x.giale || 0) >= sourcePrice
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
      stockRows,
      includeSource: true
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

    if (sourceMasp) {
      list.sort((a, b) => {
        const aSource = normText(a.masp) === sourceMasp ? 1 : 0;
        const bSource = normText(b.masp) === sourceMasp ? 1 : 0;
        return bSource - aSource;
      });
    }

    return {
      ok: true,
      source_price: sourcePrice,
      branch: useBranch,
      list
    };
  }


  async function getBestSellerListByFilters({
    sizes,
    nhomhangs,
    denNgay,
    branch
  }) {
    // Size chỉ dùng ở trang xem ảnh để kiểm tra tồn sau kiểm.
    // Doanh số bán chạy của một mã luôn được tính trên TẤT CẢ SIZE.
    const sizeList = Array.from(
      new Set((sizes || []).map(normalizeSize).filter(Boolean))
    );
    const groupList = Array.from(
      new Set((nhomhangs || []).map(normText).filter(Boolean))
    );
    const useBranch = ["cs1", "cs2"].includes(
      String(branch || "").trim().toLowerCase()
    )
      ? String(branch).trim().toLowerCase()
      : "cs1";

    if (!sizeList.length) {
      return { ok: false, message: "Chưa chọn size", list: [] };
    }
    if (!groupList.length) {
      return { ok: false, message: "Chưa chọn nhóm hàng", list: [] };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, message: "Supabase chưa sẵn sàng", list: [] };
    }

    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(denNgay || ""))
      ? String(denNgay)
      : new Date().toISOString().slice(0, 10);

    const { data, error } = await client.rpc("rpc_xemanh_ban_chay", {
      p_nhomhangs: groupList,
      p_den_ngay: endDate,
      p_so_ngay: 30,
      p_uu_tien_ngay: 10
    });

    if (error) {
      console.error("[StockQuickSimilar] rpc_xemanh_ban_chay error:", error);
      return {
        ok: false,
        message:
          "Không tải được dữ liệu bán chạy: " +
          (error.message || "Lỗi RPC"),
        list: []
      };
    }

    const list = (data || []).map(row => ({
      masp: normText(row.masp),
      giale: Number(row.giale || 0),
      nhomhang: row.nhomhang || "",
      giam_gia_pct:
        row.giam_gia_pct == null
          ? null
          : Number(row.giam_gia_pct),
      toncs1: 0,
      toncs2: 0,
      ban_10_ngay: Number(row.ban_10_ngay || 0),
      ban_30_ngay: Number(row.ban_30_ngay || 0),
      ban_11_30_ngay: Number(row.ban_11_30_ngay || 0),
      diem_ban_chay: Number(row.diem_ban_chay || 0),
      ban_cs1_30_ngay: Number(row.ban_cs1_30_ngay || 0),
      ban_cs2_30_ngay: Number(row.ban_cs2_30_ngay || 0),
      ngay_ban_gan_nhat: row.ngay_ban_gan_nhat || null,
      ban_nhanh: true
    }));

    // RPC đã sắp xếp, nhưng sắp lại tại trình duyệt để kết quả ổn định.
    list.sort((a, b) =>
      Number(b.diem_ban_chay || 0) - Number(a.diem_ban_chay || 0) ||
      Number(b.ban_10_ngay || 0) - Number(a.ban_10_ngay || 0) ||
      Number(b.ban_30_ngay || 0) - Number(a.ban_30_ngay || 0) ||
      String(b.ngay_ban_gan_nhat || "").localeCompare(
        String(a.ngay_ban_gan_nhat || "")
      ) ||
      String(a.masp || "").localeCompare(
        String(b.masp || ""),
        "vi",
        { numeric: true }
      )
    );

    return {
      ok: true,
      branch: useBranch,
      den_ngay: endDate,
      sales_scope: "all_sizes_both_branches",
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
