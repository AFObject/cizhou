// ============ 入口：tab 路由 + 启动 ============
window.App = window.App || {};

App.tabs = (function () {
  const { $, $$, on } = App.utils;

  function switchTo(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    // 进入 profile 时刷新
    if (name === 'profile' && App.profile) App.profile.render();
  }

  function init() {
    $$('.tab').forEach(t => on(t, 'click', () => switchTo(t.dataset.tab)));
  }

  return { init, switchTo };
})();

(async function bootstrap() {
  const { $, toast } = App.utils;
  try {
    App.store.load();
    await App.data.load();

    const n = App.data.listEntries().length;
    document.getElementById('topbarStatus').textContent = `共 ${n} 词条 · 本地存储`;

    App.tabs.init();
    App.browse.init();
    App.quiz.init();
    App.profile.init();

    // 默认展示第一个词条
    if (n > 0) App.browse.showEntry(App.data.listEntries()[0].id);

    // 注册 service worker（可选，纯展示效果）
    // 这里不强制，避免缓存问题
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML =
      `<div class="empty">
        <h2>加载失败</h2>
        <p>${e.message}</p>
        <p class="hint">
          如果你看到的是 fetch 错误，说明你直接双击了 index.html。请二选一：<br/>
          ① 在项目目录运行 <code>python3 -m http.server 8000</code>，访问 http://localhost:8000<br/>
          ② 把 data.json 转成 scripts/data-embed.js（见 README）
        </p>
      </div>`;
  }
})();
