import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
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
            return res.status(405).json({
                ok: false
            });
        }

        const {
            title,
            body,
            url,
            role,
            diadiem
        } = req.body || {};

        const query = supabase
            .schema('qlnv')
            .from('push_subscriptions')
            .select('*');

        if (role) {
            query.eq('role', role);
        }

        if (diadiem) {
            query.eq('diadiem', diadiem);
        }

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

                await webpush.sendNotification(
                    row.subscription,
                    payload
                );

                results.push({
                    endpoint: row.endpoint,
                    success: true
                });

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
            sent: results.length,
            results
        });

    } catch (err) {

        return res.status(500).json({
            ok: false,
            error: err.message
        });

    }
}
