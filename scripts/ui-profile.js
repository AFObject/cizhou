// ============ 我的：统计 / 导入导出 / 云同步 ============
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
        if (App.browse && App.browse.refresh) App.browse.refresh();
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
      if (App.browse && App.browse.refresh) App.browse.refresh();
    });

    // 云同步按钮事件（按钮在 render 时动态生成）
    on(document, 'click', (e) => {
      if (e.target.id === 'signInGoogleBtn') App.sync.signInWithGoogle();
      else if (e.target.id === 'signInAnonBtn') App.sync.signInAnonymously();
      else if (e.target.id === 'signOutBtn') {
        if (confirm('退出登录后将停止云同步（本地数据保留）。继续？')) App.sync.signOut();
      }
    });

    // 订阅同步状态变化，自动刷新 UI
    if (App.sync) {
      App.sync.onStatusChange(() => {
        renderSyncSection();
        renderTopbarIndicator();
      });
    }
  }

  function render() {
    renderSyncSection();
    renderStats();
  }

  function renderSyncSection() {
    const wrap = $('#syncSection');
    if (!wrap) return;
    const s = App.sync ? App.sync.getState() : { enabled: false, status: 'idle' };

    if (!s.enabled || !s.user) {
      wrap.innerHTML = `
        <div class="sync-card">
          <div class="sync-title">☁️ 云同步</div>
          <div class="sync-desc">登录后，进度将在所有设备之间实时同步。</div>
          <div class="sync-actions">
            <button class="btn-primary" id="signInGoogleBtn">用 Google 账号登录</button>
            <button class="btn-ghost" id="signInAnonBtn">匿名使用（不推荐）</button>
          </div>
        </div>
      `;
    } else {
      const u = s.user;
      const statusLabel = {
        synced: '已同步',
        syncing: '同步中…',
        connecting: '连接中…',
        offline: '离线（恢复网络后自动同步）',
        error: '错误：' + (s.error || ''),
        idle: '空闲',
      }[s.status] || s.status;

      wrap.innerHTML = `
        <div class="sync-card">
          <div class="sync-title">☁️ 云同步 <span class="sync-status status-${s.status}">● ${statusLabel}</span></div>
          <div class="sync-user">
            ${u.isAnonymous ? '匿名用户' : escapeHtml(u.email || u.name)}
            <span class="sync-uid">uid: ${u.uid.slice(0, 8)}…</span>
          </div>
          ${s.lastSyncedAt ? `<div class="sync-meta">上次同步：${formatTime(s.lastSyncedAt)}</div>` : ''}
          <div class="sync-actions">
            <button class="btn-ghost" id="signOutBtn">退出登录</button>
          </div>
        </div>
      `;
    }
  }

  function formatTime(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 5) return '刚刚';
    if (diff < 60) return Math.floor(diff) + ' 秒前';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function renderStats() {
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
        if (score > 0) weak.push({ sense: s, st, score });
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

  function renderTopbarIndicator() {
    const el = $('#syncDot');
    if (!el) return;
    const s = App.sync ? App.sync.getState() : { status: 'idle' };
    el.className = 'sync-dot status-' + s.status;
    el.title = '同步状态：' + s.status;
  }

  return { init, render };
})();