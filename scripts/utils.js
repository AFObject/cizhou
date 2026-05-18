// ============ 通用工具 ============
window.App = window.App || {};

App.utils = (function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function on(el, ev, fn) { el.addEventListener(ev, fn); return () => el.removeEventListener(ev, fn); }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // 在 example 中给"考点字"加上高亮
  function highlightExample(example, chars) {
    if (!example) return '';
    let html = escapeHtml(example);
    // chars 可能是 "辩" 或 "辩/辨" 或 ["辩","辨"]
    let list = Array.isArray(chars) ? chars : String(chars).split(/[\/／]/);
    list = list.filter(c => c && c.length === 1);
    for (const ch of list) {
      const escCh = escapeHtml(ch);
      const re = new RegExp(escCh, 'g');
      html = html.replace(re, `<span class="hl">${escCh}</span>`);
    }
    return html;
  }

  // Fisher-Yates 洗牌
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(msg, ms) {
    ms = ms || 1800;
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  return { $, $$, on, debounce, escapeHtml, highlightExample, shuffle, toast, downloadText, todayISO };
})();
