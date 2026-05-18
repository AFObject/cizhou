// ============ 我的：统计 / 导入导出 ============
window.App = window.App || {};

App.profile = (function () {
  const { $, $$, on, escapeHtml, toast, downloadText } = App.utils;

  function init() {
    on($('#exportBtn'), 'click', () => {
      const text = App.store.exportAll();
      const ts = new Date().toISOString().slice(0, 10);
      downloadText(`cizhou-progress-${ts}.json`, text);
      toast('已导出');
    });

    on($('#importInput'), 'change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        App.store.importAll(text);
        toast('导入成功');
        render();
        if (App.browse && App.browse.init) App.browse.init();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
      e.target.value = '';
    });

    on($('#resetBtn'), 'click', () => {
      if (!confirm('确定要清空所有标签和统计吗？此操作不可撤销。')) return;
      App.store.resetAll();
      toast('已重置');
      render();
    });
  }

  function render() {
    const snap = App.store.snapshot();
    const senses = App.data.listAllSenses();

    let totalReviewed = 0, totalRight = 0, totalWrong = 0;
    let importants = 0, rares = 0, mastereds = 0;
    const weak = [];

    for (const s of senses) {
      const tag = snap.tags[s.sid];
      if (tag === 'important') importants++;
      else if (tag === 'rare') rares++;
      else if (tag === 'mastered') mastereds++;

      const st = snap.stats[s.sid];
      if (st) {
        const reviewed = (st.right || 0) + (st.wrong || 0) + (st.unsure || 0);
        if (reviewed > 0) totalReviewed++;
        totalRight += (st.right || 0);
        totalWrong += (st.wrong || 0);
        const score = (st.wrong || 0) * 2 + (st.unsure || 0) - (st.right || 0) * 0.5;
        if (score > 0) {
          weak.push({ sense: s, st, score });
        }
      }
    }

    const totalAttempts = totalRight + totalWrong;
    const pct = totalAttempts ? Math.round(totalRight / totalAttempts * 100) : 0;

    $('#statsGrid').innerHTML = [
      ['义项总数', senses.length],
      ['已复习义项', totalReviewed],
      ['累计正确率', pct + '%'],
      ['重点', importants],
      ['生僻', rares],
      ['已掌握', mastereds],
    ].map(([lbl, num]) =>
      `<div class="stat-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`
    ).join('');

    weak.sort((a, b) => b.score - a.score);
    const top = weak.slice(0, 20);
    $('#weakList').innerHTML = top.length
      ? top.map(({ sense, st }) => `
          <div class="weak-row" data-id="${sense.entryId}">
            <span class="c">${escapeHtml(sense.ownerChar)}</span>
            <span class="m">${escapeHtml(sense.meaning || '')}</span>
            <span class="r">✗${st.wrong || 0} / ?${st.unsure || 0}</span>
          </div>`).join('')
      : '<div class="hint" style="padding:8px 0;">暂无错题记录</div>';

    $$('.weak-row', $('#weakList')).forEach(el => {
      on(el, 'click', () => App.browse.focusEntry(Number(el.dataset.id)));
    });
  }

  return { init, render };
})();
