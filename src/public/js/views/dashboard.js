// js/views/dashboard.js — dashboard view.
import { loadActivity } from '../components/activity.js';
import { _pageState, paginateTable } from '../components/pagination.js';
import { on } from '../core/actions.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { emptyStateRow, esc, escAttr, iconBtn, inboxStatusBadge, renderLoading, shortTime, targetEl, toast } from '../core/util.js';
import { getCode, loadInboxes, viewInbox, viewMailbox } from './inboxes.js';
// ─── Dashboard ───
let _allDashInboxes = [];
async function loadDashboard() {
  loadActivity();
  renderLoading('dash-inboxes', 6);
  try {
    // "最近邮箱" is a history panel — closed inboxes belong here. What it must
    // NOT do is walk the whole table: apiAllInboxes() pages until it has every
    // row, and Outlook recycles one account into a new closed row every reuse,
    // so that list grows without bound. One page of the newest rows is what a
    // "recent" panel means. The headline count comes from `total` on an
    // active-only query, so it stays exact without paging either.
    const [provData, activeCount, recentData, rulesData, serviceData] = await Promise.all([
      api('/providers'),
      api('/inboxes?status=active&page=1&pageSize=1'),
      api('/inboxes?page=1&pageSize=100'),
      api('/block-rules'),
      api('/services'),
    ]);
    const providers = provData.providers || [];
    const activeTotal = Number(activeCount.total) || 0;
    const recentInboxes = recentData.inboxes || [];
    const rules = rulesData.rules || [];
    const enabled = providers.filter(p => p.enabled).length;
    const services = serviceData.summary?.totalServices ?? 0;

    const sys = document.getElementById('sys-status');
    if (sys) {
      // Plain "label number" pairs; only a dead pool takes a colour.
      if (enabled === 0) {
        sys.innerHTML = `<span class="is-bad">${esc(t('status.no_providers'))}</span>`;
      } else {
        const pair = (label, value) => `<span>${esc(label)} <b>${value}</b></span>`;
        sys.innerHTML = [
          pair(t('dash.active_inboxes') || '活跃', activeTotal),
          pair(t('dash.active_providers') || '渠道', `${enabled}/${providers.length}`),
          pair(t('dash.block_rules') || '规则', rules.length),
          pair(t('dash.tracked_services') || '服务', services),
        ].join('');
      }
    }

    _allDashInboxes = recentInboxes;
    delete _pageState['dash'];
    paginateTable('dash', _allDashInboxes, renderDashTable, 'dash-pager');

    // populate provider selects
    ['d-inbox-provider', 'i-inbox-provider', 'filter-provider'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const first = sel.options[0].outerHTML;
      sel.innerHTML = first;
      providers.forEach(p => { sel.innerHTML += `<option value="${escAttr(p.name)}">${esc(p.displayName)}</option>`; });
    });
  } catch (e) { toast(e.message, 'error'); }
}

function renderDashTable(rows) {
  document.getElementById('dash-inboxes').innerHTML = rows.length ? rows.map(i => `
    <tr>
      <td class="mono">${esc(i.address)}</td>
      <td class="text-2">${esc(i.provider)}</td>
      <td>${targetEl(i.target_service)}</td>
      <td>${inboxStatusBadge(i.status)}</td>
      <td class="time">${shortTime(i.created_at)}</td>
      <td>
        ${iconBtn('inbox', t('inbox.receive'), on('click', 'switchAndView', i.id), 'blue')}
        ${iconBtn('code', t('inbox.extract'), on('click', 'switchAndCode', i.id), 'blue')}
      </td>
    </tr>
  `).join('') : emptyStateRow(6, t('common.no_data'));
}

function filterDashTable() {
  const q = document.getElementById('dash-search').value.trim().toLowerCase();
  delete _pageState['dash'];
  const filtered = q ? _allDashInboxes.filter(i => (i.address + i.provider + (i.target_service||'')).toLowerCase().includes(q)) : _allDashInboxes;
  paginateTable('dash', filtered, renderDashTable, 'dash-pager');
}

function switchAndView(id) {
  document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('[data-view="inboxes"]').classList.add('active');
  document.getElementById('v-inboxes').classList.add('active');
  loadInboxes().then(() => viewInbox(id));
}
function switchAndViewMailbox(email) {
  document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('[data-view="inboxes"]').classList.add('active');
  document.getElementById('v-inboxes').classList.add('active');
  loadInboxes().then(() => viewMailbox(email));
}
function switchAndCode(id) {
  document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('[data-view="inboxes"]').classList.add('active');
  document.getElementById('v-inboxes').classList.add('active');
  loadInboxes().then(() => getCode(id));
}
export { filterDashTable, loadDashboard, switchAndCode, switchAndView, switchAndViewMailbox };
