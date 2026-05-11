export default async function handler(req, res) {

  try {

    const appId = process.env.ZALO_APP_ID;
    const secretKey = process.env.ZALO_OA_SECRET_KEY;

    const response = await fetch(
      "https://oauth.zaloapp.com/v4/oa/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          secret_key: secretKey
        },
        body: new URLSearchParams({
          app_id: appId,
          grant_type: "client_credentials"
        })
      }
    );

    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }

}
