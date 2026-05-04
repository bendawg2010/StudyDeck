/* ============================================================================
   StudyDeck — Results page
   ============================================================================ */
(function (global) {
  'use strict';

  function render(host) {
    const raw = sessionStorage.getItem('sd_lastResult');
    if (!raw) {
      global.app.toast('No recent results', 'error');
      global.app.navigate('#/');
      return;
    }
    let r;
    try { r = JSON.parse(raw); } catch (e) {
      global.app.navigate('#/');
      return;
    }

    const page = global.app.el('div', { class: 'page results-page' });
    host.appendChild(page);

    const modeLabel = (function () {
      switch (r.mode) {
        case 'match': return 'Match · ' + (r.setTitle || '');
        case 'blocks': return 'Falling Blocks · ' + (r.setTitle || '');
        case 'test': return 'Test · ' + (r.setTitle || '');
        case 'flashcards': return 'Flashcards · ' + (r.setTitle || '');
        default: return r.setTitle || 'Result';
      }
    })();
    page.appendChild(global.app.el('div', { class: 'results-label', text: modeLabel }));

    let bigVal = '';
    let subtitle = '';
    let isPerfect = false;
    if (r.mode === 'match') {
      bigVal = global.app.fmtDuration(r.time || 0);
      subtitle = 'Total time';
    } else if (r.mode === 'blocks') {
      bigVal = String(r.score || 0);
      subtitle = (r.score || 0) + (r.score === 1 ? ' correct match' : ' correct matches');
      if (r.score >= 20) isPerfect = true;
    } else if (r.mode === 'test') {
      bigVal = (r.score || 0) + '/' + (r.scoreMax || 0);
      subtitle = (r.accuracy || 0) + '% accuracy';
      if (r.score === r.scoreMax) isPerfect = true;
    } else {
      bigVal = String(r.score || 0);
    }
    page.appendChild(global.app.el('div', { class: 'results-big', text: bigVal }));
    page.appendChild(global.app.el('p', { class: 'results-sub', text: subtitle }));

    if (r.isBest) {
      const badge = global.app.el('div', { class: 'results-best' });
      badge.appendChild(global.app.svgIcon('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', { size: 14, weight: 1.8 }));
      badge.appendChild(document.createTextNode(' New personal best'));
      page.appendChild(badge);
    }

    // top scores
    if (r.topScores && r.topScores.length) {
      const list = global.app.el('div', { class: 'score-list' });
      list.appendChild(global.app.el('h4', { text: r.mode === 'match' ? 'Best times' : 'Top scores' }));
      r.topScores.forEach(function (s, i) {
        const row = global.app.el('div', { class: 'score-row' });
        row.appendChild(global.app.el('span', { class: 'rank', text: '#' + (i + 1) }));
        const valText = r.mode === 'match' ? global.app.fmtDuration(s.timeMs || 0) : String(s.score || 0);
        row.appendChild(global.app.el('span', { class: 'val', text: valText }));
        list.appendChild(row);
      });
      page.appendChild(list);
    }

    // missed list (test mode)
    if (r.missed && r.missed.length) {
      const wrap = global.app.el('div', { class: 'missed-list' });
      wrap.appendChild(global.app.el('h4', { class: 'rail-title', style: { textAlign: 'left' }, text: 'You missed (' + r.missed.length + ')' }));
      r.missed.forEach(function (m) {
        const row = global.app.el('div', { class: 'missed-row' });
        row.appendChild(global.app.el('div', { class: 'missed-q', text: m.prompt }));
        row.appendChild(global.app.el('div', { class: 'missed-correct', text: '✓ ' + m.correct }));
        row.appendChild(global.app.el('div', { class: 'missed-yours', text: '✗ ' + (m.user || '(no answer)') }));
        wrap.appendChild(row);
      });
      page.appendChild(wrap);
    }

    // actions
    const acts = global.app.el('div', { class: 'results-actions' });
    const playAgain = global.app.el('a', { class: 'btn btn-primary', href: r.playAgainHref || '#/', text: 'Play again' });
    const back = global.app.el('a', { class: 'btn', href: r.backHref || '#/', text: 'Back to set' });
    const home = global.app.el('a', { class: 'btn btn-ghost', href: '#/', text: 'Home' });
    acts.appendChild(playAgain);
    if (r.mode === 'test' && r.missed && r.missed.length) {
      const restudy = global.app.el('a', {
        class: 'btn',
        href: '#/play/flashcards/' + encodeURIComponent(r.setId),
        text: 'Restudy missed'
      });
      acts.appendChild(restudy);
    }
    acts.appendChild(back);
    acts.appendChild(home);
    page.appendChild(acts);

    if (isPerfect || r.isBest) {
      setTimeout(function () { global.app.confetti(80); }, 200);
    }
  }

  global.ResultsPage = { render: render };
})(window);
