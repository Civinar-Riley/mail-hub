// js/components/drag-select.js — drag-select for checkbox tables.
// drag-select for checkbox tables
function initDragSelect() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;border:1px solid var(--emerald);background:var(--emerald-dim);pointer-events:none;z-index:9999;display:none;border-radius:2px';
  document.body.appendChild(box);
  let dragging = false, mode = 'set', sx = 0, sy = 0, saved = new Map();
  let activeTbody = null, activeCheckClass = null;

  const targets = [
    { tbodyId: 'inbox-list', checkClass: 'inbox-check' },
    { tbodyId: 'ol-account-list', checkClass: 'ol-check' },
    { tbodyId: 'yd-account-list', checkClass: 'yd-check' },
    { tbodyId: 'imap-account-list', checkClass: 'imap-check' },
  ];

  function syncRowClass(cb) {
    const tr = cb.closest('tr');
    if (tr) tr.classList.toggle('row-selected', cb.checked);
  }

  function hitTest() {
    if (!activeTbody) return;
    const bx = box.getBoundingClientRect();
    const rows = document.getElementById(activeTbody)?.querySelectorAll('tr') || [];
    rows.forEach(tr => {
      const cb = tr.querySelector('.' + activeCheckClass);
      if (!cb) return;
      const r = tr.getBoundingClientRect();
      const hit = !(r.bottom < bx.top || r.top > bx.bottom || r.right < bx.left || r.left > bx.right);
      if (mode === 'set') cb.checked = hit || false;
      else if (mode === 'add') cb.checked = hit || (saved.get(cb.value) ?? false);
      else if (mode === 'remove') cb.checked = hit ? false : (saved.get(cb.value) ?? false);
      syncRowClass(cb);
    });
  }

  document.addEventListener('mousedown', e => {
    let matched = null;
    for (const t of targets) {
      if (e.target.closest?.('#' + t.tbodyId)) { matched = t; break; }
    }
    if (!matched) return;
    if (e.target.closest('button,a,.btn')) return;
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') return;
    e.preventDefault();
    activeTbody = matched.tbodyId;
    activeCheckClass = matched.checkClass;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    if (e.altKey) mode = 'remove';
    else if (e.ctrlKey || e.metaKey) mode = 'add';
    else mode = 'set';
    saved.clear();
    document.querySelectorAll('.' + activeCheckClass).forEach(cb => saved.set(cb.value, cb.checked));
    box.style.display = 'block';
    box.style.left = sx + 'px'; box.style.top = sy + 'px';
    box.style.width = '0'; box.style.height = '0';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
    const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.width = w + 'px'; box.style.height = h + 'px';
    hitTest();
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    box.style.display = 'none';
    activeTbody = null;
    activeCheckClass = null;
  });

  document.addEventListener('change', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      for (const t of targets) {
        if (e.target.classList.contains(t.checkClass)) { syncRowClass(e.target); return; }
      }
    }
  });
}

function _syncAllCheckRows(checkClass) {
  document.querySelectorAll('.' + checkClass).forEach(cb => {
    const tr = cb.closest('tr');
    if (tr) tr.classList.toggle('row-selected', cb.checked);
  });
}
export { _syncAllCheckRows, initDragSelect };
