// HOANTUYET Online identity V1.1 FIX. Tách hoàn toàn phiên Auth online khỏi Warehouse/bán lẻ.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const URL='https://rddjrmbyftlcvrgzlyby.supabase.co';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
export const onlineSB=createClient(URL,ANON,{auth:{storageKey:'hoantuyet-online-personal-auth-v11',storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
export async function onlineVerify(){
 const {data:{user},error}=await onlineSB.auth.getUser();
 if(error||!user)return null;
 const {data,error:permissionError}=await onlineSB.rpc('online_v1_staff_ok');
 if(permissionError)throw new Error('Không kiểm tra được quyền nhân viên: '+permissionError.message);
 if(data!==true)throw new Error('Tài khoản Auth này chưa có quyền Online. Kiểm tra dmnhanvien.user_id / trangthai hoặc admin_users.');
 return user;
}
export async function onlineLogin(email,password){
 const {data,error}=await onlineSB.auth.signInWithPassword({email:email.trim(),password});
 if(error||!data?.user)throw new Error(error?.message||'Đăng nhập Online thất bại');
 try{const user=await onlineVerify();return user;}catch(e){await onlineSB.auth.signOut();throw e;}
}
export async function onlineLogout(){await onlineSB.auth.signOut();}
export function onlineLoginUrl(back=location.pathname+location.search){return '/hoantuyet_online_login.html?redirect='+encodeURIComponent(back);}
