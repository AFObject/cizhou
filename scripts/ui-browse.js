// ============ 浏览 / 搜索视图 ============
window.App = window.App || {};

App.browse = (function () {
  const { $, $$, on, debounce, escapeHtml, highlightExample } = App.utils;

  let currentEntryId = null;
  let currentSearch = null;  // null 或 search() 返回值

  function init() {
    on($('#searchInput'), 'input', debounce(onSearch, 120));
    on($('#filterImportant'), 'change', renderList);
    on($('#filterRare'), 'change', renderList);
    on($('#filterMastered'), 'change', renderList);
    renderList();
  }

  function onSearch() {
    const kw = $('#searchInput').value;
    currentSearch = App.data.search(kw);
    if (currentSearch) {
      $('#searchMeta').textContent = `命中 ${currentSearch.entryIds.size} 个词条`;
    } else {
      $('#searchMeta').textContent = '';
    }
    renderList();
  }

  function passesFilter(entry) {
    const onlyImp = $('#filterImportant').checked;
    const onlyRare = $('#filterRare').checked;
    const onlyMast = $('#filterMastered').checked;
    if (!onlyImp && !onlyRare && !onlyMast) return true;

    const senses = collectSenses(entry);
    if (onlyImp  && senses.some(s => App.store.getTag(s.sid) === 'important')) return true;
    if (onlyRare && senses.some(s => App.store.getTag(s.sid) === 'rare'))      return true;
    if (onlyMast && senses.some(s => App.store.getTag(s.sid) === 'mastered'))  return true;
    return false;
  }

  function collectSenses(entry) {
    const arr = [...(entry.senses || [])];
    for (const sub of (entry.subEntries || [])) arr.push(...sub.senses);
    return arr;
  }

  function entryFlags(entry) {
    const senses = collectSenses(entry);
    const flags = new Set();
    for (const s of senses) {
      const t = App.store.getTag(s.sid);
      if (t) flags.add(t);
      const st = App.store.getStat(s.sid);
      if (st.wrong > 0) flags.add('wrong');
    }
    return flags;
  }

  function renderList() {
    const list = $('#entryList');
    const items = [];
    for (const ent of App.data.listEntries()) {
      if (currentSearch && !currentSearch.entryIds.has(ent.id)) continue;
      if (!passesFilter(ent)) continue;
      const flags = entryFlags(ent);
      const flagsHtml = ['important','wrong','rare','mastered']
        .filter(f => flags.has(f))
        .map(f => `<span class="flag-dot ${f}" title="${f}"></span>`)
        .join('');
      const cls = 'entry-item' + (ent.id === currentEntryId ? ' active' : '');
      items.push(`
        <div class="${cls}" data-id="${ent.id}">
          <span class="e-id">${ent.id}</span>
          <span class="e-char">${escapeHtml(ent.char)}</span>
          <span class="e-flags">${flagsHtml}</span>
        </div>
      `);
    }
    list.innerHTML = items.join('') || '<div class="empty" style="padding:40px 20px;">无匹配</div>';
    $$('.entry-item', list).forEach(el => {
      el.addEventListener('click', () => {
        const id = Number(el.dataset.id);
        showEntry(id);
      });
    });
  }

  function showEntry(id) {
    currentEntryId = id;
    const ent = App.data.getEntry(id);
    if (!ent) return;
    renderList();
    renderDetail(ent);
  }

  function renderSenseCard(s, displayChars) {
    const tag = App.store.getTag(s.sid);
    const stat = App.store.getStat(s.sid);
    const classes = ['sense-card'];
    if (tag) classes.push('tag-' + tag, 'has-tag');

    const phrasesHtml = (s.phraseKeys || []).length
      ? `<div class="sense-phrases">${
          s.phraseKeys.map(p => `<span class="phrase-tag">${escapeHtml(p)}</span>`).join('')
        }</div>`
      : '';
    const exampleHtml = s.example
      ? `<div class="sense-example">${highlightExample(s.example, displayChars)}</div>`
      : '';
    const sourceHtml = s.source
      ? `<div class="sense-source">出处：《${escapeHtml(s.source)}》</div>`
      : '';
    const statsHtml = (stat.right || stat.wrong || stat.unsure)
      ? `<div class="sense-stat">
           <span class="ok">✓ ${stat.right}</span> ·
           <span class="bad">✗ ${stat.wrong}</span> ·
           <span class="um">? ${stat.unsure}</span>
           ${stat.lastReview ? ` · 上次 ${stat.lastReview}` : ''}
         </div>`
      : '';

    return `
      <div class="${classes.join(' ')}" data-sid="${s.sid}">
        <div class="sense-actions">
          <button class="tag-btn ${tag==='important'?'active important':''}" data-tag="important" title="重点">重</button>
          <button class="tag-btn ${tag==='rare'?'active rare':''}" data-tag="rare" title="生僻">僻</button>
          <button class="tag-btn ${tag==='mastered'?'active mastered':''}" data-tag="mastered" title="已掌握">熟</button>
        </div>
        <div class="sense-head">
          <span class="sense-label">${escapeHtml(s.label || '')}</span>
          <span class="sense-meaning ${s.isNote?'note':''}">${escapeHtml(s.meaning || '(无释义)')}</span>
        </div>
        ${phrasesHtml}
        ${exampleHtml}
        ${sourceHtml}
        ${statsHtml}
      </div>
    `;
  }

  function renderDetail(ent) {
    const detail = $('#detail');
    const baseChars = String(ent.char).split(/[\/／]/);
    const allCount =
      (ent.senses || []).length +
      (ent.subEntries || []).reduce((n, sub) => n + sub.senses.length, 0);

    let html = `
      <div class="detail-header">
        <div class="detail-char serif">${escapeHtml(ent.char)}</div>
        <div class="detail-id">第 ${ent.id} 号 · ${allCount} 个义项</div>
      </div>
      <div class="detail-summary">点击右上角小按钮可标记 · 重点 / 生僻 / 已掌握</div>
    `;
    if (ent.senses && ent.senses.length) {
      html += ent.senses.map(s => renderSenseCard(s, baseChars)).join('');
    }
    for (const sub of (ent.subEntries || [])) {
      html += `<div class="sub-section">
        <h3 class="sub-title">（${sub.subId}）${escapeHtml(sub.char)}</h3>
        ${sub.senses.map(s => renderSenseCard(s, [sub.char])).join('')}
      </div>`;
    }
    detail.innerHTML = html;

    // 绑定 tag 按钮
    $$('.tag-btn', detail).forEach(btn => {
      btn.addEventListener('click', e => {
        const card = btn.closest('.sense-card');
        const sid = card.dataset.sid;
        const tag = btn.dataset.tag;
        App.store.toggleTag(sid, tag);
        renderDetail(ent);
        renderList();
      });
    });
  }

  function focusEntry(id) {
    App.tabs.switchTo('browse');
    showEntry(id);
  }

  return { init, showEntry, focusEntry };
})();
