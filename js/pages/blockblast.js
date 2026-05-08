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
    /// New gate (per user feedback "every three blocks you have to type
    /// an answer to something correct to get 3 more"): after the third
    /// piece in the tray is placed, BEFORE refilling, the player must
    /// correctly TYPE a flashcard answer. No multiple-choice; no
    /// auto-dismiss; tray stays empty until they get it right.
    let pendingRefill = false;     // tray needs a refill but is blocked on a quiz

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
      if (!allEmpty) return;
      // Tray empty → quiz the user before handing them three more.
      // A correct typed answer is required to actually refill (the
      // "every three blocks" gate). Wrong answers reveal the right
      // one and keep the tray empty, but the player can choose to
      // continue (with a score penalty already applied) and try the
      // next card. Pieces are NOT generated until the gate clears.
      pendingRefill = true;
      const card = pickCard(validCards);
      if (!card) {
        // No cards in the set — fall back to ungated refill.
        doActualRefill();
        return;
      }
      showRefillQuiz(card);
    }

    function doActualRefill() {
      trayPieces = [makePiece(0), makePiece(1), makePiece(2)];
      pendingRefill = false;
      renderTray();
      // Game over check waited until pieces existed; do it now.
      checkGameOver();
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

      // After placement: clear lines → maybe refill (gated by typed
      // quiz when the tray's empty) → game-over check. If the tray is
      // still partially full, refillTrayIfEmpty no-ops and we just
      // checkGameOver; if it just emptied, the quiz overlay opens and
      // checkGameOver runs at the end of doActualRefill instead (so we
      // don't false-positive game-over while the tray is intentionally
      // empty waiting on a typed answer).
      scanAndClearLines(function () {
        announce('Score ' + score);
        const wasEmpty = trayPieces.every(function (p) { return !p; });
        refillTrayIfEmpty();
        if (!wasEmpty) {
          // Tray still has pieces; safe to check immediately
          checkGameOver();
        }
        // If wasEmpty: doActualRefill (called after the quiz) handles
        // the game-over check.
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
      // No more quiz-on-line-clear (per user: "it also shouldnt auto
      // answer", and the typed quiz now happens on tray refill instead).
      // Line clears are pure score/spectacle.
      if (typeof done === 'function') done();
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

    // ---------- typed-answer refill quiz ----------
    /// Compare a typed guess to the correct term. Strips whitespace,
    /// lowercases, and ignores trailing punctuation so "Mitosis" and
    /// "mitosis." both count as correct. We also accept exact-match
    /// alternative answers separated by '/' or ',' in the term (so a
    /// card term of "USA/America" accepts either spelling).
    function normalizeAnswer(s) {
      return String(s || '')
        .toLowerCase()
        .trim()
        .replace(/[.,;:!?]+$/g, '')
        .replace(/\s+/g, ' ');
    }
    function isCorrectAnswer(guess, term) {
      const g = normalizeAnswer(guess);
      if (!g) return false;
      const alts = String(term || '').split(/[\/,]/).map(normalizeAnswer).filter(Boolean);
      return alts.indexOf(g) !== -1;
    }

    function clearChildren(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    /// Shown when the tray empties. The player is given the DEFINITION
    /// from a random card and must TYPE the term. No auto-dismiss, no
    /// multiple choice — they have to actually know it. A correct
    /// answer triggers the next 3-piece refill; a wrong one reveals
    /// the answer and offers a "Continue anyway" button (with score
    /// penalty already applied) so the game never deadlocks.
    function showRefillQuiz(card) {
      interactionLocked = true;

      clearChildren(quizOverlay);
      quizOverlay.classList.add('is-visible');
      quizOverlay.setAttribute('aria-hidden', 'false');
      quizOverlay.setAttribute('role', 'dialog');
      quizOverlay.setAttribute('aria-modal', 'true');
      quizOverlay.setAttribute('aria-label', 'Type the term to get 3 more pieces');

      const cardEl = global.app.el('div', { class: 'bb-quiz-card bb-quiz-typed' });

      cardEl.appendChild(global.app.el('div', {
        class: 'bb-quiz-label',
        text: 'Type the term to unlock 3 more pieces'
      }));

      const def = global.app.el('div', { class: 'bb-quiz-def' });
      def.textContent = card.definition || '';
      cardEl.appendChild(def);

      // Input row
      const inputWrap = global.app.el('div', { class: 'bb-quiz-input-wrap' });
      const input = global.app.el('input', {
        type: 'text',
        class: 'bb-quiz-input',
        placeholder: 'Your answer…',
        autocomplete: 'off',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        // Tell 1Password / LastPass / Bitwarden to leave this field
        // alone — password managers were popping up over the input
        // and stealing focus mid-game.
        'data-1p-ignore': 'true',
        'data-lpignore': 'true',
        'data-bwignore': 'true'
      });
      const submit = global.app.el('button', {
        class: 'btn btn-primary bb-quiz-submit',
        type: 'button',
        text: 'Submit'
      });
      inputWrap.appendChild(input);
      inputWrap.appendChild(submit);
      cardEl.appendChild(inputWrap);

      // Feedback message under input
      const feedback = global.app.el('div', { class: 'bb-quiz-feedback' });
      cardEl.appendChild(feedback);

      // Action row that swaps in after a wrong answer (Try Again /
      // Continue Anyway) so the game can't deadlock if the player
      // legitimately doesn't know the term.
      const actions = global.app.el('div', { class: 'bb-quiz-actions', style: 'display:none' });
      cardEl.appendChild(actions);

      const tip = global.app.el('div', { class: 'bb-quiz-tip' });
      tip.textContent = 'Press Enter to submit. Tab to focus the input.';
      cardEl.appendChild(tip);

      quizOverlay.appendChild(cardEl);

      // Focus input — small delay so the slide-in animation finishes
      // before iOS Safari kicks the keyboard up.
      setTimeout(function () { input.focus(); input.select(); }, 30);

      let answered = false;

      function gradeAndContinue() {
        if (answered) return;
        answered = true;
        totalAttempts++;
        const guess = input.value;
        if (isCorrectAnswer(guess, card.term)) {
          correctAttempts++;
          addScore(30);
          cardEl.classList.add('flash-green');
          feedback.textContent = '✓ Correct! +30';
          feedback.className = 'bb-quiz-feedback is-correct';
          try { global.app.sound.success(); } catch (e) {}
          announce('Correct. The term was ' + card.term);
          setTimeout(closeAndRefill, 600);
          return;
        }
        // Wrong answer — small penalty, reveal correct term, give the
        // player Try Again / Continue Anyway choices. No auto-dismiss.
        addScore(-10);
        cardEl.classList.add('flash-red');
        clearChildren(feedback);
        const wrongLine = global.app.el('div', { class: 'bb-quiz-feedback-line is-wrong' });
        wrongLine.textContent = 'Not quite. The answer was:';
        const correctLine = global.app.el('div', { class: 'bb-quiz-feedback-line is-correct-reveal' });
        correctLine.textContent = card.term;
        feedback.appendChild(wrongLine);
        feedback.appendChild(correctLine);

        try { global.app.sound.error(); } catch (e) {}
        announce('Wrong. The answer was ' + card.term);

        // Hide the submit button row; show Try Again / Continue
        inputWrap.style.display = 'none';
        actions.style.display = '';

        const tryAgain = global.app.el('button', {
          class: 'btn btn-ghost', type: 'button',
          text: 'Try Again (new card)'
        });
        tryAgain.addEventListener('click', function () {
          // Re-arm the quiz with a different card so the player can't
          // grind the same one. The score penalty stays.
          answered = false;
          input.value = '';
          inputWrap.style.display = '';
          actions.style.display = 'none';
          clearChildren(actions);
          clearChildren(feedback);
          feedback.className = 'bb-quiz-feedback';
          cardEl.classList.remove('flash-red');
          // Pick a fresh card and update the definition shown.
          const next = pickCard(validCards);
          if (next) {
            card = next;
            def.textContent = card.definition || '';
          }
          setTimeout(function () { input.focus(); }, 20);
        });

        const continueBtn = global.app.el('button', {
          class: 'btn btn-primary', type: 'button',
          text: 'Continue (no points)'
        });
        continueBtn.addEventListener('click', function () { closeAndRefill(); });

        actions.appendChild(tryAgain);
        actions.appendChild(continueBtn);
        setTimeout(function () { tryAgain.focus(); }, 30);
      }

      function closeAndRefill() {
        quizOverlay.classList.remove('is-visible');
        quizOverlay.setAttribute('aria-hidden', 'true');
        clearChildren(quizOverlay);
        interactionLocked = false;
        // NOW give the player their three new pieces.
        doActualRefill();
      }

      submit.addEventListener('click', gradeAndContinue);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          gradeAndContinue();
        }
      });
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
        // Only react to primary button (left-click on mouse) or any touch
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        // Decide how much to lift the piece based on input type.
        // Touch: 1.5 cells (so finger doesn't cover the placement).
        // Mouse / trackpad: 0 cells (cursor is exactly on the piece).
        liftCells = isTouchPointer(e) ? 1.5 : 0;
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

      // Lift the piece a small fixed amount above the pointer on touch (so a
      // finger doesn't cover what's being placed) and barely at all on mouse
      // (where a long lift makes it impossible to see what cell maps to the
      // cursor). The previous logic lifted by `(rows-1)*cell` which was very
      // confusing for tall pieces.
      const isTouchPointer = (e) => e && (e.pointerType === 'touch' || e.pointerType === 'pen');
      let liftCells = 0; // updated on pointerdown

      function positionGhost(clientX, clientY) {
        if (!dragGhost) return;
        const cellSize = getCellSize();
        const bounds = shapeBounds(piece.cells);
        const w = bounds.cols * cellSize;
        const h = bounds.rows * cellSize;
        // Center the ghost on the pointer (subtract half the bbox), then
        // lift by `liftCells` cells so the user can still see the bottom row.
        dragGhost.style.left = (clientX - w / 2) + 'px';
        dragGhost.style.top  = (clientY - h / 2 - liftCells * cellSize) + 'px';
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
        const bounds = shapeBounds(piece.cells);
        // The cursor maps to the centre of the piece's bbox (with the same
        // touch lift applied), then we convert that back to the upper-left
        // anchor cell.
        const w = bounds.cols * cellSize;
        const h = bounds.rows * cellSize;
        const bboxLeft = clientX - w / 2;
        const bboxTop  = clientY - h / 2 - liftCells * cellSize;
        const c = Math.round((bboxLeft - gridRect.left) / cellSize);
        const r = Math.round((bboxTop  - gridRect.top)  / cellSize);
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
      pendingRefill = false;
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
