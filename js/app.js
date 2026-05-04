/* ============================================================================
   StudyDeck — app shell, router, shared utils
   ============================================================================ */
(function (global) {
  'use strict';

  // ---------- DOM helpers ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') {/* explicitly forbidden — ignore */}
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }

  function svgIcon(pathD, opts) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', (opts && opts.viewBox) || '0 0 24 24');
    svg.setAttribute('width', (opts && opts.size) || 18);
    svg.setAttribute('height', (opts && opts.size) || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', (opts && opts.weight) || 2);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (Array.isArray(pathD) ? pathD : [pathD]).forEach(function (d) {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  // ---------- Sound (synthesized via WebAudio) ----------
  const SoundController = (function () {
    let _ctx = null;
    let _enabled = (function () {
      try {
        const s = localStorage.getItem('sd_sound');
        return s === null ? true : s === '1';
      } catch (e) { return true; }
    })();

    function ctx() {
      if (!_ctx) {
        const C = global.AudioContext || global.webkitAudioContext;
        if (!C) return null;
        _ctx = new C();
      }
      if (_ctx.state === 'suspended') _ctx.resume();
      return _ctx;
    }

    function tone(freq, durMs, type, gain) {
      if (!_enabled) return;
      const c = ctx();
      if (!c) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.value = 0;
      const peak = (typeof gain === 'number') ? gain : 0.18;
      const now = c.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
      osc.connect(g).connect(c.destination);
      osc.start(now);
      osc.stop(now + durMs / 1000 + 0.05);
    }

    return {
      success: function () { tone(880, 140, 'sine', 0.16); },
      error: function () { tone(220, 200, 'sawtooth', 0.12); },
      tick: function () { tone(660, 80, 'sine', 0.10); },
      pop: function () { tone(440, 50, 'square', 0.08); setTimeout(function () { tone(880, 80, 'sine', 0.10); }, 30); },
      win: function () { tone(660, 110, 'sine', 0.14); setTimeout(function () { tone(880, 110, 'sine', 0.14); }, 110); setTimeout(function () { tone(1320, 200, 'sine', 0.14); }, 220); },
      lose: function () { tone(330, 220, 'sawtooth', 0.10); setTimeout(function () { tone(220, 320, 'sawtooth', 0.10); }, 200); },
      enabled: function () { return _enabled; },
      toggle: function () {
        _enabled = !_enabled;
        try { localStorage.setItem('sd_sound', _enabled ? '1' : '0'); } catch (e) {}
        return _enabled;
      }
    };
  })();

  // ---------- Toast ----------
  function toast(message, kind) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' toast-' + kind : '');
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 2700);
  }

  // ---------- Modal ----------
  function openModal(opts) {
    const host = document.getElementById('modal-host');
    if (!host) return null;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.classList.add('is-open');
    host.setAttribute('aria-hidden', 'false');

    const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });

    const head = el('div', { class: 'modal-head' });
    head.appendChild(el('div', { class: 'modal-title', text: opts.title || '' }));
    const closeBtn = el('button', { class: 'icon-btn', 'aria-label': 'Close' });
    closeBtn.appendChild(svgIcon(['M18 6 6 18', 'M6 6l12 12'], { weight: 2.4 }));
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);
    modal.appendChild(head);

    const body = el('div', { class: 'modal-body' });
    if (opts.body instanceof Node) body.appendChild(opts.body);
    else if (typeof opts.body === 'string') body.textContent = opts.body;
    modal.appendChild(body);

    if (opts.actions && opts.actions.length) {
      const foot = el('div', { class: 'modal-foot' });
      opts.actions.forEach(function (a) {
        const btn = el('button', {
          class: 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'),
          text: a.label
        });
        btn.addEventListener('click', function () {
          if (typeof a.onClick === 'function') {
            const r = a.onClick();
            if (r && r.then) r.then(function (v) { if (v !== false) close(); });
            else if (r !== false) close();
          } else close();
        });
        foot.appendChild(btn);
      });
      modal.appendChild(foot);
    }

    host.appendChild(modal);

    function onHostClick(e) { if (e.target === host) close(); }
    host.addEventListener('click', onHostClick);

    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      host.classList.remove('is-open');
      host.setAttribute('aria-hidden', 'true');
      while (host.firstChild) host.removeChild(host.firstChild);
      host.removeEventListener('click', onHostClick);
      document.removeEventListener('keydown', onKey);
    }

    return { close: close, body: body };
  }

  // ---------- Popover ----------
  function openPopover(anchorEl, items) {
    closeAllPopovers();
    const r = anchorEl.getBoundingClientRect();
    const pop = el('div', { class: 'popover', role: 'menu' });
    items.forEach(function (it) {
      if (it.divider) {
        pop.appendChild(el('div', { class: 'popover-divider' }));
        return;
      }
      const b = el('button', {
        class: 'popover-item' + (it.danger ? ' is-danger' : '') + (it.submenu ? ' has-submenu' : ''),
        role: 'menuitem',
        text: it.label
      });
      if (it.submenu) {
        const sub = el('div', { class: 'popover submenu' });
        it.submenu.forEach(function (s) {
          const sb = el('button', { class: 'popover-item', text: s.label });
          sb.addEventListener('click', function (e) {
            e.stopPropagation();
            closeAllPopovers();
            if (typeof s.onClick === 'function') s.onClick();
          });
          sub.appendChild(sb);
        });
        b.appendChild(sub);
      } else if (typeof it.onClick === 'function') {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          closeAllPopovers();
          it.onClick();
        });
      }
      pop.appendChild(b);
    });
    document.body.appendChild(pop);

    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = r.right - w;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + w > global.innerWidth - 8) left = global.innerWidth - w - 8;
    if (top + h > global.innerHeight - 8) top = r.top - h - 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    setTimeout(function () {
      document.addEventListener('click', closeAllPopovers, { once: true });
    }, 0);
  }
  function closeAllPopovers() {
    Array.prototype.forEach.call(document.querySelectorAll('.popover'), function (p) { p.remove(); });
  }

  // ---------- Confetti ----------
  function confetti(count) {
    const host = el('div', { class: 'confetti-host' });
    document.body.appendChild(host);
    const colors = ['#FFB454', '#FF6B6B', '#C147FF', '#34C759', '#5E5CE6', '#FF4FA3'];
    const n = count || 60;
    for (let i = 0; i < n; i++) {
      const c = el('div', { class: 'confetti' });
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      c.style.animationDuration = (2.4 + Math.random() * 1.4) + 's';
      c.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      c.style.width = (6 + Math.random() * 8) + 'px';
      c.style.height = (10 + Math.random() * 8) + 'px';
      host.appendChild(c);
    }
    setTimeout(function () { host.remove(); }, 4500);
  }

  // ---------- helpers ----------
  function fmtTime(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    const day = Math.floor(hr / 24);
    if (day < 7) return day + 'd ago';
    const wk = Math.floor(day / 7);
    if (wk < 4) return wk + 'w ago';
    const d = new Date(ts);
    return d.toLocaleDateString();
  }

  function fmtDuration(ms) {
    const totalCs = Math.floor(ms / 10);
    const cs = totalCs % 100;
    const totalSec = Math.floor(totalCs / 100);
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60);
    return (min < 10 ? '0' + min : min) + ':' + (sec < 10 ? '0' + sec : sec) + '.' + (cs < 10 ? '0' + cs : cs);
  }

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function pickRandom(arr, n) {
    const s = shuffle(arr);
    return s.slice(0, n);
  }

  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const v0 = new Array(b.length + 1);
    const v1 = new Array(b.length + 1);
    for (let i = 0; i <= b.length; i++) v0[i] = i;
    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
    }
    return v1[b.length];
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  function parseTermDefText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const out = [];
    lines.forEach(function (ln) {
      const t = ln.trim();
      if (!t) return;
      let parts = null;
      if (t.indexOf('\t') >= 0) parts = t.split(/\t+/);
      else if (t.indexOf(' — ') >= 0) parts = t.split(/\s+—\s+/);
      else if (t.indexOf(' - ') >= 0) parts = t.split(/\s+-\s+/);
      else if (t.indexOf(' : ') >= 0) parts = t.split(/\s+:\s+/);
      else if (t.indexOf('::') >= 0) parts = t.split(/::/);
      if (parts && parts.length >= 2) {
        out.push({ term: parts[0].trim(), definition: parts.slice(1).join(' - ').trim() });
      }
    });
    return out;
  }

  // ---------- Router ----------
  const routes = [
    { match: /^#\/$/,                          handler: function () { return pages.home.render(getHost()); } },
    { match: /^#\/set\/([^/]+)$/,              handler: function (m) { return pages.setEditor.render(getHost(), m[1]); } },
    { match: /^#\/play\/flashcards\/([^/]+)$/, handler: function (m) { return pages.flashcards.render(getHost(), m[1]); } },
    { match: /^#\/play\/match\/([^/]+)$/,      handler: function (m) { return pages.match.render(getHost(), m[1]); } },
    { match: /^#\/play\/blocks\/([^/]+)$/,     handler: function (m) { return pages.blocks.render(getHost(), m[1]); } },
    { match: /^#\/play\/blockblast\/([^/]+)$/, handler: function (m) { return pages.blockblast.render(getHost(), m[1]); } },
    { match: /^#\/play\/test\/([^/]+)$/,       handler: function (m) { return pages.test.render(getHost(), m[1]); } },
    { match: /^#\/results$/,                   handler: function () { return pages.results.render(getHost()); } },
    { match: /^#\/import-quizlet/,             handler: function () { return pages.home.renderQuizletLanding(getHost()); } }
  ];

  function getHost() {
    return document.getElementById('app');
  }

  let _currentTeardown = null;

  async function renderRoute() {
    const hash = global.location.hash || '#/';
    const host = getHost();
    if (!host) return;
    if (typeof _currentTeardown === 'function') {
      try { _currentTeardown(); } catch (e) {}
      _currentTeardown = null;
    }
    while (host.firstChild) host.removeChild(host.firstChild);
    closeAllPopovers();

    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const m = hash.match(r.match);
      if (m) {
        try {
          const td = await r.handler(m);
          if (typeof td === 'function') _currentTeardown = td;
          return;
        } catch (e) {
          console.error('route error', e);
          toast('Something went wrong loading that page', 'error');
          global.location.hash = '#/';
          return;
        }
      }
    }
    global.location.hash = '#/';
  }

  function navigate(path) {
    if (global.location.hash === path) renderRoute();
    else global.location.hash = path;
  }

  // ---------- Pages namespace ----------
  const pages = {};

  // ---------- Sound toggle UI ----------
  function setupSoundToggle() {
    const btn = document.getElementById('sound-toggle');
    if (!btn) return;
    function paint() {
      btn.classList.toggle('is-muted', !SoundController.enabled());
      btn.setAttribute('aria-pressed', SoundController.enabled() ? 'false' : 'true');
      btn.title = SoundController.enabled() ? 'Sound on (click to mute)' : 'Sound off (click to enable)';
    }
    paint();
    btn.addEventListener('click', function () {
      SoundController.toggle();
      paint();
      toast('Sound ' + (SoundController.enabled() ? 'on' : 'off'));
    });
  }

  // ---------- expose ----------
  global.app = {
    sound: SoundController,
    toast: toast,
    el: el,
    svgIcon: svgIcon,
    openModal: openModal,
    openPopover: openPopover,
    confetti: confetti,
    fmtTime: fmtTime,
    fmtDuration: fmtDuration,
    shuffle: shuffle,
    pickRandom: pickRandom,
    debounce: debounce,
    levenshtein: levenshtein,
    downloadJSON: downloadJSON,
    parseTermDefText: parseTermDefText,
    navigate: navigate,
    closeAllPopovers: closeAllPopovers
  };

  // ---------- bootstrap ----------
  document.addEventListener('DOMContentLoaded', async function () {
    setupSoundToggle();
    // bind page modules now that they've all loaded
    pages.home = global.HomePage;
    pages.setEditor = global.SetEditorPage;
    pages.flashcards = global.FlashcardsPage;
    pages.match = global.MatchPage;
    pages.blocks = global.BlocksPage;
    pages.blockblast = global.BlockBlastPage;
    pages.test = global.TestPage;
    pages.results = global.ResultsPage;

    try {
      await db.open();
      const seeded = await sampleData.seedIfEmpty();
      if (seeded) console.log('[StudyDeck] seeded sample sets');
    } catch (e) {
      console.error('init', e);
      toast('Could not open local storage', 'error');
    }
    if (!global.location.hash || global.location.hash === '') global.location.hash = '#/';
    renderRoute();
    global.addEventListener('hashchange', renderRoute);
  });

})(window);
