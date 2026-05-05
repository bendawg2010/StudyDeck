/* ============================================================================
   StudyDeck — Flashcards mode (premium)

   Stack of 3 visible cards, slide-in navigation, fly-off judgments
   (right=knew it, left=study again, with coloured trail), star/hard
   filter, term-first toggle, session stats. All keyboard-driven.
   ============================================================================ */
(function (global) {
  'use strict';

  // Per-set "hard" cards live in localStorage so they survive across runs.
  function hardKey(setId) { return 'sd_fc_hard_' + setId; }
  function loadHard(setId) {
    try { return new Set(JSON.parse(localStorage.getItem(hardKey(setId)) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveHard(setId, set) {
    try { localStorage.setItem(hardKey(setId), JSON.stringify(Array.from(set))); }
    catch (e) {}
  }

  async function render(host, setId) {
    const set = await db.getSet(setId);
    const allCards = await db.listCards(setId);
    if (!set || !allCards.length) {
      global.app.toast('Add some cards first', 'error');
      global.app.navigate('#/set/' + encodeURIComponent(setId));
      return;
    }

    const reduceMotion = global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- State ---------------------------------------------------------

    let hardSet = loadHard(setId);
    let shuffled = false;
    let termFirst = true;       // start side: term (false → definition)
    // Initial hard-only is driven by ?hard=1 in the hash (set by Done page)
    let hardOnly  = /[?&]hard=1\b/.test(location.hash);

    // The deck is rebuilt from allCards whenever a setting changes.
    let deck = [];               // ordered card list for this run
    let cursor = 0;              // index into deck (current card)
    let knew = 0;
    let again = 0;
    // Cards the user said "study again" on, in encounter order. Used by the
    // 'Review missed' shortcut on the done screen and to drive a follow-up
    // run with only the misses.
    let missedIds = [];
    let isFlipped = false;
    let startTime = performance.now();
    let busy = false;            // true while a fly-off animation is in flight
    let onKey;

    // ----- DOM scaffolding -----------------------------------------------

    const page = global.app.el('div', { class: 'page fc2-page' });
    host.appendChild(page);

    const bar = global.app.el('div', { class: 'fc2-bar' });
    page.appendChild(bar);

    const exitBtn = global.app.el('a', {
      class: 'btn btn-ghost',
      href: '#/set/' + encodeURIComponent(setId),
      text: '✕ Exit',
    });
    bar.appendChild(exitBtn);

    // Center: title + counter + progress bar
    const center = global.app.el('div', { class: 'fc2-center' });
    const titleRow = global.app.el('div', { class: 'fc2-title-row' });
    const titleEl = global.app.el('div', { class: 'fc2-title', text: set.title || 'Flashcards' });
    titleRow.appendChild(titleEl);
    const counter = global.app.el('div', { class: 'fc2-counter' });
    titleRow.appendChild(counter);
    center.appendChild(titleRow);

    const progress = global.app.el('div', { class: 'fc2-progress' });
    const progressFill = global.app.el('div', { class: 'fc2-progress-fill' });
    progress.appendChild(progressFill);
    center.appendChild(progress);
    bar.appendChild(center);

    // Right: stats chips
    const statsBar = global.app.el('div', { class: 'fc2-stats' });
    const chipKnew  = chip('—', 'fc2-chip fc2-chip-good', 'Knew it');
    const chipAgain = chip('—', 'fc2-chip fc2-chip-bad',  'Study again');
    const chipHard  = chip('—', 'fc2-chip fc2-chip-hard', 'Hard');
    statsBar.appendChild(chipKnew);
    statsBar.appendChild(chipAgain);
    statsBar.appendChild(chipHard);
    bar.appendChild(statsBar);

    // Toolbar / settings row
    const toolbar = global.app.el('div', { class: 'fc2-toolbar' });
    const tShuffle = toggle('Shuffle', shuffled, function () {
      shuffled = !shuffled;
      tShuffle.classList.toggle('is-on', shuffled);
      reset();
    });
    const tFirst = toggle(termFirst ? 'Show: Term first' : 'Show: Definition first',
      true, function () {
        termFirst = !termFirst;
        tFirst.textContent = termFirst ? 'Show: Term first' : 'Show: Definition first';
        isFlipped = false;
        repaint();
      });
    const tHardOnly = toggle('★ Hard only',  hardOnly, function () {
      if (hardSet.size === 0 && !hardOnly) {
        global.app.toast('No hard cards yet — star cards first', 'info');
        return;
      }
      hardOnly = !hardOnly;
      tHardOnly.classList.toggle('is-on', hardOnly);
      reset();
    });
    toolbar.appendChild(tShuffle);
    toolbar.appendChild(tFirst);
    toolbar.appendChild(tHardOnly);
    page.appendChild(toolbar);

    // Stage holds up to 3 cards (current + next two peeking behind)
    const stage = global.app.el('div', { class: 'fc2-stage' });
    page.appendChild(stage);

    // Action row — judge or stay. No skipping.
    const actions = global.app.el('div', { class: 'fc2-actions' });
    const againBtn = bigJudgeBtn('study-again', '←', 'Still learning', function () { judge(false); });
    const flipBtn  = global.app.el('button', { class: 'fc2-flip-btn', text: 'Flip · ↑↓' });
    flipBtn.addEventListener('click', flip);
    const knewBtn  = bigJudgeBtn('knew-it', '→', 'I know it', function () { judge(true); });
    actions.appendChild(againBtn);
    actions.appendChild(flipBtn);
    actions.appendChild(knewBtn);
    page.appendChild(actions);

    // Keyhint
    const keyhint = global.app.el('div', { class: 'fc2-keyhint' });
    const hintParts = [
      ['↑↓', 'flip'],
      ['→', 'I know it'], ['←', 'still learning'],
      ['.', 'star'], ['U', 'shuffle'],
    ];
    hintParts.forEach(function (p, i) {
      keyhint.appendChild(global.app.el('kbd', { text: p[0] }));
      keyhint.appendChild(document.createTextNode(' ' + p[1]));
      if (i < hintParts.length - 1) keyhint.appendChild(document.createTextNode('  ·  '));
    });
    page.appendChild(keyhint);

    // ----- Bootstrap -----------------------------------------------------

    reset();

    onKey = function (e) {
      // Don't intercept while typing in inputs
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (busy) return;
      switch (e.key) {
        case ' ':
        case 'f':
        case 'F':
        case 'ArrowUp':
        case 'ArrowDown':
          // Up + Down + Space + F all flip the card (reveal/hide)
          e.preventDefault(); flip(); break;
        case 'ArrowRight':
          // Right = "I know it"
          e.preventDefault(); judge(true); break;
        case 'ArrowLeft':
          // Left = "Still learning" / study again
          e.preventDefault(); judge(false); break;
        case 'a': case 'A':
          e.preventDefault(); judge(true); break;
        case 's': case 'S':
          e.preventDefault(); judge(false); break;
        case 'u': case 'U':
          e.preventDefault(); tShuffle.click(); break;
        case '.':
          e.preventDefault(); toggleHard(); break;
        case 'r': case 'R':
          e.preventDefault(); reset(); global.app.toast('Restarted'); break;
      }
    };
    document.addEventListener('keydown', onKey);

    return function teardown() {
      document.removeEventListener('keydown', onKey);
    };

    // ====================================================================
    // Helpers
    // ====================================================================

    function chip(text, cls, label) {
      const e = global.app.el('div', { class: cls, 'aria-label': label });
      e.appendChild(global.app.el('span', { class: 'fc2-chip-num', text: text }));
      e.appendChild(global.app.el('span', { class: 'fc2-chip-lbl', text: label }));
      return e;
    }

    function toggle(text, on, onClick) {
      const t = global.app.el('button', { class: 'toggle' + (on ? ' is-on' : ''), text: text });
      t.addEventListener('click', onClick);
      return t;
    }

    function navBtn(svgPath, label, onClick) {
      const b = global.app.el('button', { class: 'fc2-nav', 'aria-label': label, title: label });
      b.appendChild(global.app.svgIcon(svgPath, { size: 22, weight: 2 }));
      b.addEventListener('click', onClick);
      return b;
    }

    function bigJudgeBtn(kind, icon, label, onClick) {
      const b = global.app.el('button', {
        class: 'fc2-judge fc2-judge-' + kind,
        'aria-label': label, title: label,
      });
      b.appendChild(global.app.el('span', { class: 'fc2-judge-icon', text: icon }));
      b.appendChild(global.app.el('span', { class: 'fc2-judge-text', text: label }));
      b.addEventListener('click', onClick);
      return b;
    }

    function buildDeck() {
      let pool = allCards.slice();
      if (hardOnly) {
        pool = pool.filter(function (c) { return hardSet.has(c.id); });
      }
      if (shuffled) {
        pool = global.app.shuffle(pool);
      }
      return pool;
    }

    function reset() {
      deck = buildDeck();
      if (!deck.length) {
        // Could happen with hardOnly + no hards; turn it off
        if (hardOnly) {
          hardOnly = false;
          tHardOnly.classList.remove('is-on');
          deck = buildDeck();
        }
      }
      cursor = 0;
      knew = 0; again = 0;
      missedIds = [];
      isFlipped = false;
      startTime = performance.now();
      // Wipe the current stage and rebuild
      while (stage.firstChild) stage.removeChild(stage.firstChild);
      buildStage();
      repaint();
    }

    /// Builds 3 layered card elements (current, +1, +2).
    /// We rebuild from scratch for simplicity — only fires on reset/goto, not on every flip.
    function buildStage() {
      while (stage.firstChild) stage.removeChild(stage.firstChild);
      // Three slots, deepest first so DOM order = z-index
      [2, 1, 0].forEach(function (depth) {
        const card = makeCardEl();
        card.classList.add('fc2-card', 'depth-' + depth);
        card.dataset.depth = String(depth);
        stage.appendChild(card);
      });
      // Make the front-most card flippable on click
      const front = stage.querySelector('.depth-0');
      if (front) front.addEventListener('click', flip);
    }

    function makeCardEl() {
      const card = global.app.el('div');
      card.tabIndex = 0;
      const inner = global.app.el('div', { class: 'fc2-card-inner' });
      const front = global.app.el('div', { class: 'fc2-face fc2-face-front' });
      const back  = global.app.el('div', { class: 'fc2-face fc2-face-back' });
      // Star button (front + back so it's always visible)
      front.appendChild(starBtn(card));
      back.appendChild(starBtn(card));
      // Eyebrow + text + tip
      front.appendChild(global.app.el('div', { class: 'fc2-eyebrow', text: termFirst ? 'TERM' : 'DEFINITION' }));
      front.appendChild(global.app.el('div', { class: 'fc2-text fc2-text-front' }));
      front.appendChild(global.app.el('div', { class: 'fc2-tip', text: 'Click or ↑ ↓ to flip' }));
      back.appendChild(global.app.el('div', { class: 'fc2-eyebrow fc2-eyebrow-back', text: termFirst ? 'DEFINITION' : 'TERM' }));
      back.appendChild(global.app.el('div', { class: 'fc2-text fc2-text-back' }));
      back.appendChild(global.app.el('div', { class: 'fc2-tip', text: '→ I know it     ← still learning' }));
      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);
      return card;
    }

    function starBtn(cardEl) {
      const s = global.app.el('button', {
        class: 'fc2-star',
        'aria-label': 'Star this card as hard',
        title: 'Mark as hard ( . )',
      });
      s.textContent = '☆';
      s.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleHard();
      });
      return s;
    }

    function paintCard(cardEl, card, isFront) {
      const ft = cardEl.querySelector('.fc2-text-front');
      const bt = cardEl.querySelector('.fc2-text-back');
      if (!card) {
        ft.textContent = '';
        bt.textContent = '';
        cardEl.classList.add('is-empty');
        return;
      }
      cardEl.classList.remove('is-empty');
      ft.textContent = termFirst ? (card.term || '') : (card.definition || '');
      bt.textContent = termFirst ? (card.definition || '') : (card.term || '');
      // Star state
      const starred = hardSet.has(card.id);
      cardEl.querySelectorAll('.fc2-star').forEach(function (s) {
        s.classList.toggle('is-on', starred);
        s.textContent = starred ? '★' : '☆';
      });
      // Front-only flips
      if (isFront) {
        cardEl.classList.toggle('is-flipped', isFlipped);
      } else {
        cardEl.classList.remove('is-flipped');
      }
    }

    function repaint() {
      // Update counter / chips / progress
      const total = deck.length;
      counter.textContent = total ? (cursor + 1) + ' / ' + total : '0 / 0';
      const pct = total ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
      progressFill.style.width = pct + '%';
      chipKnew.querySelector('.fc2-chip-num').textContent = String(knew);
      chipAgain.querySelector('.fc2-chip-num').textContent = String(again);
      chipHard.querySelector('.fc2-chip-num').textContent = String(hardSet.size);

      // Repaint up to 3 cards
      const slots = stage.querySelectorAll('.fc2-card');
      slots.forEach(function (slot) {
        const depth = parseInt(slot.dataset.depth, 10);
        const c = deck[cursor + depth] || null;
        paintCard(slot, c, depth === 0);
      });

      if (cursor >= deck.length || deck.length === 0) {
        showDone();
      }
    }

    // ----- Actions -------------------------------------------------------

    function flip() {
      if (busy || cursor >= deck.length) return;
      isFlipped = !isFlipped;
      const front = stage.querySelector('.depth-0');
      if (front) front.classList.toggle('is-flipped', isFlipped);
    }

    function goNext() {
      if (busy) return;
      if (cursor >= deck.length - 1) {
        cursor = deck.length;       // off-end → done
        repaint();
        return;
      }
      slideTo('next');
    }

    function goPrev() {
      if (busy) return;
      if (cursor <= 0) return;
      slideTo('prev');
    }

    function judge(correct) {
      if (busy) return;
      if (cursor >= deck.length) return;
      if (correct) {
        knew++;
      } else {
        again++;
        const c = deck[cursor];
        if (c && !missedIds.includes(c.id)) missedIds.push(c.id);
      }
      flyOff(correct);
    }

    function toggleHard() {
      const c = deck[cursor];
      if (!c) return;
      if (hardSet.has(c.id)) hardSet.delete(c.id);
      else hardSet.add(c.id);
      saveHard(setId, hardSet);
      repaint();
      try { global.app.sound.tick(); } catch (e) {}
    }

    // ----- Animations ----------------------------------------------------

    function slideTo(dir) {
      if (reduceMotion) {
        cursor += (dir === 'next' ? 1 : -1);
        isFlipped = false;
        repaint();
        return;
      }
      busy = true;
      const front = stage.querySelector('.depth-0');
      if (!front) { busy = false; return; }
      const offset = dir === 'next' ? -110 : 110;
      front.animate(
        [
          { transform: 'translateX(0) rotate(0)', opacity: 1 },
          { transform: 'translateX(' + offset + '%) rotate(' + (offset / 14) + 'deg)', opacity: 0 },
        ],
        { duration: 260, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' },
      ).onfinish = function () {
        cursor += (dir === 'next' ? 1 : -1);
        isFlipped = false;
        // Rebuild stage so the next/prev card is the new depth-0
        buildStage();
        repaint();
        busy = false;
      };
    }

    function flyOff(correct) {
      if (reduceMotion) {
        cursor++;
        isFlipped = false;
        repaint();
        return;
      }
      busy = true;
      const front = stage.querySelector('.depth-0');
      if (!front) { busy = false; return; }
      front.classList.add(correct ? 'fly-knew' : 'fly-again');

      // Burst sparks
      burstFromCard(front, correct);
      try { (correct ? global.app.sound.success : global.app.sound.tick)(); } catch (e) {}

      const offsetX = correct ? 130 : -130;
      const rot = correct ? 18 : -18;
      front.animate(
        [
          { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
          { transform: 'translate(' + offsetX + '%, -10%) rotate(' + rot + 'deg)', opacity: 0 },
        ],
        { duration: 380, easing: 'cubic-bezier(0.36, 0, 0.66, -0.2)', fill: 'forwards' },
      ).onfinish = function () {
        cursor++;
        isFlipped = false;
        buildStage();
        repaint();
        busy = false;
      };
    }

    function burstFromCard(card, good) {
      const rect = card.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const cx = rect.left - stageRect.left + rect.width / 2;
      const cy = rect.top  - stageRect.top  + rect.height / 2;
      const N = 14;
      for (let i = 0; i < N; i++) {
        const dot = global.app.el('div', { class: 'fc2-spark' });
        dot.style.background = good ? 'var(--good, #34C759)' : 'var(--bad, #FF6B6B)';
        dot.style.left = cx + 'px';
        dot.style.top  = cy + 'px';
        const angle = (i / N) * Math.PI * 2 + (good ? 0 : Math.PI);
        const dist = 80 + Math.random() * 90;
        const dx = Math.cos(angle) * dist * (good ? 1 : 0.6) + (good ? 80 : -80);
        const dy = Math.sin(angle) * dist - 40;
        stage.appendChild(dot);
        dot.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.2)', opacity: 0 },
          ],
          { duration: 700 + Math.random() * 200, easing: 'cubic-bezier(0.36, 0, 0.66, 1)' }
        ).onfinish = function () { if (dot.parentNode) dot.parentNode.removeChild(dot); };
      }
    }

    // ----- Done state ----------------------------------------------------

    function showDone() {
      // Replace page contents with a results panel
      while (page.firstChild) page.removeChild(page.firstChild);

      const elapsed = Math.round((performance.now() - startTime) / 1000);
      const total = deck.length;
      const pct = total ? Math.round((knew / total) * 100) : 0;

      const wrap = global.app.el('div', { class: 'fc2-done' });
      wrap.appendChild(global.app.el('div', { class: 'fc2-done-emoji', text: pct === 100 ? '🎉' : pct >= 70 ? '✨' : '📚' }));
      wrap.appendChild(global.app.el('h1', null,
        global.app.el('span', null, 'You knew '),
        global.app.el('span', { class: 'fc2-grad', text: knew + ' / ' + total }),
      ));
      wrap.appendChild(global.app.el('p', { class: 'fc2-done-sub',
        text: pct === 100
          ? 'Perfect run. Press Restart to do it again or jump back.'
          : (pct + '% of cards knew it on the first pass · ' + formatElapsed(elapsed))
      }));

      // Stat row
      const stats = global.app.el('div', { class: 'fc2-done-stats' });
      stats.appendChild(stat('Knew', knew, '#34C759'));
      stats.appendChild(stat('Again', again, '#FF6B6B'));
      stats.appendChild(stat('Hard', hardSet.size, '#FFD60A'));
      stats.appendChild(stat('Time', formatElapsed(elapsed), '#C147FF'));
      wrap.appendChild(stats);

      // Action buttons
      const acts = global.app.el('div', { class: 'fc2-done-actions' });

      // Review missed — primary CTA when you got things wrong
      if (missedIds.length > 0) {
        const reviewBtn = global.app.el('button', {
          class: 'btn btn-primary',
          text: '⤺ Review the ' + missedIds.length + ' you missed',
        });
        reviewBtn.addEventListener('click', function () {
          // Restrict the deck to just the missed cards (preserve order)
          const missedCards = missedIds
            .map(function (id) { return allCards.find(function (c) { return c.id === id; }); })
            .filter(Boolean);
          if (!missedCards.length) { reset(); return; }
          // Override allCards-derived deck to use the missed list.
          // This is a small hack: temporarily swap allCards' filter via a
          // shadow buildDeck behaviour for the next reset.
          deck = missedCards.slice();
          cursor = 0;
          knew = 0; again = 0;
          missedIds = [];
          isFlipped = false;
          startTime = performance.now();
          // Rebuild the entire shell — done view replaced the toolbar
          while (host.firstChild) host.removeChild(host.firstChild);
          if (onKey) document.removeEventListener('keydown', onKey);
          // Re-render via the route handler with a session flag so we don't
          // accidentally re-run the seed shuffle.
          location.hash = '#/play/flashcards/' + encodeURIComponent(setId) + '?missed=' + Date.now();
        });
        acts.appendChild(reviewBtn);
      }

      const restart = global.app.el('button', {
        class: missedIds.length > 0 ? 'btn' : 'btn btn-primary',
        text: '↻ Restart all',
      });
      restart.addEventListener('click', reset);
      acts.appendChild(restart);

      if (hardSet.size > 0 && !hardOnly) {
        const onlyHard = global.app.el('button', { class: 'btn', text: '★ Drill hard cards (' + hardSet.size + ')' });
        onlyHard.addEventListener('click', function () {
          while (host.firstChild) host.removeChild(host.firstChild);
          if (onKey) document.removeEventListener('keydown', onKey);
          location.hash = '#/play/flashcards/' + encodeURIComponent(setId) + '?hard=1';
        });
        acts.appendChild(onlyHard);
      }
      const exitBtn2 = global.app.el('a', {
        class: 'btn',
        href: '#/set/' + encodeURIComponent(setId),
        text: 'Back to set',
      });
      acts.appendChild(exitBtn2);
      wrap.appendChild(acts);

      page.appendChild(wrap);
      try { global.app.sound.win(); } catch (e) {}
      if (pct === 100 && total > 1) global.app.confetti(120);
    }

    function stat(label, value, color) {
      const e = global.app.el('div', { class: 'fc2-stat' });
      e.appendChild(global.app.el('div', { class: 'fc2-stat-num', style: { color: color }, text: String(value) }));
      e.appendChild(global.app.el('div', { class: 'fc2-stat-label', text: label }));
      return e;
    }

    function formatElapsed(s) {
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
    }
  }

  global.FlashcardsPage = { render: render };
})(window);
