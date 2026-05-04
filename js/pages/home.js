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

  global.HomePage = { render: render };
})(window);
