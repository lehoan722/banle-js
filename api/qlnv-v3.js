// HOANTUYET QLNV V3 -- isolated employee task API.
// Keep warehouse Supabase auth and shared authModule.js untouched.
import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const SUPABASE_URL=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET=process.env.QLNV_V3_SESSION_SECRET;
const COOKIE='ht_qlnv_v3';
const TTL=60*60; // 1 hour, requires employee-password login again after expiry
const MAX_IMAGE_BYTES=6*1024*1024;
const db=SUPABASE_URL&&KEY?createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const clean=x=>String(x??'').trim();
const person=x=>/^[A-Z0-9_-]{1,40}$/.test(clean(x).toUpperCase())?clean(x).toUpperCase():null;
const branch=x=>['cs1','cs2'].includes(clean(x).toLowerCase())?clean(x).toLowerCase():null;
const error=(res,status,message)=>res.status(status).json({ok:false,error:message});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const hmac=x=>crypto.createHmac('sha256',SECRET).update(x).digest('hex');
const safeEq=(a,b)=>{const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function setCookie(res,value,maxAge){res.setHeader('Set-Cookie',`${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/qlnv-v3; Max-Age=${maxAge}`);}
function readCookie(req){const m=String(req.headers.cookie||'').match(/(?:^|;\s*)ht_qlnv_v3=([^;]+)/);return m?.[1]||'';}
function createTicket(manv,site){const payload=Buffer.from(JSON.stringify({m:manv,b:site,exp:Date.now()+TTL*1000,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');return payload+'.'+hmac(payload);}
function ticket(req){const raw=readCookie(req);const [p,s,...extras]=raw.split('.');if(extras.length||!p||!s||!/^[a-f0-9]{64}$/.test(s)||!safeEq(s,hmac(p)))return null;
 try{const x=JSON.parse(Buffer.from(p,'base64url').toString());if(!person(x.m)||!branch(x.b)||x.exp<Date.now()||x.exp>Date.now()+TTL*1000)return null;return {manv:person(x.m),diadiem:branch(x.b)};}catch{return null;}}
async function activeStaff(manv){const r=await db.from('dmnhanvien').select('manv,trangthai,matkhau').eq('manv',manv).maybeSingle();if(r.error)throw Error('Không kiểm tra được nhân viên');return r.data;}
async function auth(req){const t=ticket(req);if(!t)return null;const row=await activeStaff(t.manv);if(!row||row.trangthai===false)return null;return t;}
// Allow only our two canonical production hosts (with/without www).
// Requests must originate from our site AND target an approved host.
// Vercel preview is accepted only when the exact hostname is this deployment's VERCEL_URL.
// Diagnostic build: do not weaken origin validation. Expose only a short rejection code.
const API_BUILD='20261125-allow-app-hoantuyet-v4';
function originCheck(req){
 const rawOrigin=String(req.headers.origin||'');
 const rawHost=String(req.headers.host||'').toLowerCase();
 const marker=req.headers['x-qlnv-v3'];
 if(marker!=='1')return 'missing_custom_header';
 if(!rawOrigin)return 'missing_origin';
 if(!rawHost)return 'missing_host';
 try{
  const o=new URL(rawOrigin);
  if(o.protocol!=='https:'||o.username||o.password||o.port)return 'invalid_origin_protocol';
  const allowed=new Set(['app.hoantuyet.vn','hoantuyet.vn','www.hoantuyet.vn']);
  const deployment=String(process.env.VERCEL_URL||'').toLowerCase();
  if(deployment&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/.test(deployment))allowed.add(deployment);
  if(!allowed.has(o.hostname.toLowerCase()))return 'origin_not_allowed';
  if(!allowed.has(rawHost))return 'host_not_allowed';
  return null;
 }catch{return 'invalid_origin';}
}

function ip(req){return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();}
async function login(req,res){const manv=person(req.body?.manv),b=branch(req.body?.diadiem),password=clean(req.body?.password);
 if(!manv||!b||!password||password.length>200)return error(res,400,'Nhập đúng mã nhân viên, cơ sở và mật khẩu');
 // Reuse existing persistent attempt table; fail closed when it cannot be read.
 const attemptHash=hash('QLNV_V3|'+ip(req)+'|'+manv+'|'+b);
 const since=new Date(Date.now()-15*60000).toISOString();
 const check=await db.from('ht_notify_v1_attempts').select('*',{count:'exact',head:true}).eq('attempt_hash',attemptHash).gte('created_at',since);
 if(check.error)return error(res,503,'Chưa kiểm tra được giới hạn đăng nhập, vui lòng thử lại');
 if((check.count||0)>=5)return error(res,429,'Tài khoản/IP bị khóa thử trong 15 phút');
 const row=await activeStaff(manv);
 const correct=!!row&&row.trangthai!==false&&!!row.matkhau&&safeEq(password,String(row.matkhau).trim());
 if(!correct){const f=await db.from('ht_notify_v1_attempts').insert({attempt_hash:attemptHash});if(f.error)console.error('qlnv-v3 login attempts',f.error.message);return error(res,401,'Mã nhân viên hoặc mật khẩu không đúng');}
 setCookie(res,createTicket(manv,b),TTL);return res.json({ok:true,manv,diadiem:b,expires_in:TTL});
}
async function assigned(t,id){if(!Number.isSafeInteger(id)||id<1)return null;
 const r=await db.schema('qlnv').from('task_v3_meta').select('*').eq('task_id',id).eq('assigned_to',t.manv).eq('diadiem',t.diadiem).maybeSingle();if(r.error)throw Error(r.error.message);return r.data;}
async function task(id,t){const r=await db.schema('qlnv').from('tasks').select('*').eq('id',id).eq('assigned_to',t.manv).eq('diadiem',t.diadiem).maybeSingle();if(r.error)throw Error(r.error.message);return r.data;}
async function list(t,res){const now=new Date();const vn=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh'}));const since=new Date(Date.UTC(vn.getFullYear(),vn.getMonth(),vn.getDate(),-7)).toISOString();
 const base=()=>db.schema('qlnv').from('task_v3_meta').select('*').eq('assigned_to',t.manv).eq('diadiem',t.diadiem);
 const rr=await Promise.all([base().gte('created_at',since).order('created_at',{ascending:false}).limit(300),base().is('reported_at',null).order('created_at',{ascending:false}).limit(300),base().gte('reported_at',since).order('reported_at',{ascending:false}).limit(300)]);
 for(const r of rr)if(r.error)throw Error(r.error.message);
 const uniq=new Map();rr.forEach(r=>(r.data||[]).forEach(m=>uniq.set(m.task_id,m)));
 const meta=[...uniq.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));let tasks=[];
 if(meta.length){const r=await db.schema('qlnv').from('tasks').select('id,title,description,status,created_at').in('id',meta.map(x=>x.task_id)).eq('assigned_to',t.manv).eq('diadiem',t.diadiem);if(r.error)throw Error(r.error.message);tasks=r.data||[];}
 const by=new Map(tasks.map(x=>[x.id,x]));return res.json({ok:true,items:meta.filter(m=>by.has(m.task_id)&&by.get(m.task_id).status!=='cancelled').map(m=>({...m,task:by.get(m.task_id)}))});
}
async function upload(t,body,res){const id=Number(body?.task_id),kind=clean(body?.kind);if(!['before','after'].includes(kind))return error(res,400,'Loại ảnh không hợp lệ');const m=await assigned(t,id),tk=await task(id,t);if(!m||!tk||tk.status==='cancelled')return error(res,403,'Không có quyền với nhiệm vụ');
 if((kind==='before'&&m.started_at)||(kind==='after'&&(!m.started_at||m.reported_at)))return error(res,409,'Trạng thái nhiệm vụ không cho tải ảnh');
 const mime=clean(body?.mime),raw=clean(body?.base64);if(!['image/jpeg','image/png','image/webp'].includes(mime)||raw.length>MAX_IMAGE_BYTES*1.4+100||!raw)return error(res,400,'Ảnh không hợp lệ hoặc vượt 6 MB');
 const bytes=Buffer.from(raw,'base64');if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)return error(res,413,'Ảnh vượt 6 MB');
 const jpg=bytes[0]===0xff&&bytes[1]===0xd8;const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!(mime==='image/jpeg'&&jpg||mime==='image/png'&&png||mime==='image/webp'&&webp))return error(res,400,'Nội dung ảnh không đúng định dạng');
 const ext=jpg?'jpg':png?'png':'webp';const path=`${t.diadiem}/${t.manv}/v3/task_${id}_${kind}_${crypto.randomUUID()}.${ext}`;
 const r=await db.storage.from('qlnv-task-images').upload(path,bytes,{upsert:false,contentType:mime});if(r.error)throw Error(r.error.message);
 return res.json({ok:true,path});
}
function validPaths(paths,t,id,kind){return Array.isArray(paths)&&paths.length<=1&&paths.every(x=>typeof x==='string'&&x.startsWith(`${t.diadiem}/${t.manv}/v3/task_${id}_${kind}_`)&&/\.(jpg|png|webp)$/.test(x)&&x.length<300);}
async function verifyUploads(paths){for(const p of paths){const dir=p.slice(0,p.lastIndexOf('/'));const name=p.slice(p.lastIndexOf('/')+1);const r=await db.storage.from('qlnv-task-images').list(dir,{search:name,limit:10});if(r.error||!r.data?.some(x=>x.name===name))return false;}return true;}
async function start(t,body,res){const id=Number(body?.task_id);const paths=body?.paths||[];const m=await assigned(t,id),tk=await task(id,t);
 if(!m||!tk)return error(res,403,'Không có quyền với nhiệm vụ');if(m.started_at||tk.status!=='pending')return error(res,409,'Nhiệm vụ không còn chờ bắt đầu');
 if(!validPaths(paths,t,id,'before')||(m.image_required&&paths.length!==1)||!await verifyUploads(paths))return error(res,400,'Ảnh trước không hợp lệ');
 const open=await db.schema('qlnv').from('task_v3_meta').select('task_id').eq('assigned_to',t.manv).eq('diadiem',t.diadiem).not('started_at','is',null).is('reported_at',null).limit(2);if(open.error)throw Error(open.error.message);if(open.data?.length)return error(res,409,'Đang có nhiệm vụ khác chưa báo cáo');
 const now=new Date(),today=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh'}));const date=today.toISOString().slice(0,10);const rangeStart=new Date(date+'T00:00:00+07:00').toISOString(),rangeEnd=new Date(date+'T23:59:59+07:00').toISOString();
 const cc=await db.from('chamcong_log').select('su_kien,created_at').eq('manv',t.manv).eq('diadiem',t.diadiem).gte('created_at',rangeStart).lte('created_at',rangeEnd).order('created_at',{ascending:false}).limit(1);
 if(cc.error)throw Error(cc.error.message);if(!['VAOCA','NTRD','NCHD'].includes(cc.data?.[0]?.su_kien))return error(res,409,'Cần đang trong ca làm việc, không được đang nghỉ hay đã tan ca');
 const iso=now.toISOString(),deadline=new Date(now.getTime()+Number(m.assigned_minutes)*60000).toISOString();
 // Optimistic conditional update. Cross-table updates are not transactional; report errors explicitly.
 const upd=await db.schema('qlnv').from('task_v3_meta').update({started_at:iso,deadline_at:deadline,before_images:paths,report_status:'working',updated_at:iso}).eq('task_id',id).eq('assigned_to',t.manv).eq('diadiem',t.diadiem).is('started_at',null).select('task_id');
 if(upd.error)throw Error(upd.error.message);if(!upd.data?.length)return error(res,409,'Nhiệm vụ đã được bắt đầu từ phiên khác');
 const old=await db.schema('qlnv').from('tasks').update({status:'in_progress',started_at:iso,deadline_at:deadline,before_image_path:paths[0]||null,before_image_at:paths.length?iso:null}).eq('id',id).eq('status','pending');
 if(old.error)return res.status(500).json({ok:false,error:'Đã bắt đầu V3 nhưng chưa đồng bộ task: '+old.error.message});
 return res.json({ok:true});
}
async function report(t,body,res){const id=Number(body?.task_id),status=clean(body?.status),note=clean(body?.note),paths=body?.paths||[];const incomplete=status==='reported_incomplete';
 if(!['reported_done','reported_incomplete'].includes(status)||!note||note.length>2000)return error(res,400,'Nội dung báo cáo không hợp lệ');
 const m=await assigned(t,id),tk=await task(id,t);if(!m||!tk)return error(res,403,'Không có quyền với nhiệm vụ');if(!m.started_at||m.reported_at)return error(res,409,'Nhiệm vụ chưa bắt đầu hoặc đã báo cáo');
 if(!validPaths(paths,t,id,'after')||(m.image_required&&!incomplete&&paths.length!==1)||!await verifyUploads(paths))return error(res,400,'Ảnh sau không hợp lệ');
 const now=new Date(),iso=now.toISOString();const mins=Math.min(Number(m.assigned_minutes),Math.max(0,(now-new Date(m.started_at))/60000));
 const upd=await db.schema('qlnv').from('task_v3_meta').update({reported_at:iso,report_status:status,after_images:paths,report_note:note,updated_at:iso}).eq('task_id',id).eq('assigned_to',t.manv).eq('diadiem',t.diadiem).is('reported_at',null).select('task_id');
 if(upd.error)throw Error(upd.error.message);if(!upd.data?.length)return error(res,409,'Nhiệm vụ đã báo cáo từ phiên khác');
 const old=await db.schema('qlnv').from('tasks').update({status:incomplete?'timeout':'done',completed_at:incomplete?null:iso,actual_minutes:Math.ceil(Math.max(0,(now-new Date(m.started_at))/60000)),payroll_minutes:Math.min(Number(m.assigned_minutes),Math.ceil(mins)),after_image_path:paths[0]||null,after_image_at:paths.length?iso:null}).eq('id',id);
 if(old.error)return res.status(500).json({ok:false,error:'Đã báo cáo V3 nhưng chưa đồng bộ task: '+old.error.message});
 return res.json({ok:true,estimated_minutes:mins});
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!db||!SECRET||SECRET.length<32)return error(res,503,'Thiếu SUPABASE_SERVICE_ROLE_KEY hoặc QLNV_V3_SESSION_SECRET (>=32 ký tự)');
 if(req.method==='GET')return res.status(200).json({ok:true,service:'qlnv-v3',build:API_BUILD,method:'POST required for actions'});
 if(req.method!=='POST')return error(res,405,'Chỉ nhận POST');
 const rejected=originCheck(req);
 if(rejected)return res.status(403).json({ok:false,error:'Yêu cầu không đúng nguồn',reason:rejected,build:API_BUILD});
 const action=clean(req.body?.action);if(Number(req.headers['content-length']||0)>9*1024*1024)return error(res,413,'Yêu cầu quá lớn');
 try {if(action==='login')return await login(req,res);
 if(action==='logout'){setCookie(res,'',0);return res.json({ok:true});}
 const t=await auth(req);if(!t)return error(res,401,'Hết phiên nhiệm vụ, vui lòng đăng nhập lại');
 if(action==='whoami')return res.json({ok:true,...t});
 if(action==='list')return await list(t,res);
 if(action==='upload')return await upload(t,req.body,res);
 if(action==='start')return await start(t,req.body,res);
 if(action==='report')return await report(t,req.body,res);
 return error(res,400,'Hành động không được hỗ trợ');
 }catch(e){console.error('[QLNV-V3]',action,e.message);return error(res,500,'Không xử lý được nhiệm vụ: '+e.message);}
}
