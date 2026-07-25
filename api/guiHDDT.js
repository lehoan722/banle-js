// api/guiHDDT.js

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const viettelAccounts = {
  cs1: {
    username: process.env.VIETTEL_CS1_USERNAME || "4600370592",
    password: process.env.VIETTEL_CS1_PASSWORD,
    mst: "4600370592",
    invoiceSeries: "C25MLH",
    templateCode: "2/001",
    endpoint:

      // process.env.VIETTEL_CS1_ENDPOINT ||
      // "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/4600370592",

      process.env.VIETTEL_CS1_ENDPOINT ||
      "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/4600370592",


    sellerInfo: {
      sellerLegalName: "ĐẶNG LÊ HOÀN",
      sellerTaxCode: "4600370592",
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, Phường Tích Lương, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "lehoan722@gmail.com",
      sellerBankAccount: "555445725",
      sellerBankName: "VPBank"
    }
  },

  cs2: {
    username: process.env.VIETTEL_CS2_USERNAME || "4600960665",
    password: process.env.VIETTEL_CS2_PASSWORD,
    mst: "4600960665",
    invoiceSeries: "C25MAT",
    templateCode: "2/001",
    endpoint:
       process.env.VIETTEL_CS2_ENDPOINT ||
      "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/4600960665",

     // process.env.VIETTEL_CS2_ENDPOINT ||
    //  "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/4600960665",


    sellerInfo: {
      sellerLegalName: "NGUYỄN ÁNH TUYẾT",
      sellerTaxCode: "4600960665",
      sellerAddressLine: "Số 561, Tổ 11, Phường Phan Đình Phùng, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0763424342",
      sellerEmail: "nguyenanhtuyet140175@gmail.com",
      sellerBankAccount: "554758266",
      sellerBankName: "VPBank"
    }
  }
};

function getCoSoFromSohd(sohd = "") {
  const s = String(sohd || "").toLowerCase();
  if (s.startsWith("bancs1_") || s.startsWith("bancs1t_")) return "cs1";
  if (s.startsWith("bancs2_") || s.startsWith("bancs2t_")) return "cs2";
  return null;
}

function isTaxSohd(sohd = "") {
  const s = String(sohd || "")
    .trim()
    .toLowerCase();

  return (
    s.startsWith("bancs1t_") ||
    s.startsWith("bancs2t_")
  );
}

function safeNumber(v) {
  return Number(v || 0) || 0;
}

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  if (!h.startsWith("Bearer ")) return "";
  return h.slice("Bearer ".length).trim();
}

async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user;
}

async function markResult(
  sohd,
  ok,
  message = null,
  invoiceNo = null
) {
  const { data, error } = await supabaseAdmin.rpc(
    "rpc_mark_external_send_result",
    {
      p_sohd: sohd,
      p_ok: ok,
      p_message: message,
      p_invoice_no: invoiceNo
    }
  );

  if (error) {
    console.error(
      "[VIETTEL] RPC cập nhật kết quả gửi lỗi:",
      error
    );

    return {
      ok: false,
      code: "MARK_RESULT_RPC_ERROR"
    };
  }

  if (!data?.ok) {
    console.error(
      "[VIETTEL] RPC từ chối cập nhật kết quả:",
      data
    );

    return (
      data || {
        ok: false,
        code: "MARK_RESULT_EMPTY"
      }
    );
  }

  return data;
}

async function claimSend(sohd) {
  const { data, error } = await supabaseAdmin.rpc("claim_viettel_send", {
    p_sohd: sohd
  });

  if (error) {
    return { ok: false, status: "claim_error" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row || { ok: false, status: "claim_empty" };
}

async function loadInvoice(sohd) {
  const isTax = isTaxSohd(sohd);

  const invoiceTable = isTax
    ? "hoadon_banleT"
    : "hoadon_banle";

  const detailTable = isTax
    ? "ct_hoadon_banleT"
    : "ct_hoadon_banle";

  const { data: hoadon, error: e1 } = await supabaseAdmin
    .from(invoiceTable)
    .select("*")
    .eq("sohd", sohd)
    .maybeSingle();

  if (e1 || !hoadon) {
    return {
      hoadon: null,
      chitiet: [],
      khach: null,
      isTax
    };
  }

  const { data: chitiet, error: e2 } = await supabaseAdmin
    .from(detailTable)
    .select("*")
    .eq("sohd", sohd)
    .order("id", { ascending: true });

  if (
    e2 ||
    !Array.isArray(chitiet) ||
    chitiet.length === 0
  ) {
    return {
      hoadon,
      chitiet: [],
      khach: null,
      isTax
    };
  }

  let khach = null;

  const makh = String(
    hoadon.makh || ""
  ).trim();

  if (makh) {
    const { data } = await supabaseAdmin
      .from("dmkhachhang")
      .select(
        "makh, tenkh, diachi, dienthoai, email, mst"
      )
      .eq("makh", makh)
      .maybeSingle();

    khach = data || null;
  }

  return {
    hoadon,
    chitiet,
    khach,
    isTax
  };
}

function buildBuyerInfo(hoadon, khach) {
  const mst = String(khach?.mst || hoadon.mstkhach || "").trim();
  const hasTax = !!mst;

  const ten =
    String(khach?.tenkh || hoadon.khachhang || "Khách lẻ").trim() ||
    "Khách lẻ";

  return {
    sohd: hoadon.sohd,

    buyerName: hasTax ? ten : "KL",
    buyerLegalName: hasTax ? ten : "Khách lẻ",
    buyerTaxCode: hasTax ? mst : "",
    buyerAddressLine: hasTax ? String(khach?.diachi || hoadon.diachikhach || "").trim() : "",
    buyerPhoneNumber: hasTax ? String(khach?.dienthoai || "").trim() : "",
    buyerEmail: hasTax ? String(khach?.email || "").trim() : "",

    buyerIdNo: "",
    buyerIdType: "",
    buyerBudgetCode: ""
  };
}

function buildViettelPayload(hoadon, chitiet, khach, acc) {
  const itemInfo = chitiet.map((item, index) => {
    const giaSauKm = safeNumber(item.gia) - safeNumber(item.km);

    return {
      lineNumber: index + 1,
      itemName: String(item.tensp || "").trim(),
      unitName: String(item.dvt || "").trim(),
      quantity: safeNumber(item.soluong),
      unitPrice: giaSauKm,
      itemTotalAmountWithoutTax: safeNumber(item.thanhtien),
      taxPercentage: 0,
      taxAmount: 0,
      discount: 0,
      itemDiscount: safeNumber(item.km)
    };
  });

  const total = itemInfo.reduce(
    (sum, x) => sum + safeNumber(x.itemTotalAmountWithoutTax),
    0
  );

  return {
    generalInvoiceInfo: {
      sohd: hoadon.sohd,
      invoiceType: "02GTTT",
      templateCode: acc.templateCode,
      invoiceSeries: acc.invoiceSeries,
      invoiceIssuedDate: Date.now(),
      currencyCode: "VND",
      adjustmentType: "1",
      paymentStatus: true,
      paymentType: "TM/CK",
      paymentTypeName: "TM/CK",
      cusGetInvoiceRight: true
    },

    buyerInfo: buildBuyerInfo(hoadon, khach),
    sellerInfo: acc.sellerInfo,

    payments: [
      {
        paymentMethodName: "TM/CK",
        paymentAmount: safeNumber(hoadon.thanhtoan)
      }
    ],

    itemInfo,

    summarizeInfo: {
      totalAmountWithoutTax: total,
      totalTaxAmount: 0,
      totalAmountWithTax: total,
      totalAmountWithTaxInWords: "",
      discountAmount: safeNumber(hoadon.chietkhau)
    },

    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  };
}

async function getViettelToken(acc) {
  const tokenRes = await fetch("https://api-vinvoice.viettel.vn/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: acc.username,
      password: acc.password
    })
  });

  let tokenData = null;
  try {
    tokenData = await tokenRes.json();
  } catch {
    tokenData = null;
  }

  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error("TOKEN_FAILED");
  }

  return tokenData.access_token;
}

async function sendToViettel(acc, payload) {
  const token = await getViettelToken(acc);

  const res = await fetch(acc.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  let raw = "";

  try {
    raw = await res.text();
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok || data?.message === "GENERAL") {
    throw new Error("VIETTEL_SEND_FAILED");
  }

  return data || {};
}

export default async function handler(req, res) {
  let viettelAccepted = false;
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED"
    });
  }

  try {
    const user = await requireAuth(req);
    if (!user) {
      return res.status(401).json({
        ok: false,
        code: "NO_AUTH"
      });
    }

    const sohd = String(req.body?.sohd || "").trim();

    if (!sohd) {
      return res.status(400).json({
        ok: false,
        code: "NO_SOHD"
      });
    }

    const prefixCoSo = getCoSoFromSohd(sohd);
    if (!prefixCoSo) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_SOHD"
      });
    }

    if (!isTaxSohd(sohd)) {
      return res.status(400).json({
        ok: false,
        code: "TAX_SOHD_REQUIRED"
      });
    }

    const claim = await claimSend(sohd);

    if (!claim?.ok) {
      return res.status(409).json({
        ok: false,
        code: claim?.status || "CLAIM_FAILED"
      });
    }

    const { hoadon, chitiet, khach } = await loadInvoice(sohd);

    if (!hoadon || !chitiet.length) {
      await markResult(sohd, false, "INVOICE_DATA_NOT_FOUND");

      return res.status(404).json({
        ok: false,
        code: "INVOICE_DATA_NOT_FOUND"
      });
    }

    const dbCoSo = String(hoadon.diadiem || "").trim().toLowerCase();

    if (dbCoSo !== prefixCoSo) {
      await markResult(sohd, false, "BRANCH_MISMATCH");

      return res.status(400).json({
        ok: false,
        code: "BRANCH_MISMATCH"
      });
    }

    const acc = viettelAccounts[dbCoSo];

    if (!acc || !acc.password) {
      await markResult(sohd, false, "VIETTEL_CONFIG_MISSING");

      return res.status(500).json({
        ok: false,
        code: "VIETTEL_CONFIG_MISSING"
      });
    }

    const payload = buildViettelPayload(hoadon, chitiet, khach, acc);

    const viettelResult = await sendToViettel(acc, payload);
    viettelAccepted = true;

    const invoiceNo =
      viettelResult?.result?.invoiceNo ||
      viettelResult?.invoiceNo ||
      viettelResult?.invoice_no ||
      null;

    const markResultData = await markResult(
      sohd,
      true,
      null,
      invoiceNo
    );

    if (!markResultData?.ok) {
      return res.status(500).json({
        ok: false,
        code:
          markResultData?.code ||
          "MARK_SEND_RESULT_FAILED"
      });
    }

    return res.status(200).json({
      ok: true,
      code: "SENT",
      sohd,
      source_sohd: markResultData.source_sohd
    });
  } catch (e) {
    const sohd = String(req.body?.sohd || "").trim();

    console.error("[VIETTEL] guiHDDT error:", {
      sohd,
      viettelAccepted,
      error: e?.message || String(e)
    });

    if (sohd && !viettelAccepted) {
      await markResult(
        sohd,
        false,
        e?.message || "SEND_FAILED"
      );
    }

    return res.status(500).json({
      ok: false,
      code: viettelAccepted
        ? "VIETTEL_ACCEPTED_DB_RESULT_UNKNOWN"
        : "SEND_FAILED"
    });
  }
}
