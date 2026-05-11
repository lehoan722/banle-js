export default async function handler(req, res) {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu code. Hãy gọi /api/zalo/get-token?code=AUTHORIZATION_CODE"
      });
    }

    const response = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: process.env.ZALO_OA_SECRET_KEY
      },
      body: new URLSearchParams({
        code,
        app_id: process.env.ZALO_APP_ID,
        grant_type: "authorization_code"
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
