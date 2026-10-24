// js/core/dialog.js — confirm dialog.
import { on } from './actions.js';
import { t } from './i18n.js';
// ─── Dialog helper ───
let _dialogLastFocus = null;
function showDialog(title, bodyHtml, actions) {
  const d = document.getElementById('dialog');
  d.innerHTML = `<h3>${title}</h3>${bodyHtml}<div class="dialog-actions">${actions}</div>`;
  _dialogLastFocus = document.activeElement;
  const overlay = document.getElementById('overlay');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('show');
  requestAnimationFrame(() => {
    (d.querySelector('button,input,select,textarea,[tabindex]:not([tabindex="-1"])') || d).focus();
  });
}
function hideDialog() {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  if (window._cfmR) { window._cfmR(false); window._cfmR = null; }
  if (_dialogLastFocus && typeof _dialogLastFocus.focus === 'function') _dialogLastFocus.focus();
  _dialogLastFocus = null;
}
function confirmDialog(title, msg) {
  return new Promise(resolve => {
    const body = document.createElement('p');
    // textContent keeps the message un-trusted; pre-line is what lets a
    // multi-line warning read as a list instead of one run-on sentence.
    body.style.whiteSpace = 'pre-line';
    body.style.lineHeight = '1.8';
    body.textContent = msg;
    showDialog(title, body.outerHTML, `
      <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
      <button class="btn btn-danger"${on('click', 'answerConfirm', true)}>${t('common.confirm')}</button>
    `);
    window._cfmR = resolve;
  });
}
function answerConfirm(yes) {
  window._cfmR?.(yes);
  return hideDialog();
}
export { answerConfirm, confirmDialog, hideDialog, showDialog };
