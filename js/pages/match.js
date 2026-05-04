/* ============================================================================
   StudyDeck — Match game
   ============================================================================ */
(function (global) {
  'use strict';

  async function render(host, setId) {
    const set = await db.getSet(setId);
    const allCards = await db.listCards(setId);
    if (!set || allCards.length < 2) {
      global.app.toast('Need at least 2 cards', 'error');
      global.app.navigate('#/set/' + encodeURIComponent(setId));
      return;
    }

    const page = global.app.el('div', { class: 'page match-page' });
    host.appendChild(page);

    // top bar
    const bar = global.app.el('div', { class: 'match-bar' });
    page.appendChild(bar);
    const left = global.app.el('div', { class: 'center-row' });
    const exitBtn = global.app.el('a', { class: 'btn btn-ghost', href: '#/set/' + encodeURIComponent(setId), text: '✕ Exit' });
    left.appendChild(exitBtn);
    const restartBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Restart' });
    restartBtn.addEventListener('click', function () { restart(); });
    left.appendChild(restartBtn);
    bar.appendChild(left);

    bar.appendChild(global.app.el('div', { class: 'section-title', text: set.title || 'Match' }));

    const timerEl = global.app.el('div', { class: 'match-timer', text: '00:00.00' });
    bar.appendChild(timerEl);

    const board = global.app.el('div', { class: 'match-board' });
    page.appendChild(board);

    // game state
    let pickN = Math.min(8, allCards.length);
    if (pickN < 6 && allCards.length >= 6) pickN = 6;
    let picked = [];
    let tiles = [];
    let selected = null;
    let startTime = 0;
    let timerHandle = 0;
    let lockedUntil = 0;
    let matchedCount = 0;

    function restart() {
      cancelAnimationFrame(timerHandle);
      while (board.firstChild) board.removeChild(board.firstChild);
      picked = global.app.pickRandom(allCards, pickN);
      tiles = [];
      picked.forEach(function (c, i) {
        tiles.push({ pairId: i, role: 'term', text: c.term });
        tiles.push({ pairId: i, role: 'def', text: c.definition });
      });
      tiles = global.app.shuffle(tiles);
      tiles.forEach(function (t, i) {
        const tile = global.app.el('button', {
          class: 'match-tile',
          tabindex: '0',
          dataset: { i: String(i) },
          text: t.text || ''
        });
        tile.addEventListener('click', function () { onTileClick(i); });
        tile.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTileClick(i);
          }
        });
        t.el = tile;
        board.appendChild(tile);
      });
      selected = null;
      matchedCount = 0;
      startTime = performance.now();
      lockedUntil = 0;
      tickTimer();
    }

    function tickTimer() {
      const elapsed = performance.now() - startTime;
      timerEl.textContent = global.app.fmtDuration(elapsed);
      timerHandle = requestAnimationFrame(tickTimer);
    }

    function onTileClick(i) {
      if (performance.now() < lockedUntil) return;
      const t = tiles[i];
      if (!t || t.matched) return;
      if (selected === i) return;
      if (selected == null) {
        selected = i;
        t.el.classList.add('is-selected');
        return;
      }
      const a = tiles[selected];
      const b = t;
      if (a.pairId === b.pairId && a.role !== b.role) {
        // match
        a.matched = true; b.matched = true;
        a.el.classList.remove('is-selected');
        a.el.classList.add('is-correct');
        b.el.classList.add('is-correct');
        global.app.sound.success();
        matchedCount += 2;
        selected = null;
        // wait for animation, then hide
        setTimeout(function () {
          a.el.classList.add('is-gone');
          b.el.classList.add('is-gone');
        }, 480);
        if (matchedCount === tiles.length) finish();
      } else {
        // wrong
        a.el.classList.remove('is-selected');
        a.el.classList.add('is-wrong');
        b.el.classList.add('is-wrong');
        global.app.sound.error();
        const aRef = a, bRef = b;
        lockedUntil = performance.now() + 500;
        // disable temporarily by class; pointer-events restored by removing class
        Array.prototype.forEach.call(board.querySelectorAll('.match-tile'), function (n) {
          n.classList.add('is-disabled');
        });
        setTimeout(function () {
          aRef.el.classList.remove('is-wrong');
          bRef.el.classList.remove('is-wrong');
          Array.prototype.forEach.call(board.querySelectorAll('.match-tile'), function (n) {
            n.classList.remove('is-disabled');
          });
        }, 500);
        selected = null;
      }
    }

    async function finish() {
      cancelAnimationFrame(timerHandle);
      const elapsed = performance.now() - startTime;
      await db.recordScore(setId, 'match', 100, Math.round(elapsed));
      const top = await db.topScores(setId, 'match', 5);
      const isBest = top.length && top[0].timeMs >= elapsed - 1; // within 1ms

      // store result for results page
      sessionStorage.setItem('sd_lastResult', JSON.stringify({
        mode: 'match',
        setId: setId,
        setTitle: set.title || 'Match',
        time: elapsed,
        score: null,
        scoreMax: null,
        accuracy: null,
        isBest: !!isBest,
        topScores: top.map(function (s) {
          return { timeMs: s.timeMs, score: s.score, completedAt: s.completedAt };
        }),
        backHref: '#/set/' + encodeURIComponent(setId),
        playAgainHref: '#/play/match/' + encodeURIComponent(setId),
        missed: null
      }));
      global.app.sound.win();
      setTimeout(function () { global.app.navigate('#/results'); }, 700);
    }

    restart();

    return function teardown() {
      cancelAnimationFrame(timerHandle);
    };
  }

  global.MatchPage = { render: render };
})(window);
