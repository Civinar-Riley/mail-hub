// js/views/yyds.js — YYDS key pool view.
import { addActivity } from '../components/activity.js';
import { _syncAllCheckRows } from '../components/drag-select.js';
import { _pageState, paginateTable } from '../components/pagination.js';
import { CHECKED, EL, on } from '../core/actions.js';
import { api, beginPoolJob, restorePoolJob } from '../core/api.js';
import { hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { setCount } from '../core/motion.js';
import { emptyStateRow, esc, escAttr, fmtTime, iconBtn, renderEmpty, renderLoadError, renderLoading, toast, toggleSwitch } from '../core/util.js';
// ─── YYDS Mail ───
async function loadYyds() {
  await Promise.all([loadYydsStats(), loadYydsAccounts(), restorePoolJob('yyds')]);
}

async function loadYydsStats() {
  try {
    const s = await api('/yyds/stats');
    setCount(document.getElementById('yd-total'), s.total ?? null);
    setCount(document.getElementById('yd-active'), s.active ?? null);
    setCount(document.getElementById('yd-invalid'), s.invalid ?? null);
    setCount(document.getElementById('yd-inboxes'), s.totalInboxes ?? null);
    document.getElementById('yd-stat-invalid').classList.toggle('is-warn', s.invalid > 0);
    const tag = document.getElementById('yyds-status');
    tag.textContent = t('op.no_available_key');
    tag.hidden = s.active !== 0;
  } catch (e) { toast(e.message, 'error'); }
}

let _allYdAccounts = [];

function renderYdTable(rows) {
  document.getElementById('yd-account-list').innerHTML = rows.length ? rows.map(a => {
    const wcOn = a.supports_wildcard === 1;
    const wcLabel = wcOn ? t('yyds.own_domain') : t('yyds.public');
    // An invalid key is the one state that needs a hand; the switch alone says on or off.
    const invalid = a.status !== 'active' && a.status !== 'disabled' ? ` <span class="badge badge-bad">${t('yyds.status_invalid')}</span>` : '';
    return `<tr>
      <td><input type="checkbox" class="yd-check" value="${escAttr(a.api_key)}"></td>
      <td><span class="mono fs-sm copyable"${on('click', 'copyText', EL)} title="${escAttr(t('inbox.click_copy'))}">${esc(a.api_key)}</span></td>
      <td class="fs-base">${esc(a.name || '-')}</td>
      <td><span class="toggle-cell">${toggleSwitch(wcOn, on('change', 'toggleYdWildcard', a.api_key, CHECKED), t('yyds.wildcard'))}<span class="text-2">${wcLabel}</span></span></td>
      <td class="cell-end">${a.inbox_count || 0}</td>
      <td class="cell-end">${a.daily_calls || 0}<span class="text-3 fs-sm"> / 20k</span></td>
      <td class="time">${a.last_used_at ? fmtTime(a.last_used_at, 'date') : t('common.never')}</td>
      <td><span class="toggle-cell">${toggleSwitch(a.status === 'active', on('change', 'toggleYdStatus', a.api_key, a.status), a.status === 'active' ? t('common.disable') : t('common.enable'))}${invalid}</span></td>
      <td>
        ${iconBtn('search', t('yyds.check'), on('click', 'checkSingleYd', a.api_key), 'blue')}
        ${iconBtn('trash', t('common.delete'), on('click', 'deleteYdAccount', a.api_key), 'danger')}
      </td>
    </tr>`;
  }).join('') : emptyStateRow(9, t('yyds.no_data'));
}

async function loadYydsAccounts() {
  renderLoading('yd-account-list', 9);
  try {
    const data = await api('/yyds/accounts');
    if ((data.accounts || []).length === 0) {
      renderEmpty('yd-account-list', 9, t('yyds.empty') || 'API Key 池为空', t('yyds.import_first') || '导入 API Key', on('click', 'openConfigTab', 'yd-config', 'import', 'yd-import-text'));
      return;
    }
    _allYdAccounts = data.accounts || [];
    delete _pageState['yd'];
    paginateTable('yd', _allYdAccounts, renderYdTable, 'yd-pager');
  } catch (e) { console.error('loadYyds', e); renderLoadError('yd-account-list', 9, e, on('click', 'loadYyds')); }
}

async function toggleYdWildcard(key, wildcard) {
  try {
    await api('/yyds/accounts/wildcard', { method: 'PATCH', body: JSON.stringify({ keys: [key], wildcard }) });
    toast(wildcard ? t('op.wildcard_own') : t('op.wildcard_public'));
    loadYydsAccounts();
  } catch (e) { toast(e.message, 'error'); loadYydsAccounts(); }
}

async function toggleYdStatus(key, currentStatus) {
  const enabled = currentStatus !== 'active';
  try {
    await api('/yyds/accounts/status', { method: 'PATCH', body: JSON.stringify({ keys: [key], enabled }) });
    toast(enabled ? t('op.enabled') : t('op.disabled'));
    loadYyds();
  } catch (e) { toast(e.message, 'error'); loadYydsAccounts(); }
}

function toggleAllYd(checked) {
  document.querySelectorAll('.yd-check').forEach(cb => cb.checked = checked);
  _syncAllCheckRows('yd-check');
}

function getSelectedYdKeys() {
  return Array.from(document.querySelectorAll('.yd-check:checked')).map(cb => cb.value);
}

async function importYyds() {
  const text = document.getElementById('yd-import-text').value.trim();
  if (!text) return toast(t('validate.paste_key'), 'error');
  const status = document.getElementById('yd-import-status');
  status.textContent = t('op.importing');
  try {
    const data = await api('/yyds/import', { method: 'POST', body: JSON.stringify({ accounts: text }) });
    status.textContent = t('op.imported_n', {imported: data.imported, skipped: data.skipped});
    if (data.imported > 0) {
      toast(t('op.import_success', {n: data.imported}));
      addActivity('emerald', `${esc(t('activity.imported'))} <span class="activity-hl">${esc(String(data.imported))}</span> YYDS Mail`, true);
      document.getElementById('yd-import-text').value = '';
      loadYyds();
    }
    if (data.errors?.length) status.textContent += ` | ${t('op.import_error', {msg: data.errors[0]})}`;
  } catch (e) { status.textContent = ''; toast(e.message, 'error'); }
}

async function checkSingleYd(key) {
  await beginPoolJob('/yyds/check', { keys: [key] });
}

async function batchCheckYyds() {
  await beginPoolJob('/yyds/check', getSelectedYdKeys().length ? { keys: getSelectedYdKeys() } : {});
}

async function deleteYdAccount(key) {
  showDialog(t('dialog.confirm_delete'), `<p>${t('dialog.delete_key')}<br><span class="mono fs-sm">${esc(key)}</span></p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doDeleteYd', key)}>${t('dialog.confirm_delete')}</button>
  `);
}

async function doDeleteYd(key) {
  hideDialog();
  try {
    await api('/yyds/accounts', { method: 'DELETE', body: JSON.stringify({ keys: [key] }) });
    toast(t('toast.deleted'), 'success'); // Key deleted;
    loadYyds();
  } catch (e) { toast(e.message, 'error'); }
}

async function batchDeleteYyds() {
  const keys = getSelectedYdKeys();
  if (!keys.length) return toast(t('validate.select_delete'), 'error');
  showDialog(t('common.delete'), `<p>${t('dialog.batch_delete', {n: keys.length})}</p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doBatchDeleteYd')}>${t('dialog.confirm_delete')}</button>
  `);
}

async function doBatchDeleteYd() {
  hideDialog();
  const keys = getSelectedYdKeys();
  try {
    await api('/yyds/accounts', { method: 'DELETE', body: JSON.stringify({ keys }) });
    toast(t('op.deleted_n', {n: keys.length}));
    loadYyds();
  } catch (e) { toast(e.message, 'error'); }
}
export { batchCheckYyds, batchDeleteYyds, checkSingleYd, deleteYdAccount, doBatchDeleteYd, doDeleteYd, importYyds, loadYyds, loadYydsAccounts, loadYydsStats, toggleAllYd, toggleYdStatus, toggleYdWildcard };
