(function () {
  const app = document.getElementById('app');
  let hunt, salt, storeKey, state, timerId;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function save() {
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* private mode: progress just won't persist */ }
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(storeKey)); } catch (e) { return null; }
  }

  function fmtDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function header() {
    const total = hunt.total + 1;
    let dots = '';
    for (let i = 0; i < total; i++) {
      const isFinal = i === total - 1;
      dots += `<div class="dot${isFinal ? ' final' : ''}${i < state.log.length ? ' on' : ''}"></div>`;
    }
    const timer = state.startedAt ? `<div class="timer" id="timer">⏱ ${fmtDuration((state.finishedAt || Date.now()) - state.startedAt)}</div>` : '';
    return `
      <div class="top">
        <div>
          <div class="eyebrow">${esc(hunt.title || 'Bar Hunt')}</div>
          <h1>${esc(hunt.team)}</h1>
        </div>
        ${timer}
      </div>
      <div class="dots" aria-label="${state.log.length} of ${total} bars found">${dots}</div>`;
  }

  function journey() {
    if (!state.log.length) return '';
    const items = state.log.map((l, i) => `<li><span>${i + 1}. ${esc(l.bar)}</span><span class="t">${fmtClock(l.at)}</span></li>`).join('');
    return `<div class="card"><h3>Bars you've found</h3><ul class="journey">${items}</ul></div>`;
  }

  function footer() {
    return `<div class="footer-links"><button class="linkish" data-act="reset">Start over on this phone</button></div>`;
  }

  function startTimer() {
    clearInterval(timerId);
    if (!state.startedAt || state.finishedAt) return;
    timerId = setInterval(() => {
      const el = document.getElementById('timer');
      if (el) el.textContent = '⏱ ' + fmtDuration(Date.now() - state.startedAt);
    }, 1000);
  }

  function render() {
    let body;
    if (!state.startedAt) body = viewStart();
    else if (state.arrived) body = viewArrived();
    else if (state.done) body = viewDone();
    else body = viewClue();
    app.innerHTML = header() + body + (state.startedAt && !state.done ? journey() + footer() : '');
    startTimer();
    const input = app.querySelector('input.answer-input');
    if (input && !matchMedia('(pointer: coarse)').matches) input.focus();
  }

  function viewStart() {
    return `
      <div class="card pop center">
        <div class="big-emoji">🍻</div>
        <h2>Ready, ${esc(hunt.team)}?</h2>
        <p class="muted">Each clue leads to a bar. When you get there, enter the answer to unlock your next clue. You have ${hunt.total} bar${hunt.total === 1 ? '' : 's'} to find, then one final destination.</p>
        <button class="btn primary block" data-act="start">Reveal the first clue</button>
      </div>`;
  }

  function viewClue() {
    const c = state.clue;
    const isFinal = !!c.final;
    const label = isFinal ? 'Final clue' : `Clue ${state.step + 1} of ${hunt.total}`;
    const hasCheck = state.step < hunt.stops.length;
    const hint = c.hint
      ? (state.hintShown
        ? `<div class="hint">💡 ${esc(c.hint)}</div>`
        : `<div style="margin-top:14px"><button class="btn sm ghost" data-act="hint">💡 Need a hint?</button></div>`)
      : '';
    const check = hasCheck ? `
      <div class="card">
        <h3>${isFinal ? 'Made it to the last stop?' : 'Found the bar?'}</h3>
        <p class="muted small">Enter the answer once you're there.</p>
        <form id="answer-form" class="stack" autocomplete="off">
          <input class="answer-input" name="answer" type="text" placeholder="Your answer" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Your answer">
          <button class="btn primary block" type="submit">Check answer</button>
        </form>
        <p class="feedback" id="feedback" aria-live="polite"></p>
      </div>` : `
      <div class="card"><button class="btn pink block" data-act="finish">We made it! 🎉</button></div>`;
    return `
      <div class="card clue-card pop${isFinal ? ' final' : ''}">
        <div class="eyebrow" ${isFinal ? 'style="color:var(--pink)"' : ''}>${label}</div>
        <p class="clue-text">${esc(c.clue)}</p>
        ${hint}
      </div>
      ${check}`;
  }

  function viewArrived() {
    const a = state.arrived;
    const nextLabel = state.done ? 'See results' : state.clue && state.clue.final ? 'Get the final clue' : 'Get the next clue';
    return `
      <div class="card pop center">
        <div class="big-emoji">${state.done ? '🏆' : '✅'}</div>
        <div class="muted">You found</div>
        <div class="found">${esc(a.bar)}</div>
        ${a.msg ? `<div class="card msg" style="background:var(--bg-2)">${esc(a.msg)}</div>` : ''}
        <button class="btn primary block" style="margin-top:16px" data-act="continue">${nextLabel} →</button>
      </div>`;
  }

  function viewDone() {
    const total = state.finishedAt - state.startedAt;
    const items = state.log.map((l, i) => `<li><span>${i === state.log.length - 1 && state.log.length > hunt.total ? '🏁' : i + 1 + '.'} ${esc(l.bar)}</span><span class="t">${fmtClock(l.at)}</span></li>`).join('');
    return `
      <div class="card pop center">
        <div class="big-emoji">🏆</div>
        <h2>Hunt complete!</h2>
        <div class="muted small">Finished at ${fmtClock(state.finishedAt)} · total time</div>
        <div class="stat" style="margin:6px 0 4px">${fmtDuration(total)}</div>
        <p class="muted small">Show this screen to your host.</p>
      </div>
      <div class="card"><h3>Your route</h3><ul class="journey">${items}</ul></div>
      ${footer()}`;
  }

  async function submitAnswer(form, items, onOpen) {
    const input = form.querySelector('input');
    const btn = form.querySelector('button');
    const fb = document.getElementById('feedback');
    const guess = input.value;
    if (!Hunt.normalize(guess)) { input.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const result = await Hunt.open(items, guess, salt);
    if (result) {
      if (navigator.vibrate) navigator.vibrate(60);
      onOpen(result);
      return;
    }
    btn.disabled = false;
    btn.textContent = 'Check answer';
    fb.textContent = ['Not quite. Try again!', 'Nope, keep looking.', 'Not it. Check the clue again.'][Math.floor(Math.random() * 3)];
    fb.className = 'feedback bad';
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    input.select();
  }

  function handleStop(p) {
    const now = Date.now();
    state.log.push({ bar: p.bar, at: now });
    state.arrived = { bar: p.bar, msg: p.msg };
    state.hintShown = false;
    state.step++;
    if (p.done) {
      state.done = true;
      state.finishedAt = now;
      state.clue = null;
    } else {
      state.clue = p.next;
    }
    save();
    render();
    window.scrollTo(0, 0);
  }

  app.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'answer-form') {
      submitAnswer(e.target, hunt.stops[state.step], handleStop);
    }
  });

  app.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    switch (act.dataset.act) {
      case 'start':
        state.startedAt = Date.now();
        break;
      case 'hint':
        state.hintShown = true;
        break;
      case 'continue':
        state.arrived = null;
        window.scrollTo(0, 0);
        break;
      case 'finish': {
        const now = Date.now();
        state.log.push({ bar: 'Final destination', at: now });
        state.done = true;
        state.finishedAt = now;
        break;
      }
      case 'reset':
        if (!confirm('Erase your progress on this phone and start from the first clue?')) return;
        state = fresh();
        break;
      default:
        return;
    }
    save();
    render();
  });

  function fresh() {
    return { step: 0, clue: hunt.first, log: [], startedAt: null, finishedAt: null, arrived: null, done: false, hintShown: false };
  }

  function fail(msg) {
    app.innerHTML = `
      <div class="card center" style="margin-top:12vh">
        <div class="big-emoji">🧭</div>
        <h2>No hunt found</h2>
        <p class="muted">${esc(msg)}</p>
        <a class="btn primary block" href="./">Go to the start page</a>
      </div>`;
  }

  async function init() {
    const data = location.hash.slice(1);
    if (!data) return fail('Open the team link your host sent you.');
    try {
      hunt = await Hunt.unpack(data);
      salt = Hunt.fromB64(hunt.salt);
    } catch (e) {
      return fail(e.message.includes('too old') ? e.message : 'This link looks broken or incomplete. Ask your host to send it again.');
    }
    document.title = `${hunt.team} · ${hunt.title || 'Bar Hunt'}`;
    storeKey = 'hunt:' + Hunt.hashString(data);
    try { localStorage.setItem('hunt:last', JSON.stringify({ url: location.href, team: hunt.team, title: hunt.title })); } catch (e) { /* ignore */ }
    state = load() || fresh();
    render();
  }

  window.addEventListener('hashchange', () => location.reload());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  init();
})();
