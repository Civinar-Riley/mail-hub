// js/views/services.js — target services view.
import { _pageState, paginateTable } from '../components/pagination.js';
import { on } from '../core/actions.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { setCount } from '../core/motion.js';
import { emptyStateRow, esc, fmtTime, iconBtn, inboxStatusBadge, renderLoading, targetEl, toast } from '../core/util.js';
import { _isAdmin } from '../shell/session.js';
import { loadServiceDispatch } from './providers.js';
// ─── Services ───
let _allServices = [];

async function loadServices() {
  if (!_isAdmin) return;
  renderLoading('svc-list', 8);
  try {
    const data = await api('/services');
    const s = data.summary || {};
    // Running totals are history, not something to act on, so none takes a colour.
    setCount(document.getElementById('svc-total'), s.totalServices ?? null);
    setCount(document.getElementById('svc-inboxes'), s.totalInboxes ?? null);
    setCount(document.getElementById('svc-failures'), s.totalFailures ?? null);
    setCount(document.getElementById('svc-blocks'), s.totalBlocks ?? null);
    _allServices = data.services || [];
    delete _pageState['svc'];
    paginateTable('svc', _allServices, renderServiceList, 'svc-pager');
  } catch (e) { toast(e.message, 'error'); }
}

function renderServiceList(rows) {
  document.getElementById('svc-list').innerHTML = rows.length ? rows.map(s => `
    <tr>
      <td>${targetEl(s.name)}</td>
      <td class="cell-end">${s.totalInboxes}</td>
      <td class="cell-end"><span class="tone-ok">${s.activeInboxes}</span></td>
      <td class="cell-end"><span class="${s.successCount > 0 ? 'tone-ok' : 'text-3'}">${s.successCount ?? 0}</span></td>
      <td class="cell-end"><span class="${s.failCount > 0 ? 'tone-bad' : 'text-3'}">${s.failCount}</span></td>
      <td class="cell-end"><span class="${s.blockCount > 0 ? 'tone-warn' : 'text-3'}">${s.blockCount}</span></td>
      <td class="time">${fmtTime(s.lastUsed, 'date')}</td>
      <td>${iconBtn('info', t('common.detail'), on('click', 'loadServiceDetail', s.name), 'blue')}</td>
    </tr>
  `).join('') : emptyStateRow(8, t('svc.empty'));
}

function filterServices() {
  const q = document.getElementById('svc-search').value.trim().toLowerCase();
  delete _pageState['svc'];
  const filtered = q ? _allServices.filter(s => s.name.toLowerCase().includes(q)) : _allServices;
  paginateTable('svc', filtered, renderServiceList, 'svc-pager');
}

function closeServiceDetail() { document.getElementById('svc-detail-area').innerHTML = ''; return false; }

async function loadServiceDetail(name) {
  const area = document.getElementById('svc-detail-area');
  area.innerHTML = '<div class="svc-loading">' + (t('common.loading') || 'Loading...') + '</div>';
  try {
    const data = await api(`/services/${encodeURIComponent(name)}`);
    const inboxes = data.inboxes || [];
    const failures = data.failures || [];
    const blocks = data.blocks || [];
    const st = data.stats;
    const statsLine = st ? `<div class="svc-stats">${t('svc.cumulative', {
          created: `<span class="fw-medium">${st.totalInboxes}</span>`,
          success: `<span class="tone-ok">${st.successCount}</span>`,
          failed: `<span class="tone-bad">${st.failCount}</span>`,
          first: `<span class="time">${fmtTime(st.firstUsed, 'date')}</span>`,
        })}</div>` : '';
    area.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">${targetEl(name)} ${t('common.detail')}</span>
          <div class="panel-actions">${iconBtn('x', t('common.close'), on('click', 'closeServiceDetail'), 'blue')}</div>
        </div>
        ${statsLine}
        <div class="panel-body"><h4 class="fs-md fw-semibold text-2">${t('svc.recent_inboxes', { n: inboxes.length })}</h4></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('common.address')}</th><th>${t('common.provider')}</th><th>${t('common.status')}</th><th>${t('common.created')}</th></tr></thead>
          <tbody id="svc-d-inboxes"></tbody>
        </table></div>
        <div id="svc-d-inboxes-pager"></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">${esc(t('dispatch.svc_title'))}</span></div>
        <div id="svc-dispatch"><div class="dispatch-note">${t('common.loading') || 'Loading...'}</div></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title tone-bad">${t('svc.failures_title', { n: failures.length })}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('common.provider')}</th><th>${t('common.domain')}</th><th>${t('common.time')}</th></tr></thead>
          <tbody id="svc-d-failures"></tbody>
        </table></div>
        <div id="svc-d-failures-pager"></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title tone-warn">${t('svc.blocks_title', { n: blocks.length })}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('common.domain')}</th><th>${t('common.provider')}</th><th>${t('block.time')}</th><th>${t('block.reason')}</th></tr></thead>
          <tbody id="svc-d-blocks"></tbody>
        </table></div>
        <div id="svc-d-blocks-pager"></div>
      </div>`;
    delete _pageState['svc-d-inboxes']; delete _pageState['svc-d-failures']; delete _pageState['svc-d-blocks'];
    loadServiceDispatch(name);
    paginateTable('svc-d-inboxes', inboxes, rows => {
      document.getElementById('svc-d-inboxes').innerHTML = rows.length ? rows.map(i => `<tr>
        <td class="mono">${esc(i.address)}</td>
        <td class="text-2">${esc(i.provider)}</td>
        <td>${inboxStatusBadge(i.status)}</td>
        <td class="time">${fmtTime(i.created_at, 'date')}</td>
      </tr>`).join('') : emptyStateRow(4, t('common.no_data'));
    }, 'svc-d-inboxes-pager');
    paginateTable('svc-d-failures', failures, rows => {
      document.getElementById('svc-d-failures').innerHTML = rows.length ? rows.map(f => `<tr>
        <td class="text-2">${esc(f.provider)}</td>
        <td class="mono">${esc(f.domain)}</td>
        <td class="time">${fmtTime(f.reported_at, 'date')}</td>
      </tr>`).join('') : emptyStateRow(3, t('svc.no_failures'));
    }, 'svc-d-failures-pager');
    paginateTable('svc-d-blocks', blocks, rows => {
      document.getElementById('svc-d-blocks').innerHTML = rows.length ? rows.map(b => `<tr>
        <td class="mono">${esc(b.domain)}</td>
        <td class="text-2">${esc(b.provider || '-')}</td>
        <td class="time">${fmtTime(b.blocked_at, 'date')}</td>
        <td class="fs-base">${esc(b.reason || '-')}</td>
      </tr>`).join('') : emptyStateRow(4, t('block.empty'));
    }, 'svc-d-blocks-pager');
  } catch (e) { toast(e.message, 'error'); area.innerHTML = ''; }
}
export { closeServiceDetail, filterServices, loadServiceDetail, loadServices };
