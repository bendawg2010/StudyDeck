/* ============================================================================
   StudyDeck — Spell mode
   Definition shown, you type the term. Letter-by-letter green/red feedback,
   reveal-on-give-up, and a hint button that shows one letter at a time.
   ============================================================================ */
(function (global) {
  'use strict';

  // Score weights
  const POINTS_FIRST_TRY = 100;
  const POINTS_HINT      = 60;
  const POINTS_REVEALED  = 0;
  const POINTS_RETRY     = 25;

  async function render(host, setId) {
    const set = await db.getSet(setId);
    const allCards = (await db.listCards(setId)).filter(function (c) {
      return c.term && c.term.trim() && c.definition && c.definition.trim();
    });
    if (!set || !allCards.length) {
      global.app.toast('Add some cards first', 'error');
      global.app.navigate('#/set/' + encodeURIComponent(setId));
      return;
    }

    // ----- State -----
    let queue = global.app.shuffle(allCards.slice());
    const total = queue.length;
    let cursor = 0;
    let attempts = 0;     // attempts on the current card
    let hintsUsed = 0;    // hints on the current card
    let revealed = false; // user gave up
    let score = 0;
    let perfect = 0;
    let withHint = 0;
    let revealedCount = 0;
    let startTime = performance.now();
    const wrongCards = [];

    // ----- Layout -----
    const page = global.app.el('div', { class: 'page sp-page' });
    host.appendChild(page);

    const bar = global.app.el('div', { class: 'sp-bar' });
    page.appendChild(bar);
    bar.appendChild(global.app.el('a', {
      class: 'btn btn-ghost',
      href: '#/set/' + encodeURIComponent(setId),
      text: '✕ Exit',
    }));
    const center = global.app.el('div', { class: 'sp-center' });
    const title = global.app.el('div', { class: 'sp-title', text: set.title || 'Spell' });
    const counter = global.app.el('div', { class: 'sp-counter' });
    const titleRow = global.app.el('div', { class: 'sp-title-row' });
    titleRow.appendChild(title);
    titleRow.appendChild(counter);
    center.appendChild(titleRow);
    const progress = global.app.el('div', { class: 'sp-progress' });
    const progressFill = global.app.el('div', { class: 'sp-progress-fill' });
    progress.appendChild(progressFill);
    center.appendChild(progress);
    bar.appendChild(center);
    const scoreEl = global.app.el('div', { class: 'sp-score', text: '0' });
    bar.appendChild(scoreEl);

    const stage = global.app.el('div', { class: 'sp-stage' });
    page.appendChild(stage);

    const def = global.app.el('div', { class: 'sp-def' });
    stage.appendChild(def);

    const inputWrap = global.app.el('div', { class: 'sp-input-wrap' });
    const input = global.app.el('input', {
      class: 'sp-input',
      type: 'text',
      placeholder: 'Type the term…',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
    });
    inputWrap.appendChild(input);
    stage.appendChild(inputWrap);

    // Letter-strip preview shows live correct/incorrect feedback
    const letters = global.app.el('div', { class: 'sp-letters' });
    stage.appendChild(letters);

    const feedback = global.app.el('div', { class: 'sp-feedback' });
    stage.appendChild(feedback);

    const actions = global.app.el('div', { class: 'sp-actions' });
    const hintBtn = global.app.el('button', { class: 'btn', text: '💡 Hint (H)' });
    const revealBtn = global.app.el('button', { class: 'btn', text: '🤷 Give up (G)' });
    const submitBtn = global.app.el('button', { class: 'btn btn-primary', text: 'Check' });
    const skipBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Skip ›' });
    hintBtn.addEventListener('click', useHint);
    revealBtn.addEventListener('click', reveal);
    submitBtn.addEventListener('click', check);
    skipBtn.addEventListener('click', advance);
    actions.appendChild(hintBtn);
    actions.appendChild(revealBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(submitBtn);
    page.appendChild(actions);

    const hint = global.app.el('div', { class: 'sp-hint' });
    [
      ['Enter', 'check'],
      ['→', 'next (when correct)'],
      ['H', 'hint'],
      ['G', 'give up'],
    ].forEach(function (p, i, arr) {
      hint.appendChild(global.app.el('kbd', { text: p[0] }));
      hint.appendChild(document.createTextNode(' ' + p[1]));
      if (i < arr.length - 1) hint.appendChild(document.createTextNode('  ·  '));
    });
    page.appendChild(hint);

    // ----- Bootstrap -----
    paint();
    setTimeout(function () { input.focus(); }, 30);

    input.addEventListener('input', function () {
      paintLetters();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (revealed) advance(); else check();
      } else if (e.key === 'ArrowRight' && revealed) {
        e.preventDefault();
        advance();
      }
    });

    function onKey(e) {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        // Letter shortcuts above (H, G) only fire when the input is NOT focused
        return;
      }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); useHint(); }
      else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); reveal(); }
    }
    document.addEventListener('keydown', onKey);

    return function teardown() {
      document.removeEventListener('keydown', onKey);
    };

    // ----- Helpers -----

    function currentCard() { return queue[cursor]; }

    function paint() {
      const c = currentCard();
      counter.textContent = (cursor + 1) + ' / ' + total;
      progressFill.style.width = ((cursor / total) * 100) + '%';
      scoreEl.textContent = String(score);

      if (!c) { showDone(); return; }

      def.textContent = c.definition;
      input.value = '';
      input.disabled = false;
      submitBtn.disabled = false;
      hintBtn.disabled = false;
      revealBtn.disabled = false;
      attempts = 0;
      hintsUsed = 0;
      revealed = false;
      feedback.textContent = '';
      feedback.className = 'sp-feedback';
      paintLetters();
      input.focus();
    }

    function paintLetters() {
      while (letters.firstChild) letters.removeChild(letters.firstChild);
      const c = currentCard();
      if (!c) return;
      const target = c.term;
      const typed = input.value;
      for (let i = 0; i < target.length; i++) {
        const span = global.app.el('span', { class: 'sp-letter' });
        const targetCh = target[i];
        const typedCh = typed[i];
        if (revealed) {
          span.textContent = targetCh;
          span.classList.add('sp-letter-reveal');
        } else if (typedCh == null) {
          span.textContent = targetCh === ' ' ? '·' : '_';
          span.classList.add('sp-letter-blank');
          if (targetCh === ' ') span.classList.add('sp-letter-space');
        } else if (sameLetter(typedCh, targetCh)) {
          span.textContent = targetCh;
          span.classList.add('sp-letter-correct');
        } else {
          span.textContent = typedCh;
          span.classList.add('sp-letter-wrong');
        }
        letters.appendChild(span);
      }
    }

    function sameLetter(a, b) {
      return (a || '').toLowerCase() === (b || '').toLowerCase();
    }

    function check() {
      const c = currentCard();
      if (!c) return;
      attempts++;
      const userVal = input.value.trim();
      const normUser = userVal.toLowerCase();
      const normTarget = c.term.trim().toLowerCase();
      if (normUser === normTarget) {
        // Score
        let pts;
        if (attempts === 1 && hintsUsed === 0) {
          pts = POINTS_FIRST_TRY;
          perfect++;
          feedback.textContent = '✓ Perfect — first try';
        } else if (hintsUsed === 0) {
          pts = POINTS_RETRY;
          feedback.textContent = '✓ Correct';
        } else {
          pts = POINTS_HINT;
          withHint++;
          feedback.textContent = '✓ Correct (with hint)';
        }
        score += pts;
        feedback.className = 'sp-feedback sp-feedback-good';
        scoreEl.textContent = String(score);
        try { global.app.sound.success(); } catch (e) {}
        // Lock input
        input.disabled = true;
        submitBtn.disabled = true;
        hintBtn.disabled = true;
        revealBtn.disabled = true;
        // Auto-advance after a short pause
        setTimeout(advance, 700);
      } else {
        // Wrong
        feedback.textContent = userVal === ''
          ? '⚠ Type something first'
          : '✗ Not quite — try again';
        feedback.className = 'sp-feedback sp-feedback-bad';
        try { global.app.sound.error(); } catch (e) {}
        // Shake input
        input.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
          { duration: 220, easing: 'ease-in-out' }
        );
        if (!wrongCards.includes(c.id)) wrongCards.push(c.id);
        input.focus();
        input.select();
      }
    }

    function useHint() {
      const c = currentCard();
      if (!c || revealed || input.disabled) return;
      hintsUsed++;
      // Reveal the next correct letter at the current typed position
      const target = c.term;
      const typed = input.value;
      let nextIdx = 0;
      while (nextIdx < target.length && nextIdx < typed.length &&
             sameLetter(typed[nextIdx], target[nextIdx])) {
        nextIdx++;
      }
      if (nextIdx >= target.length) {
        feedback.textContent = 'Already correct so far';
        feedback.className = 'sp-feedback';
        return;
      }
      // Replace from nextIdx
      const newVal = target.slice(0, nextIdx + 1);
      input.value = newVal;
      paintLetters();
      input.focus();
      input.setSelectionRange(newVal.length, newVal.length);
      feedback.textContent = '💡 Hint: revealed up to letter ' + (nextIdx + 1);
      feedback.className = 'sp-feedback sp-feedback-hint';
    }

    function reveal() {
      const c = currentCard();
      if (!c) return;
      revealed = true;
      revealedCount++;
      input.value = c.term;
      input.disabled = true;
      submitBtn.disabled = true;
      hintBtn.disabled = true;
      revealBtn.disabled = true;
      feedback.textContent = 'Answer: ' + c.term + ' — press → for next';
      feedback.className = 'sp-feedback sp-feedback-reveal';
      paintLetters();
      try { global.app.sound.tick(); } catch (e) {}
      if (!wrongCards.includes(c.id)) wrongCards.push(c.id);
    }

    function advance() {
      cursor++;
      paint();
    }

    function showDone() {
      // Replace page contents with results panel
      while (page.firstChild) page.removeChild(page.firstChild);
      const elapsed = Math.round((performance.now() - startTime) / 1000);
      const max = total * POINTS_FIRST_TRY;
      const pct = max ? Math.round((score / max) * 100) : 0;
      const wrap = global.app.el('div', { class: 'fc2-done' });
      wrap.appendChild(global.app.el('div', { class: 'fc2-done-emoji', text: pct === 100 ? '🎉' : pct >= 70 ? '✨' : '📚' }));
      wrap.appendChild(global.app.el('h1', null,
        global.app.el('span', null, 'Score '),
        global.app.el('span', { class: 'fc2-grad', text: score + ' / ' + max }),
      ));
      wrap.appendChild(global.app.el('p', { class: 'fc2-done-sub',
        text: pct + '% · ' + perfect + ' perfect · ' + withHint + ' with hint · ' + revealedCount + ' revealed · ' + formatTime(elapsed),
      }));
      const stats = global.app.el('div', { class: 'fc2-done-stats' });
      stats.appendChild(stat('Perfect', perfect, '#34C759'));
      stats.appendChild(stat('Hinted', withHint, '#FFD60A'));
      stats.appendChild(stat('Revealed', revealedCount, '#FF6B6B'));
      stats.appendChild(stat('Time', formatTime(elapsed), '#C147FF'));
      wrap.appendChild(stats);
      const acts = global.app.el('div', { class: 'fc2-done-actions' });
      const restart = global.app.el('button', { class: 'btn btn-primary', text: '↻ Play again' });
      restart.addEventListener('click', function () {
        global.app.navigate('#/play/spell/' + encodeURIComponent(setId));
        // Force a re-render: the route doesn't change, but hashchange fires
        // when location.hash assignment differs. Use a refresh trick:
        const target = '#/play/spell/' + encodeURIComponent(setId);
        if (location.hash === target) {
          location.hash = '#/';
          setTimeout(function () { location.hash = target; }, 10);
        }
      });
      acts.appendChild(restart);
      const back = global.app.el('a', { class: 'btn', href: '#/set/' + encodeURIComponent(setId), text: 'Back to set' });
      acts.appendChild(back);
      wrap.appendChild(acts);
      page.appendChild(wrap);
      try { global.app.sound.win(); } catch (e) {}
      if (pct === 100) global.app.confetti(120);
    }

    function stat(label, value, color) {
      const e = global.app.el('div', { class: 'fc2-stat' });
      e.appendChild(global.app.el('div', { class: 'fc2-stat-num', style: { color: color }, text: String(value) }));
      e.appendChild(global.app.el('div', { class: 'fc2-stat-label', text: label }));
      return e;
    }

    function formatTime(s) {
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
    }
  }

  global.SpellPage = { render: render };
})(window);
