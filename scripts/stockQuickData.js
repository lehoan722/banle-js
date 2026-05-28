// stockQuickData.js
// Lấy dữ liệu tồn/bán/kiểm tồn/vị trí từ Supabase và RPC.

(function () {
  "use strict";

  async function fetchTonBanByMasp(maspRaw) {
    const U = window.StockQuickUtils;
    const C = window.StockQuickColor;

    const masp = String(maspRaw || "").trim().toUpperCase();
    if (!masp) {
      return { masp: "", rows: [], vitri_cs1: "", vitri_cs2: "", nhap_dau_ma: "", nhap_cuoi_ma: "" };
    }

    const denNgay = U.getDenNgay();
    console.log("[StockQuickPopup] Gọi xntnhanh", { masp, denNgay });

    let rows = [];
    let vitri_cs1 = "";
    let vitri_cs2 = "";
    let kiemton = { cs1: {}, cs2: {} };
    let baymau_cs1 = "";
    let baymau_cs2 = "";
    let nhap_dau_ma = "";
    let nhap_cuoi_ma = "";
    let giale = "";
    let nhomhang = "";
    let mau_khac = "";

    const client = await U.waitForSupabaseReady(1000);
    if (!client) {
      return { masp, rows, vitri_cs1, vitri_cs2, nhap_dau_ma, nhap_cuoi_ma };
    }

    try {
      const colorResPromise = C.prepareColorPromise(client, masp);

      let [snapRes, hhRes, kiemRes, colorRes] = await Promise.all([
        client.rpc("xntnhanh", {
          p_masps: [masp],
          p_den_ngay: denNgay,
          p_tonghop_size: false,
        }),

        client
          .from("dmhanghoa")
          .select("vitrikho1, vitrikho2, treomaucs1, treomaucs2, nhapdau, giale, nhomhang")
          .eq("masp", masp)
          .maybeSingle(),

        client.rpc("rpc_stockquick_kiemton", { p_masp: masp }),

        colorResPromise
      ]);

      const firstRows = Array.isArray(snapRes?.data) ? snapRes.data : [];

      if (!firstRows.length && !snapRes?.error) {
        await new Promise(r => setTimeout(r, 400));

        snapRes = await client.rpc("xntnhanh", {
          p_masps: [masp],
          p_den_ngay: denNgay,
          p_tonghop_size: false,
        });

        console.log("[StockQuickPopup] Gọi lại xntnhanh sau 400ms", {
          masp,
          denNgay,
          rows: Array.isArray(snapRes?.data) ? snapRes.data.length : 0
        });
      }

      const { data: kiemData, error: kiemErr } = kiemRes || {};
      if (kiemErr) {
        console.warn("[StockQuickPopup] rpc_stockquick_kiemton error:", kiemErr);
      }
      if (kiemData) kiemton = kiemData;

      const { data, error } = snapRes || {};
      if (!error && data && data.length) {
        nhap_dau_ma = String(data[0].nhap_dau_ma || "").trim();
        nhap_cuoi_ma = String(data[0].nhap_cuoi_ma || "").trim();

        rows = data.map((r) => {
          const ban1 = Number(r.ban_cs1 || 0);
          const ban2 = Number(r.ban_cs2 || 0);

          return {
            masp: String(r.masp || "").toUpperCase(),
            size: U.normalizeSize(r.size),
            ton_cs1: Number(r.ton_cs1 || 0),
            ton_cs2: Number(r.ton_cs2 || 0),

            lech_cs1: (() => {
              const sizeKey = String(r.size || "").replace(/^size\s+/i, "").trim();
              const v = kiemton?.cs1?.lech?.[sizeKey];
              return v === undefined || v === null || Number(v) === 0 ? null : Number(v);
            })(),

            lech_cs2: (() => {
              const sizeKey = String(r.size || "").replace(/^size\s+/i, "").trim();
              const v = kiemton?.cs2?.lech?.[sizeKey];
              return v === undefined || v === null || Number(v) === 0 ? null : Number(v);
            })(),

            ban_cs1: ban1,
            ban_cs2: ban2,
            tong_ban: ban1 + ban2,
            tong_nhap: Number(r.tong_nhap || 0),
            tong_ton: Number(r.tong_ton || 0),
          };
        });
      } else if (error) {
        console.warn("xntnhanh error:", error);
      }

      const { data: hh, error: hhErr } = hhRes || {};
      if (hhErr) {
        console.warn("[StockQuickPopup] Lỗi đọc dmhanghoa:", hhErr);
      } else if (hh) {
        vitri_cs1 = hh.vitrikho1 || "";
        vitri_cs2 = hh.vitrikho2 || "";
        baymau_cs1 = hh.treomaucs1 || "";
        baymau_cs2 = hh.treomaucs2 || "";
        giale = hh.giale || "";
        nhomhang = hh.nhomhang || "";

        const ndRaw = hh.nhapdau ? String(hh.nhapdau).trim() : "";
        if (ndRaw && !nhap_dau_ma) {
          nhap_dau_ma = U.normalizeND(ndRaw);
        }
      }

      if (nhap_dau_ma) nhap_dau_ma = String(nhap_dau_ma).trim();
      if (nhap_cuoi_ma) nhap_cuoi_ma = String(nhap_cuoi_ma).trim();

      mau_khac = C.parseColorResult(masp, colorRes);
    } catch (e) {
      console.warn("[StockQuickPopup] Exception trong fetchTonBanByMasp:", e);
    }

    window.__SQ_DATA = window.__SQ_DATA || {};
    window.__SQ_DATA[masp] = { rows, nhomhang, giale, mau_khac };

    return {
      masp,
      rows,
      kiemton,
      vitri_cs1,
      vitri_cs2,
      baymau_cs1,
      baymau_cs2,
      nhap_dau_ma,
      nhap_cuoi_ma,
      giale,
      nhomhang,
      mau_khac
    };
  }

  window.StockQuickData = {
    fetchTonBanByMasp,
  };
})();
