// File: public/inmavach/data.js
import { supabase } from './supabaseClient.js';

export async function loadData() {
    const { data, error } = await supabase
        .from('dmhanghoa')
        .select('*')
        .order('masp', { ascending: true });

    if (error) {
        console.error("Lỗi khi load dữ liệu:", error);
        return [];
    }

    // Gắn sẵn số lượng in mặc định và cờ tick
    return data.map(row => ({
        ...row,
        sltem: 1,
        tick: true
    }));
}
