// /api/zalo/send.js
// V1.2.1: GIU NGUYEN gui Zalo + them action=translate cho SigLIP Lab.
// Khong tao serverless function moi.

const translateRate = new Map();

function allowTranslate(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const row = translateRate.get(ip) || { start: now, count: 0 };
  if (now - row.start > 60_000) { row.start = now; row.count = 0; }
  row.count += 1;
  translateRate.set(ip, row);
  return row.count <= 30;
}

async function handleTranslate(req, res) {
  if (!allowTranslate(req)) return res.status(429).json({ ok:false, error:"Qua nhieu yeu cau dich. Thu lai sau 1 phut." });

  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return res.status(503).json({ ok:false, error:"Chua cau hinh GOOGLE_TRANSLATE_API_KEY tren Vercel" });

  const text = String(req.body?.text || "").trim();
  const source = String(req.body?.source || "vi").trim() || "vi";
  const target = String(req.body?.target || "en").trim() || "en";
  if (!text) return res.status(400).json({ ok:false, error:"Thieu text" });
  if (text.length > 500) return res.status(400).json({ ok:false, error:"Text qua dai (toi da 500 ky tu)" });

  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  const body = new URLSearchParams();
  body.set("q", text);
  body.set("source", source);
  body.set("target", target);
  body.set("format", "text");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({ ok:false, error:data?.error?.message || "Google Translation failed", google:data });
  }

  const translatedText = data?.data?.translations?.[0]?.translatedText || "";
  return res.status(200).json({ ok:true, translatedText, source, target });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    // === NHANH MOI: SigLIP Lab -> Google Translate ===
    if (body.action === "translate") {
      return await handleTranslate(req, res);
    }

    // === NHANH CU GIU NGUYEN: gui tin Zalo OA ===
    const { zalo_user_id, message } = body;

    if (!zalo_user_id || !message) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu zalo_user_id hoặc message"
      });
    }

    const response = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: process.env.ZALO_OA_ACCESS_TOKEN
      },
      body: JSON.stringify({
        recipient: { user_id: zalo_user_id },
        message: { text: message }
      })
    });

    const data = await response.json();

    return res.status(200).json({
      ok: true,
      zalo_response: data
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
