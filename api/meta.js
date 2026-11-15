// HOANTUYET ONLINE V1.4A: chi nhan Messenger webhook, KHONG gui tin / KHONG sua ban le.
import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const config={api:{bodyParser:false}};
const respond=(res,status,text)=>res.status(status).setHeader('Cache-Control','no-store').send(text);
const secureEqual=(a,b)=>{
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
};
async function rawBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1048576){const e=new Error('Too large');e.http=413;throw e;}chunks.push(chunk)}
  return Buffer.concat(chunks);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    const mode=req.query?.['hub.mode'];const token=req.query?.['hub.verify_token'];const challenge=req.query?.['hub.challenge'];
    if(mode==='subscribe' && typeof challenge==='string' && secureEqual(token,process.env.META_WEBHOOK_VERIFY_TOKEN) && process.env.META_WEBHOOK_VERIFY_TOKEN){return respond(res,200,challenge)}
    return respond(res,403,'Forbidden');
  }
  if(req.method!=='POST')return respond(res,405,'Method not allowed');
  const secret=process.env.META_APP_SECRET,pageId=process.env.META_PAGE_ID;
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret||!pageId||!url||!key)return respond(res,503,'Webhook not configured');
  try{
    const body=await rawBody(req);
    const signature=String(req.headers['x-hub-signature-256']||'');
    const expected='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
    if(!secureEqual(signature,expected))return respond(res,403,'Invalid signature');
    const event=JSON.parse(body.toString('utf8'));
    if(event.object!=='page'||!Array.isArray(event.entry))return respond(res,200,'EVENT_RECEIVED');
    const records=[];
    for(const entry of event.entry){
      if(String(entry.id)!==String(pageId))continue;
      for(const m of Array.isArray(entry.messaging)?entry.messaging:[]){
        if(m.message?.is_echo || !m.sender?.id || !m.recipient?.id || String(m.recipient.id)!==String(pageId))continue;
        if(!m.message?.mid)continue;
        const msg=m.message;
        const content=typeof msg.text==='string'?msg.text.slice(0,4000):'';
        const kind=content?'text':Array.isArray(msg.attachments)&&msg.attachments.length?'attachment':'other';
        // Chi luu metadata loai attachment, KHONG luu URL token va KHONG download tep.
        if(kind==='other')continue;
        const ts=Number(m.timestamp);
        records.push({page_id:String(pageId),sender_id:String(m.sender.id).slice(0,100),message_id:String(msg.mid).slice(0,200),message_text:content,message_type:kind,received_at:Number.isFinite(ts)&&ts>0?new Date(ts).toISOString():new Date().toISOString()});
      }
    }
    if(records.length){
      const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
      for(let i=0;i<records.length;i+=100){
        const {error}=await client.from('online_meta_inbox').upsert(records.slice(i,i+100),{onConflict:'page_id,message_id',ignoreDuplicates:true});
        if(error){console.error('Meta inbox insert failed',error.code);return respond(res,500,'Storage failure')}
      }
    }
    return respond(res,200,'EVENT_RECEIVED');
  }catch(e){console.error('Meta webhook failed',e.message);return respond(res,e.http||400,'Webhook error')}
}
