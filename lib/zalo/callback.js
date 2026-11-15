export default async function handler(req, res) {
  const { code, oa_id, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <h3>Lỗi Zalo OAuth</h3>
      <p>${error}</p>
      <p>${error_description || ""}</p>
    `);
  }

  if (!code) {
    return res.status(400).send("Không có code từ Zalo");
  }

  return res.status(200).send(`
    <h3>Lấy code thành công</h3>
    <p>Copy đoạn code dưới đây:</p>
    <textarea style="width:100%;height:120px;">${code}</textarea>
    <p>OA ID: ${oa_id || ""}</p>
  `);
}
