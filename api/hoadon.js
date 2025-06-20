
import { supabase } from './supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { masp } = req.body

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('*')
    .eq('masp', masp)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(200).json(data)
}
