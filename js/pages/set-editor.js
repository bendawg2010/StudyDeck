/* ============================================================================
   StudyDeck — Set Editor
   ============================================================================ */
(function (global) {
  'use strict';

  async function render(host, setId) {
    const set = await db.getSet(setId);
    if (!set) {
      global.app.toast('Set not found', 'error');
      global.app.navigate('#/');
      return;
    }
    let cards = await db.listCards(setId);

    const page = global.app.el('div', { class: 'page set-editor-page' });
    host.appendChild(page);

    // back link
    const back = global.app.el('a', { class: 'editor-back', href: '#/' });
    back.appendChild(global.app.svgIcon('M15 18l-6-6 6-6', { weight: 2 }));
    back.appendChild(document.createTextNode('Back to home'));
    page.appendChild(back);

    // layout
    const layout = global.app.el('div', { class: 'editor-layout' });
    page.appendChild(layout);

    // ---- LEFT: editor area ----
    const left = global.app.el('div');
    layout.appendChild(left);

    const head = global.app.el('div', { class: 'editor-head' });
    left.appendChild(head);

    const titleInput = global.app.el('input', {
      class: 'editor-title',
      type: 'text',
      value: set.title || '',
      placeholder: 'Untitled set',
      'aria-label': 'Set title',
      maxlength: 200
    });
    head.appendChild(titleInput);
    const descInput = global.app.el('input', {
      class: 'editor-desc',
      type: 'text',
      value: set.description || '',
      placeholder: 'Add a description (optional)',
      'aria-label': 'Set description',
      maxlength: 500
    });
    head.appendChild(descInput);

    const savePill = global.app.el('div', { class: 'save-pill', text: 'Saved' });
    head.appendChild(savePill);

    // toolbar
    const toolbar = global.app.el('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' } });
    const bulkBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Bulk add' });
    bulkBtn.addEventListener('click', openBulkAdd);
    toolbar.appendChild(bulkBtn);
    const shuffleBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Shuffle order' });
    shuffleBtn.addEventListener('click', function () {
      cards = global.app.shuffle(cards).map(function (c, i) { return Object.assign({}, c, { position: i }); });
      renderCards();
      saveCards();
      global.app.toast('Shuffled', 'success');
    });
    toolbar.appendChild(shuffleBtn);
    const cardCountSpan = global.app.el('span', {
      style: { color: 'var(--text-3)', fontSize: '13px', marginLeft: 'auto', alignSelf: 'center' }
    });
    toolbar.appendChild(cardCountSpan);
    left.appendChild(toolbar);

    const list = global.app.el('div', { class: 'card-list' });
    left.appendChild(list);

    const addBtn = global.app.el('button', { class: 'add-card-btn', text: '+ Add card' });
    addBtn.addEventListener('click', function () { addNewRow(true); });
    left.appendChild(addBtn);

    // ---- RIGHT: rail ----
    const rail = global.app.el('aside', { class: 'editor-rail' });
    layout.appendChild(rail);
    rail.appendChild(global.app.el('h4', { class: 'rail-title', text: 'Study modes' }));
    rail.appendChild(buildPlayBtn('flashcards', 'Flashcards', 'Classic flip cards', flashIcon()));
    rail.appendChild(buildPlayBtn('match',      'Match',      'Race the clock',      matchIcon()));
    rail.appendChild(buildPlayBtn('blocks',     'Falling Blocks', 'Type to defuse',  blocksIcon()));
    rail.appendChild(buildPlayBtn('test',       'Test',       'Mixed quiz',          testIcon()));

    // ---- behaviors ----
    function buildPlayBtn(mode, label, sub, iconNode) {
      const b = global.app.el('a', {
        class: 'play-btn',
        href: '#/play/' + mode + '/' + encodeURIComponent(setId),
        dataset: { mode: mode }
      });
      const icon = global.app.el('span', { class: 'play-icon' });
      icon.appendChild(iconNode);
      b.appendChild(icon);
      const txt = global.app.el('span', { class: 'play-text' });
      txt.appendChild(global.app.el('span', { text: label }));
      txt.appendChild(global.app.el('span', { class: 'play-meta', text: sub }));
      b.appendChild(txt);
      return b;
    }

    function renderCards() {
      while (list.firstChild) list.removeChild(list.firstChild);
      cards.forEach(function (c, idx) {
        list.appendChild(buildRow(c, idx));
      });
      cardCountSpan.textContent = cards.length + (cards.length === 1 ? ' card' : ' cards');
    }

    function buildRow(card, idx) {
      const row = global.app.el('div', {
        class: 'card-row',
        draggable: 'true',
        dataset: { id: card.id }
      });

      const handle = global.app.el('div', { class: 'drag-handle', 'aria-label': 'Drag to reorder' });
      handle.appendChild(global.app.svgIcon(['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'], { weight: 3 }));
      row.appendChild(handle);

      const term = global.app.el('textarea', {
        class: 'term',
        placeholder: 'Term',
        rows: '2',
        'aria-label': 'Term'
      });
      term.value = card.term || '';
      term.addEventListener('input', function () {
        card.term = term.value;
        saveDebounced();
      });
      term.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // jump to definition
          const def = row.querySelector('.definition');
          if (def) def.focus();
        }
      });
      row.appendChild(term);

      const def = global.app.el('textarea', {
        class: 'definition',
        placeholder: 'Definition',
        rows: '2',
        'aria-label': 'Definition'
      });
      def.value = card.definition || '';
      def.addEventListener('input', function () {
        card.definition = def.value;
        saveDebounced();
      });
      def.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // if last row, add new and focus, else focus next term
          const isLast = idx === cards.length - 1;
          if (isLast) addNewRow(true);
          else {
            const next = list.children[idx + 1];
            if (next) next.querySelector('.term').focus();
          }
        }
      });
      row.appendChild(def);

      const del = global.app.el('button', { class: 'delete-btn', 'aria-label': 'Delete card' });
      del.appendChild(global.app.svgIcon(['M18 6 6 18', 'M6 6l12 12'], { weight: 2.4 }));
      del.addEventListener('click', function () {
        cards.splice(idx, 1);
        renderCards();
        saveCards();
      });
      row.appendChild(del);

      // drag/drop
      row.addEventListener('dragstart', function (e) {
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('is-dragging');
        Array.prototype.forEach.call(list.querySelectorAll('.card-row'), function (r) { r.classList.remove('drag-over'); });
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(fromIdx) || fromIdx === idx) return;
        const moved = cards.splice(fromIdx, 1)[0];
        cards.splice(idx, 0, moved);
        cards.forEach(function (c, i) { c.position = i; });
        renderCards();
        saveCards();
      });

      return row;
    }

    function addNewRow(focus) {
      const newCard = { id: db.uid(), setId: setId, term: '', definition: '', position: cards.length };
      cards.push(newCard);
      renderCards();
      saveCards();
      if (focus) {
        const last = list.lastElementChild;
        if (last) {
          const t = last.querySelector('.term');
          if (t) t.focus();
        }
      }
    }

    // saving
    let _saveTimer = 0;
    function showSaved() {
      savePill.classList.add('is-visible');
      clearTimeout(_pillTimer);
      _pillTimer = setTimeout(function () { savePill.classList.remove('is-visible'); }, 1200);
    }
    let _pillTimer = 0;

    async function saveSet() {
      try {
        await db.updateSet(setId, {
          title: titleInput.value.trim() || 'Untitled set',
          description: descInput.value
        });
        showSaved();
      } catch (e) { console.error(e); }
    }
    async function saveCards() {
      try {
        cards.forEach(function (c, i) { c.position = i; });
        await db.replaceCards(setId, cards);
        showSaved();
      } catch (e) { console.error(e); }
    }

    const saveSetDebounced = global.app.debounce(saveSet, 350);
    const saveCardsDebounced = global.app.debounce(saveCards, 350);

    function saveDebounced() {
      saveCardsDebounced();
    }

    titleInput.addEventListener('input', saveSetDebounced);
    descInput.addEventListener('input', saveSetDebounced);

    // bulk add
    function openBulkAdd() {
      const body = global.app.el('div');
      body.appendChild(global.app.el('label', { class: 'field-label', text: 'Paste lines: term — definition' }));
      const ta = global.app.el('textarea', { placeholder: 'apple — manzana\norange — naranja' });
      body.appendChild(ta);
      body.appendChild(global.app.el('div', {
        class: 'field-help',
        text: 'Separators: " — " (em dash), " - " (hyphen), " : ", "::", or tab.'
      }));
      global.app.openModal({
        title: 'Bulk add cards',
        body: body,
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          {
            label: 'Add', kind: 'primary',
            onClick: function () {
              const parsed = global.app.parseTermDefText(ta.value);
              if (!parsed.length) {
                global.app.toast('No valid lines', 'error');
                return false;
              }
              parsed.forEach(function (p) {
                cards.push({ id: db.uid(), setId: setId, term: p.term, definition: p.definition, position: cards.length });
              });
              renderCards();
              saveCards();
              global.app.toast('Added ' + parsed.length + ' cards', 'success');
            }
          }
        ]
      });
    }

    renderCards();

    return function teardown() {
      // ensure final save
      saveSet();
      saveCards();
    };
  }

  function flashIcon() {
    return global.app.svgIcon([
      'M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M7 4h10',
      'M9 2h6'
    ], { size: 18, weight: 1.8 });
  }
  function matchIcon() {
    return global.app.svgIcon([
      'M3 5h7v6H3z',
      'M14 5h7v6h-7z',
      'M3 14h7v6H3z',
      'M14 14h7v6h-7z'
    ], { size: 18, weight: 1.8 });
  }
  function blocksIcon() {
    return global.app.svgIcon([
      'M6 3h4v4H6z',
      'M14 3h4v4h-4z',
      'M6 11h4v4H6z',
      'M14 11h4v4h-4z',
      'M3 21h18'
    ], { size: 18, weight: 1.8 });
  }
  function testIcon() {
    return global.app.svgIcon([
      'M9 11l3 3 8-8',
      'M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11'
    ], { size: 18, weight: 1.8 });
  }

  global.SetEditorPage = { render: render };
})(window);
