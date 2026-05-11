import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Webhook alive" });
  }

  try {
    const body = req.body || {};

    console.log("ZALO WEBHOOK BODY:", JSON.stringify(body));

    const eventName = body.event_name || "";

    const sender = body.sender || {};
    const recipient = body.recipient || {};
    const messageObj = body.message || {};

    const zaloUserId =
      sender.id ||
      sender.user_id ||
      body.user_id ||
      null;

    const userIdByApp =
      sender.user_id_by_app ||
      body.user_id_by_app ||
      null;

    const messageText =
      messageObj.text ||
      body.text ||
      null;

    if (!zaloUserId && !userIdByApp) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "No Zalo user id"
      });
    }

    const { error } = await supabase
      .from("zalo_users")
      .upsert(
        {
          zalo_user_id: zaloUserId ? String(zaloUserId) : null,
          user_id_by_app: userIdByApp ? String(userIdByApp) : null,
          last_event: eventName,
          last_message: messageText,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "zalo_user_id"
        }
      );

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      zalo_user_id: zaloUserId,
      user_id_by_app: userIdByApp
    });
  } catch (err) {
    console.error("ZALO WEBHOOK ERROR:", err);

    return res.status(200).json({
      ok: false,
      error: err.message
    });
  }
}
