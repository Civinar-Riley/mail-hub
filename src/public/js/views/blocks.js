// js/views/blocks.js — domain blocks and auto-block rules view.
import { addActivity } from '../components/activity.js';
import { _pageState, paginateTable } from '../components/pagination.js';
import { CHECKED, on } from '../core/actions.js';
import { api } from '../core/api.js';
import { hideDialog, showDialog } from '../core/dialog.js';
import { t } from '../core/i18n.js';
import { emptyStateRow, esc, escAttr, fmtTime, iconBtn, renderLoading, toast, toggleSwitch } from '../core/util.js';
// ─── Blocks ───
let _allBlocks = [];

function renderBlockTable(rows) {
  document.getElementById('block-list').innerHTML = rows.length ? rows.map(b => `
    <tr>
      <td><strong>${esc(b.service)}</strong></td>
      <td class="mono">${esc(b.domain)}</td>
      <td class="text-2">${esc(b.provider || '-')}</td>
      <td class="time">${fmtTime(b.blocked_at, 'date')}</td>
      <td class="fs-base">${esc(b.reason || '-')}</td>
      <td>${iconBtn('trash', t('common.delete'), on('click', 'deleteBlock', b.id), 'danger')}</td>
    </tr>
  `).join('') : emptyStateRow(6, t('block.empty'));
}

async function loadBlocks() {
  const service = document.getElementById('block-filter-service').value.trim();
  const domain = document.getElementById('block-filter-domain').value.trim();
  let url = '/blocks?';
  if (service) url += `service=${encodeURIComponent(service)}&`;
  if (domain) url += `domain=${encodeURIComponent(domain)}&`;
  renderLoading('block-list', 6);
  try {
    const data = await api(url);
    _allBlocks = data.blocks || [];
    delete _pageState['block'];
    paginateTable('block', _allBlocks, renderBlockTable, 'block-pager');
  } catch (e) { toast(e.message, 'error'); }
}

async function addBlock() {
  const service = document.getElementById('block-service').value.trim();
  const domain = document.getElementById('block-domain').value.trim();
  const reason = document.getElementById('block-reason').value.trim();
  if (!service || !domain) return toast(t('validate.service_domain_required'), 'error');
  try {
    await api('/blocks', { method: 'POST', body: JSON.stringify({ service, domain, reason: reason || undefined }) });
    toast(t('toast.block_added'));
    addActivity('rose', `Blocked domain <span class="activity-hl">${esc(domain)}</span> @ ${esc(service)}`, true);
    document.getElementById('block-service').value = '';
    document.getElementById('block-domain').value = '';
    document.getElementById('block-reason').value = '';
    loadBlocks();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteBlock(id) {
  showDialog(t('dialog.confirm_delete'), `<p>${t('block.confirm_delete')}</p>`, `
    <button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.cancel')}</button>
    <button class="btn btn-danger"${on('click', 'doDeleteBlock', id)}>${t('dialog.confirm_delete')}</button>
  `);
}
async function doDeleteBlock(id) {
  hideDialog();
  try {
    await api(`/blocks/${id}`, { method: 'DELETE' });
    toast(t('toast.block_deleted'));
    loadBlocks();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Block Rules ───
let _allRules = [];

function renderRuleTable(rows) {
  document.getElementById('rule-list').innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td><code>${esc(r.service)}</code></td>
      <td><code>${esc(r.provider)}</code></td>
      <td>${r.threshold}</td>
      <td>${r.window_hours}h</td>
      <td class="text-2">${r.scope === 'global' ? t('block.scope_global') : t('block.scope_per_service')}</td>
      <td>${r.domain_level || 2}</td>
      <td>${toggleSwitch(r.enabled, on('change', 'toggleRule', r.id, CHECKED), r.enabled ? t('common.disable') : t('common.enable'))}</td>
      <td>${iconBtn('trash', t('common.delete'), on('click', 'deleteRule', r.id), 'danger')}</td>
    </tr>
  `).join('') : emptyStateRow(8, t('block.no_rules'));
}

async function loadBlockRules() {
  renderLoading('rule-list', 8);
  try {
    const [data, provData] = await Promise.all([api('/block-rules'), api('/providers')]);
    const sel = document.getElementById('rule-provider');
    const cur = sel.value;
    sel.innerHTML = '<option value="*">'+ t('common.all') +'</option>' + (provData.providers || []).map(p =>
      `<option value="${escAttr(p.name)}">${esc(p.displayName || p.name)}</option>`
    ).join('');
    sel.value = cur;
    _allRules = data.rules || [];
    delete _pageState['rule'];
    paginateTable('rule', _allRules, renderRuleTable, 'rule-pager');
  } catch (e) { toast(e.message, 'error'); }
}
async function addBlockRule() {
  const service = document.getElementById('rule-service').value.trim() || '*';
  const provider = document.getElementById('rule-provider').value || '*';
  const threshold = parseInt(document.getElementById('rule-threshold').value) || 3;
  const window_hours = parseInt(document.getElementById('rule-window').value) || 24;
  const scope = document.getElementById('rule-scope').value;
  const domain_level = parseInt(document.getElementById('rule-domain-level').value) || 2;
  try {
    await api('/block-rules', { method: 'POST', body: JSON.stringify({ service, provider, threshold, window_hours, scope, domain_level }) });
    toast(t('toast.rule_created'));
    loadBlockRules();
  } catch (e) { toast(e.message, 'error'); }
}
async function toggleRule(id, enabled) {
  try {
    await api(`/block-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !!enabled }) });
    loadBlockRules();
  } catch (e) { toast(e.message, 'error'); loadBlockRules(); }
}
async function deleteRule(id) {
  try {
    await api(`/block-rules/${id}`, { method: 'DELETE' });
    toast(t('toast.rule_deleted'));
    loadBlockRules();
  } catch (e) { toast(e.message, 'error'); }
}
export { addBlock, addBlockRule, deleteBlock, deleteRule, doDeleteBlock, loadBlockRules, loadBlocks, toggleRule };
