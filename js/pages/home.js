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

  // One-click Quizlet importer. Scrapes the page the user is already on,
  // writes tab-separated cards to clipboard, and opens StudyDeck's
  // /#/import-quizlet route so the user can paste with one click.
  const QUIZLET_SCRAPER = "(async()=>{const c=[],S=new Set(),P=new Set(['term','word','question','prompt','front','side a','vocab','vocabulary']),Q=new Set(['definition','meaning','answer','translation','back','side b','def']),D=s=>{try{return JSON.parse('\"'+s+'\"')}catch(e){return s}},X=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim(),A=(t,d)=>{t=X(t);d=X(d);if(!t||!d||t===d||t.length>500||d.length>2000)return;const tl=t.toLowerCase(),dl=d.toLowerCase();if(P.has(tl)&&Q.has(dl))return;if(P.has(tl)||Q.has(dl)||P.has(dl)||Q.has(tl))return;if(d.length>t.length+2&&d.startsWith(t+' '))d=d.slice(t.length+1).trim();else if(t.length>d.length+2&&t.startsWith(d+' '))t=t.slice(d.length+1).trim();else if(d.length>t.length+2&&d.endsWith(' '+t))d=d.slice(0,d.length-t.length-1).trim();else if(t.length>d.length+2&&t.endsWith(' '+d))t=t.slice(0,t.length-d.length-1).trim();if(!t||!d||t===d)return;const k=t+'\\u0000'+d;if(S.has(k))return;S.add(k);c.push({t,d})};const G=side=>{if(!side)return null;if(typeof side.text==='string')return side.text;if(typeof side.content==='string')return side.content;if(Array.isArray(side.media)&&side.media[0]){const m=side.media[0];if(typeof m.text==='string')return m.text;if(typeof m.plainText==='string')return m.plainText;if(m.richText&&typeof m.richText.html==='string')return m.richText.html}return null};const b=document.createElement('div');b.style.cssText='position:fixed;top:18px;right:18px;z-index:2147483647;background:linear-gradient(135deg,#FFB454,#FF6B6B,#C147FF);color:white;padding:14px 22px;border-radius:12px;font:600 14px -apple-system,system-ui;box-shadow:0 12px 32px rgba(0,0,0,.45);max-width:380px';b.textContent='StudyDeck: scanning page\\u2026';document.body.appendChild(b);const nd=document.getElementById('__NEXT_DATA__');if(nd){try{const W=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(W);if(typeof o.word==='string'&&typeof o.definition==='string')A(o.word,o.definition);if(typeof o.term==='string'&&typeof o.definition==='string')A(o.term,o.definition);if(o.cardSides){const s=Array.isArray(o.cardSides)?o.cardSides:Object.values(o.cardSides);if(s.length>=2){const t=G(s[0]),d=G(s[1]);if(t&&d)A(t,d)}}for(const k in o)W(o[k])};W(JSON.parse(nd.textContent))}catch(e){}}if(c.length<3){document.querySelectorAll('script').forEach(s=>{const x=s.textContent||'',re=/\"word\":\"((?:[^\"\\\\]|\\\\.)*)\",\"definition\":\"((?:[^\"\\\\]|\\\\.)*)\"/g;for(const m of x.matchAll(re))A(D(m[1]),D(m[2]))})}b.textContent='StudyDeck: loading lazy cards\\u2026';let lh=0;for(let i=0;i<20;i++){window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,350));if(document.body.scrollHeight===lh)break;lh=document.body.scrollHeight}window.scrollTo(0,0);if(c.length<3){const TS=['[data-testid*=\"word\"]','[data-testid*=\"term\"]','[class*=\"wordText\"]','[class*=\"TermText\"][class*=\"word\"]','[class*=\"SetPageTerm-word\"]'];const DS=['[data-testid*=\"definition\"]','[class*=\"definitionText\"]','[class*=\"TermText\"][class*=\"definition\"]','[class*=\"SetPageTerm-definition\"]'];document.querySelectorAll('[class*=\"SetPageTerm\"],[class*=\"erm-content\"],li[id*=\"term\"],[data-testid*=\"term-card\"]').forEach(n=>{let tEl=null,dEl=null;for(const s of TS){if(!tEl)tEl=n.querySelector(s)}for(const s of DS){if(!dEl)dEl=n.querySelector(s)}if(tEl&&dEl)A(tEl.innerText||tEl.textContent,dEl.innerText||dEl.textContent)})}if(!c.length){b.textContent='StudyDeck: no cards found. Are you on the full set page (with all terms visible)?';b.style.background='#FF3B30';setTimeout(()=>b.remove(),6000);return}const out=c.map(o=>o.t+'\\t'+o.d).join('\\n');let cp=false;try{await navigator.clipboard.writeText(out);cp=true}catch(e){}b.textContent='StudyDeck: got '+c.length+' cards! Opening\\u2026';setTimeout(()=>b.remove(),2500);const url='https://studydeck.pages.dev/#/import-quizlet?n='+c.length+(cp?'&c=1':'');try{window.open(url,'_blank')}catch(e){}if(!cp){const w=window.open('','_blank');if(w){w.document.body.style.cssText='font:14px monospace;white-space:pre;padding:20px;background:#111;color:#eee';w.document.body.textContent=out;w.document.title='StudyDeck \\u2014 copy this'}}})();";

  // The same script but URL-encoded as a javascript: bookmarklet
  const QUIZLET_BOOKMARKLET = "javascript:" + encodeURIComponent(QUIZLET_SCRAPER);

  function openQuizletImportModal() {
    const body = global.app.el('div', { class: 'quizlet-import-v2' });

    // ============== Intro line ==============
    const intro = global.app.el('div', { class: 'qz-intro' });
    intro.textContent = 'Quizlet removed export — so we use a one-click bookmark instead. Two-minute setup, then a single click forever after.';
    body.appendChild(intro);

    // ============== Step 1: drag to bookmarks bar ==============
    body.appendChild(makeStep({
      num: 1,
      title: 'Drag this button to your bookmarks bar',
      sub: 'It becomes a "Send to StudyDeck" bookmark — set up once.',
      visual: makeStep1Visual(),
      help: 'Don’t see your bookmarks bar? Press <kbd>⌘⇧B</kbd> (Mac) or <kbd>Ctrl+Shift+B</kbd> (Windows).'
    }));

    // ============== Step 2: visit Quizlet, click bookmark ==============
    body.appendChild(makeStep({
      num: 2,
      title: 'On any Quizlet set page, click that bookmark',
      sub: 'A coloured banner appears top-right while it scans, then everything copies and StudyDeck reopens.',
      visual: makeStep2Visual()
    }));

    // ============== Step 3: confirm import ==============
    body.appendChild(makeStep({
      num: 3,
      title: 'Hit "Import N cards" — they’re saved',
      sub: 'You’ll land in the editor with the new set ready to play.',
      visual: makeStep3Visual()
    }));

    // ============== Tips ==============
    const tips = global.app.el('details', { class: 'qz-tips' });
    const tipsSummary = global.app.el('summary', { class: 'qz-tips-summary', text: 'Got fewer cards than your set has? Tap here ▾' });
    tips.appendChild(tipsSummary);
    const tipsBody = global.app.el('div', { class: 'qz-tips-body' });
    [
      'Make sure you’re on the **full set page** (the URL ends in `/flash-cards`), not a study mode like Learn or Match.',
      'For very long sets (50+ cards), let the page sit for a couple seconds before clicking the bookmark — the script auto-scrolls but waits 350 ms per chunk.',
      'Some Quizlet sets hide the term list behind a "View all" button. Click that first.',
      'If the colored banner says "no cards found", refresh the Quizlet page and try again.'
    ].forEach(function (tip) {
      const li = global.app.el('div', { class: 'qz-tip' });
      // Render with simple **bold** support (build via DOM, no innerHTML)
      const parts = tip.split(/\*\*(.*?)\*\*/g);
      parts.forEach(function (p, i) {
        if (i % 2 === 1) {
          li.appendChild(global.app.el('strong', { text: p }));
        } else {
          // backtick → <code>
          const segs = p.split(/`(.*?)`/g);
          segs.forEach(function (s, j) {
            if (j % 2 === 1) li.appendChild(global.app.el('code', { text: s }));
            else if (s) li.appendChild(document.createTextNode(s));
          });
        }
      });
      tipsBody.appendChild(li);
    });
    tips.appendChild(tipsBody);
    body.appendChild(tips);

    // ============== Fallback: paste cards directly ==============
    const fallbackToggle = global.app.el('button', {
      class: 'quizlet-fallback-toggle',
      text: 'Got cards in a different format? Paste them manually ▾'
    });
    body.appendChild(fallbackToggle);

    const fallback = global.app.el('div', { class: 'quizlet-fallback hidden' });
    fallbackToggle.addEventListener('click', function () {
      fallback.classList.toggle('hidden');
      fallbackToggle.textContent = fallback.classList.contains('hidden')
        ? 'Got cards in a different format? Paste them manually ▾'
        : 'Hide manual paste ▴';
    });
    body.appendChild(fallback);

    const help = global.app.el('div', { class: 'quizlet-help' });
    const helpTitle = global.app.el('div', {
      class: 'quizlet-help-title',
      text: 'Paste cards in any format'
    });
    help.appendChild(helpTitle);
    const helpHint = global.app.el('div', { class: 'quizlet-help-hint' });
    helpHint.textContent = 'Auto-detects tab, em-dash, hyphen, semicolon, and more. Each line = one card.';
    help.appendChild(helpHint);
    fallback.appendChild(help);

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
        note.textContent = 'Paste the URL into your browser instead — open the set there, then run the console script above and come back to paste the cards.';
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

  // ===================== Modal step helpers =====================

  function makeStep(opts) {
    const wrap = global.app.el('div', { class: 'qz-step' });

    const head = global.app.el('div', { class: 'qz-step-head' });
    head.appendChild(global.app.el('div', { class: 'qz-step-num', text: String(opts.num) }));
    const headText = global.app.el('div', { class: 'qz-step-headtext' });
    headText.appendChild(global.app.el('div', { class: 'qz-step-title', text: opts.title }));
    if (opts.sub) headText.appendChild(global.app.el('div', { class: 'qz-step-sub', text: opts.sub }));
    head.appendChild(headText);
    wrap.appendChild(head);

    if (opts.visual) wrap.appendChild(opts.visual);

    if (opts.help) {
      const help = global.app.el('div', { class: 'qz-step-help' });
      // Render with <kbd> support (textContent for safety, then post-process)
      const parts = opts.help.split(/<kbd>(.*?)<\/kbd>/g);
      parts.forEach(function (p, i) {
        if (i % 2 === 1) help.appendChild(global.app.el('kbd', { text: p }));
        else if (p) help.appendChild(document.createTextNode(p));
      });
      wrap.appendChild(help);
    }
    return wrap;
  }

  // Visual mock: Chrome browser bar with bookmarks bar + a draggable
  // "Send to StudyDeck" pill being dragged onto the bar.
  function makeStep1Visual() {
    const v = global.app.el('div', { class: 'qz-visual qz-v1' });

    // Mock bookmarks bar
    const bar = global.app.el('div', { class: 'qz-bookmark-bar' });
    bar.appendChild(global.app.el('span', { class: 'qz-bm-item', text: '★ Gmail' }));
    bar.appendChild(global.app.el('span', { class: 'qz-bm-item', text: '★ YouTube' }));
    bar.appendChild(global.app.el('span', { class: 'qz-bm-item', text: '★ Drive' }));
    const dropzone = global.app.el('span', { class: 'qz-bm-dropzone', text: 'drop here →' });
    bar.appendChild(dropzone);
    v.appendChild(bar);

    // The actual draggable bookmarklet button
    const dragRow = global.app.el('div', { class: 'qz-drag-row' });
    const dragBtn = global.app.el('a', {
      class: 'btn btn-bookmarklet qz-bookmarklet',
      href: QUIZLET_BOOKMARKLET,
      draggable: 'true',
      title: 'Drag me to your bookmarks bar',
      text: 'Send to StudyDeck'
    });
    dragBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      global.app.toast('Drag this to your bookmarks bar — clicking it here does nothing useful', 'info');
    });
    dragRow.appendChild(dragBtn);

    const arrow = global.app.el('div', { class: 'qz-drag-arrow', text: '↑ drag me up' });
    dragRow.appendChild(arrow);

    v.appendChild(dragRow);
    return v;
  }

  // Visual mock: Quizlet URL bar + a corner badge showing the bookmark click.
  function makeStep2Visual() {
    const v = global.app.el('div', { class: 'qz-visual qz-v2' });

    const browser = global.app.el('div', { class: 'qz-browser-frame' });

    const tabBar = global.app.el('div', { class: 'qz-tab-bar' });
    tabBar.appendChild(global.app.el('span', { class: 'qz-traffic qz-r' }));
    tabBar.appendChild(global.app.el('span', { class: 'qz-traffic qz-y' }));
    tabBar.appendChild(global.app.el('span', { class: 'qz-traffic qz-g' }));
    const urlBar = global.app.el('span', { class: 'qz-url-bar' });
    urlBar.appendChild(global.app.el('span', { class: 'qz-url-lock', text: '🔒' }));
    urlBar.appendChild(global.app.el('span', { class: 'qz-url-text', text: 'quizlet.com/.../flash-cards' }));
    tabBar.appendChild(urlBar);
    browser.appendChild(tabBar);

    const subBar = global.app.el('div', { class: 'qz-bookmark-bar qz-mini' });
    subBar.appendChild(global.app.el('span', { class: 'qz-bm-item' }, 'Gmail'));
    subBar.appendChild(global.app.el('span', { class: 'qz-bm-item' }, 'Drive'));
    const target = global.app.el('span', { class: 'qz-bm-item qz-bm-target', text: 'Send to StudyDeck' });
    subBar.appendChild(target);
    const cursor = global.app.el('span', { class: 'qz-cursor', text: '▲' });
    subBar.appendChild(cursor);
    browser.appendChild(subBar);

    const page = global.app.el('div', { class: 'qz-quizlet-page' });
    page.appendChild(global.app.el('div', { class: 'qz-quizlet-title', text: 'AP Bio · Cell Components' }));
    const card1 = global.app.el('div', { class: 'qz-quizlet-card' });
    card1.appendChild(global.app.el('span', { class: 'qz-q-term', text: 'Mitochondria' }));
    card1.appendChild(global.app.el('span', { class: 'qz-q-def', text: 'Powerhouse of the cell' }));
    page.appendChild(card1);
    const card2 = global.app.el('div', { class: 'qz-quizlet-card' });
    card2.appendChild(global.app.el('span', { class: 'qz-q-term', text: 'Ribosomes' }));
    card2.appendChild(global.app.el('span', { class: 'qz-q-def', text: 'Site of protein synthesis' }));
    page.appendChild(card2);
    browser.appendChild(page);

    // Top-right banner
    const banner = global.app.el('div', { class: 'qz-banner', text: 'StudyDeck: got 28 cards! Opening…' });
    browser.appendChild(banner);

    v.appendChild(browser);
    return v;
  }

  // Visual mock: StudyDeck landing page with the import button.
  function makeStep3Visual() {
    const v = global.app.el('div', { class: 'qz-visual qz-v3' });
    const card = global.app.el('div', { class: 'qz-sd-card' });
    card.appendChild(global.app.el('div', { class: 'qz-sd-eyebrow', text: 'Quizlet → StudyDeck' }));
    card.appendChild(global.app.el('div', { class: 'qz-sd-title', text: 'We grabbed 28 cards from Quizlet.' }));
    const btn = global.app.el('div', { class: 'qz-sd-btn', text: 'Import 28 cards' });
    card.appendChild(btn);
    const cursor = global.app.el('span', { class: 'qz-cursor qz-cursor-bottom', text: '▲' });
    card.appendChild(cursor);
    v.appendChild(card);
    return v;
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

  // ===================== Quizlet landing route =====================
  // Reached via #/import-quizlet?n=N&c=1 after the bookmarklet copies cards.
  // Single big "Paste cards" button → reads clipboard → creates a set.

  function renderQuizletLanding(host) {
    const params = parseHashQuery();
    const n = parseInt(params.n || '0', 10);
    const clipboardCopied = params.c === '1';

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
    sub.textContent = clipboardCopied
      ? 'They’re in your clipboard. One click and they’re yours.'
      : 'They should be in your clipboard. Click below to import.';
    card.appendChild(sub);

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
