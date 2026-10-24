// js/components/pagination.js — client-side pagination.
import { NUMBER, on } from '../core/actions.js';
import { t } from '../core/i18n.js';
// ─── Pagination ───
const _pageState = {};
const _pageCache = {};
function getPageSize() { return parseInt(localStorage.getItem('mailhub_pagesize') || '20') || 20; }
function setPageSize(n) { localStorage.setItem('mailhub_pagesize', String(n)); }

function paginateTable(key, allRows, renderFn, containerId) {
  const size = getPageSize();
  if (!_pageState[key]) _pageState[key] = { page: 1 };
  const st = _pageState[key];
  const totalPages = Math.max(1, Math.ceil(allRows.length / size));
  if (st.page > totalPages) st.page = totalPages;
  const start = (st.page - 1) * size;
  renderFn(allRows.slice(start, start + size));
  _pageCache[key] = { data: allRows, renderFn, containerId };
  _renderPager(key, containerId, allRows.length);
}

function _renderPager(key, containerId, total) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const size = getPageSize();
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (total <= size) { el.innerHTML = ''; return; }
  const p = _pageState[key]?.page || 1;
  el.innerHTML = `<div class="pager">
    <button ${p<=1?'disabled':''}${on('click', '_goPage', key, 1)}>${t('pager.first')}</button>
    <button ${p<=1?'disabled':''}${on('click', '_goPage', key, p-1)}>${t('pager.prev')}</button>
    <span class="pager-info"><input type="number" min="1" max="${totalPages}" value="${p}"${on('change', '_goPage', key, NUMBER)}${on('keydown:Enter', '_goPage', key, NUMBER)}> / ${totalPages} <span class="pager-total">(${total})</span></span>
    <button ${p>=totalPages?'disabled':''}${on('click', '_goPage', key, p+1)}>${t('pager.next')}</button>
    <button ${p>=totalPages?'disabled':''}${on('click', '_goPage', key, totalPages)}>${t('pager.last')}</button>
    <select class="pager-size"${on('change', '_changePageSize', NUMBER)}>${[10,20,50,100].map(n=>`<option value="${n}"${n===size?' selected':''}>${n}${t('pager.per_page')}</option>`).join('')}</select>
  </div>`;
}

function _goPage(key, page) {
  const c = _pageCache[key];
  if (!c) return;
  const size = getPageSize();
  const totalPages = Math.max(1, Math.ceil(c.data.length / size));
  if (!_pageState[key]) _pageState[key] = { page: 1 };
  _pageState[key].page = Math.max(1, Math.min(page, totalPages));
  paginateTable(key, c.data, c.renderFn, c.containerId);
}

function _changePageSize(n) {
  setPageSize(n);
  for (const [key, c] of Object.entries(_pageCache)) {
    _pageState[key] = { page: 1 };
    paginateTable(key, c.data, c.renderFn, c.containerId);
  }
}
export { _changePageSize, _goPage, _pageState, getPageSize, paginateTable };
