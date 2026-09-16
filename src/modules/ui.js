/**
 * modules/ui.js — 通用 UI 工具（轻提示 / 确认弹窗 / 转义）
 */

export function toast(msg, type = '') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

export function confirmModal({ title = '确认', body = '', okText = '确定', danger = false } = {}) {
  return new Promise(resolve => {
    const mask = document.getElementById('confirm-mask');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    const ok = document.getElementById('confirm-ok');
    ok.textContent = okText;
    ok.className = 'btn ' + (danger ? 'danger' : 'primary');
    mask.hidden = false;
    const done = val => {
      mask.hidden = true;
      ok.removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onNo);
      mask.removeEventListener('click', onMask);
      resolve(val);
    };
    const onOk = () => done(true);
    const onNo = () => done(false);
    const onMask = e => { if (e.target === mask) done(false); };
    ok.addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onNo);
    mask.addEventListener('click', onMask);
  });
}

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function loadingBtn(btn, on, textWhile) {
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${textWhile || '处理中…'}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.html || btn.textContent;
  }
}