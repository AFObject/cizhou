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
    document.getElementById('topbarStatus').textContent = `共 ${n} 词条`;

    App.tabs.init();
    App.browse.init();
    App.quiz.init();
    App.profile.init();

    // 启动云同步（异步，不阻塞 UI）
    if (App.sync) App.sync.init();

    if (n > 0) App.browse.showEntry(App.data.listEntries()[0].id);

  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML =
      `<div class="empty">
        <h2>加载失败</h2>
        <p>${e.message}</p>
      </div>`;
  }
})();