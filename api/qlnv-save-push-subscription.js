import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  'mailto:admin@hoantuyet.vn',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const action = req.body?.action || 'save';

    if (action === 'save') {
      return await saveSubscription(req, res);
    }

    if (action === 'send') {
      return await sendPush(req, res);
    }

    return res.status(400).json({ ok: false, error: 'Invalid action' });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

async function saveSubscription(req, res) {
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
    .schema('qlnv')
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

  return res.status(200).json({ ok: true, action: 'save' });
}

async function sendPush(req, res) {
  const {
    title,
    body,
    url,
    role,
    diadiem,
    target_manv
  } = req.body || {};

  let query = supabase
    .schema('qlnv')
    .from('push_subscriptions')
    .select('*');

  if (role) query = query.eq('role', role);
  if (diadiem) query = query.eq('diadiem', diadiem);
  if (target_manv) query = query.eq('manv', String(target_manv).trim().toUpperCase());

  const { data, error } = await query;

  if (error) throw error;

  const payload = JSON.stringify({
    title: title || 'Thông báo',
    body: body || '',
    url: url || '/qlnv/dashboard.html'
  });

  const results = [];

  for (const row of data || []) {
    try {
      await webpush.sendNotification(row.subscription, payload);
      results.push({ endpoint: row.endpoint, success: true });
    } catch (err) {
      results.push({
        endpoint: row.endpoint,
        success: false,
        error: err.message
      });
    }
  }

  return res.status(200).json({
    ok: true,
    action: 'send',
    sent: results.length,
    results
  });
}
