// ============ 背诵视图 ============
window.App = window.App || {};

App.quiz = (function () {
  const { $, $$, on, escapeHtml, highlightExample, shuffle, toast } = App.utils;

  let queue = [];      // 当前要测的 sense 数组
  let cursor = 0;
  let revealed = false;
  let order = 'sequential';
  let rounds = { right: 0, wrong: 0, unsure: 0 };

  function init() {
    on($('#rangeAll'), 'click', () => {
      $('#rangeFrom').value = 1; $('#rangeTo').value = 616;
      updatePreview();
    });
    ['rangeFrom','rangeTo','quizImportant','quizWrong',
     'quizExcludeMastered','quizExcludeRare','quizExcludeNote','quizRequireExample']
      .forEach(id => on($('#' + id), 'change', updatePreview));
    on($('#rangeFrom'), 'input', updatePreview);
    on($('#rangeTo'), 'input', updatePreview);

    $$('.seg-btn', $('#orderSeg')).forEach(b => {
      on(b, 'click', () => {
        $$('.seg-btn', $('#orderSeg')).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        order = b.dataset.order;
      });
    });

    on($('#quizStart'), 'click', start);
    on($('#quizExit'),  'click', exit);
    on($('#quizShuffle'), 'click', () => {
      queue = shuffle(queue.slice(cursor));
      cursor = 0;
      renderCard();
      toast('已重新洗牌');
    });
    on($('#quizReveal'), 'click', reveal);
    $$('.btn-judge', $('#quizActionsAfter')).forEach(b => {
      on(b, 'click', () => judge(b.dataset.judge));
    });
    on($('#finishAgain'), 'click', () => { start(); });
    on($('#finishBack'), 'click', exit);

    updatePreview();
  }

  function buildPool() {
    const from = Math.max(1, parseInt($('#rangeFrom').value) || 1);
    const to   = Math.min(616, parseInt($('#rangeTo').value) || 616);
    const onlyImp  = $('#quizImportant').checked;
    const onlyWrong = $('#quizWrong').checked;
    const excludeM  = $('#quizExcludeMastered').checked;
    const excludeR  = $('#quizExcludeRare').checked;
    const excludeN  = $('#quizExcludeNote').checked;
    const reqExample = $('#quizRequireExample').checked;

    const out = [];
    for (const s of App.data.listAllSenses()) {
      if (s.entryId < from || s.entryId > to) continue;
      const tag = App.store.getTag(s.sid);
      if (onlyImp && tag !== 'important') continue;
      if (excludeM && tag === 'mastered') continue;
      if (excludeR && tag === 'rare') continue;
      if (excludeN && s.isNote) continue;
      if (reqExample && !s.example) continue;
      if (onlyWrong) {
        const st = App.store.getStat(s.sid);
        if (!st.wrong) continue;
      }
      out.push(s);
    }
    return out;
  }

  function updatePreview() {
    const pool = buildPool();
    $('#quizPreview').textContent = pool.length
      ? `共 ${pool.length} 个义项待测`
      : '无匹配题目，请调整筛选';
    $('#quizStart').disabled = pool.length === 0;
  }

  function start() {
    let pool = buildPool();
    if (!pool.length) { toast('无可测题目'); return; }
    if (order === 'random') pool = shuffle(pool);
    queue = pool;
    cursor = 0;
    rounds = { right: 0, wrong: 0, unsure: 0 };
    $('#quizSetup').hidden = true;
    $('#quizRunner').hidden = false;
    $('#quizFinish').hidden = true;
    renderCard();
  }

  function exit() {
    $('#quizSetup').hidden = false;
    $('#quizRunner').hidden = true;
    updatePreview();
  }

  function renderCard() {
    if (cursor >= queue.length) return finish();
    const s = queue[cursor];
    revealed = false;

    $('#quizWord').textContent = s.ownerChar;
    $('#quizExample').innerHTML = s.example
      ? highlightExample(s.example, s.displayChars)
      : '<span style="color:var(--muted);">（此义项无例句）</span>';
    $('#quizSource').textContent = s.source ? `——《${s.source}》` : '';

    const phrasesHtml = (s.phraseKeys || []).length
      ? s.phraseKeys.map(p => `<span class="phrase">${escapeHtml(p)}</span>`).join(' ')
      : '';
    $('#quizAnswer').innerHTML = `${phrasesHtml}${escapeHtml(s.meaning || '(无释义)')}`;
    $('#quizAnswer').hidden = true;
    $('#quizActions').hidden = false;
    $('#quizActionsAfter').hidden = true;

    $('#quizProgress').textContent =
      `${cursor + 1} / ${queue.length}   ·   ` +
      `✓ ${rounds.right}  ✗ ${rounds.wrong}  ? ${rounds.unsure}`;
  }

  function reveal() {
    revealed = true;
    $('#quizAnswer').hidden = false;
    $('#quizActions').hidden = true;
    $('#quizActionsAfter').hidden = false;
  }

  function judge(j) {
    const s = queue[cursor];
    App.store.recordJudge(s.sid, j);
    rounds[j] = (rounds[j] || 0) + 1;
    cursor++;
    if (cursor >= queue.length) finish();
    else renderCard();
  }

  function finish() {
    $('#quizRunner').querySelector('.quiz-topbar').hidden = false;
    $('#quizFinish').hidden = false;
    document.querySelector('.card-stage').hidden = true;
    const total = rounds.right + rounds.wrong + rounds.unsure;
    const pct = total ? Math.round(rounds.right / total * 100) : 0;
    $('#finishStats').innerHTML = `
      共测 <b>${total}</b> 题<br/>
      正确 <b style="color:var(--green)">${rounds.right}</b> ·
      不会 <b style="color:var(--accent)">${rounds.wrong}</b> ·
      不确定 <b style="color:var(--gold)">${rounds.unsure}</b><br/>
      正确率 <b>${pct}%</b>
    `;
  }

  // 切回 setup 时复位 card-stage
  function _resetStage() {
    document.querySelector('.card-stage').hidden = false;
    $('#quizFinish').hidden = true;
  }
  // 覆写 start 让它先 reset
  const _origStart = start;
  start = function () { _resetStage(); _origStart(); };

  return { init };
})();
