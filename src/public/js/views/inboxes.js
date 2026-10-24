// js/views/inboxes.js — inboxes and inbox detail view.
import { addActivity } from '../components/activity.js';
import { _syncAllCheckRows } from '../components/drag-select.js';
import { _pageState, paginateTable } from '../components/pagination.js';
import { resetScopeIndicator, syncScopeIndicator } from '../components/scope-tabs.js';
import { EL, on } from '../core/actions.js';
import { api, apiAllInboxes } from '../core/api.js';
import { hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { motionDelay, prefersReducedMotion } from '../core/motion.js';
import { emptyStateRow, esc, escAttr, fmtTime, iconBtn, inboxStatusBadge, renderLoading, targetEl, toast } from '../core/util.js';
import { loadDashboard } from './dashboard.js';
// ─── Inboxes ───
let _allInboxes = [];

function renderInboxTable(rows) {
  document.getElementById('inbox-list').innerHTML = rows.length ? rows.map(i => `
    <tr>
      <td><input type="checkbox" class="inbox-check" value="${escAttr(i.id)}" data-status="${escAttr(i.status)}"></td>
      <td class="mono fs-sm">${esc(i.address)}</td>
      <td class="text-2">${esc(i.provider)}</td>
      <td>${targetEl(i.target_service)}</td>
      <td>${inboxStatusBadge(i.status)}</td>
      <td class="time">${fmtTime(i.expires_at, 'date')}</td>
      <td>
        ${iconBtn('inbox', t('inbox.receive'), on('click', 'viewInbox', i.id), 'blue')}
        ${iconBtn('code', t('inbox.extract'), on('click', 'getCode', i.id), 'blue')}
        ${i.status==='active' ? `
          ${iconBtn('check', t('inbox.success'), on('click', 'reportInbox', i.id, true), 'blue')}
          ${iconBtn('x', t('inbox.fail'), on('click', 'reportInbox', i.id, false), 'amber')}
          ${iconBtn('trash', t('common.close'), on('click', 'closeInbox', i.id), 'danger')}
        ` : ''}
      </td>
    </tr>
  `).join('') : emptyStateRow(7, t('common.no_data'));
}

async function loadInboxes() {
  const status = document.getElementById('filter-status').value;
  const provider = document.getElementById('filter-provider').value;
  let url = '/inboxes?';
  if (status) url += `status=${status}&`;
  if (provider) url += `provider=${provider}&`;
  renderLoading('inbox-list', 7);
  try {
    const data = await apiAllInboxes(url);
    _allInboxes = data.inboxes || [];
    delete _pageState['inbox'];
    paginateTable('inbox', _allInboxes, renderInboxTable, 'inbox-pager');
  } catch (e) { toast(e.message, 'error'); }
}

async function createInbox(prefix) {
  const body = {};
  const f = document.getElementById(prefix + 'inbox-for').value.trim();
  const p = document.getElementById(prefix + 'inbox-provider').value;
  const d = document.getElementById(prefix + 'inbox-domain').value.trim();
  const durEl = document.getElementById(prefix + 'inbox-duration');
  const dur = durEl ? durEl.value : '';
  if (f) body.for = f;
  if (p) body.provider = p;
  if (d) body.domain = d;
  if (dur) body.duration = parseInt(dur) * 60; // UI 输入分钟，API 接口单位为秒
  const aliasEl = document.getElementById(prefix + 'inbox-alias');
  if (aliasEl?.checked) body.alias = true;
  try {
    const result = await api('/inbox', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById(prefix + 'inbox-result').innerHTML = `
      <div class="code-box create-result">
        <div class="code-meta">Provider: <strong>${esc(result.provider)}</strong></div>
        <div class="code-value"${on('click', 'copyText', EL)} title="${escAttr(t('inbox.click_copy'))}">${esc(result.address)}</div>
        <div class="code-meta">ID: ${esc(result.id)} ${result.expiresAt ? '· Expires: ' + fmtTime(result.expiresAt) : ''}</div>
      </div>
    `;
    toast(t('toast.inbox_created'));
    addActivity('green', `Created inbox <span class="activity-hl">${esc(result.address)}</span>`, true);
    if (prefix === 'i-') loadInboxes(); else loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

/**
 * The inbox list and whatever you opened from it are two modes of one page, not
 * two stacked panels. Stacking meant every click ended in a scroll: the create
 * form plus a 20-row table pushed the messages past the fold. The list's scroll
 * position is kept so going back lands where you left.
 */
let _inboxListScroll = 0;

function inboxScroller() { return document.querySelector('.main'); }

/**
 * Fade the outgoing side, then swap. Callers must await this before writing to
 * the detail area, or the panel renders while its container is still hidden and
 * its entrance animation is thrown away.
 */
async function enterInboxDetail() {
  const view = document.getElementById('v-inboxes');
  if (!view || view.classList.contains('detail-mode')) return;
  _inboxListScroll = inboxScroller()?.scrollTop || 0;
  resetScopeIndicator();
  view.classList.add('leaving');
  await motionDelay(120);
  view.classList.remove('leaving');
  view.classList.add('detail-mode');
  if (inboxScroller()) inboxScroller().scrollTop = 0;
}

async function exitInboxDetail(restoreScroll = true, animate = true) {
  const view = document.getElementById('v-inboxes');
  if (!view || !view.classList.contains('detail-mode')) return;
  resetScopeIndicator();
  if (animate) {
    view.classList.add('leaving');
    await motionDelay(120);
    view.classList.remove('leaving');
  }
  view.classList.remove('detail-mode');
  document.getElementById('inbox-detail-area').innerHTML = '';
  if (inboxScroller()) inboxScroller().scrollTop = restoreScroll ? _inboxListScroll : 0;
}

/**
 * Fades whatever panel is already showing before the caller overwrites it.
 * No-ops on the first render into an empty area — the mode transition covers
 * that one — so this only costs a beat when one panel really replaces another.
 */
async function fadeOutDetail(area) {
  const current = area.querySelector('.detail-panel');
  if (!current || prefersReducedMotion()) return;
  current.classList.add('panel-leaving');
  await motionDelay(120);
}

/**
 * The placeholder only appears if the wait is real. Showing it unconditionally
 * meant a local fetch inserted a panel and replaced it 7ms later, so the
 * entrance animation restarted from zero and the whole thing read as a flicker.
 */
function deferredLoading(area, text) {
  const timer = setTimeout(() => {
    area.innerHTML = `<div class="detail-panel"><p class="text-3">${text}</p></div>`;
  }, 150);
  return () => clearTimeout(timer);
}

/**
 * A failed load replaces whatever the area shows — the deferred placeholder,
 * or the panel of the previous inbox — with the error and a retry, so stale
 * content never reads as the answer to this request.
 */
function renderDetailError(area, err, retryAction) {
  const msg = esc((err && err.message) || t('common.load_failed') || 'Load failed');
  area.innerHTML = `<div class="detail-panel"><div class="empty is-error">
    <p>${msg}</p>
    <button class="btn btn-sm"${retryAction}>${t('common.retry') || '重试'}</button>
  </div></div>`;
}

/** A mail body frame has loaded: size its row to the content. */
function fitMsgFrame(frame) { fitMsgBody(frame.closest('.msg-body')); }

function msgTableHead() {
  return `<thead><tr><th>${t('inbox.from')}</th><th>${t('inbox.subject')}</th><th data-i18n="common.time">${t('common.time')}</th><th>${t('common.actions')}</th></tr></thead>`;
}

function msgRow(m, readAction) {
  return `<tr>
    <td class="fs-base">${esc(m.from)}</td>
    <td>${esc(m.subject)}</td>
    <td class="time">${fmtTime(m.receivedAt, 'date')}</td>
    <td>${iconBtn('mail', t('inbox.read'), readAction, 'blue')}</td>
  </tr>`;
}

async function viewInbox(id) {
  const area = document.getElementById('inbox-detail-area');
  await enterInboxDetail();
  await fadeOutDetail(area);
  const stopLoading = deferredLoading(area, t('common.loading') || 'Loading...');
  try {
    const data = await api(`/inbox/${id}/messages`);
    stopLoading();
    const msgs = data.messages || [];
    // An inbox is a lease over a mailbox and this list stays clipped to the
    // lease. The tab is the way out to the mailbox itself — offered only when
    // the server names an account, i.e. only for Outlook, where one mailbox
    // serves one lease at a time and the rest of it is this caller's own
    // history rather than someone else's.
    const scopeTabs = data.accountEmail ? `
      <div class="scope-tabs">
        <span class="scope-ind"></span>
        <button class="scope-tab active">${t('mailbox.scope_lease')} (${msgs.length})</button>
        <button class="scope-tab"${on('click', 'scopeSwitch', EL, 'mailbox', data.accountEmail, id)}>${t('mailbox.scope_all')}</button>
      </div>` : '';
    const inboxHeader = `<div class="detail-head">
      <span class="mono fs-md fw-semibold">${esc(data.address||'')}</span>
      <span class="text-2">${esc(data.provider||'')}</span>
      ${inboxStatusBadge(data.status)}
      ${scopeTabs}
    </div>`;
    if (!msgs.length) {
      area.innerHTML = `<div class="detail-panel">${inboxHeader}<p class="text-3">${t('inbox.no_mail')}</p><div class="detail-actions">${iconBtn('refresh', t('nav.refresh'), on('click', 'viewInbox', id), 'blue')}</div></div>`;
      return;
    }
    area.innerHTML = `
      <div class="detail-panel">
        ${inboxHeader}
        <div class="detail-bar">
          <h3>${t('inbox.messages_title', {n: msgs.length})}</h3>
          ${iconBtn('refresh', t('nav.refresh'), on('click', 'viewInbox', id), 'blue')}
        </div>
        <div class="panel"><div class="table-wrap"><table>${msgTableHead()}<tbody>${msgs.map(m =>
          msgRow(m, on('click', 'readMessage', id, m.id, EL))
        ).join('')}</tbody></table></div></div>
      </div>
    `;
    syncScopeIndicator(area.querySelector('.scope-tabs'));
  } catch (e) { stopLoading(); renderDetailError(area, e, on('click', 'viewInbox', id)); }
}

/**
 * The account's whole mailbox, with every message filed under the lease that
 * held the mailbox when it arrived. The lease view above is the default because
 * it answers "did MY signup mail arrive"; this one answers "what else is in
 * here", which the lease view cannot and should not.
 */
async function viewMailbox(email, backInboxId) {
  const area = document.getElementById('inbox-detail-area');
  await enterInboxDetail();
  await fadeOutDetail(area);
  const stopLoading = deferredLoading(area, t('common.loading') || 'Loading...');
  try {
    const data = await api(`/outlook/accounts/${encodeURIComponent(email)}/mailbox`);
    stopLoading();
    const msgs = data.messages || [];
    const leases = data.leases || [];
    const leaseById = {};
    leases.forEach(l => { leaseById[l.id] = l; });

    const scopeTabs = backInboxId ? `
      <div class="scope-tabs">
        <span class="scope-ind"></span>
        <button class="scope-tab"${on('click', 'scopeSwitch', EL, 'lease', email, backInboxId)}>${t('mailbox.scope_lease')}</button>
        <button class="scope-tab active">${t('mailbox.scope_all')} (${msgs.length})</button>
      </div>` : '';

    const header = `<div class="detail-head">
      <span class="mono fs-md fw-semibold">${esc(email)}</span>
      <span class="text-2">outlook · ${t('mailbox.lease_count', {n: leases.length})}</span>
      ${scopeTabs}
    </div>`;
    const refresh = iconBtn('refresh', t('nav.refresh'), on('click', 'viewMailbox', email, backInboxId || ''), 'blue');

    if (!msgs.length) {
      area.innerHTML = `<div class="detail-panel">${header}<p class="text-3">${t('mailbox.empty')}</p><div class="detail-actions">${refresh}</div></div>`;
      return;
    }

    area.innerHTML = `
      <div class="detail-panel">
        ${header}
        <div class="detail-bar">
          <h3>${t('inbox.messages_title', {n: msgs.length})}</h3>
          ${refresh}
        </div>
        <div class="panel"><div class="table-wrap"><table>${msgTableHead()}<tbody id="mailbox-list"></tbody></table></div></div>
        <div id="mailbox-pager"></div>
        ${data.truncated ? `<div class="detail-note">${t('mailbox.limit_note', {n: data.limit})}</div>` : ''}
      </div>
    `;
    // A full mailbox is 50 rows — long enough that the pager beats scrolling.
    _mailboxCtx = { email, leaseById };
    delete _pageState['mailbox'];
    paginateTable('mailbox', msgs, renderMailboxRows, 'mailbox-pager');
    syncScopeIndicator(area.querySelector('.scope-tabs'));
  } catch (e) { stopLoading(); renderDetailError(area, e, on('click', 'viewMailbox', email, ...(backInboxId ? [backInboxId] : []))); }
}

let _mailboxCtx = null;

function renderMailboxRows(rows) {
  const { email, leaseById } = _mailboxCtx;
  // Dividers are recomputed per page, so page 2 opens with the lease its first
  // row belongs to rather than inheriting a heading the reader cannot see.
  let bucket;
  document.getElementById('mailbox-list').innerHTML = rows.map(m => {
    const key = m.leaseState === 'lease' ? m.leaseId : m.leaseState;
    let sep = '';
    if (key !== bucket) {
      bucket = key;
      sep = `<tr class="lease-sep"><td colspan="4">${leaseSepLabel(m, leaseById, email)}</td></tr>`;
    }
    return sep + msgRow(m, on('click', 'readMailboxMessage', email, m.id, EL));
  }).join('');
}

function leaseSepLabel(m, leaseById, accountEmail) {
  if (m.leaseState !== 'lease') return `<span class="lease-name">${t('mailbox.state_' + m.leaseState)}</span>`;
  const l = leaseById[m.leaseId];
  if (!l) return `<span class="lease-name">${t('mailbox.state_gap')}</span>`;
  const parts = [
    // Newest ≠ running: an account whose last lease was closed and not yet
    // re-leased still has that lease on top, and calling it "current" would say
    // the mailbox is in use when it is idle. Status is the only honest source.
    `<span class="lease-name">${l.status === 'active' ? t('mailbox.lease_current') : t('mailbox.lease_past')}</span>`,
    `<span class="mono">${esc(l.id)}</span>`,
  ];
  if (l.address && l.address !== accountEmail) parts.push(`<span class="mono">${esc(l.address)}</span>`);
  if (l.targetService) parts.push(esc(l.targetService));
  parts.push(`${fmtTime(l.createdAt, 'date')} → ${l.endedAt ? fmtTime(l.endedAt, 'date') : t('mailbox.lease_open')}`);
  return parts.join(' · ');
}

/**
 * The body opens as a row directly under the message it belongs to, so it
 * appears where the eye already is. Rendering it below the whole table meant a
 * second scroll for every message read.
 */
function renderMessage(m, btn) {
  const row = btn?.closest('tr');
  if (!row) return;
  // allow-same-origin (still WITHOUT allow-scripts, so nothing in the mail can
  // run) is what lets fitMsgBody read the rendered height and size the frame to
  // its content instead of leaving mail squeezed through a fixed slot.
  const bodyHtml = m.html
    ? `<iframe srcdoc="${escAttr(m.html)}" sandbox="allow-same-origin"${on('load', 'fitMsgFrame', EL)}></iframe>`
    : `<pre class="msg-text">${esc(m.text || t('inbox.no_content'))}</pre>`;

  // Only one body at a time. A sibling closes instantly rather than animating,
  // so switching messages never leaves two rows fighting over the layout.
  row.parentElement.querySelectorAll('.msg-expand').forEach(el => el.remove());

  const tr = document.createElement('tr');
  tr.className = 'msg-expand';
  tr.innerHTML = `<td colspan="4"><div class="msg-expand-wrap"><div>
    <div class="msg-viewer">
      <div class="msg-header"><h3>${esc(m.subject)}</h3><p>From: ${esc(m.from)} · ${fmtTime(m.receivedAt)}</p></div>
      <div class="msg-body">${bodyHtml}</div>
    </div>
  </div></div></td>`;
  row.after(tr);
  if (!m.html) fitMsgBody(tr.querySelector('.msg-body'));
  requestAnimationFrame(() => tr.classList.add('open'));
}

/** Reading the same message again closes it. Returns true when it did. */
function collapseOwnMessage(btn) {
  const open = btn?.closest('tr')?.nextElementSibling;
  if (!open || !open.classList.contains('msg-expand')) return false;
  open.classList.remove('open');
  setTimeout(() => open.remove(), 240);
  return true;
}

/**
 * Size the reader to its content, capped at ~65vh so a newsletter cannot push
 * the page furniture off screen. The cap is a starting height, not a limit —
 * .msg-body carries resize:vertical and no max-height, so dragging goes past it.
 */
function fitMsgBody(box, retried) {
  if (!box) return;
  const cap = Math.min(window.innerHeight * 0.65, 760);
  const frame = box.querySelector('iframe');
  let content;
  if (frame) {
    let inner = 0;
    try { inner = frame.contentDocument.documentElement.scrollHeight; } catch (e) { inner = 0; }
    if (inner) frame.style.height = inner + 'px';
    content = inner || 320;
    // Images finish after load and change the height under us; re-measure once.
    if (!retried) setTimeout(() => fitMsgBody(box, true), 400);
  } else {
    box.style.height = 'auto';
    content = box.scrollHeight;
  }
  box.style.height = Math.max(120, Math.min(content + 4, cap)) + 'px';
}

async function readMessage(inboxId, msgId, btn) {
  if (collapseOwnMessage(btn)) return;
  try {
    renderMessage(await api(`/inbox/${inboxId}/messages/${msgId}`), btn);
  } catch (e) { toast(e.message, 'error'); }
}

async function readMailboxMessage(email, msgId, btn) {
  if (collapseOwnMessage(btn)) return;
  try {
    renderMessage(await api(`/outlook/accounts/${encodeURIComponent(email)}/mailbox/${encodeURIComponent(msgId)}`), btn);
  } catch (e) { toast(e.message, 'error'); }
}

async function getCode(id, wait = false) {
  const area = document.getElementById('inbox-detail-area');
  await enterInboxDetail();
  await fadeOutDetail(area);
  const stopLoading = deferredLoading(area, wait ? t('inbox.extracting_wait') : t('inbox.extracting'));
  try {
    const data = await api(`/inbox/${id}/code?wait=${wait}&timeout=30`);
    stopLoading();
    if (!data.codes?.length) {
      area.innerHTML = `<div class="detail-panel"><p class="text-3">${t('inbox.no_code')}</p><button class="btn btn-primary btn-sm detail-actions"${on('click', 'getCode', id, true)}>${t('inbox.wait_retry')}</button></div>`;
      return;
    }
    addActivity('green', `${esc(t('inbox.extract') + (data.codes[0].type === 'link' ? 'link' : 'code'))} <span class="activity-hl">${esc(data.codes[0].type === 'link' ? '(link)' : data.codes[0].value)}</span>`, true);
    area.innerHTML = `
      <div class="detail-panel">
        <h3>${t('inbox.extract')}</h3>
        ${data.email ? `<p class="code-from">${t('inbox.from')}: ${esc(data.email.from)} · ${esc(data.email.subject)}</p>` : ''}
        ${data.codes.map(c => `
          <div class="code-box">
            <div class="code-meta"><span class="text-2">${esc(c.type)}</span> · ${t('inbox.confidence')}: ${(c.confidence*100).toFixed(0)}%</div>
            <div class="${c.type==='link'?'code-link':'code-value'}"${on('click', 'copyText', EL)} title="${t('inbox.click_copy')}">${esc(c.value)}</div>
            <div class="code-meta">${esc(c.context)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) { stopLoading(); renderDetailError(area, e, on('click', 'getCode', id, wait ? 'true' : 'false')); }
}

async function reportInbox(id, success) {
  try {
    const result = await api(`/inbox/${id}/report`, { method: 'POST', body: JSON.stringify({ success }) });
    if (success) {
      toast(t('toast.reported_success'));
      addActivity('green', t('activity.reported_success'));
    } else {
      const info = result.blocked?.length ? ` → blocked ${result.blocked.map(b => b.domain).join(', ')}` : '';
      toast(t('toast.reported_fail') + info);
      addActivity('rose', t('activity.reported_fail') + info);
    }
    loadInboxes();
  } catch (e) { toast(e.message, 'error'); }
}

async function closeInbox(id) {
  showDialog(t('inbox.close'), `<p>${t('dialog.confirm_close')}?</p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doClose', id)}>${t('dialog.confirm_close')}</button>
  `);
}
async function doClose(id) {
  hideDialog();
  try {
    await api(`/inbox/${id}`, { method: 'DELETE' });
    toast(t('toast.inbox_closed'));
    addActivity('rose', t('activity.closed_inbox'));
    loadInboxes();
  } catch (e) { toast(e.message, 'error'); }
}

function toggleAllInbox(checked) {
  document.querySelectorAll('.inbox-check').forEach(cb => cb.checked = checked);
  _syncAllCheckRows('inbox-check');
}

function getSelectedInboxIds(activeOnly = false) {
  return Array.from(document.querySelectorAll('.inbox-check:checked'))
    .filter(cb => !activeOnly || cb.dataset.status === 'active')
    .map(cb => cb.value);
}

async function batchCloseInbox() {
  const ids = getSelectedInboxIds();
  if (!ids.length) return toast(t('common.select_first') || '请先选择', 'error');
  if (!confirm(t('inbox.confirm_batch_close') || '批量关闭所选邮箱?')) return;
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await api(`/inbox/${id}`, { method: 'DELETE' }); ok++; }
    catch (e) { fail++; console.error('batchClose', id, e); }
  }
  const msg = fail
    ? (t('common.batch_partial') || `成功 {ok} / 失败 {fail}`).replace('{ok}', ok).replace('{fail}', fail)
    : (t('common.batch_done') || `成功关闭 {ok} 个`).replace('{ok}', ok);
  toast(msg, fail ? 'warn' : 'success');
  loadInboxes();
}

async function batchReportInbox(success) {
  const ids = getSelectedInboxIds();
  if (!ids.length) return toast(t('common.select_first') || '请先选择', 'error');
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await api(`/inbox/${id}/report`, { method: 'POST', body: JSON.stringify({ success }) }); ok++; }
    catch (e) { fail++; console.error('batchReport', id, e); }
  }
  const msg = fail
    ? (t('common.batch_partial') || `成功 {ok} / 失败 {fail}`).replace('{ok}', ok).replace('{fail}', fail)
    : (t('common.batch_done') || `成功 {ok} 个`).replace('{ok}', ok);
  toast(msg, fail ? 'warn' : 'success');
  loadInboxes();
}
export { batchCloseInbox, batchReportInbox, closeInbox, collapseOwnMessage, createInbox, deferredLoading, doClose, enterInboxDetail, exitInboxDetail, fadeOutDetail, fitMsgFrame, getCode, loadInboxes, msgRow, msgTableHead, readMailboxMessage, readMessage, renderDetailError, renderMessage, reportInbox, toggleAllInbox, viewInbox, viewMailbox };
