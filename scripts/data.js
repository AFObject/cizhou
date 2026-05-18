// ============ 数据层：加载 data.json + 索引 + 搜索 ============
window.App = window.App || {};

App.data = (function () {
  let raw = null;          // 原始 { version, words: [...] }
  let allSenses = [];      // 扁平化的全部义项 [{...sense, entryId, entryChar, ownerChar, subId|null, displayChars: []}]
  let entriesById = {};    // id -> entry

  async function load() {
    // 优先使用嵌入式数据（双击模式）
    if (window.RAW_DATA) {
      raw = window.RAW_DATA;
    } else {
      const resp = await fetch('data.json');
      if (!resp.ok) throw new Error('无法加载 data.json');
      raw = await resp.json();
    }
    buildIndex();
    return raw;
  }

  function buildIndex() {
    allSenses = [];
    entriesById = {};
    for (const ent of raw.words) {
      entriesById[ent.id] = ent;
      const baseChars = String(ent.char).split(/[\/／]/);

      // 顶层义项
      for (const s of (ent.senses || [])) {
        allSenses.push(decorate(s, ent, null, baseChars));
      }
      // 子词条
      for (const sub of (ent.subEntries || [])) {
        for (const s of (sub.senses || [])) {
          allSenses.push(decorate(s, ent, sub, [sub.char]));
        }
      }
    }
  }

  function decorate(s, ent, sub, displayChars) {
    return Object.assign({}, s, {
      entryId: ent.id,
      entryChar: ent.char,
      ownerChar: sub ? sub.char : ent.char,
      subId: sub ? sub.subId : null,
      displayChars,
    });
  }

  function getEntry(id) { return entriesById[id]; }
  function listEntries() { return raw.words; }
  function listAllSenses() { return allSenses; }

  // ----- 搜索 -----
  function search(keyword) {
    keyword = (keyword || '').trim();
    if (!keyword) return null; // null 表示无搜索
    const kw = keyword.toLowerCase();
    const isNum = /^\d+$/.test(keyword);

    const entryHits = new Set();
    const senseHits = []; // for display

    for (const ent of raw.words) {
      let matchedThisEntry = false;
      if (isNum && String(ent.id) === keyword) matchedThisEntry = true;
      if (ent.char.includes(keyword)) matchedThisEntry = true;

      // 检查 senses
      const sList = [];
      sList.push(...(ent.senses || []).map(s => ({ s, owner: ent })));
      for (const sub of (ent.subEntries || [])) {
        sList.push(...sub.senses.map(s => ({ s, owner: sub })));
      }
      for (const { s } of sList) {
        let hit = false;
        if (s.meaning && s.meaning.toLowerCase().includes(kw)) hit = true;
        if (s.example && s.example.toLowerCase().includes(kw)) hit = true;
        if (s.source && s.source.toLowerCase().includes(kw)) hit = true;
        if ((s.phraseKeys || []).some(p => p.toLowerCase().includes(kw))) hit = true;
        if (hit) {
          matchedThisEntry = true;
          senseHits.push({ entry: ent, sense: s });
        }
      }
      if (matchedThisEntry) entryHits.add(ent.id);
    }

    return {
      entryIds: entryHits,
      senseHits,
      keyword,
    };
  }

  return { load, getEntry, listEntries, listAllSenses, search };
})();
