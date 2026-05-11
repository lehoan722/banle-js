export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { zalo_user_id, message } = req.body || {};

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
        recipient: {
          user_id: zalo_user_id
        },
        message: {
          text: message
        }
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
