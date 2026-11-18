// HOANTUYET_NOTIFICATION_V1 - Vercel serverless API
// Employee device enrollment is password-verified because employees share a warehouse Supabase JWT.
// Do NOT trust manv/diadiem in a browser request without this independent verification.
import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url || 'https://localhost.invalid', key || 'not-configured', {auth:{persistSession:false,autoRefreshToken:false}});
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const clean = v => String(v ?? '').trim();
const short = (v,n=256) => clean(v).slice(0,n);
const branch = v => ['cs1','cs2'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null;
const staff = v => /^[A-Z0-9_\-]{1,40}$/.test(String(v||'').toUpperCase()) ? String(v).toUpperCase() : null;
const fail = (res,status,msg) => res.status(status).json({ok:false,error:msg});
const cors = res => {res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');};
function getToken(req){return clean(req.headers.authorization).replace(/^Bearer\s+/i,'');}
async function authDevice(req){
  const token=getToken(req);if(!/^[a-f0-9]{64}$/.test(token))return null;
  const {data}=await db.from('ht_notify_v1_devices').select('id,manv,diadiem,active')
    .eq('token_hash',sha(token)).eq('active',true).maybeSingle();return data||null;
}
async function adminUser(req){
  const token=getToken(req);if(!token)return null;
  const {data:identity,error}=await db.auth.getUser(token);
  if(error||!identity?.user?.id)return null;
  const {data}=await db.from('admin_users').select('user_id,active').eq('user_id',identity.user.id).eq('active',true).maybeSingle();
  return data ? identity.user : null;
}
function pushReady(){return !!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY);}
function setupWebPush(){
  if(!pushReady())throw Error('Thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY trên Vercel');
  webpush.setVapidDetails('mailto:admin@hoantuyet.vn',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
}
async function sendEvent(event){
  setupWebPush();
  let q=db.from('ht_notify_v1_devices').select('id,endpoint,subscription').eq('active',true);
  if(event.target_kind==='employee')q=q.eq('manv',event.target_manv).eq('diadiem',event.diadiem);
  if(event.target_kind==='branch')q=q.eq('diadiem',event.diadiem);
  const {data:devices,error}=await q.limit(300);if(error)throw error;
  let sent=0,failed=0;
  for(const d of devices||[]){
    if (!d.subscription?.endpoint) continue;
    try {
      await webpush.sendNotification(d.subscription,JSON.stringify({title:event.title,body:event.body,url:event.url,event_key:event.event_key}),{TTL:3600});
      sent++;
    }catch(e){failed++;
      if(e.statusCode===404||e.statusCode===410){await db.from('ht_notify_v1_devices').update({active:false}).eq('id',d.id);}
    }
  }
  await db.from('ht_notify_v1_events').update({dispatched_at:new Date().toISOString(),push_attempts:(event.push_attempts||0)+1}).eq('id',event.id);
  return {sent,failed,devices:(devices||[]).length};
}
async function enroll(req,res){
  const manv=staff(req.body?.manv),diadiem=branch(req.body?.diadiem);
  const password=clean(req.body?.password);
  const sub=req.body?.subscription;
  const withPush=!!sub;
  if(!manv||!diadiem||!password||password.length>200||(withPush&&(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth||!/^https:\/\//i.test(sub.endpoint))))return fail(res,400,'Thiếu thông tin thiết bị hoặc tài khoản');
  const ip=short((req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],100);
  const attemptHash=sha('HTNOTIFY|'+ip+'|'+manv+'|'+diadiem);
  const after=new Date(Date.now()-15*60000).toISOString();
  const {count}=await db.from('ht_notify_v1_attempts').select('*',{count:'exact',head:true}).eq('attempt_hash',attemptHash).gte('created_at',after);
  if((count||0)>=5)return fail(res,429,'Thử quá 5 lần, vui lòng thử lại sau 15 phút');
  const {data, error}=await db.from('dmnhanvien').select('*').ilike('manv',manv).limit(1);
  if(error)return fail(res,500,'Không kiểm tra được nhân viên');
  const row=data?.[0];const stored=clean(row?.matkhau??row?.matkhaunv??row?.password??row?.pass??row?.mat_khau);
  const a=Buffer.from(password),b=Buffer.from(stored);
  const ok=!!row&&!!stored&&a.length===b.length&&crypto.timingSafeEqual(a,b)&&row.active!==false&&row.trangthai!==false;
  if(!ok){await db.from('ht_notify_v1_attempts').insert({attempt_hash:attemptHash});return fail(res,401,'Mã nhân viên hoặc mật khẩu chưa đúng');}
  const rawToken=crypto.randomBytes(32).toString('hex');
  const payload={manv,diadiem,token_hash:sha(rawToken),endpoint:withPush?short(sub.endpoint,2000):'inbox:'+crypto.randomUUID(),subscription:sub||{},active:true,user_agent:short(req.headers['user-agent'],500),updated_at:new Date().toISOString()};
  const {error:saveError}=await db.from('ht_notify_v1_devices').upsert(payload,{onConflict:'endpoint'});
  if(saveError)return fail(res,500,'Không lưu được thiết bị: '+saveError.message);
  return res.json({ok:true,device_token:rawToken,manv,diadiem});
}
async function inbox(req,res){
  const device=await authDevice(req);if(!device)return fail(res,401,'Thiết bị chưa đăng ký hoặc phiên đã hết hạn');
  const s=device.manv,b=device.diadiem;
  const filter=`target_kind.eq.all,and(target_kind.eq.branch,diadiem.eq.${b}),and(target_kind.eq.employee,target_manv.eq.${s},diadiem.eq.${b})`;
  const {data:events,error}=await db.from('ht_notify_v1_events').select('id,event_type,title,body,url,created_at')
    .or(filter).order('created_at',{ascending:false}).limit(80);
  if(error)return fail(res,500,'Không đọc được thông báo');
  const ids=(events||[]).map(e=>e.id);let read=[];
  if(ids.length){const r=await db.from('ht_notify_v1_reads').select('event_id').eq('manv',s).eq('diadiem',b).in('event_id',ids);read=r.data||[];}
  const readIds=new Set(read.map(r=>r.event_id));
  return res.json({ok:true,items:(events||[]).map(e=>({...e,is_read:readIds.has(e.id)}))});
}
async function enablePush(req,res){
  const d=await authDevice(req);if(!d)return fail(res,401,'Thiết bị chưa đăng ký');
  const sub=req.body?.subscription;
  if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth||!/^https:\/\//i.test(sub.endpoint))return fail(res,400,'Subscription không hợp lệ');
  const {error}=await db.from('ht_notify_v1_devices').update({endpoint:short(sub.endpoint,2000),subscription:sub,updated_at:new Date().toISOString()}).eq('id',d.id);
  if(error)return fail(res,500,'Lưu Push không thành công: '+error.message);
  return res.json({ok:true});
}
async function markRead(req,res){
  const d=await authDevice(req);if(!d)return fail(res,401,'Thiết bị chưa đăng ký');
  const id=Number(req.body?.id);if(!Number.isSafeInteger(id)||id<1)return fail(res,400,'Mã thông báo không hợp lệ');
  const {data:row}=await db.from('ht_notify_v1_events').select('id,target_kind,target_manv,diadiem').eq('id',id).maybeSingle();
  if(!row || !(row.target_kind==='all'||(row.target_kind==='branch'&&row.diadiem===d.diadiem)||(row.target_kind==='employee'&&row.diadiem===d.diadiem&&row.target_manv===d.manv)))return fail(res,403,'Không có quyền đọc thông báo này');
  const {error}=await db.from('ht_notify_v1_reads').upsert({event_id:id,manv:d.manv,diadiem:d.diadiem},{onConflict:'event_id,manv,diadiem'});
  if(error)return fail(res,500,'Không lưu được trạng thái đọc');return res.json({ok:true});
}
async function dispatchTask(req,res){
  if(!await adminUser(req))return fail(res,403,'Chỉ quản lý có quyền gửi thông báo giao việc');
  const id=Number(req.body?.task_id);if(!Number.isSafeInteger(id)||id<1)return fail(res,400,'Mã nhiệm vụ không hợp lệ');
  const {data:event}=await db.from('ht_notify_v1_events').select('*').eq('event_key','TASK_ASSIGNED:'+id).maybeSingle();
  if(!event)return fail(res,404,'Chưa có sự kiện từ nhiệm vụ V3');
  if(event.dispatched_at)return res.json({ok:true,already_sent:true});
  const result=await sendEvent(event);return res.json({ok:true,...result});
}
// Future reusable API: admin creates a notification for employee, branch or all via a verified token.
async function publish(req,res){
  if(!await adminUser(req))return fail(res,403,'Chỉ quản lý được phát thông báo');
  const p=req.body||{};const kind=short(p.target_kind,20), b=branch(p.diadiem), m=staff(p.target_manv);
  if(!['employee','branch','all'].includes(kind)||((kind==='employee'||kind==='branch')&&!b)||(kind==='employee'&&!m))return fail(res,400,'Đối tượng nhận không hợp lệ');
  const title=short(p.title,120),body=short(p.body,500),path=short(p.url,300);
  if(!title||!path.startsWith('/')||path.startsWith('//'))return fail(res,400,'Tiêu đề hoặc đường dẫn không hợp lệ');
  const eventKey=short(p.event_key,150);if(!eventKey)return fail(res,400,'Phải có event_key để chống gửi trùng');
  const payload={event_type:short(p.event_type,50)||'GENERAL',event_key:eventKey,target_kind:kind,target_manv:kind==='employee'?m:null,diadiem:kind==='all'?null:b,title,body,url:path};
  const {data:event,error}=await db.from('ht_notify_v1_events').upsert(payload,{onConflict:'event_key',ignoreDuplicates:true}).select('*').maybeSingle();
  if(error)return fail(res,500,error.message);
  // On duplicate, fetch the existing event; never overwrite previously established recipients.
  const e=event||(await db.from('ht_notify_v1_events').select('*').eq('event_key',eventKey).single()).data;
  if(!e)return fail(res,500,'Không đọc được sự kiện');
  if(e.dispatched_at)return res.json({ok:true,already_sent:true});
  const result=await sendEvent(e);return res.json({ok:true,event_id:e.id,...result});
}
export default async function handler(req,res){
  cors(res);
  if(!url||!key)return fail(res,500,'Thiếu cấu hình Supabase trên Vercel');
  if(req.method==='GET'&&req.query?.action==='config')return res.json({ok:true,vapid_public_key:process.env.VAPID_PUBLIC_KEY||''});
  if(req.method==='GET'&&req.query?.action==='inbox')return inbox(req,res);
  if(req.method!=='POST')return fail(res,405,'Method not allowed');
  if(Number(req.headers['content-length']||0)>16000)return fail(res,413,'Yêu cầu quá lớn');
  try {
    const a=String(req.query?.action||'');
    if(a==='enroll')return await enroll(req,res);
    if(a==='read')return await markRead(req,res);
    if(a==='enable-push')return await enablePush(req,res);
    if(a==='dispatch-task')return await dispatchTask(req,res);
    if(a==='publish')return await publish(req,res);
    return fail(res,400,'Action không hợp lệ');
  }catch(e){console.error('[HT_NOTIFY_V1]',e?.message);return fail(res,500,'Thông báo gặp lỗi máy chủ');}
}
