import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false });
    }

    const {
      manv,
      diadiem,
      role,
      subscription
    } = req.body || {};

    if (!subscription?.endpoint) {
      return res.status(400).json({
        ok: false,
        error: 'Missing subscription'
      });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        manv,
        diadiem,
        role,
        endpoint: subscription.endpoint,
        subscription,
        user_agent: req.headers['user-agent']
      }, {
        onConflict: 'endpoint'
      });

    if (error) throw error;

    res.status(200).json({ ok: true });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}