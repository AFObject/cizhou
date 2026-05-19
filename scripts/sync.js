// ============ 云同步层（Firebase Firestore）============
// 设计要点：
//   1. 所有写操作仍然先打到 App.store（localStorage），UI 立即反映
//   2. App.store 在 setTag / recordJudge 之后调用 App.sync.pushDelta()
//   3. pushDelta 用 Firestore 的字段级 update + increment，保证多端原子合并
//   4. 启动时 onSnapshot 订阅远程，远程变化 → 合并进 store → 触发 UI 重渲染

window.App = window.App || {};

App.sync = (function () {
  const { toast } = App.utils;

  // ---- Firebase SDK 通过 CDN 动态加载（modular v10 风格的 compat 版本，方便全局调用）----
  // 我们用 v10 的 compat / namespaced API，因为它能直接挂到全局，无需 import
  const SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"
  ];

  let _ready = false;
  let _user = null;
  let _db = null;
  let _docRef = null;
  let _unsubscribeDoc = null;
  let _pendingWrites = 0;           // 在飞的写次数
  let _listeners = new Set();        // 状态变化的订阅者
  let _lastSyncedAt = null;
  let _enabled = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;   // 保证顺序
      s.onload = resolve;
      s.onerror = () => reject(new Error('加载失败: ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadSDK() {
    if (window.firebase) return;
    for (const url of SDK_URLS) await loadScript(url);
  }

  function setStatus(patch) {
    Object.assign(state, patch);
    for (const fn of _listeners) {
      try { fn(state); } catch (e) {}
    }
  }
  const state = {
    enabled: false,        // 是否启用了云同步
    status: 'idle',        // idle | connecting | synced | syncing | offline | error
    user: null,            // { uid, name, email, isAnonymous }
    lastSyncedAt: null,
    error: null,
  };

  function onStatusChange(fn) {
    _listeners.add(fn);
    fn(state);
    return () => _listeners.delete(fn);
  }

  // ---- 初始化（如果用户已经登录过，自动恢复连接）----
  async function init() {
    if (!window.FIREBASE_CONFIG) {
      console.warn('未配置 Firebase，跳过云同步');
      return;
    }
    try {
      setStatus({ status: 'connecting' });
      await loadSDK();
      firebase.initializeApp(window.FIREBASE_CONFIG);

      // 启用 IndexedDB 持久化（离线写队列 + 缓存）
      try {
        await firebase.firestore().enablePersistence({ synchronizeTabs: true });
      } catch (e) {
        // 多标签或浏览器不支持时静默
        console.warn('Firestore persistence 未启用:', e.code);
      }

      _db = firebase.firestore();

      // 监听 auth 状态。如果之前登录过，会自动恢复
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
          await onSignedIn(user);
        } else {
          onSignedOut();
        }
      });

      // 在线/离线状态侦测
      window.addEventListener('online',  () => { if (_user) setStatus({ status: 'synced' }); });
      window.addEventListener('offline', () => { setStatus({ status: 'offline' }); });

    } catch (e) {
      console.error(e);
      setStatus({ status: 'error', error: e.message });
    }
  }

  async function signInWithGoogle() {
    if (!window.firebase) await init();
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await firebase.auth().signInWithPopup(provider);
      // onAuthStateChanged 会触发 onSignedIn
    } catch (e) {
      console.error(e);
      toast('登录失败：' + e.message);
      setStatus({ status: 'error', error: e.message });
    }
  }

  async function signInAnonymously() {
    if (!window.firebase) await init();
    try {
      await firebase.auth().signInAnonymously();
    } catch (e) {
      toast('匿名登录失败：' + e.message);
      setStatus({ status: 'error', error: e.message });
    }
  }

  async function signOut() {
    if (_unsubscribeDoc) { _unsubscribeDoc(); _unsubscribeDoc = null; }
    await firebase.auth().signOut();
  }

  async function onSignedIn(user) {
    _user = user;
    _enabled = true;
    _docRef = _db.collection('users').doc(user.uid)
                .collection('data').doc('progress');
    setStatus({
      enabled: true,
      user: {
        uid: user.uid,
        name: user.displayName || '(匿名)',
        email: user.email || null,
        isAnonymous: user.isAnonymous,
      },
      status: 'syncing',
    });

    // 启动订阅
    _unsubscribeDoc = _docRef.onSnapshot(
      { includeMetadataChanges: true },
      (snap) => {
        // 来自本地缓存的事件 metadata.fromCache === true
        if (snap.exists) {
          const remote = snap.data();
          mergeRemoteIntoLocal(remote);
        } else {
          // 首次：把本地推上去作为初始版本
          pushFullSnapshot();
        }
        if (!snap.metadata.hasPendingWrites) {
          _lastSyncedAt = Date.now();
          setStatus({
            status: navigator.onLine ? 'synced' : 'offline',
            lastSyncedAt: _lastSyncedAt,
          });
        } else {
          setStatus({ status: 'syncing' });
        }
      },
      (err) => {
        console.error('snapshot err', err);
        setStatus({ status: 'error', error: err.message });
      }
    );
  }

  function onSignedOut() {
    _user = null;
    _enabled = false;
    setStatus({
      enabled: false, user: null, status: 'idle',
    });
  }

  // ---- 合并远程数据进本地 ----
  function mergeRemoteIntoLocal(remote) {
    // 远程结构: { tags: {...}, stats: {...}, updatedAt }
    const local = App.store.snapshot();
    const mergedTags = Object.assign({}, local.tags, remote.tags || {});
    // tags 的合并：远端为准（因为远端用 set 覆盖语义；如果本地有 remote 没有的，保留本地——这是用户本地刚做的改动还没推上去）
    // 实际上为了避免本地新打的 tag 被远端旧值覆盖，下面用"远程已有的字段覆盖本地"
    // 反向合并：以远端为底，本地新值打补丁
    const finalTags = Object.assign({}, remote.tags || {}, /* 然后让本地未上传的覆盖？ 不，本地通过 update 已经写了 */);

    // stats 合并：取每个字段的较大值（counter 单调递增）
    const mergedStats = {};
    const allSids = new Set([
      ...Object.keys(local.stats || {}),
      ...Object.keys(remote.stats || {}),
    ]);
    for (const sid of allSids) {
      const l = local.stats[sid] || {};
      const r = (remote.stats || {})[sid] || {};
      mergedStats[sid] = {
        right:  Math.max(l.right  || 0, r.right  || 0),
        wrong:  Math.max(l.wrong  || 0, r.wrong  || 0),
        unsure: Math.max(l.unsure || 0, r.unsure || 0),
        lastReview: (l.lastReview && r.lastReview)
          ? (l.lastReview > r.lastReview ? l.lastReview : r.lastReview)
          : (l.lastReview || r.lastReview || null),
      };
    }

    App.store._setRaw({
      tags: finalTags,
      stats: mergedStats,
      meta: local.meta,
    });

    // 通知 UI 重渲染
    if (App.browse && App.browse.refresh) App.browse.refresh();
    if (App.profile && App.profile.render) App.profile.render();
  }

  // ---- 首次：把本地完整推到云 ----
  async function pushFullSnapshot() {
    if (!_docRef) return;
    const snap = App.store.snapshot();
    await _docRef.set({
      tags: snap.tags || {},
      stats: snap.stats || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ---- 增量推送（被 store 在每次改动后调用）----
  // 关键：使用 dot-path + increment，保证多端原子合并
  async function pushTag(sid, tag) {
    if (!_docRef) return;
    setStatus({ status: 'syncing' });
    try {
      if (tag === null) {
        await _docRef.update({
          [`tags.${sid}`]: firebase.firestore.FieldValue.delete(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await _docRef.update({
          [`tags.${sid}`]: tag,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      // 文档还不存在的情况
      if (e.code === 'not-found') { await pushFullSnapshot(); return; }
      console.error(e);
    }
  }

  async function pushJudge(sid, judge) {
    if (!_docRef) return;
    setStatus({ status: 'syncing' });
    try {
      const inc = firebase.firestore.FieldValue.increment(1);
      const update = {
        [`stats.${sid}.${judge}`]: inc,
        [`stats.${sid}.lastReview`]: App.utils.todayISO(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await _docRef.update(update);
    } catch (e) {
      if (e.code === 'not-found') { await pushFullSnapshot(); return; }
      console.error(e);
    }
  }

  async function pushResetAll() {
    if (!_docRef) return;
    await _docRef.set({
      tags: {}, stats: {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function isEnabled() { return _enabled; }
  function getState()  { return state; }

  return {
    init,
    signInWithGoogle, signInAnonymously, signOut,
    pushTag, pushJudge, pushResetAll, pushFullSnapshot,
    onStatusChange, isEnabled, getState,
  };
})();