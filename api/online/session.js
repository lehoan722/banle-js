import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COOKIE = 'ht_online_sso';
const channels = new Set(['facebook', 'zalo', 'zalo_oa', 'instagram', 'dien_thoai', 'khac']);
const statuses = new Set(['moi', 'dang_tu_van', 'da_gui_mau', 'cho_khach', 'da_chot', 'khong_chot']);
const uidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err = (message, status = 400) => Object.assign(new Error(message), { status });
function parseCookie(req) { const match = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')); return match ? match.slice(COOKIE.length + 1) : null }
function verifyCookie(req) {
    const secret = process.env.ONLINE_CRM_SESSION_SECRET;
    if (!secret || secret.length < 32) return null;
    const cookie = parseCookie(req); if (!cookie) return null;
    const [body, sig, ...extra] = cookie.split('.'); if (!body || !sig || extra.length) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest(); let given;
    try { given = Buffer.from(sig, 'base64url') } catch { return null }
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (p.v !== 1 || !['cs1', 'cs2'].includes(p.cs) || !p.manv || !/^[A-Z0-9_-]{1,50}$/.test(p.manv) || !Number.isInteger(p.exp) || p.exp <= Date.now() / 1000) return null;
        return p;
    } catch { return null }
}
const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
function uuid(v) { return typeof v === 'string' && uidRe.test(v) ? v : null }

function assertOrigin(req) {
    const origin = String(req.headers.origin || "").trim();

    // Chỉ cho phép các tên miền chính thức của Hoàn Tuyết.
    const allowedOrigins = new Set([
        "https://hoantuyet.vn",
        "https://www.hoantuyet.vn",
        "https://app.hoantuyet.vn"
    ]);

    if (!origin) return false;

    try {
        const url = new globalThis.URL(origin);

        // Không chấp nhận đường dẫn hoặc thông tin bất thường.
        if (url.username || url.password) return false;
        if (url.pathname !== "/" || url.search || url.hash) {
            return false;
        }

        return allowedOrigins.has(url.origin);
    } catch (error) {
        return false;
    }
}

function db() { if (!URL || !KEY) throw err('Chua cau hinh Supabase server', 500); return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }
async function identity(req, client) {
    const p = verifyCookie(req);
    if (p) {
        const { data: n, error: e } = await client.from('dmnhanvien').select('manv,tennv,user_id,trangthai').eq('manv', p.manv).maybeSingle();
        if (e || !n || n.trangthai !== true || !n.user_id) throw err('Nhan vien chua hoat dong hoac chua co user_id', 403);
        return { uid: n.user_id, manv: n.manv, name: n.tennv, admin: false, cs: p.cs };
    }
    const header = String(req.headers.authorization || ''); if (!header.startsWith('Bearer ')) throw err('Chua dang nhap, hay dung login ban le', 401);
    const { data: { user }, error: e } = await client.auth.getUser(header.slice(7)); if (e || !user) throw err('Phien admin khong hop le', 401);
    const { data: a, error: ea } = await client.from('admin_users').select('manv,tenadmin,active').eq('user_id', user.id).maybeSingle();
    if (ea || !a || a.active !== true) throw err('Khong co quyen Admin', 403);
    return { uid: user.id, manv: a.manv || 'ADMIN', name: a.tenadmin, admin: true };
}
async function rows(q) { const { data, error } = await q; if (error) throw err(error.message, 500); return data }
async function access(client, id, u) { const v = await rows(client.from('online_crm_tuvan').select('*').eq('id', id).maybeSingle()); if (!v) throw err('Khong tim thay phien', 404); if (!u.admin && v.created_by_uid !== u.uid && v.phu_trach_uid !== u.uid) throw err('Khong co quyen xu ly phien', 403); return v }
async function list(client, u) {
    let q = client.from('online_crm_tuvan').select('*').order('updated_at', { ascending: false }).limit(1000);
    if (!u.admin) q = q.or(`created_by_uid.eq.${u.uid},phu_trach_uid.eq.${u.uid}`);
    const data = await rows(q); const ids = [...new Set(data.map(r => r.phu_trach_uid).filter(Boolean))]; const gids = [...new Set(data.map(r => r.gio_id).filter(Boolean))];
    const n = ids.length ? await rows(client.from('dmnhanvien').select('user_id,manv,tennv').in('user_id', ids)) : [];
    const a = ids.length ? await rows(client.from('admin_users').select('user_id,manv,tenadmin').in('user_id', ids)) : [];
    const g = gids.length ? await rows(client.from('online_gio_anh').select('id,tieu_de,share_token,share_expires_at').in('id', gids)) : [];
    const labels = new Map([...a, ...n].map(x => [x.user_id, x])); const carts = new Map(g.map(x => [x.id, x]));
    return data.map(x => ({ ...x, phu_trach: labels.get(x.phu_trach_uid)?.manv || '', ten_phu_trach: labels.get(x.phu_trach_uid)?.tennv || labels.get(x.phu_trach_uid)?.tenadmin || '', ten_gio: carts.get(x.gio_id)?.tieu_de || '', gio_token: carts.get(x.gio_id)?.share_token || null, gio_expires_at: carts.get(x.gio_id)?.share_expires_at || null }));
}
async function choices(client, u) {
    // Chỉ lấy giỏ sở hữu theo UID đã xác minh. Giỏ Warehouse cũ không tự chuyển chủ.
    const g = await rows(client.from('online_gio_anh').select('id,tieu_de,trang_thai,created_at,updated_at').eq('owner_uid', u.uid).order('updated_at', { ascending: false }).limit(100));
    const ids = g.map(x => x.id); const c = ids.length ? await rows(client.from('online_gio_anh_ct').select('gio_id').in('gio_id', ids)) : [];
    return g.map(x => ({ id: x.id, title: x.tieu_de, status: x.trang_thai, created_at: x.created_at, item_count: c.filter(y => y.gio_id === x.id).length }));
}
async function save(client, u, b) {
    const old = uuid(b.p_id) ? await access(client, b.p_id, u) : null;
    const name = text(b.p_ten_khach, 121), contact = text(b.p_lien_he, 151), url = text(b.p_duong_dan_chat, 501), need = text(b.p_nhu_cau, 1001), note = text(b.p_ghi_chu, 1201);
    if (!name || name.length > 120 || contact.length > 150 || need.length > 1000 || note.length > 1200 || url.length > 500 || (!channels.has(b.p_kenh)) || !statuses.has(b.p_trang_thai)) throw err('Thong tin tu van khong hop le');
    if (url && !/^https:\/\/\S+$/i.test(url)) throw err('Link hoi thoai phai la HTTPS');
    const cid = uuid(b.p_gio_id); if (b.p_gio_id && !cid) throw err('ID gio khong hop le');
    if (cid && cid !== old?.gio_id) { const own = await rows(client.from('online_gio_anh').select('id').eq('id', cid).eq('owner_uid', u.uid).maybeSingle()); if (!own) throw err('Chi duoc gan gio do chinh tai khoan tao', 403) }
    let assignee = old?.phu_trach_uid || u.uid;
    if (u.admin) { assignee = uuid(b.p_phu_trach_uid) || assignee; if (assignee !== u.uid) { const n = await rows(client.from('dmnhanvien').select('user_id').eq('user_id', assignee).eq('trangthai', true).maybeSingle()); if (!n) throw err('Nhan vien duoc giao khong hop le') } }
    let date = null; if (b.p_ngay_hen) { date = new Date(b.p_ngay_hen).toISOString() }
    const payload = { phu_trach_uid: assignee, ten_khach: name, lien_he: contact, duong_dan_chat: url, kenh: b.p_kenh, nhu_cau: need, trang_thai: b.p_trang_thai, gio_id: cid, ghi_chu: note, ngay_hen: date, updated_at: new Date().toISOString() };
    const q = old ? client.from('online_crm_tuvan').update(payload).eq('id', old.id).select('id').single() : client.from('online_crm_tuvan').insert({ ...payload, created_by_uid: u.uid }).select('id').single();
    return (await rows(q)).id;
}
async function preview(client, u, b) {
    const gid = uuid(b.p_gio_id); if (!gid) throw err('ID gio khong hop le');
    const g = await rows(client.from('online_gio_anh').select('id,tieu_de,owner_uid').eq('id', gid).maybeSingle()); if (!g) throw err('Khong tim thay gio', 404);
    if (g.owner_uid !== u.uid) { const id = uuid(b.p_phien_id); if (!id) throw err('Gio chua duoc gan cho phien', 403); const v = await access(client, id, u); if (v.gio_id !== gid) throw err('Gio khong thuoc phien', 403) }
    const items = await rows(client.from('online_gio_anh_ct').select('masp,tensp,size,gia_bao,ghichu,stt').eq('gio_id', gid).order('stt'));
    return { id: gid, title: g.tieu_de, items };
}

async function cartList(client, u) { return await rows(client.from('online_gio_anh').select('id,tieu_de,kenh,trang_thai,created_at,diadiem,updated_at,share_token,share_expires_at').eq('owner_uid', u.uid).order('updated_at', { ascending: false }).limit(100)) }
async function cartDetail(client, u, id) {
    const cid = uuid(id); if (!cid) throw err('ID gio khong hop le');
    const g = await rows(client.from('online_gio_anh').select('id,tieu_de,kenh,trang_thai,created_at,diadiem,updated_at,share_token,share_expires_at,owner_uid').eq('id', cid).eq('owner_uid', u.uid).maybeSingle());
    if (!g) throw err('Gio khong thuoc tai khoan', 403);
    const items = await rows(client.from('online_gio_anh_ct').select('masp,tensp,size,gia_bao,ghichu,stt').eq('gio_id', cid).order('stt'));
    delete g.owner_uid; return { ...g, items };
}
async function cartSave(client, u, a) {
    const i = Array.isArray(a.p_items) ? a.p_items : null;
    if (!i || i.length < 1 || i.length > 50) throw err('Gio phai co 1-50 san pham');
    if (!['facebook', 'zalo', 'khac'].includes(a.p_kenh) || !['cs1', 'cs2'].includes(a.p_diadiem)) throw err('Kenh hoac co so khong hop le');
    const title = text(a.p_tieu_de, 151); if (!title || title.length > 150) throw err('Tieu de khong hop le');
    const clean = i.map(p => ({ masp: text(p.masp, 101).toUpperCase(), size: text(p.size, 31), ghichu: text(p.ghichu, 301) }));
    if (clean.some(p => !p.masp || p.masp.length > 100 || p.size.length > 30 || p.ghichu.length > 300)) throw err('San pham khong hop le');
    if (a.p_id) { const g = await rows(client.from('online_gio_anh').select('id').eq('id', uuid(a.p_id) || '00000000-0000-0000-0000-000000000000').eq('owner_uid', u.uid).maybeSingle()); if (!g) throw err('Khong du quyen sua gio', 403) }
    const { data, error } = await client.rpc('online_sso_luu_gio', { p_owner_uid: u.uid, p_id: uuid(a.p_id), p_tieu_de: title, p_kenh: a.p_kenh, p_diadiem: a.p_diadiem, p_items: clean });
    if (error) throw err(error.message, 400); return data;
}
async function cartAction(client, u, action, id) {
    const cid = uuid(id); if (!cid) throw err('ID gio khong hop le');
    const g = await rows(client.from('online_gio_anh').select('id').eq('id', cid).eq('owner_uid', u.uid).maybeSingle()); if (!g) throw err('Khong co quyen voi gio', 403);
    if (action === 'share') {
        const any = await rows(client.from('online_gio_anh_ct').select('id').eq('gio_id', cid).limit(1)); if (!any.length) throw err('Gio trong');
        const token = crypto.randomUUID(); await rows(client.from('online_gio_anh').update({ share_token: token, share_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), trang_thai: 'chia_se', updated_at: new Date().toISOString() }).eq('id', cid)); return token;
    }
    const updated = await rows(client.from('online_gio_anh').update({ share_token: null, share_expires_at: null, trang_thai: 'thu_hoi', updated_at: new Date().toISOString() }).eq('id', cid).select('id')); return updated.length > 0;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!assertOrigin(req)) return res.status(403).json({ error: 'Origin khong hop le' });
    try {
        const action = String(req.body?.action || '');
        if (action === 'logout') { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/online; Max-Age=0`); return res.status(200).json({ ok: true }) }
        const client = db(), u = await identity(req, client); let data;
        switch (action) {
            case 'identity': data = { id: u.uid, manv: u.manv, name: u.name, admin: u.admin }; break;
            case 'online_v11_admin_ok': data = u.admin; break;
            case 'online_v1_staff_ok': data = true; break;
            case 'online_v11_list': data = await list(client, u); break;
            case 'online_v11_staff_choices': if (!u.admin) throw err('Chi Admin duoc phan cong', 403); data = (await rows(client.from('dmnhanvien').select('manv,tennv,user_id').eq('trangthai', true).not('user_id', 'is', null).order('manv'))).map(x => ({ manv: x.manv, tennv: x.tennv, uid: x.user_id })); break;
            case 'online_v11_cart_choices': data = await choices(client, u); break;
            case 'online_v11_save': data = await save(client, u, req.body.args || {}); break;
            case 'online_v11_cart_preview': data = await preview(client, u, req.body.args || {}); break;
            case 'cart_list': data = await cartList(client, u); break;
            case 'cart_detail': data = await cartDetail(client, u, req.body.args?.id); break;
            case 'cart_save': data = await cartSave(client, u, req.body.args || {}); break;
            case 'cart_share': data = await cartAction(client, u, 'share', req.body.args?.id); break;
            case 'cart_revoke': data = await cartAction(client, u, 'revoke', req.body.args?.id); break;
            default: throw err('Action khong duoc cho phep', 400);
        }
        return res.status(200).json({ data });
    } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Loi server' }) }
}
