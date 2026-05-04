/* ============================================================================
   StudyDeck — Falling Blocks (Gravity clone)
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

    const page = global.app.el('div', { class: 'page blocks-page' });
    host.appendChild(page);

    // bar
    const bar = global.app.el('div', { class: 'blocks-bar' });
    page.appendChild(bar);

    const left = global.app.el('div', { class: 'center-row' });
    const exitBtn = global.app.el('a', { class: 'btn btn-ghost', href: '#/set/' + encodeURIComponent(setId), text: '✕ Exit' });
    left.appendChild(exitBtn);
    const lives = global.app.el('div', { class: 'blocks-lives', 'aria-label': 'Lives' });
    for (let i = 0; i < 3; i++) {
      const heart = global.app.el('div', { class: 'blocks-life' });
      heart.appendChild(global.app.svgIcon(
        'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
        { size: 24, weight: 1.8 }
      ));
      lives.appendChild(heart);
    }
    left.appendChild(lives);
    bar.appendChild(left);

    bar.appendChild(global.app.el('div', { class: 'section-title', text: set.title || 'Falling Blocks' }));

    const scoreEl = global.app.el('div', { class: 'blocks-score', text: '0' });
    bar.appendChild(scoreEl);

    // field
    const field = global.app.el('div', { class: 'blocks-field' });
    page.appendChild(field);

    const overlay = global.app.el('div', { class: 'blocks-overlay' });
    field.appendChild(overlay);

    // input
    const inputRow = global.app.el('div', { class: 'blocks-input-row' });
    const input = global.app.el('input', {
      class: 'blocks-input',
      type: 'text',
      placeholder: 'Type the matching term…',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': 'Answer'
    });
    inputRow.appendChild(input);
    page.appendChild(inputRow);
    page.appendChild(global.app.el('div', { class: 'blocks-hint', text: 'Type the term that matches a falling definition. Enter to submit.' }));

    // game state
    let lifeCount = 3;
    let score = 0;
    let blocks = []; // { card, x, y, speed, fontEl }
    let running = true;
    let lastSpawn = 0;
    let spawnInterval = 2200; // ms
    let rafId = 0;
    let lastT = 0;

    const colors = [
      'linear-gradient(135deg, #FFB454, #FF6B6B)',
      'linear-gradient(135deg, #FF6B6B, #C147FF)',
      'linear-gradient(135deg, #C147FF, #5E5CE6)',
      'linear-gradient(135deg, #34C759, #30B0C7)',
      'linear-gradient(135deg, #FFB454, #C147FF)',
      'linear-gradient(135deg, #FF4FA3, #FF6B6B)'
    ];

    function spawn() {
      // pick a card not currently on screen
      const used = new Set(blocks.map(function (b) { return b.card.id; }));
      const pool = allCards.filter(function (c) { return !used.has(c.id) && (c.term || '').trim() && (c.definition || '').trim(); });
      if (!pool.length) return;
      const card = pool[Math.floor(Math.random() * pool.length)];
      const blockEl = global.app.el('div', {
        class: 'block',
        text: card.definition
      });
      blockEl.style.background = colors[Math.floor(Math.random() * colors.length)];
      // append first so we can measure
      blockEl.style.left = '-9999px';
      blockEl.style.top = '-9999px';
      field.appendChild(blockEl);
      const fieldRect = field.getBoundingClientRect();
      const blockW = blockEl.offsetWidth;
      const blockH = blockEl.offsetHeight;
      const maxX = Math.max(0, fieldRect.width - blockW - 8);
      const x = Math.floor(4 + Math.random() * maxX);
      blockEl.style.left = x + 'px';
      blockEl.style.top = (-blockH) + 'px';
      // Initial fall speed scales with score
      const speed = Math.max(40, 70 - score * 0.4);
      const baseSpeed = Math.min(speed + score * 2.5, 240);
      blocks.push({ card: card, el: blockEl, y: -blockH, x: x, w: blockW, h: blockH, speed: baseSpeed });
    }

    function tick(t) {
      if (!running) return;
      if (!lastT) lastT = t;
      const dt = (t - lastT) / 1000;
      lastT = t;

      const fieldRect = field.getBoundingClientRect();
      const floor = fieldRect.height - 8;

      // spawn
      lastSpawn += dt * 1000;
      const dynamicInterval = Math.max(900, spawnInterval - score * 25);
      if (lastSpawn > dynamicInterval) {
        lastSpawn = 0;
        spawn();
      }

      // move
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.y += b.speed * dt;
        b.el.style.top = b.y + 'px';
        if ((b.y + (b.h || 0)) >= floor) {
          // missed
          b.el.classList.add('is-missed');
          setTimeout(function () { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); }, 350);
          blocks.splice(i, 1);
          loseLife(b.card);
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    function start() {
      lastT = 0;
      lastSpawn = spawnInterval - 600; // first one comes quick
      rafId = requestAnimationFrame(tick);
    }
    function stop() { running = false; cancelAnimationFrame(rafId); }

    function loseLife(card) {
      lifeCount = Math.max(0, lifeCount - 1);
      paintLives();
      global.app.sound.error();
      // brief shake
      field.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
        { duration: 240, easing: 'ease-in-out' }
      );
      if (lifeCount <= 0) gameOver();
    }

    function paintLives() {
      Array.prototype.forEach.call(lives.children, function (n, idx) {
        n.classList.toggle('is-lost', idx >= lifeCount);
      });
    }

    function paintScore() {
      scoreEl.textContent = String(score);
    }

    function tryAnswer() {
      const val = input.value.trim().toLowerCase();
      if (!val) return;
      // find a block whose term matches (case-insensitive)
      let hitIdx = -1;
      for (let i = 0; i < blocks.length; i++) {
        if ((blocks[i].card.term || '').trim().toLowerCase() === val) { hitIdx = i; break; }
      }
      if (hitIdx >= 0) {
        const b = blocks[hitIdx];
        explode(b);
        blocks.splice(hitIdx, 1);
        score += 1;
        paintScore();
        global.app.sound.success();
        input.value = '';
      }
    }

    function explode(b) {
      const cx = b.x + (b.w || 100) / 2;
      const cy = b.y + (b.h || 30) / 2;
      const partColors = ['#FFB454', '#FF6B6B', '#C147FF', '#34C759', '#FF4FA3'];
      // burst
      for (let i = 0; i < 12; i++) {
        const p = global.app.el('div', { class: 'particle' });
        p.style.background = partColors[i % partColors.length];
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        field.appendChild(p);
        const angle = (i / 12) * Math.PI * 2;
        const dist = 60 + Math.random() * 40;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        p.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.4)', opacity: 0 }
          ],
          { duration: 600, easing: 'cubic-bezier(0.22,1,0.36,1)' }
        );
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
      }
      b.el.classList.add('is-popped');
      setTimeout(function () { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); }, 320);
    }

    input.addEventListener('input', function () {
      // check for full match anywhere — auto-resolve as you type? Spec says "Enter or auto-match on full-string match"
      tryAnswer();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryAnswer();
      }
    });

    async function gameOver() {
      stop();
      // remove remaining blocks
      blocks.forEach(function (b) { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
      blocks = [];
      const accuracy = score > 0 ? Math.min(100, Math.round((score / Math.max(1, score + 3)) * 100)) : 0;
      await db.recordScore(setId, 'blocks', score, 0);
      const top = await db.topScores(setId, 'blocks', 5);
      const isBest = top.length && top[0].score === score && top[0].score > 0;

      sessionStorage.setItem('sd_lastResult', JSON.stringify({
        mode: 'blocks',
        setId: setId,
        setTitle: set.title || 'Falling Blocks',
        time: null,
        score: score,
        scoreMax: null,
        accuracy: accuracy,
        isBest: !!isBest,
        topScores: top.map(function (s) {
          return { score: s.score, completedAt: s.completedAt };
        }),
        backHref: '#/set/' + encodeURIComponent(setId),
        playAgainHref: '#/play/blocks/' + encodeURIComponent(setId),
        missed: null
      }));
      global.app.sound.lose();

      // show overlay briefly then go to results
      const o = overlay;
      while (o.firstChild) o.removeChild(o.firstChild);
      o.appendChild(global.app.el('h3', { text: 'Game over' }));
      o.appendChild(global.app.el('p', { class: 'txt-mute', text: 'Score: ' + score }));
      o.classList.add('is-visible');
      setTimeout(function () { global.app.navigate('#/results'); }, 1100);
    }

    paintLives();
    paintScore();
    input.focus();
    start();

    return function teardown() {
      running = false;
      cancelAnimationFrame(rafId);
      blocks.forEach(function (b) { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
    };
  }

  global.BlocksPage = { render: render };
})(window);
