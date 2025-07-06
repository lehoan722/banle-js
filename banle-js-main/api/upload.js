

import { createClient } from '@supabase/supabase-js';
import formidable from "formidable";


export const config = {
  api: {
    bodyParser: false,
  },
};
export const runtime = 'nodejs';

// Nhập 2 dòng này từ environment variables hoặc hard-code cho test
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njc2NTgwNCwiZXhwIjoyMDYyMzQxODA0fQ.6UBSL-2jW7Qj73W8PEKOtIeDcGldbCMwpHn1He0MfhM'; // Dùng service_role key cho backend (KHÔNG công khai lên client!)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Chỉ chấp nhận POST' });
  }

  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      return res.status(500).json({ error: 'Không thể parse form data', detail: err.message || err });
    }

    const file = files.file;
    if (!file) {
      console.error('Thiếu file!', files);
      return res.status(400).json({ error: 'Thiếu file!', files: files });
    }

    const buffer = file.buffer;
    if (!buffer) {
      console.error('Không thể đọc buffer file:', file);
      return res.status(500).json({ error: 'Không thể đọc buffer file', file });
    }

    const fileName = file.originalFilename || 'upload.jpg';
    console.log(`Chuẩn bị upload: ${fileName}, size: ${buffer.length}, mimetype: ${file.mimetype}`);

    try {
      const { data, error } = await supabase.storage
        .from('anhsanpham')
        .upload(fileName, buffer, {
          upsert: true,
          contentType: file.mimetype || 'image/jpeg'
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return res.status(500).json({ error: error.message || error });
      }

      console.log('Upload thành công:', data);
      return res.status(200).json({ data });
    } catch (e) {
      console.error('Unexpected server error:', e);
      return res.status(500).json({ error: 'Lỗi server không xác định', detail: e.message || e });
    }
  });
}
