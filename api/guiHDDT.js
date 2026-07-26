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

   //   process.env.VIETTEL_CS2_ENDPOINT ||
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

function getSourceSohdFromTaxSohd(sohd = "") {
  const value = String(sohd || "").trim();

  /*
   * bancs1T_000001 → bancs1_000001
   * bancs2T_000001 → bancs2_000001
   */
  if (/^bancs1t_/i.test(value)) {
    return value.replace(/^bancs1t_/i, "bancs1_");
  }

  if (/^bancs2t_/i.test(value)) {
    return value.replace(/^bancs2t_/i, "bancs2_");
  }

  return "";
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

function cleanText(value) {
  return String(value ?? "").trim();
}

function isRetailCustomerText(value) {
  const text = cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    !text ||
    text === "kl" ||
    text === "khach le" ||
    text === "ban cho nguoi tieu dung"
  );
}

/**
 * Tìm khách theo thứ tự:
 * 1. hoadon.makh
 * 2. hoadon.khachhang được coi là mã khách
 * 3. hoadon.khachhang được coi là tên khách
 */

async function findCustomerFromInvoice(hoadon) {
  // Đúng với cấu trúc bảng dmkhachhang hiện tại
  const customerFields =
    "makh, tenkh, diachi, dienthoai, email, mst, cccd";

  /*
   * Danh sách các trường có thể đang chứa mã khách.
   * makh là trường chuẩn.
   * Các trường còn lại giúp tương thích dữ liệu đã lưu trước đây.
   */
  const codeCandidates = [
    hoadon?.makh,
    hoadon?.makhachhang,
    hoadon?.ma_khach_hang,
    hoadon?.customer_code,
    hoadon?.dienthoaikhach,
    hoadon?.sdtkhach
  ]
    .map(cleanText)
    .filter(Boolean);

  const uniqueCodes = [...new Set(codeCandidates)];

  /*
   * 1. Ưu tiên tìm chính xác bằng mã khách.
   */
  for (const code of uniqueCodes) {
    const { data, error } = await supabaseAdmin
      .from("dmkhachhang")
      .select(customerFields)
      .eq("makh", code)
      .maybeSingle();

    if (error) {
      console.error(
        "[VIETTEL] Lỗi tìm khách theo mã khách:",
        {
          sohd: hoadon?.sohd,
          code,
          error: error.message
        }
      );
    }

    if (!error && data) {
      console.log(
        "[VIETTEL] Đã tìm thấy khách theo mã:",
        {
          sohd: hoadon?.sohd,
          makh: data.makh
        }
      );

      return data;
    }
  }

  /*
   * 2. Vì hệ thống của bạn thường dùng số điện thoại làm mã khách,
   * thử tìm các mã trên trong cột dienthoai.
   */
  for (const code of uniqueCodes) {
    const { data, error } = await supabaseAdmin
      .from("dmkhachhang")
      .select(customerFields)
      .eq("dienthoai", code)
      .limit(2);

    if (error) {
      console.error(
        "[VIETTEL] Lỗi tìm khách theo điện thoại:",
        {
          sohd: hoadon?.sohd,
          code,
          error: error.message
        }
      );
    }

    if (
      !error &&
      Array.isArray(data) &&
      data.length === 1
    ) {
      console.log(
        "[VIETTEL] Đã tìm thấy khách theo điện thoại:",
        {
          sohd: hoadon?.sohd,
          makh: data[0].makh
        }
      );

      return data[0];
    }
  }

  const khachhang = cleanText(hoadon?.khachhang);

  // Nếu đúng là khách lẻ thì không tìm tiếp
  if (isRetailCustomerText(khachhang)) {
    return null;
  }

  /*
   * 3. Tương thích trường hợp cột khachhang đang chứa mã khách.
   */
  if (khachhang) {
    const { data, error } = await supabaseAdmin
      .from("dmkhachhang")
      .select(customerFields)
      .eq("makh", khachhang)
      .maybeSingle();

    if (error) {
      console.error(
        "[VIETTEL] Lỗi tìm khi khachhang chứa mã:",
        {
          sohd: hoadon?.sohd,
          khachhang,
          error: error.message
        }
      );
    }

    if (!error && data) {
      console.log(
        "[VIETTEL] Đã tìm thấy khách từ cột khachhang:",
        {
          sohd: hoadon?.sohd,
          makh: data.makh
        }
      );

      return data;
    }
  }

  /*
   * 4. Cuối cùng mới tìm bằng tên.
   * Dùng khớp chính xác không phân biệt hoa thường.
   */
  if (khachhang) {
    const { data, error } = await supabaseAdmin
      .from("dmkhachhang")
      .select(customerFields)
      .ilike("tenkh", khachhang)
      .limit(3);

    if (error) {
      console.error(
        "[VIETTEL] Lỗi tìm khách theo tên:",
        {
          sohd: hoadon?.sohd,
          khachhang,
          error: error.message
        }
      );
    }

    if (
      !error &&
      Array.isArray(data) &&
      data.length === 1
    ) {
      console.log(
        "[VIETTEL] Đã tìm thấy duy nhất một khách theo tên:",
        {
          sohd: hoadon?.sohd,
          makh: data[0].makh
        }
      );

      return data[0];
    }

    if (
      !error &&
      Array.isArray(data) &&
      data.length > 1
    ) {
      console.warn(
        "[VIETTEL] Có nhiều khách trùng tên, không tự chọn:",
        {
          sohd: hoadon?.sohd,
          khachhang,
          count: data.length
        }
      );
    }
  }

  console.warn(
    "[VIETTEL] Không tìm được khách trong dmkhachhang:",
    {
      sohd: hoadon?.sohd,
      makh: hoadon?.makh || "",
      makhachhang: hoadon?.makhachhang || "",
      khachhang: hoadon?.khachhang || "",
      dienthoaikhach: hoadon?.dienthoaikhach || "",
      sdtkhach: hoadon?.sdtkhach || "",
      codeCandidates: uniqueCodes
    }
  );

  return null;
}

async function loadSourceInvoiceCustomer(taxInvoice) {
  const taxSohd = cleanText(taxInvoice?.sohd);
  const sourceSohd = getSourceSohdFromTaxSohd(taxSohd);

  if (!sourceSohd) {
    return {
      sourceInvoice: null,
      sourceSohd: ""
    };
  }

  const { data, error } = await supabaseAdmin
    .from("hoadon_banle")
    .select(
      "sohd, makh, khachhang, diadiem, ngay, created_at"
    )
    .eq("sohd", sourceSohd)
    .maybeSingle();

  if (error) {
    console.error(
      "[VIETTEL] Lỗi đọc hóa đơn nguồn:",
      {
        taxSohd,
        sourceSohd,
        error: error.message
      }
    );

    return {
      sourceInvoice: null,
      sourceSohd
    };
  }

  if (!data) {
    console.warn(
      "[VIETTEL] Không tìm thấy hóa đơn nguồn:",
      {
        taxSohd,
        sourceSohd
      }
    );

    return {
      sourceInvoice: null,
      sourceSohd
    };
  }

  console.log(
    "[VIETTEL] Đã tìm thấy hóa đơn nguồn:",
    {
      taxSohd,
      sourceSohd,
      makh: data.makh || "",
      khachhang: data.khachhang || ""
    }
  );

  return {
    sourceInvoice: data,
    sourceSohd
  };
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

  /*
 * Bản hóa đơn T có thể không được sao chép makh.
 * Khi đó lấy makh từ hóa đơn nguồn hoadon_banle.
 */
  let sourceInvoice = null;
  let sourceSohd = "";

  if (isTax) {
    const sourceResult =
      await loadSourceInvoiceCustomer(hoadon);

    sourceInvoice =
      sourceResult.sourceInvoice;

    sourceSohd =
      sourceResult.sourceSohd;
  }

  /*
   * Gộp thông tin nhận diện khách:
   * - Ưu tiên makh đang có trên bản T.
   * - Nếu bản T thiếu thì lấy từ hóa đơn nguồn.
   * - Tên trên bản T vẫn được giữ.
   */
  const invoiceForCustomerLookup = {
    ...hoadon,

    makh:
      cleanText(hoadon?.makh) ||
      cleanText(sourceInvoice?.makh),

    khachhang:
      cleanText(hoadon?.khachhang) ||
      cleanText(sourceInvoice?.khachhang),

    source_sohd: sourceSohd
  };

  const khach = await findCustomerFromInvoice(
    invoiceForCustomerLookup
  );

  if (!khach) {
    console.warn(
      "[VIETTEL] Không tìm được khách trong dmkhachhang:",
      {
        taxSohd: hoadon.sohd,
        sourceSohd,
        taxMakh: hoadon.makh || "",
        sourceMakh: sourceInvoice?.makh || "",
        taxKhachhang: hoadon.khachhang || "",
        sourceKhachhang:
          sourceInvoice?.khachhang || ""
      }
    );
  }

  return {
    hoadon: invoiceForCustomerLookup,
    chitiet,
    khach,
    isTax,
    sourceInvoice
  };
}

function buildBuyerInfo(hoadon, khach) {
  /*
   * Ưu tiên dữ liệu lấy từ dmkhachhang.
   * Chỉ dùng dữ liệu trên hóa đơn khi không có dữ liệu danh mục.
   */
  const buyerName = cleanText(
    khach?.tenkh ||
    hoadon?.tenkhach ||
    hoadon?.khachhang
  );

  const buyerTaxCode = cleanText(
    khach?.mst ||
    hoadon?.mstkhach
  );

  const buyerAddress = cleanText(
    khach?.diachi ||
    hoadon?.diachikhach
  );

  const buyerPhone = cleanText(
    khach?.dienthoai ||
    hoadon?.dienthoaikhach ||
    hoadon?.sdtkhach
  );

  const buyerEmail = cleanText(
    khach?.email ||
    hoadon?.emailkhach
  );

  const buyerIdNo = cleanText(
    khach?.cccd ||
    hoadon?.cccdkhach ||
    hoadon?.sodinhdanhkhach
  );

  const hasCustomerInformation =
    !!khach ||
    !isRetailCustomerText(buyerName) ||
    !!buyerTaxCode ||
    !!buyerAddress ||
    !!buyerPhone ||
    !!buyerEmail ||
    !!buyerIdNo;

  const displayName = hasCustomerInformation
    ? buyerName || "Bán cho người tiêu dùng"
    : "Bán cho người tiêu dùng";

  return {
    sohd: hoadon.sohd,

    buyerName: displayName,
    buyerLegalName: displayName,

    buyerTaxCode,
    buyerAddressLine: buyerAddress,
    buyerPhoneNumber: buyerPhone,
    buyerEmail,

    buyerIdNo,
    buyerIdType: buyerIdNo ? "CCCD" : "",

    buyerBudgetCode: cleanText(
      hoadon?.ma_dvqhns
    )
  };
}

function validateBuyerMapping(hoadon, khach, buyerInfo) {
  const selectedCustomerCode = cleanText(
    hoadon?.makh ||
    hoadon?.makhachhang ||
    hoadon?.ma_khach_hang
  );

  /*
   * Nếu hóa đơn có mã khách nhưng không tìm thấy trong dmkhachhang,
   * dừng gửi để tránh phát hành hóa đơn thiếu thông tin.
   */
  if (selectedCustomerCode && !khach) {
    const error = new Error(
      "BUYER_NOT_FOUND_IN_CUSTOMER_MASTER"
    );

    error.details = {
      sohd: hoadon?.sohd,
      selectedCustomerCode
    };

    throw error;
  }

  /*
   * Nếu khách có mã số thuế thì bắt buộc phải có tên và địa chỉ.
   */
  if (buyerInfo.buyerTaxCode) {
    if (
      !buyerInfo.buyerName ||
      isRetailCustomerText(buyerInfo.buyerName)
    ) {
      throw new Error("BUYER_NAME_MISSING");
    }

    if (!buyerInfo.buyerAddressLine) {
      throw new Error("BUYER_ADDRESS_MISSING");
    }
  }
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

    const payload = buildViettelPayload(
      hoadon,
      chitiet,
      khach,
      acc
    );

    validateBuyerMapping(
      hoadon,
      khach,
      payload.buyerInfo
    );

    /*
     * Log tạm để kiểm tra dữ liệu trước khi gửi Viettel.
     * Sau khi kiểm tra ổn định có thể xóa phần buyerInfo chi tiết.
     */
    console.log(
      "[VIETTEL] Buyer mapping before send:",
      {
        taxSohd: sohd,

        sourceSohd:
          hoadon?.source_sohd || "",

        invoiceCustomerFields: {
          makh: hoadon?.makh || "",
          khachhang:
            hoadon?.khachhang || ""
        },

        customerFound: !!khach,

        customerMaster: khach
          ? {
            makh: khach.makh || "",
            tenkh: khach.tenkh || "",
            hasAddress: !!khach.diachi,
            hasPhone: !!khach.dienthoai,
            hasEmail: !!khach.email,
            hasTaxCode: !!khach.mst,
            hasCccd: !!khach.cccd
          }
          : null,

        buyerInfo: payload.buyerInfo
      }
    );

    const viettelResult = await sendToViettel(
      acc,
      payload
    );
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
        : e?.message || "SEND_FAILED",

      detail: e?.details || null
    });
  }
}
