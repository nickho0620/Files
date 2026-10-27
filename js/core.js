// Shared helpers for the host builder and the team player.
//
// A team's whole hunt lives inside its link (after the #), so there is no
// server. To stop people peeking, everything after the first clue is
// encrypted: the payload for each bar is locked with that bar's answer, so
// the only way to read the next clue is to type the right answer.
(function (root) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITERATIONS = 100000;

  // "The Rusty Nail!" -> "rustynail". Case, accents, punctuation, spaces,
  // "&" vs "and", and a leading "the" never make an answer wrong.
  function normalize(s) {
    return String(s || '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^the /, '')
      .replace(/ /g, '');
  }

  // "Rusty Nail, The Nail" -> ["rustynail", "nail"]
  function splitAnswers(s) {
    return [...new Set(String(s || '').split(/[,\n]/).map(normalize).filter(Boolean))];
  }

  function toB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  async function deriveKey(answer, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  // Encrypt obj once per accepted answer; any one of them opens it.
  async function seal(obj, answers, salt) {
    const plain = enc.encode(JSON.stringify(obj));
    const items = [];
    for (const answer of answers) {
      const key = await deriveKey(answer, salt);
      const iv = randomBytes(12);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
      const joined = new Uint8Array(iv.length + ct.length);
      joined.set(iv);
      joined.set(ct, iv.length);
      items.push(toB64(joined));
    }
    return items;
  }

  // Returns the decrypted object, or null if the guess is wrong.
  async function open(items, guess, salt) {
    if (!normalize(guess)) return null;
    const key = await deriveKey(guess, salt);
    for (const item of items) {
      const bytes = fromB64(item);
      try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
        return JSON.parse(dec.decode(plain));
      } catch (e) { /* wrong answer for this item */ }
    }
    return null;
  }

  async function streamBytes(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  // Object -> short URL-safe string ("1" = deflated, "0" = plain JSON).
  async function pack(obj) {
    const bytes = enc.encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') {
      try { return '1' + toB64(await streamBytes(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* fall through */ }
    }
    return '0' + toB64(bytes);
  }

  async function unpack(str) {
    const body = fromB64(str.slice(1));
    if (str[0] === '1') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to open the hunt. Try updating it.');
      return JSON.parse(dec.decode(await streamBytes(body, new DecompressionStream('deflate-raw'))));
    }
    if (str[0] === '0') return JSON.parse(dec.decode(body));
    throw new Error('That link does not look like a hunt link.');
  }

  // "42.3601, -71.0550", or a Google Maps link containing one -> [lat, lng].
  function parseLoc(s) {
    const str = String(s || '').trim();
    if (!str) return null;
    const m = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
      || str.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      || str.match(/[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i)
      || str.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) return null;
    const lat = +m[1], lng = +m[2];
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
    return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
  }

  // Straight-line meters between two [lat, lng] points.
  function distance(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Builds one team's link payload from the host's hunt definition.
  // route: ordered bar objects; final: the last bar, whose clue a team gets
  // as soon as it finishes its own route. A bar's location and its GPS
  // backup code ride inside its locked payload, so they only exist once the
  // team has that bar's answer, and a backup code only works at its own bar.
  async function buildTeam(hunt, team, route, final) {
    const salt = randomBytes(16);
    const finalClue = { clue: final.clue, hint: final.hint || '', final: true };
    const finalAnswers = splitAnswers(final.answers);
    const finalLoc = parseLoc(final.loc);
    const stops = [];
    let geo = false;

    for (let i = 0; i < route.length; i++) {
      const bar = route[i];
      const payload = { bar: bar.name, msg: bar.msg || '' };
      const loc = parseLoc(bar.loc);
      if (loc) {
        payload.loc = loc;
        geo = true;
        const backup = splitAnswers(bar.backup);
        if (backup.length) payload.backup = await seal({ ok: 1 }, backup, salt);
      }
      payload.next = i < route.length - 1
        ? { clue: route[i + 1].clue, hint: route[i + 1].hint || '' }
        : finalClue;
      stops.push(await seal(payload, splitAnswers(bar.answers), salt));
    }
    const finalBackup = finalLoc && splitAnswers(final.backup).length
      ? await seal({ ok: 1 }, splitAnswers(final.backup), salt)
      : null;
    if (finalLoc) geo = true;
    if (finalAnswers.length) {
      const payload = { bar: final.name, msg: final.msg || '', done: true };
      if (finalLoc) payload.loc = finalLoc;
      if (finalBackup) payload.backup = finalBackup;
      stops.push(await seal(payload, finalAnswers, salt));
    } else if (finalLoc) {
      finalClue.loc = finalLoc;
      if (finalBackup) finalClue.backup = finalBackup;
    }

    const data = {
      v: 1,
      title: hunt.title,
      team: team.name,
      total: route.length,
      salt: toB64(salt),
      first: { clue: route[0].clue, hint: route[0].hint || '' },
      stops,
    };
    if (geo) data.radius = Math.max(25, parseInt(hunt.geoRadius, 10) || 100);
    return pack(data);
  }

  // Short links: every team's packed hunt is locked with its own random key
  // and published together in one file on the site. The file is safe to make
  // public; a team's link carries only the file id, its slot and its key.
  async function teamKey(keyB64, usage) {
    return crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, [usage]);
  }

  async function lockTeam(packed, keyB64) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await teamKey(keyB64, 'encrypt'), enc.encode(packed)));
    const joined = new Uint8Array(iv.length + ct.length);
    joined.set(iv);
    joined.set(ct, iv.length);
    return toB64(joined);
  }

  async function unlockTeam(blob, keyB64) {
    const bytes = fromB64(blob);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await teamKey(keyB64, 'decrypt'), bytes.subarray(12));
    return dec.decode(plain);
  }

  function randomId(bytes) {
    return toB64(randomBytes(bytes));
  }

  // "s.<file id>.<team slot>.<team key>" -> parts, or null for a long link.
  function parseShort(hash) {
    const m = /^s\.([A-Za-z0-9_-]{6,16})\.(\d{1,3})\.([A-Za-z0-9_-]{22})$/.exec(hash);
    return m ? { id: m[1], slot: +m[2], key: m[3] } : null;
  }

  function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  root.Hunt = { normalize, splitAnswers, seal, open, pack, unpack, buildTeam, parseLoc, distance, lockTeam, unlockTeam, randomId, parseShort, hashString, toB64, fromB64 };
})(typeof window !== 'undefined' ? window : globalThis);
