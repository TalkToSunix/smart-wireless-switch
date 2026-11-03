const $ = (id) => document.getElementById(id);
let workerUrl = localStorage.getItem('outlet.worker') || '';
let controllerToken = sessionStorage.getItem('outlet.controller') || '';
$('workerUrl').value = workerUrl;
$('controllerToken').value = controllerToken;

function connection(ok) {
  const el = $('connection');
  el.className = `status ${ok ? 'online' : 'offline'}`;
  el.innerHTML = `<i></i>${ok ? 'متصل' : 'قطع'}`;
}
async function call(path, options = {}) {
  if (!workerUrl || !controllerToken) throw new Error('نشانی Worker و کلید کنترلی را در تنظیمات وارد کن.');
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${controllerToken}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `خطای سرور: ${response.status}`);
  return payload;
}
function show(on) {
  $('outletIcon').classList.toggle('on', on);
  $('stateText').textContent = on ? 'پریز روشن است' : 'پریز خاموش است';
  $('detailText').textContent = on ? 'فرمان روشن بودن ثبت شده است.' : 'فرمان خاموش بودن ثبت شده است.';
  $('toggle').textContent = on ? 'خاموش کردن' : 'روشن کردن';
  $('toggle').dataset.on = String(on);
  $('toggle').disabled = false;
}
async function refresh() {
  if (!workerUrl || !controllerToken) {
    connection(false); $('toggle').disabled = true;
    $('stateText').textContent = 'تنظیم اتصال لازم است';
    $('detailText').textContent = 'آدرس Worker و کلید دسترسی را در تنظیمات وارد کن.';
    return;
  }
  try {
    const data = await call('/api/devices/living-room/state');
    show(Boolean(data.on)); connection(true); $('error').textContent = '';
  } catch (e) {
    connection(false); $('toggle').disabled = true;
    $('error').textContent = e.message.includes('Failed to fetch') ? 'Worker در دسترس نیست؛ نشانی و تنظیمات را بررسی کن.' : e.message;
  }
}
$('save').addEventListener('click', async () => {
  workerUrl = $('workerUrl').value.trim().replace(/\/$/, '');
  controllerToken = $('controllerToken').value.trim();
  localStorage.setItem('outlet.worker', workerUrl);
  sessionStorage.setItem('outlet.controller', controllerToken);
  $('error').textContent = '';
  await refresh();
});
$('toggle').addEventListener('click', async () => {
  $('toggle').disabled = true;
  try {
    const data = await call('/api/devices/living-room/state', {
      method: 'POST', body: JSON.stringify({ on: $('toggle').dataset.on !== 'true' })
    });
    show(Boolean(data.on)); connection(true); $('error').textContent = '';
  } catch (e) { $('error').textContent = e.message; await refresh(); }
});
refresh();
setInterval(refresh, 5000);
