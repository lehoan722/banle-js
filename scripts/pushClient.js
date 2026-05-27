export async function registerPushNotifications({
    manv,
    diadiem,
    role = 'staff'
}) {

    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
        console.warn('Không được cấp quyền notification');
        return;
    }

    const reg = await navigator.serviceWorker.ready;

    const publicKey = 'BF5J4YmZ7Q4cZsqM2o7D-BF5J4YmZ7Q4cZsqM2o7D-1xyrLA9t3eAxYri2hts9huaE7Yk1ZOAhuDKoVYViBYCBdXf1Iuh93IfIDQEv3hNGEc';

    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/api/qlnv-save-push-subscription', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            manv,
            diadiem,
            role,
            subscription: sub
        })
    });

    console.log('Đã đăng ký push notification');
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
