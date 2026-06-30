let autoSaveTimer = null;
let isSaving = false;
let pendingSave = false;

export function createCafeOrderSync({
  getSelectedBan,
  getHoaDonByBan,
  getOrderItems,
  setHoaDonForBan,
  saveOrder,
  showSaving,
  showSaved,
  showError,
}) {
  async function saveNow() {
    if (isSaving) {
      pendingSave = true;
      return;
    }

    const ban = getSelectedBan?.();
    const orderItems = getOrderItems?.() || [];

    if (!ban || !orderItems.length) return;

    try {
      isSaving = true;
      pendingSave = false;

      showSaving?.();

      const banKey = String(ban.id);
      const hoaDonCu = getHoaDonByBan?.(banKey);

      const hoaDon = await saveOrder({
        hoaDonId: hoaDonCu?.id || null,
        ban,
        orderItems,
        manv: null,
        tennv: "admin",
      });

      setHoaDonForBan?.(banKey, hoaDon);

      showSaved?.(hoaDon);
    } catch (error) {
      console.error("Lỗi tự động lưu đơn cafe:", error);
      showError?.(error);
    } finally {
      isSaving = false;

      if (pendingSave) {
        pendingSave = false;
        scheduleSave();
      }
    }
  }

  function scheduleSave(delay = 300) {
    clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(() => {
      saveNow();
    }, delay);
  }

  return {
    scheduleSave,
    saveNow,
  };
}