/*
 * Shop Hoan Tuyet - Cau hinh Zalo dung chung
 * ------------------------------------------------------------
 * Muc dich: KHONG hard-code link nhom Zalo o tung trang.
 *
 * Khi doi nhom:
 * 1) Them/sua URL trong GROUPS.
 * 2) Doi ACTIVE_GROUP sang ma nhom muon dung.
 * 3) Commit/push DUY NHAT file nay neu khong co thay doi khac.
 *
 * QR tren cac trang co thuoc tinh data-ht-zalo-qr se tu dong
 * sinh tu URL nhom dang active, nen link va QR luon dong bo.
 */
(function (window, document) {
  "use strict";

  const CONFIG = {
    ACTIVE_GROUP: "group2",

    GROUPS: {
      group1: {
        name: "Cong dong khuyen mai 1",
        url: "https://zalo.me/g/rz31sxl6fvcidvehzvty",
        enabled: false
      },
      group2: {
        name: "Cong dong khuyen mai 2",
        url: "https://zalo.me/g/6eejzcpnckjr6pv1qfdz",
        enabled: true
      }
    },

    OA_URL: "https://zalo.me/s/2332738582622777725/",

    getActiveGroup() {
      const group = this.GROUPS[this.ACTIVE_GROUP];
      if (!group || !group.url) {
        console.error("[HT_ZALO] ACTIVE_GROUP khong hop le:", this.ACTIVE_GROUP);
        return { name: "", url: "", enabled: false };
      }
      return group;
    },

    getGroupUrl() {
      return this.getActiveGroup().url;
    },

    getGroupName() {
      return this.getActiveGroup().name;
    },

    getOAUrl() {
      return this.OA_URL;
    },

    getQrUrl(size = 300, value) {
      const px = Math.max(120, Math.min(1000, Number(size) || 300));
      const data = value || this.getGroupUrl();
      return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&data=${encodeURIComponent(data)}`;
    },

    applyToPage() {
      // QR nhom Zalo: <img data-ht-zalo-qr data-qr-size="260">
      document.querySelectorAll("[data-ht-zalo-qr]").forEach((el) => {
        const size = el.getAttribute("data-qr-size") || 300;
        el.setAttribute("src", this.getQrUrl(size));
      });

      // Link tham gia nhom: <a data-ht-zalo-group-link>
      document.querySelectorAll("[data-ht-zalo-group-link]").forEach((el) => {
        el.setAttribute("href", this.getGroupUrl());
      });

      // Link OA: <a data-ht-zalo-oa-link>
      document.querySelectorAll("[data-ht-zalo-oa-link]").forEach((el) => {
        el.setAttribute("href", this.getOAUrl());
      });
    }
  };

  window.HT_ZALO = CONFIG;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => CONFIG.applyToPage(), { once: true });
  } else {
    CONFIG.applyToPage();
  }
})(window, document);
