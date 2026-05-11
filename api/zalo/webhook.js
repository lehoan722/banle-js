export default async function handler(req, res) {

  try {

    console.log("ZALO WEBHOOK");

    return res.status(200).json({
      ok: true
    });

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }

}
