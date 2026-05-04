/* ============================================================================
   StudyDeck — Test mode
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

    const page = global.app.el('div', { class: 'page test-page' });
    host.appendChild(page);

    // build questions
    const total = Math.min(20, allCards.length);
    const pool = global.app.shuffle(allCards.slice());
    const subset = pool.slice(0, total);
    const questions = subset.map(function (c, i) {
      const r = i / total;
      let type;
      if (r < 0.5) type = 'mc';
      else if (r < 0.75) type = 'tf';
      else type = 'write';
      return buildQuestion(type, c, allCards);
    });

    // top bar
    const bar = global.app.el('div', { class: 'match-bar' });
    page.appendChild(bar);

    const left = global.app.el('div', { class: 'center-row' });
    left.appendChild(global.app.el('a', { class: 'btn btn-ghost', href: '#/set/' + encodeURIComponent(setId), text: '✕ Exit' }));
    bar.appendChild(left);
    bar.appendChild(global.app.el('div', { class: 'section-title', text: set.title || 'Test' }));
    const counter = global.app.el('div', { class: 'match-timer', style: { fontSize: '14px', padding: '8px 14px' }, text: '1 / ' + total });
    bar.appendChild(counter);

    // progress dots
    const progress = global.app.el('div', { class: 'test-progress' });
    page.appendChild(progress);
    const pdots = [];
    for (let i = 0; i < total; i++) {
      const d = global.app.el('div', { class: 'test-pdot' });
      progress.appendChild(d);
      pdots.push(d);
    }

    const card = global.app.el('div', { class: 'test-card' });
    page.appendChild(card);

    let idx = 0;
    const answers = []; // { correct: bool, userAnswer, q }

    function paint() {
      counter.textContent = (idx + 1) + ' / ' + total;
      pdots.forEach(function (d, i) {
        d.classList.remove('is-current', 'is-correct', 'is-wrong');
        if (i < answers.length) d.classList.add(answers[i].correct ? 'is-correct' : 'is-wrong');
        else if (i === idx) d.classList.add('is-current');
      });
      while (card.firstChild) card.removeChild(card.firstChild);
      const q = questions[idx];
      const labelMap = { mc: 'Multiple choice', tf: 'True or false', write: 'Write the term' };
      card.appendChild(global.app.el('div', { class: 'test-q-label', text: labelMap[q.type] || '' }));
      card.appendChild(global.app.el('div', { class: 'test-prompt', text: q.prompt }));

      let answered = false;
      const optsWrap = global.app.el('div', { class: q.type === 'tf' ? 'test-tf' : 'test-options' });
      card.appendChild(optsWrap);

      // feedback
      const feedback = global.app.el('div', { class: 'test-feedback' });
      const msg = global.app.el('div', { class: 'test-feedback-msg', text: '' });
      const nextBtn = global.app.el('button', { class: 'btn btn-primary', text: idx === total - 1 ? 'Finish' : 'Next →' });
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.4';
      feedback.appendChild(msg);
      feedback.appendChild(nextBtn);
      card.appendChild(feedback);

      function lockOptions() {
        Array.prototype.forEach.call(optsWrap.querySelectorAll('button'), function (b) { b.disabled = true; });
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
      }

      function record(correct, userAnswer) {
        if (answered) return;
        answered = true;
        answers.push({ correct: correct, userAnswer: userAnswer, q: q });
        if (correct) {
          msg.textContent = 'Correct';
          msg.className = 'test-feedback-msg is-correct';
          global.app.sound.success();
        } else {
          msg.textContent = 'Wrong — answer: ' + q.correctText;
          msg.className = 'test-feedback-msg is-wrong';
          global.app.sound.error();
        }
        lockOptions();
      }

      if (q.type === 'mc') {
        q.options.forEach(function (opt, i) {
          const btn = global.app.el('button', { class: 'test-opt' });
          btn.appendChild(global.app.el('span', { class: 'test-opt-key', text: String(i + 1) }));
          btn.appendChild(global.app.el('span', { text: opt.text }));
          btn.addEventListener('click', function () {
            if (answered) return;
            if (opt.correct) btn.classList.add('is-correct');
            else {
              btn.classList.add('is-wrong');
              // also reveal correct
              Array.prototype.forEach.call(optsWrap.children, function (n, j) {
                if (q.options[j].correct) n.classList.add('is-correct');
              });
            }
            record(opt.correct, opt.text);
          });
          optsWrap.appendChild(btn);
        });
      } else if (q.type === 'tf') {
        ['True', 'False'].forEach(function (label, i) {
          const btn = global.app.el('button', { class: 'test-opt', text: label });
          btn.addEventListener('click', function () {
            if (answered) return;
            const userTrue = i === 0;
            const correct = userTrue === q.isTrue;
            if (correct) btn.classList.add('is-correct');
            else {
              btn.classList.add('is-wrong');
              const otherIdx = i === 0 ? 1 : 0;
              const other = optsWrap.children[otherIdx];
              if (other) other.classList.add('is-correct');
            }
            record(correct, label);
          });
          optsWrap.appendChild(btn);
        });
      } else if (q.type === 'write') {
        const inputEl = global.app.el('input', {
          class: 'test-write-input',
          type: 'text',
          placeholder: 'Type the term…',
          autocomplete: 'off',
          autocapitalize: 'off',
          autocorrect: 'off',
          spellcheck: 'false',
          'aria-label': 'Your answer'
        });
        const submit = global.app.el('button', { class: 'btn btn-primary', text: 'Submit' });
        const wrap = global.app.el('div', { class: 'test-write' });
        wrap.appendChild(inputEl);
        wrap.appendChild(submit);
        optsWrap.appendChild(wrap);

        function check() {
          if (answered) return;
          const val = inputEl.value.trim();
          if (!val) return;
          const correct = isCloseEnough(val, q.correctText);
          if (correct) inputEl.classList.add('is-correct');
          else inputEl.classList.add('is-wrong');
          inputEl.disabled = true;
          submit.disabled = true;
          record(correct, val);
        }
        submit.addEventListener('click', check);
        inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); check(); }
        });
        setTimeout(function () { inputEl.focus(); }, 30);
      }

      nextBtn.addEventListener('click', function () {
        if (!answered) return;
        idx += 1;
        if (idx >= total) finish();
        else paint();
      });
    }

    function onKey(e) {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        // allow Enter handlers locally
        return;
      }
      const q = questions[idx];
      if (!q) return;
      if (q.type === 'mc') {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= q.options.length) {
          e.preventDefault();
          const btn = card.querySelectorAll('.test-opt')[n - 1];
          if (btn && !btn.disabled) btn.click();
        }
      } else if (q.type === 'tf') {
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          const btn = card.querySelectorAll('.test-opt')[0];
          if (btn && !btn.disabled) btn.click();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          const btn = card.querySelectorAll('.test-opt')[1];
          if (btn && !btn.disabled) btn.click();
        }
      }
      if (e.key === 'Enter') {
        const btn = card.querySelector('.test-feedback .btn-primary');
        if (btn && !btn.disabled) btn.click();
      }
    }
    document.addEventListener('keydown', onKey);

    async function finish() {
      const correctCount = answers.filter(function (a) { return a.correct; }).length;
      const score = Math.round((correctCount / total) * 100);
      await db.recordScore(setId, 'test', score, 0);
      const top = await db.topScores(setId, 'test', 5);
      const isBest = top.length && top[0].score === score && score > 0;

      const missed = answers
        .map(function (a, i) {
          if (a.correct) return null;
          return { prompt: a.q.prompt, correct: a.q.correctText, user: a.userAnswer, idx: i + 1 };
        })
        .filter(function (m) { return !!m; });

      sessionStorage.setItem('sd_lastResult', JSON.stringify({
        mode: 'test',
        setId: setId,
        setTitle: set.title || 'Test',
        time: null,
        score: correctCount,
        scoreMax: total,
        accuracy: score,
        isBest: !!isBest,
        topScores: top.map(function (s) { return { score: s.score, completedAt: s.completedAt }; }),
        backHref: '#/set/' + encodeURIComponent(setId),
        playAgainHref: '#/play/test/' + encodeURIComponent(setId),
        missed: missed,
        // a list of card ids the user missed, for "Restudy missed"
        missedTermSetId: setId
      }));
      if (correctCount === total) global.app.sound.win();
      else global.app.sound.success();
      global.app.navigate('#/results');
    }

    paint();

    return function teardown() {
      document.removeEventListener('keydown', onKey);
    };
  }

  function buildQuestion(type, target, all) {
    const distractors = all.filter(function (c) { return c.id !== target.id; });
    if (type === 'mc') {
      const opts = global.app.pickRandom(distractors, 3).map(function (c) {
        return { text: c.term, correct: false };
      });
      opts.push({ text: target.term, correct: true });
      const shuffled = global.app.shuffle(opts);
      return {
        type: 'mc',
        prompt: target.definition,
        options: shuffled,
        correctText: target.term
      };
    } else if (type === 'tf') {
      const isTrue = Math.random() < 0.5;
      let shownTerm = target.term;
      let shownDef = target.definition;
      if (!isTrue) {
        const wrong = distractors[Math.floor(Math.random() * distractors.length)];
        shownDef = wrong ? wrong.definition : target.definition;
      }
      return {
        type: 'tf',
        prompt: '"' + shownTerm + '" means: ' + shownDef,
        isTrue: isTrue,
        correctText: isTrue ? 'True (it does mean: ' + target.definition + ')' : 'False (it actually means: ' + target.definition + ')'
      };
    } else { // write
      return {
        type: 'write',
        prompt: target.definition,
        correctText: target.term
      };
    }
  }

  function isCloseEnough(user, correct) {
    const u = (user || '').trim().toLowerCase();
    const c = (correct || '').trim().toLowerCase();
    if (!u || !c) return false;
    if (u === c) return true;
    // accept "to <verb>" matching just verb, etc — alternatively strip leading "to " or "the "
    const stripA = u.replace(/^(to|the|a|an)\s+/, '');
    const stripB = c.replace(/^(to|the|a|an)\s+/, '');
    if (stripA === stripB) return true;
    if (c.length >= 6) {
      const dist = global.app.levenshtein(u, c);
      if (dist <= 2) return true;
    }
    return false;
  }

  global.TestPage = { render: render };
})(window);
