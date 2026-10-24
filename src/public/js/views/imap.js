// js/views/imap.js — IMAP accounts view.
import { addActivity } from '../components/activity.js';
import { on } from '../core/actions.js';
import { api } from '../core/api.js';
import { confirmDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { setCount } from '../core/motion.js';
import { esc, escAttr, fmtTime, iconBtn, renderEmpty, renderLoadError, renderLoading, setTone } from '../core/util.js';
async function loadImap() {
  try {
    const s = await api('/imap/stats');
    setCount(document.getElementById('imap-total'), s.total ?? null);
    setCount(document.getElementById('imap-active'), s.active ?? null);
    const tag = document.getElementById('imap-status');
    tag.textContent = t('imap.no_active');
    tag.hidden = s.active !== 0;
  } catch (e) { console.error('loadImap', e); }
  loadImapAccounts();
}
async function loadImapAccounts() {
  renderLoading('imap-account-list', 9);
  try {
    const data = await api('/imap/accounts');
    if ((data.accounts || []).length === 0) {
      renderEmpty('imap-account-list', 9, t('imap.empty') || '尚未添加 IMAP 账号', t('imap.add_first') || '添加第一个', on('click', 'openConfigTab', 'imap-config', 'add', 'imap-host'));
      return;
    }
    const tbody = document.getElementById('imap-account-list');
    tbody.innerHTML = (data.accounts || []).map(a => `
      <tr>
        <td><input type="checkbox" class="imap-check" value="${escAttr(a.id)}"></td>
        <td>${esc(a.host)}</td>
        <td>${a.port}</td>
        <td>${esc(a.user)}</td>
        <td>${esc(a.domain)}</td>
        <td><span class="${a.status === 'active' ? 'badge' : 'badge badge-bad'}">${esc(a.status)}</span></td>
        <td>${a.tls ? t('common.yes') : t('common.no')}</td>
        <td>${a.last_checked_at ? fmtTime(a.last_checked_at, 'date') : '-'}</td>
        <td>
          ${iconBtn('test', t('common.test'), on('click', 'testImapAccount', a.id), 'blue')}
          ${iconBtn('trash', t('common.delete'), on('click', 'deleteImapAccount', a.id), 'danger')}
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error('loadImapAccounts', e); renderLoadError('imap-account-list', 9, e, on('click', 'loadImapAccounts')); }
}
async function addImapAccount() {
  const status = document.getElementById('imap-add-status');
  const body = {
    host: document.getElementById('imap-host').value.trim(),
    port: parseInt(document.getElementById('imap-port').value) || 993,
    user: document.getElementById('imap-user').value.trim(),
    password: document.getElementById('imap-password').value,
    domain: document.getElementById('imap-domain').value.trim(),
    tls: document.getElementById('imap-tls').checked,
  };
  if (!body.host || !body.user || !body.password || !body.domain) {
    status.textContent = t('imap.fill_all_fields'); setTone(status, 'bad'); return;
  }
  status.textContent = t('imap.adding'); setTone(status, 'muted');
  try {
    await api('/imap/accounts', { method: 'POST', body: JSON.stringify(body) });
    status.textContent = t('imap.added'); setTone(status, 'ok');
    document.getElementById('imap-host').value = '';
    document.getElementById('imap-user').value = '';
    document.getElementById('imap-password').value = '';
    document.getElementById('imap-domain').value = '';
    loadImap();
  } catch (e) {
    status.textContent = t('imap.add_failed') + e.message; setTone(status, 'bad');
  }
}
async function testImapAccount(id) {
  try {
    const data = await api('/imap/accounts/' + id + '/test', { method: 'POST' });
    if (data.ok) addActivity('green', t('imap.test_ok') + id.slice(0, 8));
    else addActivity('rose', t('imap.test_fail') + (data.error || ''));
  } catch (e) {
    addActivity('rose', t('imap.test_fail') + e.message);
  }
  loadImapAccounts();
}
async function deleteImapAccount(id) {
  if (!await confirmDialog(t('common.delete'), t('imap.confirm_delete_hint'))) return;
  await api('/imap/accounts/' + id, { method: 'DELETE' });
  loadImap();
}
async function deleteImapSelected() {
  const checked = document.querySelectorAll('.imap-check:checked');
  if (!checked.length) return;
  if (!await confirmDialog(t('imap.batch_delete'), t('imap.confirm_batch_delete', {n: checked.length}))) return;
  for (const cb of checked) {
    await api('/imap/accounts/' + cb.value, { method: 'DELETE' });
  }
  loadImap();
}
function toggleAllImap(checked) {
  document.querySelectorAll('.imap-check').forEach(cb => { cb.checked = checked; });
}
export { addImapAccount, deleteImapAccount, deleteImapSelected, loadImap, loadImapAccounts, testImapAccount, toggleAllImap };
