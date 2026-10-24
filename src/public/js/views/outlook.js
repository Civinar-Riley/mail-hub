// js/views/outlook.js — Outlook account pool view.
import { addActivity } from '../components/activity.js';
import { initConfigCard, selectConfigTab } from '../components/config-card.js';
import { _syncAllCheckRows } from '../components/drag-select.js';
import { foldBody } from '../components/fold.js';
import { _pageState, paginateTable } from '../components/pagination.js';
import { on } from '../core/actions.js';
import { api, beginPoolJob, restorePoolJob } from '../core/api.js';
import { hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { setCount, staggerRows } from '../core/motion.js';
import { esc, escAttr, fmtTime, iconBtn, renderEmpty, renderLoadError, renderLoading, sleep, toast } from '../core/util.js';
/**
 * Outlook keeps its low-frequency forms in one folded card:
 * the account list is what the view is for, so it has to be on screen first.
 * Every panel in the stack becomes one tab.
 */
function initOutlookConfigCards() {
  const card = document.getElementById('ol-config');
  const stack = document.getElementById('ol-panels-grid');
  if (!card || !stack) return;
  const body = foldBody(card);
  const tabs = card.querySelector('.card-tabs');
  for (const panel of [...stack.children]) {
    if (panel === card || !panel.id || !panel.classList.contains('panel')) continue;
    const label = panel.querySelector(':scope > .panel-header .panel-title')?.textContent.trim() || panel.id;
    panel.classList.add('config-pane');
    panel.dataset.pane = panel.id;
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    body.appendChild(panel);
    const btn = document.createElement('button');
    btn.className = 'card-tab';
    btn.setAttribute('role', 'tab');
    btn.dataset.tab = panel.id;
    btn.innerHTML = '<span class="card-tab-label"></span>';
    btn.firstChild.textContent = label;
    btn.addEventListener('click', () => selectConfigTab(card.id, panel.id));
    tabs.appendChild(btn);
  }
  initConfigCard('ol-config');
}

// ─── Outlook ───
async function loadOutlook() {
  initOutlookConfigCards();
  _olStaggerNext = true;
  await Promise.all([loadOutlookStats(), loadOutlookAccounts(), loadOlSettings(), restorePoolJob('outlook')]);
}

async function loadOlSettings() {
  try {
    const s = await api('/outlook/settings');
    document.getElementById('ol-record-fail').checked = s.recordFailService;
    document.getElementById('ol-oauth-client-id').value = s.oauthClientId || '';
    document.getElementById('ol-oauth-redirect-uri').value = s.oauthRedirectUri || '';
    document.getElementById('ol-oauth-scopes').value = s.oauthScopes || '';
    document.getElementById('ol-oauth-tenant').value = s.oauthTenant || '';
  } catch (e) { console.error('loadOlSettings', e); }
}

function normalizeOlSettingValue(v) {
  return v == null ? '' : String(v);
}

async function saveOlSettings() {
  const payload = {
    recordFailService: document.getElementById('ol-record-fail').checked,
    oauthClientId: normalizeOlSettingValue(document.getElementById('ol-oauth-client-id').value),
    oauthRedirectUri: normalizeOlSettingValue(document.getElementById('ol-oauth-redirect-uri').value),
    oauthScopes: normalizeOlSettingValue(document.getElementById('ol-oauth-scopes').value),
    oauthTenant: normalizeOlSettingValue(document.getElementById('ol-oauth-tenant').value),
  };
  try {
    await api('/outlook/settings', { method: 'PATCH', body: JSON.stringify(payload) });
    toast(t('toast.saved'));
  } catch (e) { toast(e.message, 'error'); loadOlSettings(); }
}

async function loadOutlookStats() {
  try {
    const s = await api('/outlook/stats');
    // An unknown count shows a dash, never 0.
    const toNumber = (v) => v != null && Number.isFinite(Number(v)) ? Number(v) : null;
    const pending = toNumber(s.pendingOAuth ?? s.pending_oauth);
    const noToken = toNumber(s.noToken ?? s.no_token);
    setCount(document.getElementById('ol-total'), toNumber(s.total));
    setCount(document.getElementById('ol-available'), toNumber(s.available));
    setCount(document.getElementById('ol-assigned'), toNumber(s.assigned));
    setCount(document.getElementById('ol-valid'), toNumber(s.validToken ?? s.valid ?? s.valid_tokens));
    setCount(document.getElementById('ol-pending-oauth'), pending);
    setCount(document.getElementById('ol-no-token'), noToken);
    // Only counts that need a hand take a colour.
    document.getElementById('ol-stat-pending').classList.toggle('is-warn', pending > 0);
    document.getElementById('ol-stat-notoken').classList.toggle('is-warn', noToken > 0);
    const tag = document.getElementById('outlook-status');
    tag.textContent = t('op.no_available_account');
    tag.hidden = toNumber(s.available) !== 0;
  } catch (e) { toast(e.message, 'error'); }
}

let _allOlAccounts = [];

let _olStaggerNext = false;

function renderOlTable(rows) {
  const tbody = document.getElementById('ol-account-list');
  if (!rows.length) { renderEmpty('ol-account-list', 8, t('common.no_match')); return; }
  tbody.innerHTML = rows.map(a => {
    const status = (a.token_status || '').toString().toLowerCase();
    const isNoToken = status === 'no_token' || status === 'notoken';
    const isPendingOauth = status === 'pending_oauth' || status === 'pending';
    const needsAuth = isNoToken || isPendingOauth;
    const unusable = needsAuth || status === 'invalid';
    // The token column carries the row's only badge, and
    // only states that need a hand are coloured — a healthy pool reads grey.
    const tone = status === 'invalid' ? 'badge-bad' : needsAuth ? 'badge-warn' : '';
    const assigned = a.assigned_inbox_id ? t('outlook.assigned') : unusable ? t('outlook.unavailable') : t('outlook.free');
    const assignedClass = a.assigned_inbox_id ? '' : unusable ? 'text-3' : 'text-2';
    const typeLabel = a.account_type === 'long' ? t('outlook.long') : t('outlook.short');
    const actions = needsAuth
      ? [iconBtn('copy', t('outlook.copy_password'), on('click', 'copyOutlookOauthPassword', a.email)),
         iconBtn('check', t('outlook.complete_oauth'), on('click', 'startOutlookOauth', a.email))]
      : [iconBtn('inbox', t('mailbox.open'), on('click', 'switchAndViewMailbox', a.email)),
         iconBtn('search', t('outlook.check'), on('click', 'checkSingleOl', a.email)),
         iconBtn('refresh', t('outlook.renew'), on('click', 'renewSingleOl', a.email))];
    // Delete asks for confirmation before it acts, so it sits in the row with
    // the rest; an assigned account cannot be deleted and keeps the slot empty.
    const del = a.assigned_inbox_id
      ? '<span class="row-actions-gap"></span>'
      : iconBtn('trash', t('common.delete'), on('click', 'deleteOlAccount', a.email), 'danger');
    return `<tr>
      <td><input type="checkbox" class="ol-check" value="${escAttr(a.email)}"></td>
      <td class="mono">${esc(a.email)}</td>
      <td class="text-2">${typeLabel}</td>
      <td><span class="badge ${tone}">${getOutlookOauthStatusText(status)}</span></td>
      <td class="${assignedClass}">${assigned}</td>
      <td class="text-2">${esc(a.group_name || '—')}</td>
      <td class="time cell-end">${fmtTime(a.token_renewed_at, 'date')}</td>
      <td class="cell-end"><div class="row-actions">${actions.join('')}${del}</div></td>
    </tr>`;
  }).join('');
  if (_olStaggerNext) { _olStaggerNext = false; staggerRows(tbody); }
}

function getOutlookOauthStatusText(status) {
  const s = (status || '').toLowerCase();
  if (s === 'pending_oauth' || s === 'pending') return t('outlook.status_pending_oauth');
  if (s === 'no_token' || s === 'notoken') return t('outlook.status_no_token');
  if (s === 'invalid') return t('outlook.status_invalid');
  if (s === 'valid') return t('outlook.status_valid');
  return t('outlook.status_unchecked');
}

function isOutlookOauthCompleted(status) {
  const s = (status || '').toLowerCase();
  return !['pending', 'pending_oauth', 'in_progress', 'starting', 'started', 'processing', 'exchanging', 'validating'].includes(s);
}

function isOutlookOauthSuccess(status) {
  const s = (status || '').toLowerCase();
  return ['completed', 'success', 'valid', 'ok', 'finished'].includes(s);
}

async function startOutlookOauth(email) {
  toast(t('op.oauth_starting'));
  let session;
  let popup;
  try {
    if (!email) throw new Error(t('validate.paste_account'));
    const data = await api('/outlook/oauth/start', { method: 'POST', body: JSON.stringify({ email, preset: 'thunderbird' }) });
    session = data?.sessionId;
    if (!session || !data.authorizeUrl) throw new Error(t('op.oauth_bad_start'));
    await copyOutlookOauthPassword(email, session, { silent: true }).catch(() => toast(t('op.oauth_password_copy_hint'), 'error'));
    if (data.serverProxyConfigured) {
      await navigator.clipboard.writeText(data.authorizeUrl);
      toast(t('op.oauth_proxy_link_copied'), 'success');
      return;
    }
    popup = window.open(data.authorizeUrl, 'mailhub_outlook_oauth', 'width=560,height=760');
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      throw new Error(t('op.oauth_popup_blocked'));
    }
    toast(t('op.oauth_waiting'));
    const pollTimeout = 120000;
    const pollStart = Date.now();
    const pollStep = 2000;
    while (true) {
      if (Date.now() - pollStart > pollTimeout) {
        throw new Error(t('op.oauth_timeout'));
      }
      const statusData = await api(`/outlook/oauth/status/${encodeURIComponent(session)}`);
      const status = (statusData.status || '').toLowerCase();
      if (isOutlookOauthCompleted(status)) {
        if (isOutlookOauthSuccess(status)) {
          toast(t('op.oauth_completed'), 'success');
        } else {
          toast(t('op.oauth_failed', { reason: statusData.error || status || t('outlook.status_invalid') }), 'error');
        }
        break;
      }
      if (popup.closed) {
        throw new Error(t('op.oauth_cancelled'));
      }
      await sleep(pollStep);
    }
  } catch (e) {
    toast(e.message || t('op.oauth_flow_failed'), 'error');
  } finally {
    if (popup && !popup.closed) popup.close();
    loadOutlook();
  }
}

async function copyOutlookOauthPassword(email, sessionId = '', opts = {}) {
  try {
    const payload = sessionId ? { sessionId } : { email };
    const data = await api('/outlook/oauth/password', { method: 'POST', body: JSON.stringify(payload) });
    if (!data?.password) throw new Error(t('outlook.password_missing'));
    await navigator.clipboard.writeText(data.password);
    if (!opts.silent) toast(t('outlook.password_copied'), 'success');
  } catch (e) {
    if (!opts.silent) toast(e.message || t('validate.copy_failed'), 'error');
    if (opts.silent) throw e;
  }
}

async function submitOutlookOauthFinalUrl() {
  const input = document.getElementById('ol-oauth-final-url');
  const finalUrl = input?.value.trim();
  if (!finalUrl) return toast(t('validate.no_content'), 'error');
  try {
    toast(t('op.oauth_code_submitting'));
    await api('/outlook/oauth/code', { method: 'POST', body: JSON.stringify({ finalUrl }) });
    if (input) input.value = '';
    toast(t('op.oauth_completed'), 'success');
    await Promise.all([loadOutlookStats(), loadOutlookAccounts()]);
  } catch (e) {
    toast(e.message || t('op.oauth_submit_failed'), 'error');
  }
}

async function loadOutlookAccounts() {
  const status = document.getElementById('ol-filter-status').value;
  const avail = document.getElementById('ol-filter-avail').value;
  const type = document.getElementById('ol-filter-type').value;
  let url = '/outlook/accounts?';
  if (status) url += `status=${status}&`;
  if (avail) url += `available=${avail}&`;
  if (type) url += `type=${type}&`;
  // First visit only: a list already on screen stays until the new one replaces it.
  if (!document.getElementById('ol-account-list').rows.length) renderLoading('ol-account-list', 8);
  try {
    const data = await api(url);
    _allOlAccounts = data.accounts || [];
    if (_allOlAccounts.length === 0) {
      renderEmpty('ol-account-list', 8, t('outlook.empty') || '账号池为空', t('outlook.import_first') || '导入账号', on('click', 'openConfigTab', 'ol-config', 'import', 'ol-import-text'));
      return;
    }
    filterOlAccounts();
  } catch (e) { console.error('loadOutlook', e); renderLoadError('ol-account-list', 8, e, on('click', 'loadOutlook')); }
}

function filterOlAccounts() {
  const q = (document.getElementById('ol-search')?.value || '').trim().toLowerCase();
  delete _pageState['ol'];
  const filtered = q
    ? _allOlAccounts.filter(a => (a.email || '').toLowerCase().includes(q) || (a.group_name || '').toLowerCase().includes(q))
    : _allOlAccounts;
  paginateTable('ol', filtered, renderOlTable, 'ol-pager');
}

function toggleAllOl(checked) {
  document.querySelectorAll('.ol-check').forEach(cb => cb.checked = checked);
  _syncAllCheckRows('ol-check');
}

function getSelectedOlEmails() {
  return Array.from(document.querySelectorAll('.ol-check:checked')).map(cb => cb.value);
}

async function importOutlook() {
  const text = document.getElementById('ol-import-text').value.trim();
  if (!text) return toast(t('validate.paste_account'), 'error');
  const status = document.getElementById('ol-import-status');
  status.textContent = t('op.importing');
  try {
    const importType = document.getElementById('ol-import-type').value;
    const data = await api('/outlook/import', { method: 'POST', body: JSON.stringify({ accounts: text, type: importType }) });
    status.textContent = t('op.imported_n', {imported: data.imported, skipped: data.skipped});
    if (data.imported > 0) {
      toast(t('op.import_success', {n: data.imported}));
      addActivity('blue', `${esc(t('activity.imported'))} <span class="activity-hl">${esc(String(data.imported))}</span> Outlook`, true);
      document.getElementById('ol-import-text').value = '';
      loadOutlook();
    }
    if (data.errors?.length) status.textContent += ` | ${t('op.import_error', {msg: data.errors[0]})}`;
  } catch (e) { status.textContent = ''; toast(e.message, 'error'); }
}

async function checkSingleOl(email) {
  await beginPoolJob('/outlook/check', { emails: [email] });
}

async function renewSingleOl(email) {
  await beginPoolJob('/outlook/renew', { emails: [email] });
}

async function batchCheckOutlook() {
  await beginPoolJob('/outlook/check', getSelectedOlEmails().length ? { emails: getSelectedOlEmails() } : {});
}

async function batchRenewOutlook() {
  await beginPoolJob('/outlook/renew', getSelectedOlEmails().length ? { emails: getSelectedOlEmails() } : {});
}

async function deleteOlAccount(email) {
  showDialog(t('dialog.confirm_delete'), `<p>${t('dialog.delete_account', {name: esc(email)})}<br><span class="fs-base text-3">${t('dialog.delete_account_hint')}</span></p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doDeleteOl', email)}>${t('dialog.confirm_delete')}</button>
  `);
}

async function doDeleteOl(email) {
  hideDialog();
  try {
    await api('/outlook/accounts', { method: 'DELETE', body: JSON.stringify({ emails: [email] }) });
    toast(t('toast.deleted'), 'success'); // account deleted;
    loadOutlook();
  } catch (e) { toast(e.message, 'error'); }
}

function batchDeleteOutlook() {
  const emails = getSelectedOlEmails();
  if (!emails.length) { toast(t('validate.select_delete'), 'error'); return; }
  showDialog(t('common.delete'), `<p>${t('dialog.batch_delete', {n: emails.length})}<br><span class="fs-base text-3">${t('dialog.batch_delete_account_hint')}</span></p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doBatchDeleteOl')}>${t('dialog.confirm_delete')}</button>
  `);
}

async function doBatchDeleteOl() {
  hideDialog();
  const emails = getSelectedOlEmails();
  try {
    const data = await api('/outlook/accounts', { method: 'DELETE', body: JSON.stringify({ emails }) });
    toast(t('op.deleted_n', {n: data.deleted}));
    addActivity('amber', `${esc(t('common.delete'))} <span class="activity-hl">${esc(String(data.deleted))}</span> Outlook`, true);
    loadOutlook();
  } catch (e) { toast(e.message, 'error'); }
}

// Runs once startup has finished loading scripts, so every panel in the stack is wired.
function placeOutlookOauthPanel() {
  initOutlookConfigCards();
}
export { batchCheckOutlook, batchDeleteOutlook, batchRenewOutlook, checkSingleOl, copyOutlookOauthPassword, deleteOlAccount, doBatchDeleteOl, doDeleteOl, filterOlAccounts, importOutlook, loadOutlook, loadOutlookAccounts, loadOutlookStats, placeOutlookOauthPanel, renewSingleOl, saveOlSettings, startOutlookOauth, submitOutlookOauthFinalUrl, toggleAllOl };
