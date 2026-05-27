export async function registerPushNotifications({
    manv,
    diadiem,
    role = 'staff'
}) {
    try {
        console.log("Bắt đầu đăng ký push:", { manv, diadiem, role });

        if (!('serviceWorker' in navigator)) {
            console.warn("Trình duyệt không hỗ trợ serviceWorker");
            return;
        }

        if (!('PushManager' in window)) {
            console.warn("Trình duyệt không hỗ trợ PushManager");
            return;
        }

        if (!('Notification' in window)) {
            console.warn("Trình duyệt không hỗ trợ Notification");
            return;
        }

        const permission = await Notification.requestPermission();

        console.log("Notification permission:", permission);

        if (permission !== 'granted') {
            console.warn('Không được cấp quyền notification');
            return;
        }

        const reg = await navigator.serviceWorker.ready;

        const publicKey = 'BN8W0LhqELqb_J3zCwSlOfJhwo5fCjxEJjp-IlT5ddpLSAONRZBUb0R75S_88yfvmVxTws_obGt35EsczHbGXKM';

        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        console.log("Push subscription:", sub);

        const resp = await fetch('/api/qlnv-save-push-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'save',
                manv,
                diadiem,
                role,
                subscription: sub
            })
        });

        const result = await resp.json().catch(() => null);

        console.log("Kết quả lưu push subscription:", resp.status, result);

        if (!resp.ok) {
            console.error("Không lưu được push subscription:", result);
        }

    } catch (err) {
        console.error("Lỗi registerPushNotifications:", err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 =
        (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

    const rawData = window.atob(base64);

    return Uint8Array.from([...rawData]
        .map(char => char.charCodeAt(0)));
}
