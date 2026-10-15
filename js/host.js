(function () {
  const STORE = 'hunt-builder:v1';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'b' + Math.random().toString(36).slice(2, 9);

  let state;
  let linksMade = false;

  function blankBar() {
    return { id: uid(), name: '', clue: '', hint: '', answers: '', msg: '' };
  }

  function defaults() {
    const bars = [blankBar(), blankBar(), blankBar()];
    const s = {
      title: '',
      bars,
      final: { name: '', clue: '', hint: '', answers: '', msg: '' },
      stopsPerTeam: bars.length,
      geoRadiusFt: 330,
      backupCode: '',
      teams: [1, 2, 3].map((n) => ({ name: 'Team ' + n, route: [] })),
    };
    stagger(s);
    return s;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      return valid(s) ? s : null;
    } catch (e) { return null; }
  }

  function valid(s) {
    return s && Array.isArray(s.bars) && Array.isArray(s.teams) && s.final && typeof s.final === 'object';
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function barById(id) { return state.bars.find((b) => b.id === id); }
  function barLabel(bar) { return bar ? (bar.name.trim() || `Bar ${state.bars.indexOf(bar) + 1} (unnamed)`) : '?'; }

  function clampStops(s) {
    s.stopsPerTeam = Math.max(1, Math.min(s.bars.length || 1, parseInt(s.stopsPerTeam, 10) || s.bars.length));
  }

  // Team i starts at bar i and follows the bar list in a loop.
  function stagger(s) {
    clampStops(s);
    const ids = s.bars.map((b) => b.id);
    s.teams.forEach((t, i) => {
      const start = ids.length ? i % ids.length : 0;
      t.route = ids.slice(start).concat(ids.slice(0, start)).slice(0, s.stopsPerTeam);
    });
  }

  function shuffle(s) {
    clampStops(s);
    const ids = s.bars.map((b) => b.id);
    s.teams.forEach((t) => {
      const a = ids.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      t.route = a.slice(0, s.stopsPerTeam);
    });
  }

  function changed() {
    save();
    if (linksMade) $('links-wrap').classList.add('links-stale');
    clearTimeout(changed.t);
    changed.t = setTimeout(renderWarnings, 250);
  }

  // ---------- Rendering ----------

  function barFields(bar, isFinal) {
    const key = isFinal ? 'final' : bar.id;
    const f = (field, label, ph, type) => type === 'area'
      ? `<label class="field"><span>${label}</span><textarea data-bar="${key}" data-field="${field}" placeholder="${esc(ph)}" rows="3">${esc(bar[field])}</textarea></label>`
      : `<label class="field"><span>${label}</span><input type="text" data-bar="${key}" data-field="${field}" placeholder="${esc(ph)}" value="${esc(bar[field])}"></label>`;
    return `
      <div class="stack">
        ${f('clue', isFinal ? 'Final clue (leads to this bar)' : 'Clue that leads to this bar', isFinal ? 'Where the night ends: look for the neon flamingo…' : 'Where the pirates drink and the jukebox only plays sea shanties…', 'area')}
        <div class="grid2">
          ${f('answers', isFinal ? 'Answer(s) at the final bar (optional)' : 'Answer(s) they enter when they arrive', 'e.g. Anchor, The Anchor')}
          ${f('hint', 'Hint (optional)', 'It’s on Main Street')}
        </div>
        ${f('msg', 'Message when they arrive (optional)', isFinal ? 'You made it! First round is on the host.' : 'Order the house special and take a team photo.', 'area')}
        <div>
          <div class="loc-row">
            ${f('loc', 'Location for check-in (optional)', '42.3613, -71.0572 or a Google Maps link')}
            <button class="btn sm" data-act="here" data-bar="${key}" type="button">📍 Use my location</button>
          </div>
          <div class="loc-status" data-loc-status="${key}">${locStatus(bar.loc)}</div>
        </div>
      </div>`;
  }

  function locStatus(text) {
    if (!String(text || '').trim()) return '<span class="muted">Leave blank to only check the answer here.</span>';
    const loc = Hunt.parseLoc(text);
    if (!loc) return '<span class="bad">Couldn’t read that. Paste numbers like 42.3613, -71.0572.</span>';
    return `<span class="good">✓ ${loc[0]}, ${loc[1]}</span> · <a href="https://www.google.com/maps?q=${loc[0]},${loc[1]}" target="_blank" rel="noopener">Check on map</a>`;
  }

  function updateLocStatus(key) {
    const bar = key === 'final' ? state.final : barById(key);
    const el = document.querySelector(`[data-loc-status="${key}"]`);
    if (bar && el) el.innerHTML = locStatus(bar.loc);
  }

  function renderGeo() {
    $('geo-radius').value = state.geoRadiusFt || 330;
    $('backup-code').value = state.backupCode || '';
  }

  function renderBars() {
    $('bars').innerHTML = state.bars.map((bar, i) => `
      <div class="card bar-card" data-id="${bar.id}">
        <div class="head">
          <span class="tag">Bar ${i + 1}</span>
          <input type="text" data-bar="${bar.id}" data-field="name" placeholder="Bar name" value="${esc(bar.name)}" aria-label="Bar ${i + 1} name">
          <button class="btn icon danger" data-act="remove-bar" data-id="${bar.id}" title="Remove bar" aria-label="Remove bar ${i + 1}">✕</button>
        </div>
        ${barFields(bar, false)}
      </div>`).join('') || '<div class="card muted center">No bars yet. Add one to get started.</div>';
  }

  function renderFinal() {
    const f = state.final;
    $('final').innerHTML = `
      <div class="card bar-card final">
        <div class="head">
          <span class="tag">★ Final</span>
          <input type="text" data-bar="final" data-field="name" placeholder="Final bar name" value="${esc(f.name)}" aria-label="Final bar name">
        </div>
        ${barFields(f, true)}
      </div>`;
  }

  function renderTeams() {
    $('team-count').value = state.teams.length;
    $('stops-per-team').value = state.stopsPerTeam;
    $('stops-per-team').max = Math.max(1, state.bars.length);
    const finalName = state.final.name.trim() || 'Final bar';
    $('teams').innerHTML = `<div class="grid2">${state.teams.map((t, ti) => {
      const remaining = state.bars.filter((b) => !t.route.includes(b.id));
      const items = t.route.map((id, si) => `
        <li>
          <span class="name">${esc(barLabel(barById(id)))}</span>
          <button class="btn icon ghost" data-act="up" data-team="${ti}" data-stop="${si}" ${si === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn icon ghost" data-act="down" data-team="${ti}" data-stop="${si}" ${si === t.route.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn icon danger" data-act="drop" data-team="${ti}" data-stop="${si}" aria-label="Remove from route">✕</button>
        </li>`).join('');
      const add = remaining.length
        ? `<select data-act="add-stop" data-team="${ti}" aria-label="Add a bar to ${esc(t.name)}"><option value="">+ Add a bar…</option>${remaining.map((b) => `<option value="${b.id}">${esc(barLabel(b))}</option>`).join('')}</select>`
        : '';
      return `
        <div class="card team-card">
          <label class="field"><span>Team ${ti + 1} name</span><input type="text" data-team-name="${ti}" value="${esc(t.name)}" placeholder="Team ${ti + 1}"></label>
          <ol class="route">${items}<li class="final-stop"><span class="name">${esc(finalName)}</span></li></ol>
          ${add}
        </div>`;
    }).join('')}</div>`;
  }

  function problems() {
    const errs = [];
    const notes = [];
    if (!state.bars.length) errs.push('Add at least one bar.');
    state.bars.forEach((b, i) => {
      const label = b.name.trim() || `Bar ${i + 1}`;
      if (!b.name.trim()) errs.push(`Bar ${i + 1} needs a name.`);
      if (!b.clue.trim()) errs.push(`${label} needs a clue.`);
      if (!Hunt.splitAnswers(b.answers).length) errs.push(`${label} needs at least one answer.`);
    });
    if (!state.final.name.trim()) errs.push('The final bar needs a name.');
    if (!state.final.clue.trim()) errs.push('The final bar needs a clue.');
    const all = state.bars.concat([state.final]);
    all.forEach((b, i) => {
      if (String(b.loc || '').trim() && !Hunt.parseLoc(b.loc)) errs.push(`${b.name.trim() || (b === state.final ? 'The final bar' : `Bar ${i + 1}`)}: couldn’t read the location.`);
    });
    const located = all.filter((b) => Hunt.parseLoc(b.loc)).length;
    if (located && located < all.length) notes.push(`${located} of ${all.length} bars have a location. At the others, teams only need the answer.`);
    if (located && !Hunt.splitAnswers(state.backupCode).length) notes.push('Add a backup code in case a team’s GPS won’t work inside a bar.');
    if (!Hunt.splitAnswers(state.final.answers).length) notes.push('The final bar has no answer, so teams will tap “We made it!” when they arrive.');

    const names = new Map();
    state.teams.forEach((t, i) => {
      const n = t.name.trim() || `Team ${i + 1}`;
      if (!t.route.length) errs.push(`${n} has no bars in its route.`);
      const k = n.toLowerCase();
      if (names.has(k)) errs.push(`Two teams are called “${n}”.`);
      names.set(k, true);
    });

    // Two teams at the same bar at the same step will run into each other.
    const maxLen = Math.max(0, ...state.teams.map((t) => t.route.length));
    for (let step = 0; step < maxLen; step++) {
      const at = new Map();
      state.teams.forEach((t, i) => {
        const id = t.route[step];
        if (!id) return;
        if (!at.has(id)) at.set(id, []);
        at.get(id).push(t.name.trim() || `Team ${i + 1}`);
      });
      at.forEach((teams, id) => {
        if (teams.length > 1) notes.push(`${teams.join(' & ')} are ${teams.length === 2 ? 'both' : 'all'} at ${barLabel(barById(id))} for stop ${step + 1}.`);
      });
    }
    return { errs, notes };
  }

  function renderWarnings() {
    const { errs, notes } = problems();
    let html = '';
    if (errs.length) html += `<div class="warn"><strong>Fix before creating links:</strong><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (notes.length) html += `<div class="warn" style="margin-top:8px;color:var(--muted);border-color:var(--line);background:transparent"><strong>Heads up:</strong><ul>${notes.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (!errs.length && !notes.length) html = '<div class="ok">Looks good. Create the links when you’re ready.</div>';
    $('warnings').innerHTML = html;
    $('generate').disabled = errs.length > 0;
  }

  function renderAll() {
    $('title').value = state.title;
    renderGeo();
    renderBars();
    renderFinal();
    renderTeams();
    renderWarnings();
  }

  // ---------- Links ----------

  function qrFor(url) {
    if (typeof qrcode === 'undefined') return '<p class="muted small">QR codes need an internet connection to load.</p>';
    try {
      const qr = qrcode(0, 'L');
      qr.addData(url, 'Byte');
      qr.make();
      return `<div class="qr"><img alt="QR code" src="${qr.createDataURL(4, 2)}"></div>`;
    } catch (e) {
      return '<p class="muted small">This link is too long for a QR code. Text or AirDrop the link instead (shorter clues help).</p>';
    }
  }

  async function generate() {
    const btn = $('generate');
    btn.disabled = true;
    btn.textContent = 'Locking clues…';
    const base = new URL('play.html', location.href);
    base.hash = '';
    base.search = '';
    const out = [];
    try {
      for (let i = 0; i < state.teams.length; i++) {
        const team = state.teams[i];
        const route = team.route.map(barById);
        const data = await Hunt.buildTeam({ ...state, geoRadius: Math.round((parseInt(state.geoRadiusFt, 10) || 330) / 3.281) }, { name: team.name.trim() || `Team ${i + 1}` }, route, state.final);
        out.push({ name: team.name.trim() || `Team ${i + 1}`, url: base.href + '#' + data, start: barLabel(route[0]) });
      }
    } catch (e) {
      toast('Something went wrong: ' + e.message);
      btn.textContent = 'Create team links';
      btn.disabled = false;
      return;
    }
    const canShare = !!navigator.share;
    $('links').innerHTML = `<div class="grid2">${out.map((l, i) => `
      <div class="card link-card">
        <h3>${esc(l.name)}</h3>
        <div class="muted small">Starts at ${esc(l.start)}</div>
        <div class="url">${esc(l.url)}</div>
        <div class="row">
          <button class="btn sm primary" data-act="copy" data-i="${i}">Copy link</button>
          ${canShare ? `<button class="btn sm" data-act="share" data-i="${i}">Share</button>` : ''}
          <a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">Test</a>
          <button class="btn sm" data-act="qr" data-i="${i}">QR code</button>
        </div>
        <div class="qr-slot"></div>
      </div>`).join('')}</div>`;
    $('links').dataset.links = JSON.stringify(out);
    linksMade = true;
    $('links-wrap').classList.remove('links-stale');
    btn.textContent = 'Create team links';
    btn.disabled = false;
    toast(`${out.length} team link${out.length === 1 ? '' : 's'} ready`);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Link copied');
  }

  function buildCheatSheet() {
    const rows = state.teams.map((t, i) => {
      const stops = t.route.map((id, si) => {
        const b = barById(id);
        return `<li>${si + 1}. <strong>${esc(barLabel(b))}</strong>: answer “${esc(b ? b.answers : '')}”</li>`;
      }).join('');
      return `<div class="card" style="break-inside:avoid;margin-bottom:12px"><h3>${esc(t.name || 'Team ' + (i + 1))}</h3><ul style="list-style:none;padding:0;margin:0">${stops}<li>★ <strong>${esc(state.final.name)}</strong>${state.final.answers ? `: answer “${esc(state.final.answers)}”` : ''}</li></ul></div>`;
    }).join('');
    $('cheat').innerHTML = `
      <h1>${esc(state.title || 'Bar Hunt')}: host sheet</h1>
      ${state.backupCode ? `<p><strong>GPS backup code:</strong> ${esc(state.backupCode)}</p>` : ''}
      ${rows}`;
  }

  // ---------- Events ----------

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bar) {
      const bar = t.dataset.bar === 'final' ? state.final : barById(t.dataset.bar);
      if (!bar) return;
      bar[t.dataset.field] = t.value;
      if (t.dataset.field === 'name') renderTeams();
      if (t.dataset.field === 'loc') updateLocStatus(t.dataset.bar);
      changed();
    } else if (t.dataset.teamName != null) {
      state.teams[+t.dataset.teamName].name = t.value;
      changed();
    } else if (t.id === 'geo-radius') {
      state.geoRadiusFt = t.value;
      changed();
    } else if (t.id === 'backup-code') {
      state.backupCode = t.value;
      changed();
    } else if (t.id === 'title') {
      state.title = t.value;
      changed();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'team-count') {
      const n = Math.max(1, Math.min(30, parseInt(t.value, 10) || 1));
      while (state.teams.length < n) state.teams.push({ name: 'Team ' + (state.teams.length + 1), route: [] });
      state.teams.length = n;
      // New teams get a staggered route; existing routes are left alone.
      const ids = state.bars.map((b) => b.id);
      state.teams.forEach((team, i) => {
        if (!team.route.length && ids.length) {
          const start = i % ids.length;
          team.route = ids.slice(start).concat(ids.slice(0, start)).slice(0, state.stopsPerTeam);
        }
      });
      renderTeams();
      changed();
    } else if (t.id === 'stops-per-team') {
      state.stopsPerTeam = t.value;
      stagger(state);
      renderTeams();
      changed();
      toast('Routes re-staggered');
    } else if (t.dataset.act === 'add-stop' && t.value) {
      state.teams[+t.dataset.team].route.push(t.value);
      renderTeams();
      changed();
    }
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT') return;
    const ti = +el.dataset.team, si = +el.dataset.stop;
    switch (el.dataset.act) {
      case 'here': {
        const key = el.dataset.bar;
        if (!navigator.geolocation) { toast('This browser can’t share location'); break; }
        el.disabled = true;
        el.textContent = 'Finding you…';
        navigator.geolocation.getCurrentPosition((pos) => {
          const bar = key === 'final' ? state.final : barById(key);
          if (bar) {
            bar.loc = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
            const input = document.querySelector(`[data-bar="${key}"][data-field="loc"]`);
            if (input) input.value = bar.loc;
            updateLocStatus(key);
            changed();
            toast(`Location saved (within about ${Math.round(pos.coords.accuracy * 3.281)} ft)`);
          }
          el.disabled = false;
          el.textContent = '📍 Use my location';
        }, () => {
          toast('Couldn’t get your location. Check location permissions.');
          el.disabled = false;
          el.textContent = '📍 Use my location';
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        break;
      }
      case 'remove-bar': {
        const bar = barById(el.dataset.id);
        if ((bar.name || bar.clue || bar.answers) && !confirm(`Remove ${barLabel(bar)}?`)) return;
        state.bars = state.bars.filter((b) => b.id !== el.dataset.id);
        state.teams.forEach((t) => { t.route = t.route.filter((id) => id !== el.dataset.id); });
        clampStops(state);
        renderBars();
        renderTeams();
        changed();
        break;
      }
      case 'up':
      case 'down': {
        const r = state.teams[ti].route;
        const j = el.dataset.act === 'up' ? si - 1 : si + 1;
        [r[si], r[j]] = [r[j], r[si]];
        renderTeams();
        changed();
        break;
      }
      case 'drop':
        state.teams[ti].route.splice(si, 1);
        renderTeams();
        changed();
        break;
      case 'copy':
      case 'share':
      case 'qr': {
        const link = JSON.parse($('links').dataset.links)[+el.dataset.i];
        if (el.dataset.act === 'copy') copy(link.url);
        else if (el.dataset.act === 'share') navigator.share({ title: `${state.title || 'Bar Hunt'}: ${link.name}`, text: `Your clues for ${state.title || 'the hunt'} (${link.name}):`, url: link.url }).catch(() => {});
        else {
          const slot = el.closest('.link-card').querySelector('.qr-slot');
          slot.innerHTML = slot.innerHTML ? '' : qrFor(link.url);
        }
        break;
      }
    }
  });

  $('add-bar').addEventListener('click', () => {
    const grow = state.stopsPerTeam >= state.bars.length;
    const bar = blankBar();
    state.bars.push(bar);
    if (grow) {
      state.stopsPerTeam = state.bars.length;
      state.teams.forEach((t) => t.route.push(bar.id));
    }
    renderBars();
    renderTeams();
    changed();
    const input = document.querySelector(`[data-bar="${bar.id}"][data-field="name"]`);
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  });

  $('stagger').addEventListener('click', () => { stagger(state); renderTeams(); changed(); toast('Every team starts somewhere different'); });
  $('shuffle').addEventListener('click', () => { shuffle(state); renderTeams(); changed(); toast('Routes shuffled'); });
  $('generate').addEventListener('click', generate);
  $('print-btn').addEventListener('click', () => { buildCheatSheet(); window.print(); });

  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.title.trim() || 'bar-hunt').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!valid(s)) throw new Error('bad file');
      state = s;
      clampStops(state);
      save();
      renderAll();
      toast('Hunt loaded');
    } catch (err) {
      toast('That file is not a hunt file');
    }
  });

  $('new-btn').addEventListener('click', () => {
    if (!confirm('Start a new hunt? This clears everything here (save a file first if you want to keep it).')) return;
    state = defaults();
    save();
    renderAll();
    $('links').innerHTML = '';
    linksMade = false;
    $('links-wrap').classList.remove('links-stale');
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  state = load() || defaults();
  clampStops(state);
  renderAll();
})();
