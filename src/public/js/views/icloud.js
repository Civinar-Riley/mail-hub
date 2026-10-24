// js/views/icloud.js — iCloud aliases view.
import { addActivity } from '../components/activity.js';
import { openConfigTab } from '../components/config-card.js';
import { EL, on } from '../core/actions.js';
import { api } from '../core/api.js';
import { confirmDialog, hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { setCount } from '../core/motion.js';
import { esc, escAttr, fmtTime, iconBtn, renderEmpty, renderLoadError, renderLoading, setTone, toast } from '../core/util.js';
import { collapseOwnMessage, deferredLoading, enterInboxDetail, fadeOutDetail, msgRow, msgTableHead, renderDetailError, renderMessage } from './inboxes.js';
// ─── iCloud aliases ───
// 'degraded' is not a failure: the cookie expired, so no new addresses can be
// minted, but every address already in the pool still receives and reads.
// Painting it the same red as a dead account sends someone off fixing an outage
// that is not happening.
const ICLOUD_STATUS_BADGE = { active: 'badge', degraded: 'badge badge-warn', error: 'badge badge-bad' };
async function loadIcloud() {
  // Both lists are loaded one after the other; both show the skeleton from the start.
  renderLoading('icloud-account-list', 5);
  renderLoading('icloud-address-list', 5);
  await loadIcloudPoolSettings();
  await loadIcloudAccounts();
  await loadIcloudAddresses();
}

/**
 * The refill controls sit on this page rather than in Settings because this is
 * where the pool they fill is visible — turning autofill off while looking at
 * a full pool is a different decision from doing it blind two pages away.
 */
async function loadIcloudPoolSettings() {
  try {
    const { settings } = await api('/admin/settings');
    document.getElementById('icloud-autofill').checked = settings.icloud_pool_enabled !== '0';
    document.getElementById('icloud-pool-target').value = settings.icloud_pool_target || '10';
    renderIcloudPoolStatus(settings);
  } catch (e) { console.error('loadIcloudPoolSettings', e); }
}

function renderIcloudPoolStatus(settings) {
  const el = document.getElementById('icloud-pool-status');
  if (!el) return;
  el.textContent = settings.icloud_pool_enabled === '0'
    ? t('icloud.autofill_off')
    : t('icloud.autofill_on', { n: settings.icloud_pool_interval_minutes || '15' });
}

async function saveIcloudPoolSettings() {
  const enabled = document.getElementById('icloud-autofill').checked;
  const target = parseInt(document.getElementById('icloud-pool-target').value, 10) || 10;
  try {
    const res = await api('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: { icloud_pool_enabled: enabled ? '1' : '0', icloud_pool_target: String(target) } }),
    });
    // The server clamps the target at 750 — an Apple ID's lifetime cap — so
    // show back what it actually stored rather than what was typed.
    if (res.settings?.icloud_pool_target) {
      document.getElementById('icloud-pool-target').value = res.settings.icloud_pool_target;
    }
    await loadIcloudPoolSettings();
    addActivity(enabled ? 'green' : 'amber', enabled ? t('icloud.autofill_enabled') : t('icloud.autofill_disabled'));
  } catch (e) { addActivity('rose', e.message); loadIcloudPoolSettings(); }
  return false;
}
let _icloudAccounts = [];
let _icloudAddresses = [];

async function loadIcloudAccounts() {
  renderLoading('icloud-account-list', 5);
  try {
    _icloudAccounts = (await api('/icloud/accounts')).accounts || [];
    setCount(document.getElementById('icloud-total'), _icloudAccounts.length);
    // 'degraded' still serves the pool, so it is not "needs setup" either.
    const usable = _icloudAccounts.filter(a => a.status === 'active' || a.status === 'degraded').length;
    const minting = _icloudAccounts.filter(a => a.status === 'active').length;
    // "Ready" says nothing the counts don't; only the two states that need a hand show.
    const tag = document.getElementById('icloud-status');
    tag.textContent = usable > 0 ? t('icloud.status_degraded') : t('icloud.needs_setup');
    tag.className = usable > 0 ? 'is-warn' : 'is-bad';
    tag.hidden = minting > 0;
    renderIcloudAccounts();
  } catch (e) { console.error('loadIcloudAccounts', e); renderLoadError('icloud-account-list', 5, e, on('click', 'loadIcloudAccounts')); }
}

function renderIcloudAccounts() {
  const q = (document.getElementById('icloud-account-search')?.value || '').trim().toLowerCase();
  const rows = _icloudAccounts.filter(a => !q || (a.apple_id || '').toLowerCase().includes(q));

  if (!rows.length) {
    renderEmpty('icloud-account-list', 5,
      _icloudAccounts.length ? t('common.no_match') : t('icloud.no_account'),
      _icloudAccounts.length ? '' : t('icloud.add_first'),
      on('click', 'openConfigTab', 'icloud-config', 'add', 'icloud-apple-id'));
    return;
  }

  document.getElementById('icloud-account-list').innerHTML = rows.map(a => {
    // Counting here rather than server-side keeps the pool panel the single
    // source of truth for what an account actually holds.
    const mine = _icloudAddresses.filter(r => r.account_id === a.id);
    const free = mine.filter(r => r.state === 'free').length;
    const held = mine.filter(r => r.state === 'assigned').length;
    const err = a.last_error
      ? `<div class="cell-sub tone-bad" title="${escAttr(a.last_error)}">${esc(a.last_error.slice(0, 90))}${a.last_error.length > 90 ? '…' : ''}</div>`
      : '';
    return `
      <tr>
        <td>
          <div>${esc(a.apple_id)}</div>
          <div class="cell-sub">${esc(a.region)} · ${esc(a.auth_mode === 'srp' ? t('icloud.auth_srp') : t('icloud.auth_cookie'))}</div>
        </td>
        <td>
          <span class="${ICLOUD_STATUS_BADGE[a.status] || 'badge badge-bad'}" title="${escAttr(t('icloud.status_' + a.status + '_hint'))}">${esc(t('icloud.status_' + a.status))}</span>
          ${err}
        </td>
        <td><span class="tone-ok">${free}</span> <span class="text-3">/ ${mine.length}</span>${held ? `<div class="cell-sub">${held} ${esc(t('icloud.assigned'))}</div>` : ''}</td>
        <td>${a.last_checked_at ? fmtTime(a.last_checked_at, 'date') : '-'}</td>
        <td>
          ${iconBtn('plus', t('icloud.generate'), on('click', 'generateIcloud', a.id), 'blue')}
          ${iconBtn('key', t('icloud.srp'), on('click', 'srpIcloudLogin', a.id), 'blue')}
          ${iconBtn('refresh', t('icloud.recookie'), on('click', 'refreshIcloudCookies', a.id), 'amber')}
          ${iconBtn('test', t('common.test'), on('click', 'testIcloudAccount', a.id), 'blue')}
          ${iconBtn('trash', t('common.delete'), on('click', 'deleteIcloudAccount', a.id), 'danger')}
        </td>
      </tr>`;
  }).join('');
}

async function loadIcloudAddresses() {
  renderLoading('icloud-address-list', 5);
  try {
    _icloudAddresses = (await api('/icloud/addresses')).addresses || [];
    setCount(document.getElementById('icloud-free'), _icloudAddresses.filter(r => r.state === 'free').length);
    setCount(document.getElementById('icloud-assigned'), _icloudAddresses.filter(r => r.state === 'assigned').length);
    renderIcloudAddresses();
    // The account rows show per-account pool counts, so they follow this data.
    if (_icloudAccounts.length) renderIcloudAccounts();
  } catch (e) { console.error('loadIcloudAddresses', e); renderLoadError('icloud-address-list', 5, e, on('click', 'loadIcloudAddresses')); }
}

function renderIcloudAddresses() {
  const q = (document.getElementById('icloud-address-search')?.value || '').trim().toLowerCase();
  const state = document.getElementById('icloud-address-state')?.value || '';
  const rows = _icloudAddresses.filter(r =>
    (!q || r.hme.toLowerCase().includes(q)) && (!state || r.state === state));

  if (!rows.length) {
    renderEmpty('icloud-address-list', 5,
      _icloudAddresses.length ? t('common.no_match') : t('icloud.empty_pool'));
    return;
  }

  // Free and held are both normal; a retired address is done with, so it reads muted.
  const stateBadge = { free: 'badge', assigned: 'badge', retired: 'badge text-3' };
  document.getElementById('icloud-address-list').innerHTML = rows.map(r => `
    <tr>
      <td><code>${esc(r.hme)}</code>${r.created_at ? `<div class="cell-sub">${esc(fmtTime(r.created_at, 'date'))}</div>` : ''}</td>
      <td><span class="${stateBadge[r.state] || 'badge'}">${esc(t('icloud.state_' + r.state) || r.state)}</span></td>
      <td>${r.use_count}</td>
      <td>${r.assigned_inbox_id ? `<code>${esc(r.assigned_inbox_id)}</code>` : '<span class="text-3">-</span>'}</td>
      <td>
        ${iconBtn('inbox', t('icloud.view_mail'), on('click', 'viewIcloudMailbox', r.hme), 'blue')}
        ${r.state === 'retired' ? '' : iconBtn('trash', t('icloud.retire'), on('click', 'retireIcloudAddress', r.hme), 'danger')}
      </td>
    </tr>`).join('');
}

/**
 * Open an address's mail in the inbox detail view.
 *
 * The same view Outlook's account mailbox uses, for the same reason: this
 * answers "what has ever arrived at this address", which the tenant-facing
 * inbox view deliberately cannot — it hides everything older than the inbox
 * asking. Reusing the view means the message list, the reader and the pager all
 * behave identically to every other mailbox in the app.
 */
async function viewIcloudMailbox(hme) {
  // Switch to the inboxes view the same way the nav does, so the sidebar's
  // active state follows and does not keep pointing at the iCloud page.
  document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('.nav-icon[data-view="inboxes"]')?.classList.add('active');
  document.getElementById('v-inboxes').classList.add('active');

  const area = document.getElementById('inbox-detail-area');
  await enterInboxDetail();
  await fadeOutDetail(area);
  const stopLoading = deferredLoading(area, t('common.loading') || 'Loading...');
  try {
    const data = await api('/icloud/addresses/' + encodeURIComponent(hme) + '/messages');
    stopLoading();
    const msgs = data.messages || [];

    const header = '<div class="detail-head">' +
      '<span class="mono fs-md fw-semibold">' + esc(hme) + '</span>' +
      '<span class="text-2">icloud</span>' +
      '</div>';
    const refresh = iconBtn('refresh', t('nav.refresh'), on('click', 'viewIcloudMailbox', hme), 'blue');

    if (!msgs.length) {
      area.innerHTML = '<div class="detail-panel">' + header +
        '<p class="text-3">' + esc(t('icloud.no_mail')) + '</p>' +
        '<div class="detail-actions">' + refresh + '</div></div>';
      return;
    }

    area.innerHTML = '<div class="detail-panel">' + header +
      '<div class="detail-bar">' +
        '<h3>' + t('inbox.messages_title', { n: msgs.length }) + '</h3>' + refresh +
      '</div>' +
      '<div class="panel"><div class="table-wrap"><table>' + msgTableHead() + '<tbody>' +
        // Newest first, matching every other mailbox in the app.
        msgs.slice().reverse().map(m =>
          msgRow(m, on('click', 'readIcloudMessage', hme, m.id, EL))).join('') +
      '</tbody></table></div></div></div>';
  } catch (e) { stopLoading(); renderDetailError(area, e, on('click', 'viewIcloudMailbox', hme)); }
}

async function readIcloudMessage(hme, uid, btn) {
  if (collapseOwnMessage(btn)) return;
  try {
    const data = await api('/icloud/addresses/' + encodeURIComponent(hme) + '/messages/' + encodeURIComponent(uid));
    renderMessage(data.message, btn);
  } catch (e) { toast(e.message, 'error'); }
}

/**
 * Fill host and port from the chosen provider, and only show the raw fields
 * when none of them fits. Typing a hostname is a step nobody should need for
 * the two providers Hide My Email actually forwards to in practice.
 */
function applyIcloudHostPreset() {
  const preset = document.getElementById('icloud-imap-preset').value;
  const custom = !preset;
  document.getElementById('icloud-host-custom').hidden = !custom;
  document.getElementById('icloud-port-custom').hidden = !custom;
  if (!custom) {
    const [host, port] = preset.split('|');
    document.getElementById('icloud-imap-host').value = host;
    document.getElementById('icloud-imap-port').value = port;
  }
  return false;
}

/**
 * Receiving-mailbox domain -> the IMAP host of its preset in #icloud-imap-preset.
 * Referenced since v0.10.1 but never declared, so typing an address threw on
 * every keystroke and the preset never followed it.
 */
const IMAP_HOSTS = {
  'icloud.com': 'imap.mail.me.com', 'me.com': 'imap.mail.me.com', 'mac.com': 'imap.mail.me.com',
  'gmail.com': 'imap.gmail.com', 'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com', 'hotmail.com': 'outlook.office365.com', 'live.com': 'outlook.office365.com', 'msn.com': 'outlook.office365.com',
};

/** Point the preset at whatever provider the receiving mailbox belongs to. */
function suggestIcloudImapHost() {
  const user = document.getElementById('icloud-imap-user').value.trim().toLowerCase();
  const domain = user.split('@')[1];
  if (!domain || !IMAP_HOSTS[domain]) return;
  const select = document.getElementById('icloud-imap-preset');
  const wanted = [...select.options].find(o => o.value.startsWith(IMAP_HOSTS[domain] + '|'));
  if (wanted && select.value !== wanted.value) {
    select.value = wanted.value;
    applyIcloudHostPreset();
  }
}

async function addIcloudAccount() {
  const status = document.getElementById('icloud-add-status');
  if (icloudCookieTarget) {
    const blob = document.getElementById('icloud-cookies').value.trim();
    if (!blob) { status.textContent = t('icloud.fill_cookie'); setTone(status, 'bad'); return; }
    try {
      const r = await api('/icloud/accounts/' + icloudCookieTarget + '/cookies', { method: 'POST', body: JSON.stringify({ cookies: blob }) });
      status.textContent = t('icloud.cookie_updated') + ' (' + (r.found || []).length + ')';
      setTone(status, 'ok');
      document.getElementById('icloud-cookies').value = '';
      cancelIcloudCookieTarget();
    } catch (e) { status.textContent = e.message; setTone(status, 'bad'); }
    loadIcloud();
    return;
  }
  const body = {
    appleId: document.getElementById('icloud-apple-id').value.trim(),
    region: document.getElementById('icloud-region').value,
    cookies: document.getElementById('icloud-cookies').value.trim(),
    imapUser: document.getElementById('icloud-imap-user').value.trim() || undefined,
    imapHost: document.getElementById('icloud-imap-host').value.trim() || undefined,
    imapPort: parseInt(document.getElementById('icloud-imap-port').value) || 993,
    imapPassword: document.getElementById('icloud-imap-password').value,
  };
  // The app-specific password is not optional in practice: without it the
  // addresses can be minted but never read, which looks like a broken provider.
  if (!body.appleId || !body.cookies || !body.imapPassword) {
    status.textContent = t('icloud.fill_all'); setTone(status, 'bad'); return;
  }
  status.textContent = t('icloud.adding'); setTone(status, 'muted');
  try {
    await api('/icloud/accounts', { method: 'POST', body: JSON.stringify(body) });
    status.textContent = t('icloud.added'); setTone(status, 'ok');
    document.getElementById('icloud-cookies').value = '';
    document.getElementById('icloud-imap-password').value = '';
    loadIcloud();
  } catch (e) {
    status.textContent = t('icloud.add_failed') + e.message; setTone(status, 'bad');
  }
}
async function testIcloudAccount(id) {
  try {
    const data = await api('/icloud/accounts/' + id + '/test', { method: 'POST' });
    if (data.forwardTo) addActivity('blue', t('icloud.forwards_to') + data.forwardTo);
    if (data.ok) addActivity('green', t('icloud.test_ok'));
    // Report each half separately: the cookie and the app password fail for
    // completely different reasons; the forwarding destination is independent.
    else addActivity('rose', [data.hmeError, data.imapError].filter(Boolean).join(' | '));
    if (data.forwardMismatch) addActivity('amber', data.forwardMismatch);
  } catch (e) { addActivity('rose', e.message); }
  loadIcloudAccounts();
}
// Row actions report in a toast, not in the add form's status line: the form
// sits in a config card that is folded most of the time.
async function generateIcloud(id) {
  toast(t('icloud.generating'), 'info');
  try {
    const data = await api('/icloud/accounts/' + id + '/generate', { method: 'POST', body: JSON.stringify({ count: 1 }) });
    if (data.created > 0) toast(t('icloud.generated', { n: data.created }) + (data.addresses || []).join(', '));
    else toast(t('icloud.gen_failed') + (data.error || ''), 'error');
  } catch (e) {
    toast(t('icloud.gen_failed') + e.message, 'error');
  }
  loadIcloud();
}
// Which account a paste is meant to update, or null to create a new one.
// Reuses the big textarea above rather than a native prompt, because the whole
// point is that the paste is a 4KB cURL command.
let icloudCookieTarget = null;
/**
 * Sign in over SRP instead of pasting a cookie.
 *
 * A cookie dies within hours; a trust token survives weeks, so the six-digit
 * code is asked for once per Apple ID rather than once per session. The whole
 * exchange runs in one dialog because it is one conversation with Apple — and
 * because a native prompt() cannot show the phone numbers Apple offers, which
 * is the only route open to someone with no Apple hardware to hand.
 */
async function srpIcloudLogin(id) {
  const say = (msg, tone) => toast(msg, { emerald: 'success', rose: 'error' }[tone] || 'info');

  const password = await srpAskPassword();
  if (!password) return;

  say(t('icloud.srp_signing_in'), 'text3');
  let begun;
  try {
    begun = await api('/icloud/accounts/' + id + '/srp/begin', {
      method: 'POST', body: JSON.stringify({ password }),
    });
  } catch (e) { say(t('icloud.srp_failed') + e.message, 'rose'); return; }

  if (!begun.needsMfa) {
    // Apple accepted the stored trust token and sent no code at all. That
    // silent path is the steady state this mechanism exists to reach, so it is
    // worth saying out loud rather than looking like nothing happened.
    say(t('icloud.srp_trusted'), 'emerald');
    loadIcloud();
    return;
  }

  let phones = [];
  try {
    phones = (await api('/icloud/srp/' + begun.sessionId + '/phones')).phones || [];
  } catch { /* the device push still works without the list */ }

  const code = await srpAskCode(begun.sessionId, phones);
  if (!code) { say(t('icloud.srp_abandoned'), 'rose'); return; }

  try {
    const done = await api('/icloud/accounts/' + id + '/srp/complete', {
      method: 'POST', body: JSON.stringify({ sessionId: begun.sessionId, code }),
    });
    say(done.ok ? t('icloud.srp_done') : t('icloud.srp_failed') + (done.error || ''), done.ok ? 'emerald' : 'rose');
  } catch (e) { say(t('icloud.srp_failed') + e.message, 'rose'); }
  loadIcloud();
}

function srpAskPassword() {
  return new Promise(resolve => {
    const html =
      '<p class="srp-hint">' + esc(t('icloud.srp_password_hint')) + '</p>' +
      '<input id="srp-pw" type="password" class="srp-input" placeholder="' + escAttr(t('icloud.srp_password_ph')) + '"' +
      on('keydown:Enter', 'clickById', 'srp-go') + '>';
    const buttons =
      '<button class="btn" data-no-loading' + on('click', 'srpAnswer', null) + '>' + t('common.cancel') + '</button>' +
      '<button id="srp-go" class="btn btn-primary"' + on('click', 'srpAnswerFrom', 'srp-pw', false) + '>' + t('common.confirm') + '</button>';
    showDialog(t('icloud.srp'), html, buttons);
    window._srpR = resolve;
    setTimeout(() => document.getElementById('srp-pw')?.focus(), 50);
  });
}

function srpAskCode(sessionId, phones) {
  return new Promise(resolve => {
    // Apple masks the digits itself, so the numbers it hands back are safe to
    // print. Without this list, an account with no Apple device to hand is
    // simply stuck on a code that is pushed somewhere unreachable.
    const options = phones.map(ph =>
      '<option value="' + escAttr(ph.id) + '">' + esc(ph.numberWithDialCode || ('#' + ph.id)) + '</option>').join('');
    const smsRow = phones.length
      ? '<div class="srp-sms">' +
          '<div class="srp-sms-note">' + esc(t('icloud.srp_no_device')) + '</div>' +
          '<div class="srp-sms-row">' +
            '<select id="srp-phone">' + options + '</select>' +
            '<button class="btn btn-sm" data-no-loading' + on('click', 'srpSendSms', sessionId) + '>' + esc(t('icloud.srp_send_sms')) + '</button>' +
            '<span id="srp-sms-status" class="fs-base text-3"></span>' +
          '</div>' +
        '</div>'
      : '';

    const html =
      '<p class="srp-prompt">' + esc(t('icloud.srp_code_prompt')) + '</p>' +
      smsRow +
      '<input id="srp-code" inputmode="numeric" maxlength="6" class="srp-input srp-code" placeholder="000000"' +
      on('keydown:Enter', 'clickById', 'srp-ok') + '>';
    const buttons =
      '<button class="btn" data-no-loading' + on('click', 'srpAnswer', null) + '>' + t('common.cancel') + '</button>' +
      '<button id="srp-ok" class="btn btn-primary"' + on('click', 'srpAnswerFrom', 'srp-code', true) + '>' + t('common.confirm') + '</button>';

    showDialog(t('icloud.srp_code_title'), html, buttons);
    window._srpR = resolve;
    setTimeout(() => document.getElementById('srp-code')?.focus(), 50);
  });
}

/** Answer the open SRP dialog with `value` (null cancels) and close it. */
function srpAnswer(value) {
  window._srpR?.(value);
  return hideDialog();
}
/** Answer it with what the reader typed into `inputId`; the code is trimmed, a password is not. */
function srpAnswerFrom(inputId, trim) {
  const value = document.getElementById(inputId)?.value ?? '';
  return srpAnswer(trim ? value.trim() : value);
}
async function srpSendSms(sessionId) {
  const el = document.getElementById('srp-sms-status');
  const phoneId = parseInt(document.getElementById('srp-phone').value, 10);
  el.textContent = t('icloud.srp_sms_sending');
  setTone(el, 'muted');
  try {
    await api('/icloud/srp/' + sessionId + '/sms', { method: 'POST', body: JSON.stringify({ phoneId }) });
    el.textContent = t('icloud.srp_sms_sent');
    setTone(el, 'ok');
    document.getElementById('srp-code')?.focus();
  } catch (e) {
    el.textContent = e.message;
    setTone(el, 'bad');
  }
  return false;
}
function refreshIcloudCookies(id) {
  icloudCookieTarget = id;
  const box = document.getElementById('icloud-cookies');
  const status = document.getElementById('icloud-add-status');
  document.getElementById('icloud-add-btn').textContent = t('icloud.recookie_save');
  status.textContent = t('icloud.recookie_hint');
  setTone(status, 'muted');
  box.value = '';
  // The paste box is in the add form, which is folded unless someone opened it.
  openConfigTab('icloud-config', 'add', 'icloud-cookies');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function cancelIcloudCookieTarget() {
  icloudCookieTarget = null;
  document.getElementById('icloud-add-btn').textContent = t('icloud.add_btn');
}
/**
 * Retire a burned address: Apple stops forwarding it and it never returns to
 * the pool. The slot it occupies is spent either way once a target has blocked
 * the address, which is why this exists at all — but it is spent for good, so
 * the confirmation spells that out rather than saying "are you sure".
 */
async function retireIcloudAddress(hme) {
  if (!await confirmDialog(t('icloud.retire'), t('icloud.confirm_retire', { hme }))) return;
  try {
    await api('/icloud/addresses/' + encodeURIComponent(hme) + '/retire', { method: 'POST' });
    addActivity('rose', t('icloud.retired', { hme }));
  } catch (e) { addActivity('rose', e.message); }
  loadIcloud();
}

async function deleteIcloudAccount(id) {
  if (!await confirmDialog(t('common.delete'), t('icloud.confirm_delete'))) return;
  try {
    await api('/icloud/accounts/' + id, { method: 'DELETE' });
  } catch (e) { addActivity('rose', e.message); }
  loadIcloud();
}
export { addIcloudAccount, applyIcloudHostPreset, deleteIcloudAccount, generateIcloud, loadIcloud, loadIcloudAccounts, loadIcloudAddresses, readIcloudMessage, refreshIcloudCookies, renderIcloudAccounts, renderIcloudAddresses, retireIcloudAddress, saveIcloudPoolSettings, srpAnswer, srpAnswerFrom, srpIcloudLogin, srpSendSms, suggestIcloudImapHost, testIcloudAccount, viewIcloudMailbox };
