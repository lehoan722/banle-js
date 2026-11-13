// HOANTUYET ONLINE V1.3. Product lookup is exclusively server-side.
import {cleanText} from './online_ai_helpers.js';
const simplify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function parseNeed(q){
 const s=simplify(q).replace(/\s+/g,' ');let category='';
 if(/polo|co be|cỏ bẻ/.test(s))category='polo';
 else if(/quan (bo|jean|denim)|jeans?|bo rach|quan rach/.test(s))category='jean';
 else if(/ao (phong|thun)|t-shirt|tshirt/.test(s))category='aophong';
 else if(/ao (khoac|gio)|bomber/.test(s))category='aokhoac';
 else if(/so mi|somi/.test(s))category='somi';
 else if(/giay|sneaker|slipon/.test(s))category='giay';
 else if(/dep|sandal|sip/.test(s))category='dep';
 else if(/quan (vai|tay|au)/.test(s))category='quantay';
 else if(/ao len|mongtoghi|knit/.test(s))category='len';
 const match=s.match(/(?:khoang|tam|gia|duoi|toi da|ngan sach|~)\s*([1-9]\d{1,6})(?:\s*(k|nghin|ngan|tr|trieu))?\b/)||s.match(/\b([1-9]\d{2,3})\s*(k|nghin|ngan|tr|trieu)\b/);
 let price=null;if(match){let n=Number(match[1]),unit=match[2]||'';if(unit.startsWith('tr'))n*=1e6;else if(unit==='k'||unit==='nghin'||unit==='ngan'||n<=999)n*=1000;if(n>=10000&&n<=20000000)price=n;}
 const sm=s.match(/(?:size|sz|sai|xai|co)\s*[:.]?\s*(\d{1,3}|2xl|3xl|4xl|5xl|6xl|xxxl|xxl|xl|s|m|l)\b/);
 const size=sm?sm[1]:null;
 const color=/\bden\b/.test(s)?'đen':/\btrang\b/.test(s)?'trắng':/\bxam\b/.test(s)?'xám':/\bxanh\b/.test(s)?'xanh':/\bnau\b/.test(s)?'nâu':null;
 return {category,price,size,color,original:cleanText(q,500)};
}
// Quy doi size theo bang V2, giu size chuan 38..46 va size 0.
const CANONICAL = new Set(['0','38','39','40','41','42','43','44','45','46']);
const ALPHA={S:'38',M:'39',L:'40',XL:'41','2XL':'42','XXL':'42','3XL':'43','XXXL':'43','4XL':'44','5XL':'45','6XL':'46'};
export function normalizeOnlineSize(raw,category=''){
 const token=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
 if(CANONICAL.has(token))return token;
 if(ALPHA[token])return ALPHA[token];
 const n=Number(token);
 if(!Number.isInteger(n))return null;
 // Size jean tu 28-36 quy sang 38-46: 29->39,31->41.
 if(n>=28&&n<=36)return String(n+10);
 // He size so 2..10 trong bang quy doi V2.
 if(n>=2&&n<=10)return String(n+36);
 return null;
}
export function parseOnlineNeed(question){
 const need=parseNeed(question);const s=simplify(question);
 // Bat ca 'sai', 'xai', size, sz va ten size chu; khong lay 300K lam size.
 const match=s.match(/(?:\bsize|\bsz|\bsai|\bxai|\bco)\s*[:.]?\s*(2xl|3xl|4xl|5xl|6xl|xxxl|xxl|xl|s|m|l|\d{1,2})(?![a-z0-9])/i)
   ||s.match(/\b(2xl|3xl|4xl|5xl|6xl|xxxl|xxl|xl)\b/i);
 need.size_input=match?match[1].toUpperCase():null;
 need.size=need.size_input?normalizeOnlineSize(need.size_input,need.category):null;
 need.rach=/(?:\brach\b|\bdistressed\b)/.test(s);
 need.size_converted=!!(need.size&&need.size_input!==need.size);
 return need;
}
const queryTerms={polo:['polo','POLO'],jean:['jean','JEAN','BÒ','BO','DENIM'],aophong:['PHÔNG','PHONG','THUN'],aokhoac:['KHOÁC','KHOAC','BOMBER'],somi:['SƠ MI','SO MI'],giay:['GIÀY','GIAY','SNEAKER'],dep:['DÉP','DEP','SANDAL','SIP'],quantay:['QUẦN TÂY','QUAN TAY','QUẦN VẢI','QUAN VAI'],len:['LEN','KNITTED','MONGTOGHI']};
function wordsOf(cat){return queryTerms[cat]||[]}
function inStock(v){return Math.max(0,Number(v?.ton_cs1||0))+Math.max(0,Number(v?.ton_cs2||0))}
function score(p,need){
 const hay=simplify([p.tensp,p.nhomhang,p.chungloai,p.mausac,p.form,p.masp].join(' '));
 let v=0;
 if(need.category==='jean'){
  if(String(p.nhomhang||'').trim().toUpperCase()!=='QB')return -10000;
  v+=60;
 }else if(wordsOf(need.category).some(t=>hay.includes(simplify(t))))v+=60;
 else return -10000;
 if(need.size){const exact=inStock(p.ton_sizes?.[need.size]);const zero=inStock(p.ton_sizes?.['0']);
   v+=exact>0?150:zero>0?5:-150;
 }
 if(need.color){if(hay.includes(simplify(need.color)))v+=25;else v-=12;}
 if(need.rach){if(hay.includes('rach'))v+=35;else v-=15;}
 const price=Number(p.giale||0);
 if(need.price&&price>0){const ratio=Math.abs(price-need.price)/need.price;v+=Math.max(-40,35-65*ratio);}
 v+=p.qty_total>0?20:-100;
 return v;
}
export function formatProduct(p){
 return {masp:cleanText(p.masp,100),ten:cleanText(p.tensp,160),nhom:cleanText(p.nhomhang,100),mau:cleanText(p.mausac,60),form:cleanText(p.form,60),gia_ban:Number(p.giale),ton_sizes:p.ton_sizes||{},ton_verified:true,requested_size:p.requested_size||null,requested_size_input:p.requested_size_input||null,detail_unverified:!!p.detail_unverified};
}
export async function searchOnlineProducts(client,question,{limit=10}={}){
 const need=parseOnlineNeed(question);
 if(!need.category)return {need,items:[],verified:true,message:'Chưa nhận diện được nhóm hàng; vui lòng nêu rõ loại sản phẩm.'};
 const terms=wordsOf(need.category);
 const ors=[...new Set(terms)].flatMap(w=>['tensp','nhomhang','chungloai'].map(k=>`${k}.ilike.%${w}%`)).join(',');
 let query=client.from('dmhanghoa').select('masp,tensp,giale,nhomhang,chungloai,mausac,form')
   .eq('active',true).gt('giale',0);
 // Quần bò: chỉ lấy QB, tránh tình trạng lẫn áo khoác mã KMD/XANH.
 if(need.category==='jean')query=query.eq('nhomhang','QB');
 else query=query.or(ors);
 const {data,error}=await query.limit(240);
 if(error)throw new Error('Không đọc được danh mục hàng hóa: '+error.message);
 // Loc theo danh muc, mau, gia truoc khi kiem ton (API stock gioi han 40 ma/lan).
 const candidates=(data||[]).filter(p=>score({...p,qty_total:1},need)>-1000)
   .sort((a,b)=>score({...b,qty_total:1},need)-score({...a,qty_total:1},need));
 if(!candidates.length)return {need,items:[],verified:true,message:'Không có mẫu trong đúng nhóm hàng.'};
 const shortlist=candidates.slice(0,120),stockRows=[];
 // V2-fast: tra 40 ma moi lan, ngung som khi du mau dung size, giam do tre API.
 for(let offset=0;offset<shortlist.length;offset+=40){
  const codes=shortlist.slice(offset,offset+40).map(p=>p.masp);
  const result=await client.rpc('online_v13_stock_by_codes',{p_codes:codes});
  if(result.error)throw new Error('Không xác minh được tồn sau kiểm: '+result.error.message);
  stockRows.push(...(result.data||[]));
  const enough=stockRows.filter(r=>{
   const entries=Object.entries(r.ton_sizes||{});
   return need.size?entries.some(([sz,v])=>sz===need.size&&inStock(v)>0):entries.some(([,v])=>inStock(v)>0);
  }).length;
  if(enough>=Math.max(1,Math.min(12,limit)))break;
 }
 const index=new Map(stockRows.map(s=>[String(s.masp).trim().toUpperCase(),s.ton_sizes||{}]));
 const products=shortlist.map(p=>{
   const sizes=index.get(String(p.masp).trim().toUpperCase())||{};
   const qty=Object.values(sizes).reduce((a,v)=>a+inStock(v),0);
   return {...p,ton_sizes:sizes,qty_total:qty,requested_size:need.size,requested_size_input:need.size_input,detail_unverified:need.rach&&!simplify([p.tensp,p.chungloai,p.form].join(' ')).includes('rach')};
 }).filter(p=>p.qty_total>0);
 // Chinh sach size V2: dung size duoc uu tien; neu khong co, thong bao ro, khong dua size khac vao de khach hieu nham.
 const matching=need.size?products.filter(p=>inStock(p.ton_sizes?.[need.size])>0):products;
 const final=matching.sort((a,b)=>score(b,need)-score(a,need)).slice(0,Math.max(1,Math.min(12,limit)));
 const note=need.size_converted?`Đã quy đổi size ${need.size_input} → size kho ${need.size}. `:'';
 const detail=need.rach?'Tính chất “rách” cần nhân viên đối chiếu ảnh thật. ':'';
 const message=note+detail+(final.length?'Tồn sau kiểm tại thời điểm tra cứu; xác nhận lại trước khi chốt.':need.size?`Không tìm thấy sản phẩm đúng nhóm còn size ${need.size} sau kiểm; không tự thay bằng size khác.`:'Không có mẫu còn tồn trong tập sản phẩm tra cứu.');
 return {need,items:final.map(formatProduct),verified:true,message};
}
export function answerWithVerifiedProducts(question,items){
 if(!items.length)return 'Dạ em chào anh/chị ạ! Hiện em chưa tìm được mẫu phù hợp và có tồn trong danh sách tra cứu. Anh/chị cho em xin thêm màu hoặc khoảng giá để em kiểm tra tiếp nhé ạ.';
 const lines=items.slice(0,5).map((p,i)=>{
  const sizes=Object.entries(p.ton_sizes||{}).filter(([s,v])=>(!p.requested_size||s===p.requested_size)&&(Number(v.ton_cs1||0)+Number(v.ton_cs2||0)>0)).slice(0,7).map(([s,v])=>`${s}: CS1 ${v.ton_cs1||0}, CS2 ${v.ton_cs2||0}`).join('; ');
  return `${i+1}. ${p.ten} (mã ${p.masp}) – ${p.gia_ban.toLocaleString('vi-VN')}đ. Size: ${sizes||'chưa rõ'}.`;
 });
 return `Dạ em chào anh/chị ạ! Shop có một số mẫu mình tham khảo (kiểu dáng chi tiết như rách cần xác nhận qua ảnh thật):\n${lines.join('\n')}\nSố lượng là số liệu phần mềm tại thời điểm tra cứu, em sẽ kiểm tra lại trước khi chốt ạ. Anh/chị ưng mẫu nào để em gửi ảnh thật nhé!`;
}
