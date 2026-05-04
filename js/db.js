/* ============================================================================
   StudyDeck — IndexedDB wrapper
   ============================================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'studydeck';
  const DB_VERSION = 1;
  const STORE_SETS = 'sets';
  const STORE_CARDS = 'cards';
  const STORE_SCORES = 'scores';

  let _dbp = null;

  function open() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_SETS)) {
          const s = db.createObjectStore(STORE_SETS, { keyPath: 'id' });
          s.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(STORE_CARDS)) {
          const c = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
          c.createIndex('setId', 'setId');
          c.createIndex('setId_position', ['setId', 'position']);
        }
        if (!db.objectStoreNames.contains(STORE_SCORES)) {
          const sc = db.createObjectStore(STORE_SCORES, { keyPath: 'id' });
          sc.createIndex('setId_mode', ['setId', 'mode']);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _dbp;
  }

  function tx(stores, mode) {
    return open().then(function (db) {
      const t = db.transaction(stores, mode || 'readonly');
      const result = {};
      (Array.isArray(stores) ? stores : [stores]).forEach(function (s) {
        result[s] = t.objectStore(s);
      });
      result.tx = t;
      return result;
    });
  }

  function reqToPromise(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function txComplete(t) {
    return new Promise(function (resolve, reject) {
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error || new Error('tx aborted')); };
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // --- Sets ---
  async function listSets() {
    const { sets } = await tx(STORE_SETS);
    const all = await reqToPromise(sets.getAll());
    all.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return all;
  }

  async function getSet(id) {
    const { sets } = await tx(STORE_SETS);
    return await reqToPromise(sets.get(id));
  }

  async function createSet(input) {
    const now = Date.now();
    const set = {
      id: input.id || uid(),
      title: input.title || 'Untitled set',
      description: input.description || '',
      color: input.color || pickColor(),
      createdAt: input.createdAt || now,
      updatedAt: now
    };
    const t = await tx(STORE_SETS, 'readwrite');
    t.sets.put(set);
    await txComplete(t.tx);
    return set.id;
  }

  async function updateSet(id, patch) {
    const t = await tx(STORE_SETS, 'readwrite');
    const cur = await reqToPromise(t.sets.get(id));
    if (!cur) { await txComplete(t.tx); return; }
    const next = Object.assign({}, cur, patch, { updatedAt: Date.now() });
    t.sets.put(next);
    await txComplete(t.tx);
  }

  async function deleteSet(id) {
    const t = await tx([STORE_SETS, STORE_CARDS, STORE_SCORES], 'readwrite');
    t.sets.delete(id);
    // delete cards
    const idx = t.cards.index('setId');
    await new Promise(function (resolve, reject) {
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = function () {
        const cur = req.result;
        if (cur) { cur.delete(); cur.continue(); } else resolve();
      };
      req.onerror = function () { reject(req.error); };
    });
    // delete scores
    const sidx = t.scores.index('setId_mode');
    await new Promise(function (resolve, reject) {
      const req = sidx.openCursor();
      req.onsuccess = function () {
        const cur = req.result;
        if (cur) {
          if (cur.value && cur.value.setId === id) cur.delete();
          cur.continue();
        } else resolve();
      };
      req.onerror = function () { reject(req.error); };
    });
    await txComplete(t.tx);
  }

  // --- Cards ---
  async function listCards(setId) {
    const t = await tx(STORE_CARDS);
    const idx = t.cards.index('setId');
    const all = await reqToPromise(idx.getAll(IDBKeyRange.only(setId)));
    all.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
    return all;
  }

  async function upsertCards(setId, cards) {
    const t = await tx([STORE_CARDS, STORE_SETS], 'readwrite');
    const now = Date.now();
    cards.forEach(function (c, i) {
      const card = {
        id: c.id || uid(),
        setId: setId,
        term: (c.term || '').toString(),
        definition: (c.definition || '').toString(),
        position: typeof c.position === 'number' ? c.position : i
      };
      t.cards.put(card);
    });
    // bump set updatedAt
    const cur = await reqToPromise(t.sets.get(setId));
    if (cur) {
      cur.updatedAt = now;
      t.sets.put(cur);
    }
    await txComplete(t.tx);
  }

  async function deleteCard(id) {
    const t = await tx(STORE_CARDS, 'readwrite');
    t.cards.delete(id);
    await txComplete(t.tx);
  }

  async function replaceCards(setId, cards) {
    const t = await tx([STORE_CARDS, STORE_SETS], 'readwrite');
    const idx = t.cards.index('setId');
    await new Promise(function (resolve, reject) {
      const req = idx.openCursor(IDBKeyRange.only(setId));
      req.onsuccess = function () {
        const cur = req.result;
        if (cur) { cur.delete(); cur.continue(); } else resolve();
      };
      req.onerror = function () { reject(req.error); };
    });
    cards.forEach(function (c, i) {
      const card = {
        id: c.id || uid(),
        setId: setId,
        term: (c.term || '').toString(),
        definition: (c.definition || '').toString(),
        position: typeof c.position === 'number' ? c.position : i
      };
      t.cards.put(card);
    });
    const cur = await reqToPromise(t.sets.get(setId));
    if (cur) {
      cur.updatedAt = Date.now();
      t.sets.put(cur);
    }
    await txComplete(t.tx);
  }

  async function exportSet(id) {
    const set = await getSet(id);
    if (!set) return null;
    const cards = await listCards(id);
    return {
      version: 1,
      set: { title: set.title, description: set.description, color: set.color },
      cards: cards.map(function (c) { return { term: c.term, definition: c.definition, position: c.position }; })
    };
  }

  async function importSet(json) {
    if (!json || typeof json !== 'object') throw new Error('Invalid format');
    const setData = json.set || {};
    const cards = Array.isArray(json.cards) ? json.cards : [];
    const id = await createSet({
      title: setData.title || 'Imported set',
      description: setData.description || '',
      color: setData.color || pickColor()
    });
    if (cards.length) {
      await upsertCards(id, cards.map(function (c, i) {
        return { term: c.term || '', definition: c.definition || '', position: i };
      }));
    }
    return id;
  }

  // --- Scores ---
  async function recordScore(setId, mode, score, timeMs) {
    const t = await tx(STORE_SCORES, 'readwrite');
    t.scores.put({
      id: uid(),
      setId: setId,
      mode: mode,
      score: score,
      timeMs: timeMs || 0,
      completedAt: Date.now()
    });
    await txComplete(t.tx);
  }

  async function topScores(setId, mode, n) {
    const t = await tx(STORE_SCORES);
    const idx = t.scores.index('setId_mode');
    const all = await reqToPromise(idx.getAll(IDBKeyRange.only([setId, mode])));
    // Sort by mode-specific best:
    //  - match/blocks/test → higher score is better; if scores equal, lower time
    //  - match → lower time is better (score is fixed at 100)
    if (mode === 'match') {
      all.sort(function (a, b) { return (a.timeMs || 0) - (b.timeMs || 0); });
    } else {
      all.sort(function (a, b) {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return (a.timeMs || 0) - (b.timeMs || 0);
      });
    }
    return all.slice(0, n || 5);
  }

  function pickColor() {
    const palettes = [
      'linear-gradient(135deg, #FFB454, #FF6B6B)',
      'linear-gradient(135deg, #FF6B6B, #C147FF)',
      'linear-gradient(135deg, #C147FF, #5E5CE6)',
      'linear-gradient(135deg, #34C759, #30B0C7)',
      'linear-gradient(135deg, #FFB454, #C147FF)',
      'linear-gradient(135deg, #FF4FA3, #FF6B6B)'
    ];
    return palettes[Math.floor(Math.random() * palettes.length)];
  }

  global.db = {
    open: open,
    listSets: listSets,
    getSet: getSet,
    createSet: createSet,
    updateSet: updateSet,
    deleteSet: deleteSet,
    listCards: listCards,
    upsertCards: upsertCards,
    deleteCard: deleteCard,
    replaceCards: replaceCards,
    exportSet: exportSet,
    importSet: importSet,
    recordScore: recordScore,
    topScores: topScores,
    pickColor: pickColor,
    uid: uid
  };
})(window);
