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
 const sm=s.match(/(?:size|sz|co)\s*[:.]?\s*(\d{1,3})\b/);
 const size=sm?sm[1]:null;
 const color=/\bden\b/.test(s)?'đen':/\btrang\b/.test(s)?'trắng':/\bxam\b/.test(s)?'xám':/\bxanh\b/.test(s)?'xanh':/\bnau\b/.test(s)?'nâu':null;
 return {category,price,size,color,original:cleanText(q,500)};
}
const queryTerms={polo:['polo','POLO'],jean:['jean','JEAN','BÒ','BO','DENIM'],aophong:['PHÔNG','PHONG','THUN'],aokhoac:['KHOÁC','KHOAC','BOMBER'],somi:['SƠ MI','SO MI'],giay:['GIÀY','GIAY','SNEAKER'],dep:['DÉP','DEP','SANDAL','SIP'],quantay:['QUẦN TÂY','QUAN TAY','QUẦN VẢI','QUAN VAI'],len:['LEN','KNITTED','MONGTOGHI']};
function wordsOf(cat){return queryTerms[cat]||[]}
function score(p,need){
 const hay=simplify([p.tensp,p.nhomhang,p.chungloai,p.mausac,p.form,p.masp].join(' '));
 const terms=wordsOf(need.category).map(simplify);let v=terms.some(t=>hay.includes(t))?25:0;
 const price=Number(p.giale||0);
 if(need.price&&price>0){const ratio=Math.abs(price-need.price)/need.price;v+=Math.max(0,20-30*ratio);if(ratio>0.65)v-=30;}
 if(need.color&&hay.includes(simplify(need.color)))v+=9;
 if(need.size&&p.ton_sizes){const x=p.ton_sizes[need.size];if(x&&(Number(x.ton_cs1||0)+Number(x.ton_cs2||0))>0)v+=30;}
 if(p.qty_total>0)v+=15;
 return v;
}
export function formatProduct(p){
 return {masp:cleanText(p.masp,100),ten:cleanText(p.tensp,160),nhom:cleanText(p.nhomhang,100),mau:cleanText(p.mausac,60),form:cleanText(p.form,60),gia_ban:Number(p.giale),ton_sizes:p.ton_sizes||{},ton_verified:true};
}
export async function searchOnlineProducts(client,question,{limit=10}={}){
 const need=parseNeed(question);if(!need.category)return {need,items:[],verified:true,message:'Không nhận diện được nhóm hàng; hãy nhập loại sản phẩm cụ thể.'};
 const terms=wordsOf(need.category);
 // Encode only constant search words; no raw user SQL filters.
 const ors=[...new Set(terms)].flatMap(w=>['tensp','nhomhang','chungloai'].map(k=>`${k}.ilike.%${w}%`)).join(',');
 const {data,error}=await client.from('dmhanghoa')
  .select('masp,tensp,giale,nhomhang,chungloai,mausac,form')
  .eq('active',true).gt('giale',0).or(ors).limit(120);
 if(error)throw new Error('Không đọc được danh mục hàng hóa: '+error.message);
 // Price ranking before stock RPC. Keep bounded size to avoid expensive stock calculations.
 const ranked=(data||[]).sort((a,b)=>score(b,need)-score(a,need));
 const shortlist=ranked.slice(0,40),codes=shortlist.map(p=>p.masp);
 if(!codes.length)return {need,items:[],verified:true,message:'Không tìm thấy sản phẩm trong danh mục theo nhóm hàng.'};
 const stock=await client.rpc('online_v13_stock_by_codes',{p_codes:codes});
 if(stock.error)throw new Error('Không xác minh được tồn sau kiểm: '+stock.error.message);
 const index=new Map((stock.data||[]).map(s=>[String(s.masp).toUpperCase(),s.ton_sizes||{}]));
 const products=shortlist.map(p=>{
  const sizes=index.get(String(p.masp).toUpperCase())||{};
  const qty=Object.values(sizes).reduce((a,v)=>a+Number(v.ton_cs1||0)+Number(v.ton_cs2||0),0);
  return {...p,ton_sizes:sizes,qty_total:qty};
 }).filter(p=>p.qty_total>0).sort((a,b)=>score(b,need)-score(a,need)).slice(0,Math.max(1,Math.min(12,limit)));
 return {need,items:products.map(formatProduct),verified:true,message:products.length?'Tồn lấy từ cache và điều chỉnh phiếu kiểm mới nhất (cần xác nhận lại khi chốt đơn).':'Không tìm thấy sản phẩm còn tồn trong tập kết quả.'};
}
export function answerWithVerifiedProducts(question,items){
 if(!items.length)return 'Dạ em chào anh/chị ạ! Hiện em chưa tìm được mẫu phù hợp và có tồn trong danh sách tra cứu. Anh/chị cho em xin thêm màu hoặc khoảng giá để em kiểm tra tiếp nhé ạ.';
 const lines=items.slice(0,5).map((p,i)=>{
  const sizes=Object.entries(p.ton_sizes||{}).filter(([s,v])=>Number(v.ton_cs1||0)+Number(v.ton_cs2||0)>0).slice(0,7).map(([s,v])=>`${s}: CS1 ${v.ton_cs1||0}, CS2 ${v.ton_cs2||0}`).join('; ');
  return `${i+1}. ${p.ten} (mã ${p.masp}) – ${p.gia_ban.toLocaleString('vi-VN')}đ. Size: ${sizes||'chưa rõ'}.`;
 });
 return `Dạ em chào anh/chị ạ! Shop có một số mẫu mình tham khảo:\n${lines.join('\n')}\nSố lượng là số liệu phần mềm tại thời điểm tra cứu, em sẽ kiểm tra lại trước khi chốt ạ. Anh/chị ưng mẫu nào để em gửi ảnh thật nhé!`;
}
