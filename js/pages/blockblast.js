/* ============================================================================
   StudyDeck — Block Blast (8x8 polyomino + flashcard quiz)
   ============================================================================ */
(function (global) {
  'use strict';

  // ---------- Piece library ----------
  // Each shape = list of [r, c] cell offsets. Origin (0,0) is top-left of bbox.
  // The "anchor" is the largest cell carrying the term label — first cell by default.
  const SHAPES = [
    // 1
    { id: 'mono',  cells: [[0,0]] },
    // 2-line H/V
    { id: 'dom-h', cells: [[0,0],[0,1]] },
    { id: 'dom-v', cells: [[0,0],[1,0]] },
    // 3-line H/V
    { id: 'tri-h', cells: [[0,0],[0,1],[0,2]] },
    { id: 'tri-v', cells: [[0,0],[1,0],[2,0]] },
    // 2x2 square
    { id: 'sq2',   cells: [[0,0],[0,1],[1,0],[1,1]] },
    // 3-block L (4 rotations)
    { id: 'L-a',   cells: [[0,0],[1,0],[1,1]] },
    { id: 'L-b',   cells: [[0,0],[0,1],[1,0]] },
    { id: 'L-c',   cells: [[0,0],[0,1],[1,1]] },
    { id: 'L-d',   cells: [[0,1],[1,0],[1,1]] },
    // 3-diagonal
    { id: 'diag-a', cells: [[0,0],[1,1],[2,2]] },
    { id: 'diag-b', cells: [[0,2],[1,1],[2,0]] },
    // T piece (4 rotations)
    { id: 'T-a',   cells: [[0,0],[0,1],[0,2],[1,1]] },
    { id: 'T-b',   cells: [[0,1],[1,0],[1,1],[2,1]] },
    { id: 'T-c',   cells: [[0,1],[1,0],[1,1],[1,2]] },
    { id: 'T-d',   cells: [[0,0],[1,0],[1,1],[2,0]] },
    // S / Z
    { id: 'S-a',   cells: [[0,1],[0,2],[1,0],[1,1]] },
    { id: 'S-b',   cells: [[0,0],[1,0],[1,1],[2,1]] },
    { id: 'Z-a',   cells: [[0,0],[0,1],[1,1],[1,2]] },
    { id: 'Z-b',   cells: [[0,1],[1,0],[1,1],[2,0]] },
    // 4-line
    { id: 'I4-h',  cells: [[0,0],[0,1],[0,2],[0,3]] },
    { id: 'I4-v',  cells: [[0,0],[1,0],[2,0],[3,0]] }
  ];

  const PALETTE = ['#FFB454', '#FF6B6B', '#C147FF', '#4F8BFF', '#34C759', '#FFD60A'];
  const GRID_SIZE = 8;

  // Shape utilities
  function shapeBounds(cells) {
    let maxR = 0, maxC = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i][0] > maxR) maxR = cells[i][0];
      if (cells[i][1] > maxC) maxC = cells[i][1];
    }
    return { rows: maxR + 1, cols: maxC + 1 };
  }
  function rotateShape(cells) {
    // Rotate 90° clockwise: (r, c) → (c, maxR - r)
    let maxR = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i][0] > maxR) maxR = cells[i][0];
    const rotated = cells.map(function (rc) { return [rc[1], maxR - rc[0]]; });
    // Normalize so min row/col = 0
    let minR = Infinity, minC = Infinity;
    rotated.forEach(function (rc) { if (rc[0] < minR) minR = rc[0]; if (rc[1] < minC) minC = rc[1]; });
    return rotated.map(function (rc) { return [rc[0] - minR, rc[1] - minC]; });
  }

  // Sample card pool helper
  function pickCard(allCards) {
    const validCards = allCards.filter(function (c) {
      return (c.term || '').trim() && (c.definition || '').trim();
    });
    if (!validCards.length) return null;
    return validCards[Math.floor(Math.random() * validCards.length)];
  }

  function pickPaletteColor(idx) {
    return PALETTE[idx % PALETTE.length];
  }

  async function render(host, setId) {
    const set = await db.getSet(setId);
    const allCards = await db.listCards(setId);
    const validCards = (allCards || []).filter(function (c) {
      return (c.term || '').trim() && (c.definition || '').trim();
    });
    if (!set || !validCards.length) {
      global.app.toast('Add some cards first', 'error');
      global.app.navigate('#/set/' + encodeURIComponent(setId));
      return;
    }

    const reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const page = global.app.el('div', { class: 'page bb-page' });
    host.appendChild(page);

    // -------- top bar --------
    const bar = global.app.el('div', { class: 'bb-bar' });
    page.appendChild(bar);

    const left = global.app.el('div', { class: 'center-row' });
    const exitBtn = global.app.el('a', {
      class: 'btn btn-ghost',
      href: '#/set/' + encodeURIComponent(setId),
      text: '✕ Exit'
    });
    left.appendChild(exitBtn);
    const pauseBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Pause' });
    left.appendChild(pauseBtn);
    const restartBtn = global.app.el('button', { class: 'btn btn-ghost', text: 'Restart' });
    left.appendChild(restartBtn);
    bar.appendChild(left);

    bar.appendChild(global.app.el('div', { class: 'section-title bb-title', text: set.title || 'Block Blast' }));

    const scoreWrap = global.app.el('div', { class: 'bb-score-wrap' });
    const scoreLabel = global.app.el('div', { class: 'bb-score-label', text: 'SCORE' });
    const scoreEl = global.app.el('div', { class: 'bb-score', text: '0', 'aria-live': 'polite', 'aria-atomic': 'true' });
    scoreWrap.appendChild(scoreLabel);
    scoreWrap.appendChild(scoreEl);
    bar.appendChild(scoreWrap);

    // -------- frame --------
    const frame = global.app.el('div', { class: 'bb-frame' });
    page.appendChild(frame);

    const gridEl = global.app.el('div', {
      class: 'bb-grid',
      role: 'grid',
      'aria-label': 'Block Blast 8 by 8 grid',
      'aria-rowcount': String(GRID_SIZE),
      'aria-colcount': String(GRID_SIZE),
      tabindex: '0'
    });
    frame.appendChild(gridEl);

    // overlay sits on top of grid for ghosting/clears
    const fxLayer = global.app.el('div', { class: 'bb-fx-layer', 'aria-hidden': 'true' });
    frame.appendChild(fxLayer);

    // grid cells
    const cellEls = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = global.app.el('div', {
          class: 'bb-cell',
          role: 'gridcell',
          dataset: { r: String(r), c: String(c) }
        });
        gridEl.appendChild(cell);
        cellEls.push(cell);
      }
    }
    function cellAt(r, c) {
      if (r < 0 || c < 0 || r >= GRID_SIZE || c >= GRID_SIZE) return null;
      return cellEls[r * GRID_SIZE + c];
    }

    // status (sr-only live region)
    const srStatus = global.app.el('div', { class: 'bb-sr-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    frame.appendChild(srStatus);

    // -------- tray --------
    const tray = global.app.el('div', {
      class: 'bb-tray',
      role: 'list',
      'aria-label': 'Available pieces — drag onto the grid'
    });
    page.appendChild(tray);

    const hint = global.app.el('div', {
      class: 'bb-hint',
      text: 'Drag pieces onto the grid · fill rows/columns to clear them · arrow keys + Enter for keyboard · R to rotate'
    });
    page.appendChild(hint);

    // pause overlay / game over overlay
    const overlay = global.app.el('div', { class: 'bb-overlay', 'aria-hidden': 'true' });
    frame.appendChild(overlay);

    // quiz overlay (separate, sits over whole frame)
    const quizOverlay = global.app.el('div', { class: 'bb-quiz', 'aria-hidden': 'true' });
    frame.appendChild(quizOverlay);

    // combo banner host
    const comboHost = global.app.el('div', { class: 'bb-combo-host', 'aria-hidden': 'true' });
    frame.appendChild(comboHost);

    // -------- state --------
    // grid: 0 = empty, otherwise object { color, cardId, term, anchor: bool }
    const grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const row = [];
      for (let c = 0; c < GRID_SIZE; c++) row.push(null);
      grid.push(row);
    }

    let score = 0;
    let startTime = performance.now();
    let pausedTotal = 0;
    let pauseStart = 0;
    let paused = false;
    let gameOverFlag = false;
    let interactionLocked = false; // true while quiz overlay shown
    let trayPieces = [];           // length 3 (some null when consumed)
    let kbFocus = { trayIdx: 0, r: 3, c: 3 }; // keyboard cursor
    let rafId = 0;
    const particles = [];          // active particles for rAF loop

    let totalAttempts = 0;
    let correctAttempts = 0;
    const quizQueue = [];          // cards waiting to be quizzed

    // ---------- piece factory ----------
    function makePiece(idx) {
      const shapeDef = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const cells = shapeDef.cells.slice();
      const card = pickCard(validCards);
      const colorIdx = Math.floor(Math.random() * PALETTE.length);
      // anchor = cell with highest (r+c) so label tends to land in big cluster
      let anchorIdx = 0;
      let anchorScore = -1;
      for (let i = 0; i < cells.length; i++) {
        const s = cells[i][0] + cells[i][1];
        if (s > anchorScore) { anchorScore = s; anchorIdx = i; }
      }
      return {
        idx: idx,
        shapeId: shapeDef.id,
        cells: cells,
        color: pickPaletteColor(colorIdx),
        card: card,
        anchorIdx: anchorIdx,
        el: null
      };
    }

    function refillTrayIfEmpty() {
      let allEmpty = true;
      for (let i = 0; i < trayPieces.length; i++) {
        if (trayPieces[i]) { allEmpty = false; break; }
      }
      if (allEmpty) {
        trayPieces = [makePiece(0), makePiece(1), makePiece(2)];
        renderTray();
      }
    }

    function initTray() {
      trayPieces = [makePiece(0), makePiece(1), makePiece(2)];
      renderTray();
    }

    // ---------- tray rendering ----------
    function renderTray() {
      while (tray.firstChild) tray.removeChild(tray.firstChild);
      for (let i = 0; i < trayPieces.length; i++) {
        const piece = trayPieces[i];
        const slot = global.app.el('div', { class: 'bb-tray-slot', role: 'listitem' });
        if (!piece) {
          slot.classList.add('is-empty');
          tray.appendChild(slot);
          continue;
        }
        slot.dataset.idx = String(i);
        const pieceEl = buildPieceEl(piece, /*forTray*/ true);
        piece.el = pieceEl;
        slot.appendChild(pieceEl);
        attachPieceInteractions(pieceEl, piece, slot);
        tray.appendChild(slot);
      }
      paintKbFocus();
    }

    function buildPieceEl(piece, forTray) {
      const bounds = shapeBounds(piece.cells);
      const wrap = global.app.el('div', {
        class: 'bb-piece' + (forTray ? ' is-tray' : ''),
        tabindex: forTray ? '0' : '-1',
        role: 'button',
        'aria-label': pieceAriaLabel(piece),
        dataset: { idx: String(piece.idx) }
      });
      wrap.style.setProperty('--bb-rows', String(bounds.rows));
      wrap.style.setProperty('--bb-cols', String(bounds.cols));
      // build a rows x cols mini-grid of cells
      for (let r = 0; r < bounds.rows; r++) {
        for (let c = 0; c < bounds.cols; c++) {
          const occupied = piece.cells.some(function (rc) { return rc[0] === r && rc[1] === c; });
          const ix = piece.cells.findIndex(function (rc) { return rc[0] === r && rc[1] === c; });
          const cell = global.app.el('div', { class: 'bb-piece-cell' + (occupied ? ' is-on' : '') });
          if (occupied) {
            cell.style.background = piece.color;
            if (ix === piece.anchorIdx && piece.card) {
              const lbl = global.app.el('div', { class: 'bb-piece-label' });
              lbl.textContent = (piece.card.term || '').slice(0, 24);
              cell.appendChild(lbl);
            }
          }
          wrap.appendChild(cell);
        }
      }
      return wrap;
    }

    function pieceAriaLabel(piece) {
      const term = piece.card && piece.card.term ? piece.card.term : '';
      return 'Piece ' + (term ? '“' + term + '” ' : '') + piece.cells.length + ' cells';
    }

    // ---------- placement check / commit ----------
    function canPlaceAt(piece, anchorR, anchorC) {
      for (let i = 0; i < piece.cells.length; i++) {
        const rr = anchorR + piece.cells[i][0];
        const cc = anchorC + piece.cells[i][1];
        if (rr < 0 || cc < 0 || rr >= GRID_SIZE || cc >= GRID_SIZE) return false;
        if (grid[rr][cc]) return false;
      }
      return true;
    }

    function pieceFitsAnywhere(piece) {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (canPlaceAt(piece, r, c)) return true;
        }
      }
      return false;
    }

    function commitPiece(piece, anchorR, anchorC) {
      const placed = [];
      piece.cells.forEach(function (rc, i) {
        const r = anchorR + rc[0];
        const c = anchorC + rc[1];
        const isAnchor = i === piece.anchorIdx;
        grid[r][c] = {
          color: piece.color,
          cardId: piece.card ? piece.card.id : null,
          term: piece.card ? piece.card.term : '',
          definition: piece.card ? piece.card.definition : '',
          isAnchor: isAnchor
        };
        const cell = cellAt(r, c);
        if (cell) {
          cell.classList.add('is-filled');
          cell.style.background = piece.color;
          if (isAnchor && piece.card) {
            // ensure no children
            while (cell.firstChild) cell.removeChild(cell.firstChild);
            const lbl = global.app.el('div', { class: 'bb-cell-label' });
            lbl.textContent = (piece.card.term || '').slice(0, 24);
            cell.appendChild(lbl);
          }
          if (!reduceMotion) {
            cell.animate(
              [{ transform: 'scale(0.85)' }, { transform: 'scale(1)' }],
              { duration: 150, easing: 'cubic-bezier(0.34,1.56,0.64,1)' }
            );
          }
          placed.push({ r: r, c: c });
        }
      });
      // Remove from tray
      trayPieces[piece.idx] = null;
      renderTray();

      try { global.app.sound.tick(); } catch (e) {}

      // gain placement score = cells * 1
      addScore(placed.length);

      // After placement, scan for line clears, then refill, then check game over
      scanAndClearLines(function () {
        refillTrayIfEmpty();
        announce('Score ' + score);
        checkGameOver();
      });
    }

    function addScore(delta) {
      score += delta;
      scoreEl.textContent = String(score);
    }

    function announce(msg) {
      srStatus.textContent = msg;
    }

    // ---------- line clearing ----------
    function scanAndClearLines(done) {
      const fullRows = [];
      const fullCols = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        let full = true;
        for (let c = 0; c < GRID_SIZE; c++) if (!grid[r][c]) { full = false; break; }
        if (full) fullRows.push(r);
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) if (!grid[r][c]) { full = false; break; }
        if (full) fullCols.push(c);
      }
      const totalLines = fullRows.length + fullCols.length;
      if (totalLines === 0) {
        if (typeof done === 'function') done();
        return;
      }

      // Cells about to clear (dedup)
      const clearSet = new Set();
      const clearedCells = [];
      function add(r, c) {
        const k = r + ',' + c;
        if (clearSet.has(k)) return;
        clearSet.add(k);
        clearedCells.push({ r: r, c: c, data: grid[r][c] });
      }
      fullRows.forEach(function (r) { for (let c = 0; c < GRID_SIZE; c++) add(r, c); });
      fullCols.forEach(function (c) { for (let r = 0; r < GRID_SIZE; r++) add(r, c); });

      try { global.app.sound.pop(); } catch (e) {}

      // burst particles + clear cells
      clearedCells.forEach(function (cd) {
        const cell = cellAt(cd.r, cd.c);
        if (!cell) return;
        const color = (cd.data && cd.data.color) || PALETTE[Math.floor(Math.random() * PALETTE.length)];
        burstParticles(cell, color);
        cell.classList.remove('is-filled');
        cell.style.background = '';
        while (cell.firstChild) cell.removeChild(cell.firstChild);
        grid[cd.r][cd.c] = null;
      });

      // Score: 10 per cell + 50 combo bonus per simultaneous line
      const cellPts = clearedCells.length * 10;
      const comboPts = totalLines * 50;
      addScore(cellPts + comboPts);

      if (totalLines >= 2) {
        showComboBanner(totalLines, cellPts + comboPts);
        try { global.app.sound.win(); } catch (e) {}
      }

      announce('Cleared ' + totalLines + ' line' + (totalLines === 1 ? '' : 's'));

      // Queue a quiz card from a random cleared cell with a card
      const quizCandidates = clearedCells.filter(function (cd) {
        return cd.data && cd.data.cardId;
      });
      if (quizCandidates.length) {
        const pick = quizCandidates[Math.floor(Math.random() * quizCandidates.length)];
        quizQueue.push({
          term: pick.data.term,
          definition: pick.data.definition,
          cardId: pick.data.cardId
        });
      }
      // process queue (one at a time)
      processQuizQueue(done);
    }

    function showComboBanner(lines, pts) {
      const banner = global.app.el('div', { class: 'bb-combo' });
      banner.textContent = lines + '-line combo! +' + pts;
      comboHost.appendChild(banner);
      // animate
      requestAnimationFrame(function () { banner.classList.add('is-in'); });
      setTimeout(function () { banner.classList.remove('is-in'); banner.classList.add('is-out'); }, 800);
      setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 1300);
    }

    // ---------- particles ----------
    function burstParticles(cell, color) {
      if (reduceMotion) return;
      const rect = cell.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const cx = rect.left - frameRect.left + rect.width / 2;
      const cy = rect.top - frameRect.top + rect.height / 2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const p = global.app.el('div', { class: 'bb-particle' });
        p.style.background = color;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        fxLayer.appendChild(p);
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const speed = 80 + Math.random() * 60; // px/s
        particles.push({
          el: p,
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          life: 0,
          ttl: 600 + Math.random() * 200
        });
      }
      ensureParticleLoop();
    }

    function ensureParticleLoop() {
      if (rafId) return;
      let last = performance.now();
      function step(now) {
        const dt = Math.min(40, now - last);
        last = now;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += dt;
          if (p.life >= p.ttl) {
            if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
            particles.splice(i, 1);
            continue;
          }
          p.x += p.vx * (dt / 1000);
          p.y += p.vy * (dt / 1000);
          p.vy += 220 * (dt / 1000); // gravity
          const t = p.life / p.ttl;
          p.el.style.left = p.x + 'px';
          p.el.style.top = p.y + 'px';
          p.el.style.opacity = String(1 - t);
          p.el.style.transform = 'scale(' + (1 - t * 0.5) + ')';
        }
        if (particles.length === 0) {
          rafId = 0;
          return;
        }
        rafId = requestAnimationFrame(step);
      }
      rafId = requestAnimationFrame(step);
    }

    // ---------- quiz overlay ----------
    function processQuizQueue(done) {
      if (!quizQueue.length || gameOverFlag) {
        if (typeof done === 'function') done();
        return;
      }
      const q = quizQueue.shift();
      showQuiz(q, function () {
        // chain remaining
        processQuizQueue(done);
      });
    }

    function showQuiz(q, after) {
      interactionLocked = true;
      // build choices: 1 correct + 3 distractors
      const distractors = global.app.shuffle(
        validCards
          .filter(function (c) { return c.id !== q.cardId; })
          .map(function (c) { return c.term; })
      ).slice(0, 3);
      // Pad if not enough cards
      while (distractors.length < 3) {
        distractors.push('—');
      }
      const choices = global.app.shuffle([q.term].concat(distractors));

      while (quizOverlay.firstChild) quizOverlay.removeChild(quizOverlay.firstChild);
      quizOverlay.classList.add('is-visible');
      quizOverlay.setAttribute('aria-hidden', 'false');
      quizOverlay.setAttribute('role', 'dialog');
      quizOverlay.setAttribute('aria-modal', 'true');
      quizOverlay.setAttribute('aria-label', 'Quick quiz');

      const card = global.app.el('div', { class: 'bb-quiz-card' });
      card.appendChild(global.app.el('div', { class: 'bb-quiz-label', text: 'Definition' }));
      const def = global.app.el('div', { class: 'bb-quiz-def' });
      def.textContent = q.definition || '';
      card.appendChild(def);

      const choicesWrap = global.app.el('div', { class: 'bb-quiz-choices' });
      const buttons = [];
      let answered = false;
      let timeoutHandle = 0;
      let countdownHandle = 0;

      function pick(choice, btn) {
        if (answered) return;
        answered = true;
        clearTimeout(timeoutHandle);
        clearInterval(countdownHandle);
        totalAttempts++;
        if (choice === q.term) {
          correctAttempts++;
          addScore(25);
          btn.classList.add('is-correct');
          card.classList.add('flash-green');
          try { global.app.sound.success(); } catch (e) {}
          announce('Correct! +25');
          setTimeout(closeAndContinue, 700);
        } else {
          addScore(-10);
          btn.classList.add('is-wrong');
          // reveal correct
          buttons.forEach(function (b) {
            if (b.textContent === q.term) b.classList.add('is-correct-reveal');
          });
          card.classList.add('flash-red');
          try { global.app.sound.error(); } catch (e) {}
          announce('Wrong. The answer was ' + q.term);
          setTimeout(closeAndContinue, 1200);
        }
      }

      function closeAndContinue() {
        quizOverlay.classList.remove('is-visible');
        quizOverlay.setAttribute('aria-hidden', 'true');
        while (quizOverlay.firstChild) quizOverlay.removeChild(quizOverlay.firstChild);
        interactionLocked = false;
        if (typeof after === 'function') after();
      }

      choices.forEach(function (txt) {
        const b = global.app.el('button', { class: 'bb-quiz-choice' });
        b.textContent = txt;
        b.addEventListener('click', function () { pick(txt, b); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(txt, b); }
        });
        choicesWrap.appendChild(b);
        buttons.push(b);
      });
      card.appendChild(choicesWrap);

      const tip = global.app.el('div', { class: 'bb-quiz-tip' });
      tip.textContent = 'Auto-dismiss in 5s';
      card.appendChild(tip);

      quizOverlay.appendChild(card);

      // 5s auto-dismiss countdown
      let remain = 5;
      countdownHandle = setInterval(function () {
        remain--;
        if (remain <= 0) {
          tip.textContent = '...';
        } else {
          tip.textContent = 'Auto-dismiss in ' + remain + 's';
        }
      }, 1000);
      timeoutHandle = setTimeout(function () {
        if (answered) return;
        answered = true;
        clearInterval(countdownHandle);
        // reveal correct without penalty
        buttons.forEach(function (b) {
          if (b.textContent === q.term) b.classList.add('is-correct-reveal');
        });
        announce('Time up. The answer was ' + q.term);
        setTimeout(closeAndContinue, 700);
      }, 5000);

      // focus first button for keyboard users
      setTimeout(function () { if (buttons[0]) buttons[0].focus(); }, 30);
    }

    // ---------- pointer drag interactions ----------
    function attachPieceInteractions(pieceEl, piece, slot) {
      pieceEl.style.touchAction = 'none';

      let dragging = false;
      let pointerId = null;
      let dragGhost = null;
      let lastValidPlacement = null; // {r, c}

      function onPointerDown(e) {
        if (interactionLocked || paused || gameOverFlag) return;
        if (!piece || !trayPieces[piece.idx]) return;
        e.preventDefault();
        dragging = true;
        pointerId = e.pointerId;
        try { pieceEl.setPointerCapture(pointerId); } catch (err) {}
        // Build floating ghost element
        dragGhost = buildPieceEl(piece, false);
        dragGhost.classList.add('bb-drag-ghost');
        document.body.appendChild(dragGhost);
        // Position relative to pointer
        positionGhost(e.clientX, e.clientY);
        pieceEl.classList.add('is-dragging-source');
      }

      function positionGhost(clientX, clientY) {
        if (!dragGhost) return;
        const cellSize = getCellSize();
        const bounds = shapeBounds(piece.cells);
        // Center the ghost roughly on the cursor
        const w = bounds.cols * cellSize;
        const h = bounds.rows * cellSize;
        // place pointer just below first cell so user can see what they're placing
        dragGhost.style.left = (clientX - cellSize * 0.5) + 'px';
        dragGhost.style.top = (clientY - cellSize * 0.5 - h) + 'px';
        // Update preview on grid
        updateGridPreview(clientX, clientY);
      }

      function getCellSize() {
        const first = cellEls[0];
        if (!first) return 40;
        return first.getBoundingClientRect().width;
      }

      function clientToAnchor(clientX, clientY) {
        const cellSize = getCellSize();
        const gridRect = gridEl.getBoundingClientRect();
        // The "anchor" cell is the upper-left of the piece's bbox.
        // We want the cell under (clientX, clientY - cellSize/2 - h_offset)
        const bounds = shapeBounds(piece.cells);
        // Choose anchor so the piece bbox top is one cell-row above pointer
        const targetX = clientX - cellSize * 0.5;
        const targetY = clientY - cellSize * 0.5 - (bounds.rows - 1) * cellSize;
        const c = Math.round((targetX - gridRect.left) / cellSize);
        const r = Math.round((targetY - gridRect.top) / cellSize);
        return { r: r, c: c };
      }

      function updateGridPreview(clientX, clientY) {
        clearPreview();
        const a = clientToAnchor(clientX, clientY);
        const valid = canPlaceAt(piece, a.r, a.c);
        if (valid) {
          piece.cells.forEach(function (rc) {
            const cell = cellAt(a.r + rc[0], a.c + rc[1]);
            if (cell) {
              cell.classList.add('is-ghost');
              cell.style.setProperty('--bb-ghost-color', piece.color);
            }
          });
          lastValidPlacement = a;
        } else {
          // show invalid ghost on cells inside grid
          piece.cells.forEach(function (rc) {
            const cell = cellAt(a.r + rc[0], a.c + rc[1]);
            if (cell) cell.classList.add('is-ghost-bad');
          });
          lastValidPlacement = null;
        }
      }

      function clearPreview() {
        for (let i = 0; i < cellEls.length; i++) {
          cellEls[i].classList.remove('is-ghost');
          cellEls[i].classList.remove('is-ghost-bad');
        }
      }

      function onPointerMove(e) {
        if (!dragging) return;
        positionGhost(e.clientX, e.clientY);
      }

      function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;
        try { pieceEl.releasePointerCapture(pointerId); } catch (err) {}
        if (dragGhost && dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
        dragGhost = null;
        clearPreview();
        pieceEl.classList.remove('is-dragging-source');
        if (lastValidPlacement && trayPieces[piece.idx]) {
          commitPiece(piece, lastValidPlacement.r, lastValidPlacement.c);
          lastValidPlacement = null;
        } else {
          // snap-back: tiny shake
          if (!reduceMotion) {
            pieceEl.animate(
              [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
              { duration: 220, easing: 'ease-in-out' }
            );
          }
          try { global.app.sound.error(); } catch (e2) {}
        }
      }

      function onPointerCancel() {
        if (!dragging) return;
        dragging = false;
        if (dragGhost && dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
        dragGhost = null;
        clearPreview();
        pieceEl.classList.remove('is-dragging-source');
      }

      pieceEl.addEventListener('pointerdown', onPointerDown);
      pieceEl.addEventListener('pointermove', onPointerMove);
      pieceEl.addEventListener('pointerup', onPointerUp);
      pieceEl.addEventListener('pointercancel', onPointerCancel);

      // Keyboard: Enter on tray piece selects it for keyboard placement
      pieceEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          kbFocus.trayIdx = piece.idx;
          kbStartPlacement();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          rotateTrayPiece(piece.idx);
        }
      });
    }

    function rotateTrayPiece(idx) {
      const piece = trayPieces[idx];
      if (!piece) return;
      const rotated = rotateShape(piece.cells);
      // Recompute anchor index after rotation (highest r+c again)
      let anchorIdx = 0, anchorScore = -1;
      for (let i = 0; i < rotated.length; i++) {
        const s = rotated[i][0] + rotated[i][1];
        if (s > anchorScore) { anchorScore = s; anchorIdx = i; }
      }
      piece.cells = rotated;
      piece.anchorIdx = anchorIdx;
      renderTray();
    }

    // ---------- keyboard placement ----------
    let kbActive = false;
    function kbStartPlacement() {
      const piece = trayPieces[kbFocus.trayIdx];
      if (!piece) return;
      kbActive = true;
      // ensure cursor is on grid
      kbFocus.r = Math.min(kbFocus.r, GRID_SIZE - 1);
      kbFocus.c = Math.min(kbFocus.c, GRID_SIZE - 1);
      paintKbFocus();
      gridEl.focus();
    }

    function paintKbFocus() {
      // remove all
      for (let i = 0; i < cellEls.length; i++) {
        cellEls[i].classList.remove('is-kb-cursor');
        cellEls[i].classList.remove('is-ghost');
        cellEls[i].classList.remove('is-ghost-bad');
      }
      if (!kbActive) return;
      const piece = trayPieces[kbFocus.trayIdx];
      if (!piece) return;
      const valid = canPlaceAt(piece, kbFocus.r, kbFocus.c);
      piece.cells.forEach(function (rc) {
        const cell = cellAt(kbFocus.r + rc[0], kbFocus.c + rc[1]);
        if (cell) {
          if (valid) {
            cell.classList.add('is-ghost');
            cell.style.setProperty('--bb-ghost-color', piece.color);
          } else {
            cell.classList.add('is-ghost-bad');
          }
        }
      });
      const cur = cellAt(kbFocus.r, kbFocus.c);
      if (cur) cur.classList.add('is-kb-cursor');
    }

    function onGridKey(e) {
      if (interactionLocked || paused || gameOverFlag) return;
      // Tab between pieces is handled natively via tabindex
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateTrayPiece(kbFocus.trayIdx);
        if (kbActive) paintKbFocus();
        return;
      }
      if (!kbActive) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          kbStartPlacement();
        }
        return;
      }
      if (e.key === 'ArrowUp')   { e.preventDefault(); kbFocus.r = Math.max(0, kbFocus.r - 1); paintKbFocus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); kbFocus.r = Math.min(GRID_SIZE - 1, kbFocus.r + 1); paintKbFocus(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); kbFocus.c = Math.max(0, kbFocus.c - 1); paintKbFocus(); }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); kbFocus.c = Math.min(GRID_SIZE - 1, kbFocus.c + 1); paintKbFocus(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const piece = trayPieces[kbFocus.trayIdx];
        if (piece && canPlaceAt(piece, kbFocus.r, kbFocus.c)) {
          kbActive = false;
          commitPiece(piece, kbFocus.r, kbFocus.c);
          paintKbFocus();
        } else {
          try { global.app.sound.error(); } catch (e2) {}
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        kbActive = false;
        paintKbFocus();
      }
    }
    gridEl.addEventListener('keydown', onGridKey);

    // ---------- pause / restart / game over ----------
    function setPaused(v) {
      if (gameOverFlag) return;
      paused = v;
      if (paused) {
        pauseStart = performance.now();
        pauseBtn.textContent = 'Resume';
        showOverlay('Paused', 'Click resume to continue', null);
      } else {
        pausedTotal += performance.now() - pauseStart;
        pauseStart = 0;
        pauseBtn.textContent = 'Pause';
        hideOverlay();
      }
    }
    pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    restartBtn.addEventListener('click', function () { restart(); });

    function showOverlay(title, sub, ctaButton) {
      while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      const card = global.app.el('div', { class: 'bb-overlay-card' });
      card.appendChild(global.app.el('h3', { text: title }));
      if (sub) card.appendChild(global.app.el('p', { class: 'txt-mute', text: sub }));
      if (ctaButton) card.appendChild(ctaButton);
      overlay.appendChild(card);
    }
    function hideOverlay() {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    }

    function restart() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      // reset particles
      particles.forEach(function (p) { if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el); });
      particles.length = 0;
      // clear grid
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          grid[r][c] = null;
          const cell = cellAt(r, c);
          if (cell) {
            cell.classList.remove('is-filled');
            cell.classList.remove('is-ghost');
            cell.classList.remove('is-ghost-bad');
            cell.classList.remove('is-kb-cursor');
            cell.style.background = '';
            while (cell.firstChild) cell.removeChild(cell.firstChild);
          }
        }
      }
      score = 0;
      scoreEl.textContent = '0';
      totalAttempts = 0;
      correctAttempts = 0;
      quizQueue.length = 0;
      kbActive = false;
      kbFocus = { trayIdx: 0, r: 3, c: 3 };
      gameOverFlag = false;
      paused = false;
      interactionLocked = false;
      pausedTotal = 0;
      startTime = performance.now();
      hideOverlay();
      // close quiz overlay if any
      quizOverlay.classList.remove('is-visible');
      quizOverlay.setAttribute('aria-hidden', 'true');
      while (quizOverlay.firstChild) quizOverlay.removeChild(quizOverlay.firstChild);
      initTray();
    }

    function checkGameOver() {
      let any = false;
      for (let i = 0; i < trayPieces.length; i++) {
        if (trayPieces[i] && pieceFitsAnywhere(trayPieces[i])) {
          any = true; break;
        }
      }
      if (!any) gameOver();
    }

    async function gameOver() {
      if (gameOverFlag) return;
      gameOverFlag = true;
      kbActive = false;
      paintKbFocus();

      const elapsed = (performance.now() - startTime) - pausedTotal;
      const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

      try {
        await db.recordScore(setId, 'blockblast', score, Math.round(elapsed));
      } catch (e) { console.error(e); }
      let top = [];
      try { top = await db.topScores(setId, 'blockblast', 5); } catch (e) {}
      const isBest = top.length && top[0].score === score && top[0].score > 0;

      sessionStorage.setItem('sd_lastResult', JSON.stringify({
        mode: 'blockblast',
        setId: setId,
        setTitle: set.title || 'Block Blast',
        time: Math.round(elapsed),
        score: score,
        scoreMax: null,
        accuracy: accuracy,
        isBest: !!isBest,
        topScores: top.map(function (s) {
          return { score: s.score, timeMs: s.timeMs, completedAt: s.completedAt };
        }),
        backHref: '#/set/' + encodeURIComponent(setId),
        playAgainHref: '#/play/blockblast/' + encodeURIComponent(setId),
        missed: null
      }));
      try { global.app.sound.lose(); } catch (e) {}

      const playAgain = global.app.el('button', { class: 'btn btn-primary', text: 'Play again' });
      playAgain.addEventListener('click', function () { global.app.navigate('#/play/blockblast/' + encodeURIComponent(setId)); });
      const sub = 'Score: ' + score + ' · ' + (totalAttempts ? accuracy + '% quiz accuracy' : 'No quizzes triggered');
      showOverlay('Game over', sub, playAgain);
      setTimeout(function () { playAgain.focus(); }, 50);
      // Auto-route to /results after a beat
      setTimeout(function () { global.app.navigate('#/results'); }, 1400);
    }

    // ---------- bootstrap ----------
    initTray();

    return function teardown() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      gridEl.removeEventListener('keydown', onGridKey);
      // remove particles
      particles.forEach(function (p) { if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el); });
      particles.length = 0;
      // remove any stray drag ghost
      Array.prototype.forEach.call(document.querySelectorAll('.bb-drag-ghost'), function (n) { n.remove(); });
    };
  }

  global.BlockBlastPage = { render: render };
})(window);
