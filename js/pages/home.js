/* ============================================================================
   StudyDeck — Home page
   ============================================================================ */
(function (global) {
  'use strict';

  function render(host) {
    const page = global.app.el('div', { class: 'page home-page' });
    host.appendChild(page);

    // hero
    const hero = global.app.el('section', { class: 'hero' });
    hero.appendChild(global.app.el('div', { class: 'results-label', text: 'StudyDeck' }));
    hero.appendChild(global.app.el('h1', { text: 'Flashcards. Faster. Free.' }));
    hero.appendChild(global.app.el('p', { class: 'tagline', text: 'Build a study set in 60 seconds. Drill it with four addicting game modes. Everything saves locally — no signup, no ads, no nonsense.' }));

    const heroActions = global.app.el('div', { class: 'hero-actions' });
    const createBtn = global.app.el('button', { class: 'btn btn-primary btn-large', text: '+ Create new set' });
    createBtn.addEventListener('click', createNewSet);
    heroActions.appendChild(createBtn);

    const importBtn = global.app.el('button', { class: 'btn btn-large', text: 'Import' });
    importBtn.addEventListener('click', openImportModal);
    heroActions.appendChild(importBtn);

    const quizletBtn = global.app.el('button', { class: 'btn btn-large btn-quizlet', text: 'Import from Quizlet' });
    quizletBtn.addEventListener('click', openQuizletImportModal);
    heroActions.appendChild(quizletBtn);

    hero.appendChild(heroActions);
    page.appendChild(hero);

    // section row
    const sectionRow = global.app.el('div', { class: 'section-row' });
    sectionRow.appendChild(global.app.el('div', { class: 'section-title', text: 'Your sets' }));
    const meta = global.app.el('div', { class: 'section-meta', text: '' });
    sectionRow.appendChild(meta);
    page.appendChild(sectionRow);

    // grid
    const grid = global.app.el('div', { class: 'set-grid' });
    page.appendChild(grid);

    refresh();

    async function refresh() {
      const sets = await db.listSets();
      meta.textContent = sets.length + (sets.length === 1 ? ' set' : ' sets');
      while (grid.firstChild) grid.removeChild(grid.firstChild);

      if (!sets.length) {
        if (grid.parentNode === page) page.removeChild(grid);
        if (!page.querySelector('.empty-state')) {
          const empty = global.app.el('div', { class: 'empty-state' });
          empty.appendChild(global.app.el('div', { style: { fontSize: '40px' } }, '⌘'));
          empty.appendChild(global.app.el('h3', { text: 'No sets yet' }));
          empty.appendChild(global.app.el('p', { text: 'Create your first study set to get started.' }));
          const eBtn = global.app.el('button', { class: 'btn btn-primary', text: '+ Create new set' });
          eBtn.addEventListener('click', createNewSet);
          empty.appendChild(eBtn);
          page.appendChild(empty);
        }
        return;
      }
      const existingEmpty = page.querySelector('.empty-state');
      if (existingEmpty) existingEmpty.remove();
      if (!page.contains(grid)) page.appendChild(grid);

      for (const s of sets) {
        const cards = await db.listCards(s.id);
        grid.appendChild(buildSetCard(s, cards.length, refresh));
      }
    }

    // ---------- keyboard shortcut ----------
    function onKey(e) {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        createNewSet();
      }
    }
    document.addEventListener('keydown', onKey);

    return function teardown() {
      document.removeEventListener('keydown', onKey);
    };
  }

  function buildSetCard(set, cardCount, refresh) {
    const card = global.app.el('div', {
      class: 'set-card',
      role: 'button',
      tabindex: '0',
      'aria-label': set.title
    });
    card.style.setProperty('--card-color', set.color || 'var(--gradient)');

    card.appendChild(global.app.el('h3', { class: 'set-card-title', text: set.title || 'Untitled' }));
    if (set.description) {
      card.appendChild(global.app.el('p', { class: 'set-card-desc', text: set.description }));
    }
    const metaRow = global.app.el('div', { class: 'set-card-meta' });
    const count = global.app.el('span', { class: 'set-card-count' });
    count.textContent = cardCount + (cardCount === 1 ? ' card' : ' cards');
    metaRow.appendChild(count);
    metaRow.appendChild(global.app.el('span', { text: 'Edited ' + global.app.fmtTime(set.updatedAt || set.createdAt || Date.now()) }));
    card.appendChild(metaRow);

    const menu = global.app.el('button', { class: 'menu-btn', 'aria-label': 'Set actions' });
    menu.appendChild(global.app.svgIcon(['M12 5v.01', 'M12 12v.01', 'M12 19v.01'], { weight: 3 }));
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      openSetMenu(menu, set, refresh);
    });
    card.appendChild(menu);

    card.addEventListener('click', function () {
      global.app.navigate('#/set/' + encodeURIComponent(set.id));
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        global.app.navigate('#/set/' + encodeURIComponent(set.id));
      }
    });

    return card;
  }

  function openSetMenu(anchor, set, refresh) {
    global.app.openPopover(anchor, [
      { label: 'Edit', onClick: function () { global.app.navigate('#/set/' + encodeURIComponent(set.id)); } },
      { label: 'Play › Flashcards', onClick: function () { global.app.navigate('#/play/flashcards/' + encodeURIComponent(set.id)); } },
      { label: 'Play › Match',      onClick: function () { global.app.navigate('#/play/match/' + encodeURIComponent(set.id)); } },
      { label: 'Play › Blocks',     onClick: function () { global.app.navigate('#/play/blocks/' + encodeURIComponent(set.id)); } },
      { label: 'Play › Test',       onClick: function () { global.app.navigate('#/play/test/' + encodeURIComponent(set.id)); } },
      { divider: true },
      { label: 'Export JSON', onClick: async function () {
          const data = await db.exportSet(set.id);
          if (!data) return;
          const safe = (set.title || 'set').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          global.app.downloadJSON('studydeck-' + safe + '.json', data);
          global.app.toast('Exported ' + (set.title || 'set'), 'success');
        }
      },
      { divider: true },
      { label: 'Delete', danger: true, onClick: function () {
          confirmDelete(set, refresh);
        }
      }
    ]);
  }

  function confirmDelete(set, refresh) {
    const body = global.app.el('div');
    body.appendChild(global.app.el('p', {
      text: 'Delete "' + (set.title || 'this set') + '" forever? This cannot be undone.'
    }));
    global.app.openModal({
      title: 'Delete set?',
      body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Delete', kind: 'danger',
          onClick: async function () {
            await db.deleteSet(set.id);
            global.app.toast('Deleted', 'success');
            if (refresh) refresh();
          }
        }
      ]
    });
  }

  async function createNewSet() {
    const id = await db.createSet({ title: 'Untitled set', description: '' });
    await db.upsertCards(id, [
      { term: '', definition: '', position: 0 },
      { term: '', definition: '', position: 1 }
    ]);
    global.app.navigate('#/set/' + encodeURIComponent(id));
  }

  function openImportModal() {
    const body = global.app.el('div');
    body.appendChild(global.app.el('label', { class: 'field-label', text: 'Paste JSON or "term — definition" lines' }));
    const ta = global.app.el('textarea', { placeholder: 'Photosynthesis — Process by which plants make food from sunlight\nMitosis — Cell division producing two identical cells' });
    body.appendChild(ta);
    body.appendChild(global.app.el('div', {
      class: 'field-help',
      text: 'Separators: " — " (em dash), " - " (hyphen), " : ", "::", or tab. Or paste a StudyDeck JSON export.'
    }));

    global.app.openModal({
      title: 'Import a set',
      body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Import', kind: 'primary',
          onClick: async function () {
            const text = ta.value.trim();
            if (!text) {
              global.app.toast('Paste something first', 'error');
              return false;
            }
            try {
              if (text.charAt(0) === '{' || text.charAt(0) === '[') {
                const json = JSON.parse(text);
                const id = await db.importSet(json);
                global.app.toast('Imported set', 'success');
                global.app.navigate('#/set/' + encodeURIComponent(id));
                return;
              }
              const cards = global.app.parseTermDefText(text);
              if (!cards.length) {
                global.app.toast('No valid lines found. Use "term — definition".', 'error');
                return false;
              }
              const id = await db.createSet({ title: 'Imported set' });
              await db.upsertCards(id, cards.map(function (c, i) {
                return { term: c.term, definition: c.definition, position: i };
              }));
              global.app.toast('Imported ' + cards.length + ' cards', 'success');
              global.app.navigate('#/set/' + encodeURIComponent(id));
            } catch (e) {
              console.error(e);
              global.app.toast('Could not parse — check your format', 'error');
              return false;
            }
          }
        }
      ]
    });
  }

  // ===================== Quizlet import =====================

  // Quizlet's "Export" panel offers these separators verbatim
  const TD_OPTIONS = [
    { id: 'auto',  label: 'Auto-detect', value: null },
    { id: 'tab',   label: 'Tab',         value: '\t' },
    { id: 'comma', label: 'Comma',       value: ',' },
    { id: 'semi',  label: 'Semicolon',   value: ';' },
    { id: 'dash',  label: 'Em dash ( — )', value: '—' },
    { id: 'hyphen', label: 'Hyphen ( - )', value: '-' },
    { id: 'custom', label: 'Custom…',    value: 'custom' },
  ];
  const ROW_OPTIONS = [
    { id: 'auto',    label: 'Auto-detect',           value: null },
    { id: 'newline', label: 'New line',              value: '\n' },
    { id: 'blank',   label: 'Blank line',            value: '\n\n' },
    { id: 'semi',    label: 'Semicolon ( ; )',       value: ';' },
    { id: 'pipe',    label: 'Pipe ( | )',            value: '|' },
    { id: 'custom',  label: 'Custom…',               value: 'custom' },
  ];

  function openQuizletImportModal() {
    const body = global.app.el('div', { class: 'quizlet-import' });

    // How-to strip
    const help = global.app.el('div', { class: 'quizlet-help' });
    const helpTitle = global.app.el('div', {
      class: 'quizlet-help-title',
      text: 'Paste a Quizlet Export'
    });
    help.appendChild(helpTitle);
    const helpSteps = global.app.el('ol', { class: 'quizlet-help-steps' });
    [
      'Open your set on Quizlet → click the ⋯ menu → Export',
      'Pick any term/card separators you like (or keep the defaults)',
      'Click "Copy text", come back here, and paste below',
    ].forEach(function (txt) {
      const li = global.app.el('li');
      li.textContent = txt;
      helpSteps.appendChild(li);
    });
    help.appendChild(helpSteps);
    body.appendChild(help);

    // Title
    const titleLabel = global.app.el('label', { class: 'field-label', text: 'Set title' });
    body.appendChild(titleLabel);
    const titleInput = global.app.el('input', { type: 'text', placeholder: 'Imported from Quizlet' });
    body.appendChild(titleInput);

    // Separators row
    const sepsRow = global.app.el('div', { class: 'quizlet-seps' });

    const tdGroup = global.app.el('div', { class: 'quizlet-sep-group' });
    tdGroup.appendChild(global.app.el('label', { class: 'field-label', text: 'Between term and definition' }));
    const tdSelect = makeSelect(TD_OPTIONS, 'auto');
    tdGroup.appendChild(tdSelect);
    const tdCustom = global.app.el('input', { type: 'text', class: 'quizlet-custom hidden', placeholder: 'Custom separator', maxlength: '12' });
    tdGroup.appendChild(tdCustom);
    sepsRow.appendChild(tdGroup);

    const rowGroup = global.app.el('div', { class: 'quizlet-sep-group' });
    rowGroup.appendChild(global.app.el('label', { class: 'field-label', text: 'Between cards' }));
    const rowSelect = makeSelect(ROW_OPTIONS, 'auto');
    rowGroup.appendChild(rowSelect);
    const rowCustom = global.app.el('input', { type: 'text', class: 'quizlet-custom hidden', placeholder: 'Custom separator', maxlength: '12' });
    rowGroup.appendChild(rowCustom);
    sepsRow.appendChild(rowGroup);

    body.appendChild(sepsRow);

    // Textarea
    body.appendChild(global.app.el('label', { class: 'field-label', text: 'Paste here' }));
    const ta = global.app.el('textarea', {
      placeholder: 'Photosynthesis\tProcess by which plants make food from sunlight\n' +
                   'Mitosis\tCell division producing two identical cells\n…'
    });
    ta.style.minHeight = '180px';
    body.appendChild(ta);

    // Preview
    const previewWrap = global.app.el('div', { class: 'quizlet-preview' });
    const previewLabel = global.app.el('div', { class: 'field-label', text: 'Detected cards' });
    const previewMeta = global.app.el('span', { class: 'quizlet-preview-count', text: '0' });
    previewLabel.appendChild(previewMeta);
    previewWrap.appendChild(previewLabel);
    const previewList = global.app.el('div', { class: 'quizlet-preview-list' });
    previewWrap.appendChild(previewList);
    body.appendChild(previewWrap);

    // State + parse loop
    let detected = [];

    function currentTdSep() {
      const id = tdSelect.value;
      if (id === 'custom') return tdCustom.value || null;
      const opt = TD_OPTIONS.find(function (o) { return o.id === id; });
      return opt ? opt.value : null;
    }
    function currentRowSep() {
      const id = rowSelect.value;
      if (id === 'custom') return rowCustom.value || null;
      const opt = ROW_OPTIONS.find(function (o) { return o.id === id; });
      return opt ? opt.value : null;
    }

    function refreshPreview() {
      const text = ta.value;

      // If user pastes a Quizlet URL by mistake — give a friendly hint
      if (/^https?:\/\/(www\.)?quizlet\.com\//i.test(text.trim())) {
        previewMeta.textContent = 'URL detected';
        clearChildren(previewList);
        const note = global.app.el('div', { class: 'quizlet-preview-empty' });
        note.textContent = 'Quizlet blocks direct URL imports. Open the set in your browser, click ⋯ → Export → Copy text, then paste THAT here.';
        previewList.appendChild(note);
        detected = [];
        return;
      }

      detected = parseQuizlet(text, currentTdSep(), currentRowSep());
      previewMeta.textContent = detected.length + (detected.length === 1 ? ' card' : ' cards');
      clearChildren(previewList);
      if (detected.length === 0 && text.trim()) {
        const note = global.app.el('div', { class: 'quizlet-preview-empty' });
        note.textContent = 'No cards detected. Try changing the separators above, or use Auto-detect.';
        previewList.appendChild(note);
        return;
      }
      // Show first 5 + "…and N more"
      detected.slice(0, 5).forEach(function (c) {
        const row = global.app.el('div', { class: 'quizlet-preview-row' });
        const term = global.app.el('span', { class: 'quizlet-preview-term' });
        term.textContent = truncate(c.term, 40);
        const arrow = global.app.el('span', { class: 'quizlet-preview-arrow', text: '→' });
        const def = global.app.el('span', { class: 'quizlet-preview-def' });
        def.textContent = truncate(c.definition, 80);
        row.appendChild(term);
        row.appendChild(arrow);
        row.appendChild(def);
        previewList.appendChild(row);
      });
      if (detected.length > 5) {
        const more = global.app.el('div', { class: 'quizlet-preview-more' });
        more.textContent = '…and ' + (detected.length - 5) + ' more';
        previewList.appendChild(more);
      }
    }

    // Toggle custom inputs
    function syncCustomVis() {
      tdCustom.classList.toggle('hidden', tdSelect.value !== 'custom');
      rowCustom.classList.toggle('hidden', rowSelect.value !== 'custom');
    }
    tdSelect.addEventListener('change', function () { syncCustomVis(); refreshPreview(); });
    rowSelect.addEventListener('change', function () { syncCustomVis(); refreshPreview(); });
    tdCustom.addEventListener('input', refreshPreview);
    rowCustom.addEventListener('input', refreshPreview);
    ta.addEventListener('input', refreshPreview);

    refreshPreview();

    global.app.openModal({
      title: 'Import from Quizlet',
      body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Import',
          kind: 'primary',
          onClick: async function () {
            if (!detected.length) {
              global.app.toast('No cards to import', 'error');
              return false;
            }
            try {
              const title = (titleInput.value || '').trim() || 'Imported from Quizlet';
              const id = await db.createSet({ title: title, description: '' });
              await db.upsertCards(id, detected.map(function (c, i) {
                return { term: c.term, definition: c.definition, position: i };
              }));
              global.app.toast('Imported ' + detected.length + ' cards from Quizlet', 'success');
              global.app.navigate('#/set/' + encodeURIComponent(id));
            } catch (e) {
              console.error(e);
              global.app.toast('Could not save the import', 'error');
              return false;
            }
          }
        }
      ]
    });
  }

  function makeSelect(options, defaultId) {
    const sel = global.app.el('select', { class: 'quizlet-select' });
    options.forEach(function (o) {
      const opt = global.app.el('option', { value: o.id, text: o.label });
      if (o.id === defaultId) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /**
   * Parse Quizlet export text given chosen separators (or auto-detect).
   * Returns [{term, definition}, …]
   */
  function parseQuizlet(text, tdSep, rowSep) {
    text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!text.trim()) return [];

    // Auto-detect rules
    if (!rowSep) {
      // Prefer blank line if present, else newline
      rowSep = text.indexOf('\n\n') !== -1 ? '\n\n' : '\n';
    }

    let rows = splitOnSep(text, rowSep)
      .map(function (r) { return r.trim(); })
      .filter(function (r) { return r.length > 0; });

    if (!tdSep) {
      // Try common candidates in order, score each on "what fraction of rows split into 2 non-empty halves"
      const candidates = ['\t', '—', ' - ', ' : ', '::', ':', '  ', ','];
      let best = { sep: null, score: 0 };
      for (const c of candidates) {
        let hits = 0;
        for (const r of rows) {
          const idx = r.indexOf(c);
          if (idx > 0 && idx < r.length - c.length) hits++;
        }
        const score = hits / Math.max(1, rows.length);
        if (score > best.score) best = { sep: c, score: score };
      }
      tdSep = best.sep || '\t';
    }

    const cards = [];
    for (const row of rows) {
      const idx = row.indexOf(tdSep);
      if (idx <= 0) continue;
      const term = row.slice(0, idx).trim();
      const def = row.slice(idx + tdSep.length).trim();
      if (!term || !def) continue;
      cards.push({ term: term, definition: def });
    }
    return cards;
  }

  function splitOnSep(text, sep) {
    if (sep === '\n' || sep === '\n\n') return text.split(sep);
    return text.split(sep);
  }

  global.HomePage = { render: render };
})(window);
