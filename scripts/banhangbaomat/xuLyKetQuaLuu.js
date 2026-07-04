// scripts/banhangbaomat/xuLyKetQuaLuu.js

export function xuLyKetQuaLuuBaoMat(result) {
  console.log("[BAO MAT] KET QUA RPC:", result);

  if (!result?.ok) {
    const message =
      result?.message ||
      "RPC bảo mật trả về trạng thái không thành công.";

    throw new Error(message);
  }

  if (result.test_mode === true) {
    alert(
      "TEST BẢO MẬT THÀNH CÔNG\n\n" +
      "RPC đã nhận dữ liệu.\n" +
      "Audit đã được ghi.\n\n" +
      "Request ID:\n" +
      result.request_id
    );

    return result;
  }

  return result;
}