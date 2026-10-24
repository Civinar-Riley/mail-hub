// js/views/keys.js — API keys view.
import { addActivity } from '../components/activity.js';
import { _pageState, getPageSize, paginateTable } from '../components/pagination.js';
import { CHECKED, VALUE, on } from '../core/actions.js';
import { api } from '../core/api.js';
import { hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { copyValue, emptyStateRow, esc, escAttr, fmtTime, iconBtn, toast } from '../core/util.js';
import { _isAdmin } from '../shell/session.js';
// ─── Keys ───
let _allKeys = [];
const _visibleKeyHashes = new Set();

function maskKey(key) {
  const value = String(key ?? '');
  if (value.length <= 12) return '••••••••';
  return `${value.slice(0, 6)}••••••••••••${value.slice(-4)}`;
}

function copyKeySecret(keyHash) {
  const item = _allKeys.find(k => k.keyHash === keyHash);
  if (!item) return false;
  return copyValue(item.key);
}

function toggleKeySecret(keyHash) {
  if (_visibleKeyHashes.has(keyHash)) _visibleKeyHashes.delete(keyHash);
  else _visibleKeyHashes.add(keyHash);
  renderKeyTable(getPagedRows('key', _allKeys));
  return false;
}

function getPagedRows(name, rows) {
  const st = _pageState[name];
  if (!st) return rows;
  const size = getPageSize();
  const start = (st.page - 1) * size;
  return rows.slice(start, start + size);
}

function renderKeyTable(rows) {
  document.getElementById('key-list').innerHTML = rows.length ? rows.map(k => `
    <tr>
      <td class="fw-medium">${esc(k.name)}</td>
      <td>
        <div class="key-secret">
          <span class="mono key-secret-value"${on('click', 'copyKeySecret', k.keyHash)} title="${t('inbox.click_copy')}">${esc(_visibleKeyHashes.has(k.keyHash) ? k.key : maskKey(k.key))}</span>
          ${iconBtn(_visibleKeyHashes.has(k.keyHash) ? 'eye-off' : 'eye', _visibleKeyHashes.has(k.keyHash) ? t('key.hide') : t('key.show'), on('click', 'toggleKeySecret', k.keyHash), 'blue')}
          ${iconBtn('copy', t('common.copy'), on('click', 'copyKeySecret', k.keyHash), 'blue')}
        </div>
      </td>
      <td class="cell-end">${k.callCount}</td>
      <td class="cell-end"><div class="quota-cell"><input type="number" min="0" class="quota-input" placeholder="${t('provider.no_limit')}" value="${escAttr(k.dailyLimit ?? '')}"${on('change', 'setKeyQuota', k.keyHash, VALUE)}>${k.dailyLimit != null ? `<span class="quota-used">${k.dailyCalls}/${k.dailyLimit}</span>` : ''}</div></td>
      <td class="time">${k.lastUsedAt ? fmtTime(k.lastUsedAt, 'date') : t('common.never')}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${k.active ? 'checked' : ''}${on('change', 'toggleKey', k.keyHash, CHECKED)}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </td>
      <td>${iconBtn('trash', t('common.delete'), on('click', 'deleteKey', k.keyHash, k.name), 'danger')}</td>    </tr>
  `).join('') : emptyStateRow(7, t('op.no_keys_short'));
}

async function loadKeys() {
  if (!_isAdmin) return;
  try {
    const data = await api('/keys');
    _allKeys = data.keys || [];
    delete _pageState['key'];
    paginateTable('key', _allKeys, renderKeyTable, 'key-pager');
  } catch (e) { toast(e.message, 'error'); }
}

async function createKey() {
  const name = document.getElementById('key-name').value.trim();
  if (!name) return toast(t('validate.enter_name'), 'error');
  try {
    const data = await api('/keys', { method: 'POST', body: JSON.stringify({ name }) });
    toast(t('toast.key_created'));
    addActivity('blue', `${esc(t('op.key_created'))} <span class="activity-hl">${esc(name)}</span>`, true);
    document.getElementById('key-name').value = '';
    loadKeys();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleKey(key, active) {
  try {
    await api(`/keys/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    toast(t('op.key_toggled', {action: active ? t('common.enable') : t('common.disable')}));
  } catch (e) { toast(e.message, 'error'); loadKeys(); }
}

async function setKeyQuota(key, val) {
  const dailyLimit = val === '' ? null : parseInt(val, 10);
  if (dailyLimit !== null && (!Number.isFinite(dailyLimit) || dailyLimit < 1)) return;
  try {
    await api(`/keys/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify({ dailyLimit }) });
    toast(dailyLimit ? t('op.quota_set', {n: dailyLimit}) : t('op.quota_removed'));
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteKey(key, name) {
  showDialog(t('dialog.confirm_delete'), `<p>${t('dialog.delete_account', {name: esc(name)})}</p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doDeleteKey', key)}>${t('dialog.confirm_delete')}</button>
  `);
}

async function doDeleteKey(key) {
  hideDialog();
  try {
    await api(`/keys/${encodeURIComponent(key)}`, { method: 'DELETE' });
    toast(t('toast.key_deleted'));
    loadKeys();
  } catch (e) { toast(e.message, 'error'); }
}
export { copyKeySecret, createKey, deleteKey, doDeleteKey, loadKeys, setKeyQuota, toggleKey, toggleKeySecret };
