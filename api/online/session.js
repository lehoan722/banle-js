import {searchOnlineProducts, answerWithVerifiedProducts} from '../../lib/online_product_search.js';
import { cleanText, redactPII, summarizeProducts, makeTemplate, askGemini } from '../../lib/online_ai_helpers.js';
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
    // Cac truy van doc lap: thuc hien dong thoi, khong thay doi phan quyen.
    const [n, a, g] = await Promise.all([
        ids.length ? rows(client.from('dmnhanvien').select('user_id,manv,tennv').in('user_id', ids)) : Promise.resolve([]),
        ids.length ? rows(client.from('admin_users').select('user_id,manv,tenadmin').in('user_id', ids)) : Promise.resolve([]),
        gids.length ? rows(client.from('online_gio_anh').select('id,tieu_de,share_token,share_expires_at').in('id', gids)) : Promise.resolve([])
    ]);
    const labels = new Map([...a, ...n].map(x => [x.user_id, x])); const carts = new Map(g.map(x => [x.id, x]));
    return data.map(x => ({ ...x, phu_trach: labels.get(x.phu_trach_uid)?.manv || '', ten_phu_trach: labels.get(x.phu_trach_uid)?.tennv || labels.get(x.phu_trach_uid)?.tenadmin || '', ten_gio: carts.get(x.gio_id)?.tieu_de || '', gio_token: carts.get(x.gio_id)?.share_token || null, gio_expires_at: carts.get(x.gio_id)?.share_expires_at || null }));
}
async function choices(client, u) {
    // Chỉ lấy giỏ sở hữu theo UID đã xác minh. Giỏ Warehouse cũ không tự chuyển chủ.
    const g = await rows(client.from('online_gio_anh').select('id,tieu_de,trang_thai,created_at,updated_at').eq('owner_uid', u.uid).order('updated_at', { ascending: false }).limit(100));
    const ids = g.map(x => x.id); const c = ids.length ? await rows(client.from('online_gio_anh_ct').select('gio_id').in('gio_id', ids)) : [];
    // O(n) thay vi loc lai toan bo chi tiet cho tung gio.
    const counts = new Map();
    for (const row of c) counts.set(row.gio_id, (counts.get(row.gio_id) || 0) + 1);
    return g.map(x => ({ id: x.id, title: x.tieu_de, status: x.trang_thai, created_at: x.created_at, item_count: counts.get(x.id) || 0 }));
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


// V1.2: Moi hanh dong AI chay qua API SSO hien co, khong lo API key ra trinh duyet.
async function assistantGenerate(client,u,b,withAI=false){
 const q=cleanText(b.question,1500); if(q.length<3)throw err('Nhap cau hoi tu 3 ky tu tro len');
 const crmId=uuid(b.crm_id),cartId=uuid(b.cart_id);
 if(b.crm_id&&!crmId)throw err('Ma phien CRM khong hop le');
 if(b.cart_id&&!cartId)throw err('Ma gio khong hop le');
 let crm=null;
 if(crmId)crm=await access(client,crmId,u);
 if(cartId&&crm&&crm.gio_id!==cartId)throw err('Gio khong khop phien CRM',403);
 let items=[];
 if(cartId){const p=await preview(client,u,{p_gio_id:cartId,p_phien_id:crmId});items=p.items||[];}
 const found=await searchOnlineProducts(client,q);
 const products=found.items.length?found.items:summarizeProducts(items);
 const template=found.need.category?{...makeTemplate(q,products),answer:answerWithVerifiedProducts(q,found.items)}:makeTemplate(q,products);
 let ai=null,knowledge=[];
 if(withAI){
   // Han che chi phi moi nhan vien: toi da 30 lan AI/ngay va 5 lan/5 phut.
   const sinceDay=new Date(Date.now()-24*3600*1000).toISOString();
   const sinceFive=new Date(Date.now()-5*60*1000).toISOString();
   const counts=await Promise.all([
     client.from('online_ai_tuvan_history').select('id',{count:'exact',head:true}).eq('owner_uid',u.uid).not('ai_model','is',null).gte('created_at',sinceDay),
     client.from('online_ai_tuvan_history').select('id',{count:'exact',head:true}).eq('owner_uid',u.uid).not('ai_model','is',null).gte('created_at',sinceFive)
   ]);
   if(counts.some(x=>x.error))throw err('Khong kiem tra duoc han muc AI',500);
   if((counts[0].count||0)>=30||(counts[1].count||0)>=5)throw err('Da den han muc AI (30/ngay hoac 5/5 phut). Hay dung Tra loi nhanh.',429);
   const known=await rows(client.from('online_ai_tuvan_history').select('final_answer,intent').eq('approved_for_knowledge',true).eq('intent',template.intent).order('approved_at',{ascending:false}).limit(3));
   knowledge=known.map(x=>cleanText(x.final_answer,280)).filter(Boolean);
   ai=await askGemini({question:q,products,template:template.answer,knowledge});
 }
 // Luu cau hoi da an du lieu lien he va ket qua, khong luu cac tuyen hoi thoai goc.
 const record={owner_uid:u.uid,crm_id:crmId,cart_id:cartId,question_redacted:redactPII(q),product_context:products,intent:template.intent,template_answer:template.answer,ai_answer:ai?.answer||null,ai_model:ai?.model||null,ai_usage:ai?.usage||null,final_answer:ai?.answer||template.answer};
 const {data,error}=await client.from('online_ai_tuvan_history').insert(record).select('id,created_at').single();
 if(error)throw err('Khong luu duoc lich su AI: '+error.message,500);
 return {id:data.id,created_at:data.created_at,template:template.answer,ai:ai?.answer||null,model:ai?.model||null,usage:ai?.usage||null,intent:template.intent,has_verified_stock:found.verified&&found.items.length>0,products:found.items,search_message:found.message};
}
async function assistantHistory(client,u,b){
 const cid=uuid(b.crm_id);if(b.crm_id&&!cid)throw err('Ma phien khong hop le');
 if(cid)await access(client,cid,u);
 let query=client.from('online_ai_tuvan_history').select('id,created_at,question_redacted,intent,template_answer,ai_answer,ai_model,ai_usage,final_answer,feedback,approved_for_knowledge,owner_uid,crm_id').order('created_at',{ascending:false}).limit(40);
 if(cid)query=query.eq('crm_id',cid);
 // Chi nguoi tao xem lich su; admin xem lich su cua phien minh da duoc cap quyen neu co CRM id.
 if(!u.admin||!cid)query=query.eq('owner_uid',u.uid);
 return await rows(query);
}
async function assistantFeedback(client,u,b){
 const id=uuid(b.id);if(!id)throw err('Ma lich su khong hop le');
 const existing=await rows(client.from('online_ai_tuvan_history').select('id,owner_uid,crm_id,template_answer,ai_answer').eq('id',id).maybeSingle());
 if(!existing)throw err('Khong tim thay lich su',404);
 if(existing.owner_uid!==u.uid){if(!u.admin||!existing.crm_id)throw err('Khong co quyen sua',403);await access(client,existing.crm_id,u);}
 const fb=cleanText(b.feedback,30);
 if(!['tot','can_sua','khong_dung'].includes(fb))throw err('Danh gia khong hop le');
 const answer=cleanText(b.final_answer,2000);
 if(answer.length<5)throw err('Noi dung sau sua qua ngan');
 const patch={feedback:fb,final_answer:answer,approved_for_knowledge:false,approved_by_uid:null,approved_at:null};
 const updated=await rows(client.from('online_ai_tuvan_history').update(patch).eq('id',id).select('id'));
 if(!updated.length)throw err('Khong ghi duoc danh gia',500);
 return true;
}
async function assistantApprove(client,u,b){
 if(!u.admin)throw err('Chi Admin duoc duyet tri thuc',403);
 const id=uuid(b.id);if(!id)throw err('Ma lich su khong hop le');
 const record=await rows(client.from('online_ai_tuvan_history').select('id,feedback,final_answer').eq('id',id).maybeSingle());
 if(!record)throw err('Khong tim thay lich su',404);
 if(b.approve===true&&(record.feedback!=='tot'||!record.final_answer))throw err('Chi duyet cau tra loi da danh gia tot');
 const approved=b.approve===true;
 const changed=await rows(client.from('online_ai_tuvan_history').update({approved_for_knowledge:approved,approved_by_uid:approved?u.uid:null,approved_at:approved?new Date().toISOString():null}).eq('id',id).select('id'));
 return changed.length>0;
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
            case 'online_v13_product_search': data = await searchOnlineProducts(client,text(req.body.args?.question,500)); break;
            case 'assist_template': data = await assistantGenerate(client,u,req.body.args||{},false); break;
            case 'assist_ai': data = await assistantGenerate(client,u,req.body.args||{},true); break;
            case 'assist_history': data = await assistantHistory(client,u,req.body.args||{}); break;
            case 'assist_feedback': data = await assistantFeedback(client,u,req.body.args||{}); break;
            case 'assist_approve': data = await assistantApprove(client,u,req.body.args||{}); break;
            default: throw err('Action khong duoc cho phep', 400);
        }
        return res.status(200).json({ data });
    } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Loi server' }) }
}
