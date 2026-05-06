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

    const deckgrabLink = global.app.el('a', {
      class: 'btn btn-large btn-quizlet',
      href: 'https://deckgrab.pages.dev/',
      target: '_blank',
      rel: 'noopener',
      text: 'Import from Quizlet → DeckGrab',
    });
    heroActions.appendChild(deckgrabLink);

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
      { label: 'Play › Block Blast', onClick: function () { global.app.navigate('#/play/blockblast/' + encodeURIComponent(set.id)); } },
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


  // ===================== Quizlet landing route =====================
  // Reached via #/import-quizlet?n=N&c=1 after the bookmarklet copies cards.
  // Single big "Paste cards" button → reads clipboard → creates a set.

  function renderQuizletLanding(host) {
    const params = parseHashQuery();
    const n = parseInt(params.n || '0', 10);
    const clipboardCopied = params.c === '1';
    // The d= URL param carries the TSV directly (Safari path: avoids
    // cross-origin clipboard hop). If present, auto-import without
    // requiring a click — the data is right here in the URL.
    const urlData = params.d ? String(params.d) : '';

    const wrap = global.app.el('div', { class: 'quizlet-landing' });
    const card = global.app.el('div', { class: 'quizlet-landing-card' });

    const eyebrow = global.app.el('div', { class: 'quizlet-landing-eyebrow' });
    eyebrow.textContent = 'Quizlet → StudyDeck';
    card.appendChild(eyebrow);

    const title = global.app.el('h1', { class: 'quizlet-landing-title' });
    title.textContent = n > 0
      ? 'We grabbed ' + n + ' cards from Quizlet.'
      : 'Cards copied from Quizlet';
    card.appendChild(title);

    const sub = global.app.el('p', { class: 'quizlet-landing-sub' });
    sub.textContent = urlData
      ? 'Importing now — sit tight…'
      : clipboardCopied
        ? 'They’re in your clipboard. One click and they’re yours.'
        : 'They should be in your clipboard. Click below to import.';
    card.appendChild(sub);

    // If TSV came in on the URL, import it immediately — no click needed.
    if (urlData) {
      wrap.appendChild(card);
      host.appendChild(wrap);
      importPastedCards(urlData);
      return;
    }

    // Big import button
    const importBtn = global.app.el('button', {
      class: 'btn btn-large btn-primary quizlet-landing-btn',
      text: 'Import' + (n > 0 ? ' ' + n + ' cards' : '')
    });
    importBtn.addEventListener('click', async function () {
      try {
        const text = await navigator.clipboard.readText();
        await importPastedCards(text || '');
      } catch (e) {
        // Permission denied or no clipboard API — fallback to manual paste
        showFallbackPaste();
      }
    });
    card.appendChild(importBtn);

    // Manual paste fallback
    const fbWrap = global.app.el('div', { class: 'quizlet-landing-fallback hidden' });
    const fbLabel = global.app.el('label', { class: 'field-label' });
    fbLabel.textContent = 'Couldn’t read clipboard automatically — paste here instead:';
    fbWrap.appendChild(fbLabel);
    const fbTa = global.app.el('textarea', { class: 'quizlet-landing-ta', rows: '8' });
    fbWrap.appendChild(fbTa);
    const fbImport = global.app.el('button', { class: 'btn btn-primary', text: 'Import these cards' });
    fbImport.addEventListener('click', async function () {
      await importPastedCards(fbTa.value || '');
    });
    fbWrap.appendChild(fbImport);
    card.appendChild(fbWrap);

    function showFallbackPaste() {
      fbWrap.classList.remove('hidden');
      fbTa.focus();
    }

    // Backup link
    const backLink = global.app.el('a', {
      class: 'quizlet-landing-back',
      href: '#/',
      text: '← Back to home'
    });
    card.appendChild(backLink);

    wrap.appendChild(card);
    host.appendChild(wrap);

    // Auto-attempt clipboard read once on load (works in some browsers
    // without an explicit gesture, but we don't rely on it)
    setTimeout(async function () {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.indexOf('\t') !== -1) {
          // It's tab-separated — looks like our bookmarklet's output
          // Auto-parse but require a click to commit
          const cards = global.app.parseTermDefText(text);
          if (cards.length) {
            importBtn.textContent = 'Import ' + cards.length + ' cards';
          }
        }
      } catch (e) { /* clipboard API needs user gesture — that's fine */ }
    }, 250);
  }

  async function importPastedCards(text) {
    text = (text || '').trim();
    if (!text) {
      global.app.toast('Clipboard was empty — try copying again', 'error');
      return;
    }
    const cards = global.app.parseTermDefText(text);
    if (!cards.length) {
      global.app.toast('Couldn’t parse the clipboard contents', 'error');
      return;
    }
    try {
      const id = await db.createSet({ title: 'Imported from Quizlet', description: '' });
      await db.upsertCards(id, cards.map(function (c, i) {
        return { term: c.term, definition: c.definition, position: i };
      }));
      global.app.toast('Imported ' + cards.length + ' cards', 'success');
      global.app.navigate('#/set/' + encodeURIComponent(id));
    } catch (e) {
      console.error(e);
      global.app.toast('Could not save the import', 'error');
    }
  }

  function parseHashQuery() {
    const hash = global.location.hash || '';
    const q = hash.indexOf('?');
    if (q === -1) return {};
    const out = {};
    hash.slice(q + 1).split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i === -1 ? kv : kv.slice(0, i));
      const v = decodeURIComponent(i === -1 ? '' : kv.slice(i + 1));
      out[k] = v;
    });
    return out;
  }

  global.HomePage = { render: render, renderQuizletLanding: renderQuizletLanding };
})(window);
