/* ============================================================================
   StudyDeck — Flashcards mode
   ============================================================================ */
(function (global) {
  'use strict';

  async function render(host, setId) {
    const set = await db.getSet(setId);
    const allCards = await db.listCards(setId);
    if (!set || !allCards.length) {
      global.app.toast('Add some cards first', 'error');
      global.app.navigate('#/set/' + encodeURIComponent(setId));
      return;
    }

    const page = global.app.el('div', { class: 'page fc-page' });
    host.appendChild(page);

    let queue = allCards.slice();
    let shuffled = false;
    let knew = 0;
    let again = 0;
    let isFlipped = false;
    let total = allCards.length;

    // header bar
    const bar = global.app.el('div', { class: 'fc-bar' });
    page.appendChild(bar);

    const backLink = global.app.el('a', { class: 'btn btn-ghost', href: '#/set/' + encodeURIComponent(setId), text: '✕ Exit' });
    bar.appendChild(backLink);

    const dots = global.app.el('div', { class: 'fc-progress-dots' });
    bar.appendChild(dots);

    const counts = global.app.el('div', { class: 'fc-counts' });
    const cAgain = global.app.el('span', { class: 'fc-count-again', text: 'Again 0' });
    const cKnew = global.app.el('span', { class: 'fc-count-good', text: 'Knew 0' });
    counts.appendChild(cAgain);
    counts.appendChild(cKnew);
    bar.appendChild(counts);

    // controls strip
    const controlsStrip = global.app.el('div', { class: 'toggle-row', style: { marginBottom: '8px' } });
    const shuffleToggle = global.app.el('button', { class: 'toggle', text: 'Shuffle' });
    shuffleToggle.addEventListener('click', function () {
      shuffled = !shuffled;
      shuffleToggle.classList.toggle('is-on', shuffled);
      reset();
    });
    controlsStrip.appendChild(shuffleToggle);
    page.appendChild(controlsStrip);

    // card stage
    const stage = global.app.el('div', { class: 'fc-stage' });
    const fcCard = global.app.el('div', { class: 'fc-card', tabindex: '0', 'aria-label': 'Flashcard, click to flip' });

    const front = global.app.el('div', { class: 'fc-face fc-face-front' });
    front.appendChild(global.app.el('div', { class: 'fc-face-label', text: 'Term' }));
    const frontText = global.app.el('div', { class: 'fc-face-text' });
    front.appendChild(frontText);
    front.appendChild(global.app.el('div', { class: 'fc-flip-hint', text: 'Tap or press Space' }));

    const back = global.app.el('div', { class: 'fc-face fc-face-back' });
    back.appendChild(global.app.el('div', { class: 'fc-face-label', text: 'Definition' }));
    const backText = global.app.el('div', { class: 'fc-face-text' });
    back.appendChild(backText);
    back.appendChild(global.app.el('div', { class: 'fc-flip-hint', text: 'Tap to flip back' }));

    fcCard.appendChild(front);
    fcCard.appendChild(back);
    stage.appendChild(fcCard);
    page.appendChild(stage);

    fcCard.addEventListener('click', flip);

    // controls
    const controls = global.app.el('div', { class: 'fc-controls' });
    const prevBtn = global.app.el('button', { class: 'fc-nav-btn', 'aria-label': 'Previous card' });
    prevBtn.appendChild(global.app.svgIcon('M15 18l-6-6 6-6', { size: 22, weight: 2 }));
    prevBtn.addEventListener('click', prev);
    controls.appendChild(prevBtn);

    const judge = global.app.el('div', { class: 'fc-judge' });
    const againBtn = global.app.el('button', { class: 'again', text: 'Study again (S)' });
    againBtn.addEventListener('click', function () { judgeCard(false); });
    const knewBtn = global.app.el('button', { class: 'knew', text: 'I knew it (A)' });
    knewBtn.addEventListener('click', function () { judgeCard(true); });
    judge.appendChild(againBtn);
    judge.appendChild(knewBtn);
    controls.appendChild(judge);

    const nextBtn = global.app.el('button', { class: 'fc-nav-btn', 'aria-label': 'Next card' });
    nextBtn.appendChild(global.app.svgIcon('M9 18l6-6-6-6', { size: 22, weight: 2 }));
    nextBtn.addEventListener('click', next);
    controls.appendChild(nextBtn);

    page.appendChild(controls);

    const keyhint = global.app.el('div', { class: 'fc-keyhint' });
    const hintParts = [
      ['Space', 'flip'],
      ['← →', 'navigate'],
      ['A', 'knew it'],
      ['S', 'study again']
    ];
    hintParts.forEach(function (p, i) {
      keyhint.appendChild(global.app.el('kbd', { text: p[0] }));
      keyhint.appendChild(document.createTextNode(' ' + p[1]));
      if (i < hintParts.length - 1) keyhint.appendChild(document.createTextNode('  ·  '));
    });
    page.appendChild(keyhint);

    // touch swipe
    let touchStartX = null;
    fcCard.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    fcCard.addEventListener('touchend', function (e) {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 60) {
        if (dx < 0) next(); else prev();
        e.preventDefault && e.preventDefault();
      }
    });

    function reset() {
      queue = shuffled ? global.app.shuffle(allCards.slice()) : allCards.slice();
      knew = 0; again = 0; isFlipped = false; total = allCards.length;
      paint();
    }

    function paint() {
      // dots: build progress bar — show one dot per remaining card + completed
      while (dots.firstChild) dots.removeChild(dots.firstChild);
      const done = total - queue.length;
      for (let i = 0; i < total; i++) {
        const d = global.app.el('span', { class: 'fc-dot' });
        if (i < done) d.classList.add('is-done');
        else if (i === done) d.classList.add('is-current');
        dots.appendChild(d);
      }
      cAgain.textContent = 'Again ' + again;
      cKnew.textContent = 'Knew ' + knew;

      if (!queue.length) {
        showDone();
        return;
      }
      const card = queue[0];
      frontText.textContent = card.term || '';
      backText.textContent = card.definition || '';
      fcCard.classList.toggle('is-flipped', isFlipped);
      prevBtn.disabled = false; // hard to track real prev in queue model; allow
      nextBtn.disabled = false;
    }

    function flip() {
      isFlipped = !isFlipped;
      fcCard.classList.toggle('is-flipped', isFlipped);
    }

    function next() {
      if (!queue.length) return;
      // rotate
      const c = queue.shift();
      queue.push(c);
      isFlipped = false;
      paint();
    }
    function prev() {
      if (!queue.length) return;
      const c = queue.pop();
      queue.unshift(c);
      isFlipped = false;
      paint();
    }

    function judgeCard(correct) {
      if (!queue.length) return;
      const card = queue.shift();
      if (correct) {
        knew += 1;
      } else {
        again += 1;
        queue.push(card);
      }
      isFlipped = false;
      paint();
    }

    function showDone() {
      while (page.firstChild) page.removeChild(page.firstChild);
      const wrap = global.app.el('div', { class: 'results-page' });
      wrap.appendChild(global.app.el('div', { class: 'results-label', text: 'All done!' }));
      wrap.appendChild(global.app.el('div', { class: 'results-big', text: knew + '/' + total }));
      wrap.appendChild(global.app.el('div', { class: 'results-sub', text: knew === total ? 'Perfect run.' : 'Cards you knew on the first try.' }));
      const acts = global.app.el('div', { class: 'results-actions' });
      const restart = global.app.el('button', { class: 'btn btn-primary', text: 'Restart' });
      restart.addEventListener('click', function () {
        global.app.navigate('#/play/flashcards/' + encodeURIComponent(setId));
      });
      const exit = global.app.el('a', { class: 'btn', href: '#/set/' + encodeURIComponent(setId), text: 'Back to set' });
      acts.appendChild(restart);
      acts.appendChild(exit);
      wrap.appendChild(acts);
      page.appendChild(wrap);
      if (knew === total) global.app.confetti(80);
      global.app.sound.win();
    }

    function onKey(e) {
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); judgeCard(true); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); judgeCard(false); }
    }
    document.addEventListener('keydown', onKey);
    fcCard.focus();

    paint();

    return function teardown() {
      document.removeEventListener('keydown', onKey);
    };
  }

  global.FlashcardsPage = { render: render };
})(window);
