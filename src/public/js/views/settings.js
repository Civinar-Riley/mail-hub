// js/views/settings.js — settings view.
import { on } from '../core/actions.js';
import { api } from '../core/api.js';
import { confirmDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { esc, fmtBytes, fmtTime, iconBtn, renderEmpty, toast } from '../core/util.js';
import { _isAdmin } from '../shell/session.js';
// ─── Settings ───
let _settingsSaveTimer = null;
let _settingsLoading = false;

function currentSettingsPayload() {
  return {
    backup_enabled: document.getElementById('set-backup-enabled').checked ? '1' : '0',
    backup_interval_hours: document.getElementById('set-backup-interval').value || '6',
    backup_max_count: document.getElementById('set-backup-max').value || '5',
    retention_activity_days: document.getElementById('set-retention-activity').value || '30',
    retention_faillog_days: document.getElementById('set-retention-fail').value || '7',
    retention_inbox_days: document.getElementById('set-retention-inbox').value || '7',
    proxy_url: document.getElementById('set-proxy-url').value.trim(),
    batch_concurrency: document.getElementById('set-batch-concurrency').value || '5',
  };
}

async function loadSettings() {
  if (!_isAdmin) return;
  _settingsLoading = true;
  try {
    const [settingsData, infoData] = await Promise.all([
      api('/admin/settings'),
      api('/admin/system-info'),
      loadBackups(),
    ]);
    const s = settingsData.settings || {};
    document.getElementById('set-backup-enabled').checked = s.backup_enabled !== '0';
    document.getElementById('set-backup-interval').value = s.backup_interval_hours || '6';
    document.getElementById('set-backup-max').value = s.backup_max_count || '5';
    document.getElementById('set-retention-activity').value = s.retention_activity_days || '30';
    document.getElementById('set-retention-fail').value = s.retention_faillog_days || '7';
    document.getElementById('set-retention-inbox').value = s.retention_inbox_days || '7';
    document.getElementById('set-proxy-url').value = s.proxy_url || '';
    document.getElementById('set-batch-concurrency').value = s.batch_concurrency || '5';
    _proxyEnvUrl = settingsData.env?.proxyUrl || '';
    if (_proxyEnvUrl) {
      document.getElementById('set-proxy-url').placeholder = _proxyEnvUrl;
    }
    updateProxySource();
    renderSystemInfo(infoData);
    renderShortcuts();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    _settingsLoading = false;
  }
}

let _proxyEnvUrl = '';

function updateProxySource() {
  const el = document.getElementById('proxy-source');
  if (!el) return;
  const val = document.getElementById('set-proxy-url').value.trim();
  if (val) {
    el.textContent = t('settings.proxy_src_ui');
  } else if (_proxyEnvUrl) {
    el.textContent = t('settings.proxy_src_env');
  } else {
    el.textContent = '';
  }
}

function resetProxyUrl() {
  document.getElementById('set-proxy-url').value = '';
  updateProxySource();
  saveSettings();
}

function renderShortcuts() {
  let list = [...document.querySelectorAll('.nav-icon[data-view]')]
    .filter(el => el.offsetParent !== null)
    .slice(0, 9)
    .map((el, i) => {
      const label = el.closest('.tooltip-wrap')?.querySelector('.tooltip')?.textContent || el.dataset.view;
      return `<div class="shortcut-row"><kbd class="key-cap">Alt+${i + 1}</kbd><span class="text-2">${label}</span></div>`;
    })
    .join('');
  list += `<div class="shortcut-help"><kbd class="key-cap">?</kbd> ${t('settings.shortcut_help')}</div>`;
  document.getElementById('shortcuts-list').innerHTML = list;
}

function saveSettings() {
  if (_settingsLoading) return;
  clearTimeout(_settingsSaveTimer);
  _settingsSaveTimer = setTimeout(async () => {
    try {
      await api('/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings: currentSettingsPayload() }) });
      toast(t('toast.settings_saved'));
    } catch (e) { toast(e.message, 'error'); loadSettings(); }
  }, 500);
}

async function triggerBackup() {
  try {
    toast(t('toast.backup_started'));
    await api('/admin/backup', { method: 'POST' });
    toast(t('toast.backup_done'));
    await Promise.all([loadBackups(), api('/admin/system-info').then(renderSystemInfo)]);
  } catch (e) { toast(e.message, 'error'); }
}

async function loadBackups() {
  const data = await api('/admin/backups');
  const rows = data.backups || [];
  if (rows.length === 0) {
    renderEmpty('backup-list', 4, t('backup.empty') || '暂无备份', null, null);
    return data;
  }
  document.getElementById('backup-list').innerHTML = rows.map(b => `
    <tr>
      <td class="mono">${esc(b.filename)}</td>
      <td>${fmtBytes(b.size)}</td>
      <td class="time">${fmtTime(b.createdAt, 'date')}</td>
      <td>${iconBtn('trash', t('common.delete'), on('click', 'deleteBackup', b.filename), 'danger')}</td>
    </tr>
  `).join('');
  return data;
}

async function deleteBackup(filename) {
  if (!await confirmDialog(t('dialog.confirm_delete'), t('dialog.delete_backup', {name: filename}))) return;
  try {
    await api(`/admin/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    toast(t('toast.backup_deleted'));
    loadBackups();
  } catch (e) { toast(e.message, 'error'); }
}

let _checkingUpdates = false;

async function checkForUpdates() {
  if (_checkingUpdates) return false;
  const button = document.getElementById('check-update-btn');
  _checkingUpdates = true;
  if (button) {
    button.disabled = true;
    button.textContent = t('settings.checking_updates');
  }

  try {
    const result = await api('/admin/update-check');
    if (result.updateAvailable) {
      toast(t('settings.update_available', {
        latest: result.latestVersion,
        current: result.currentVersion,
      }), 'warning');
    } else if (result.source === 'github-feed') {
      toast(t('settings.update_feed_no_update', {
        latest: result.latestVersion,
        current: result.currentVersion,
      }), 'warning');
    } else if (result.currentVersion !== result.latestVersion) {
      toast(t('settings.version_ahead', {
        current: result.currentVersion,
        latest: result.latestVersion,
      }));
    } else {
      toast(t('settings.version_latest', { version: result.latestVersion }));
    }
  } catch (error) {
    toast(t('settings.update_check_failed', { error: error.message }), 'error');
  } finally {
    _checkingUpdates = false;
    if (button) {
      button.disabled = false;
      button.textContent = t('settings.check_updates');
    }
  }
  return false;
}

function renderSystemInfo(info) {
  document.getElementById('system-info').innerHTML = `
    <tr><th>${t('settings.version')}</th><td>
      <div class="version-cell">
        <span>${esc(info.version)}</span>
        <button id="check-update-btn" class="btn btn-sm"${on('click', 'checkForUpdates')}>${t('settings.check_updates')}</button>
      </div>
    </td></tr>
    <tr><th>${t('settings.db_path')}</th><td class="mono">${esc(info.dbPath)}</td></tr>
    <tr><th>${t('settings.db_size')}</th><td>${fmtBytes(info.dbSize)}</td></tr>
    <tr><th>${t('settings.uptime')}</th><td>${Math.floor((info.uptime || 0) / 3600)} ${t('common.hours')} ${Math.floor(((info.uptime || 0) % 3600) / 60)} ${t('common.minutes')}</td></tr>
  `;
}
export { checkForUpdates, deleteBackup, loadSettings, resetProxyUrl, saveSettings, triggerBackup, updateProxySource };
