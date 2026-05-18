// ============ 持久化层：标签 + 统计 ============
window.App = window.App || {};

App.store = (function () {
  const KEY = 'cizhou.progress.v1';

  // 内存里维护一份，写时合并
  let state = {
    tags: {},   // { sid: 'important' | 'rare' | 'mastered' }
    stats: {},  // { sid: { right, wrong, unsure, lastReview } }
    meta: { createdAt: new Date().toISOString() }
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        state.tags = obj.tags || {};
        state.stats = obj.stats || {};
        state.meta = obj.meta || state.meta;
      }
    } catch (e) {
      console.warn('progress load failed', e);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('progress save failed', e);
    }
  }

  function getTag(sid)        { return state.tags[sid] || null; }
  function setTag(sid, tag) {
    if (!tag) delete state.tags[sid];
    else state.tags[sid] = tag;
    save();
  }
  function toggleTag(sid, tag) {
    if (state.tags[sid] === tag) delete state.tags[sid];
    else state.tags[sid] = tag;
    save();
  }

  function getStat(sid) {
    return state.stats[sid] || { right: 0, wrong: 0, unsure: 0, lastReview: null };
  }
  function recordJudge(sid, judge) {
    const s = getStat(sid);
    if (judge === 'right')  s.right  = (s.right  || 0) + 1;
    if (judge === 'wrong')  s.wrong  = (s.wrong  || 0) + 1;
    if (judge === 'unsure') s.unsure = (s.unsure || 0) + 1;
    s.lastReview = App.utils.todayISO();
    state.stats[sid] = s;
    save();
  }

  function exportAll() {
    return JSON.stringify({
      app: 'cizhou',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...state,
    }, null, 2);
  }

  function importAll(jsonText) {
    const obj = JSON.parse(jsonText);
    if (obj && (obj.tags || obj.stats)) {
      state.tags = obj.tags || {};
      state.stats = obj.stats || {};
      state.meta.importedAt = new Date().toISOString();
      save();
      return true;
    }
    throw new Error('文件格式不正确');
  }

  function resetAll() {
    state = { tags: {}, stats: {}, meta: { createdAt: new Date().toISOString() } };
    save();
  }

  function snapshot() { return state; }

  return {
    load, save,
    getTag, setTag, toggleTag,
    getStat, recordJudge,
    exportAll, importAll, resetAll,
    snapshot,
  };
})();
