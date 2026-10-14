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

  // Builds one team's link payload from the host's hunt definition.
  // route: ordered bar objects; final: the last bar, whose clue a team gets
  // as soon as it finishes its own route.
  async function buildTeam(hunt, team, route, final) {
    const salt = randomBytes(16);
    const finalClue = { clue: final.clue, hint: final.hint || '', final: true };
    const finalAnswers = splitAnswers(final.answers);
    const stops = [];

    for (let i = 0; i < route.length; i++) {
      const bar = route[i];
      const payload = { bar: bar.name, msg: bar.msg || '' };
      payload.next = i < route.length - 1
        ? { clue: route[i + 1].clue, hint: route[i + 1].hint || '' }
        : finalClue;
      stops.push(await seal(payload, splitAnswers(bar.answers), salt));
    }
    if (finalAnswers.length) {
      stops.push(await seal({ bar: final.name, msg: final.msg || '', done: true }, finalAnswers, salt));
    }

    return pack({
      v: 1,
      title: hunt.title,
      team: team.name,
      total: route.length,
      salt: toB64(salt),
      first: { clue: route[0].clue, hint: route[0].hint || '' },
      stops,
    });
  }

  function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  root.Hunt = { normalize, splitAnswers, seal, open, pack, unpack, buildTeam, hashString, toB64, fromB64 };
})(typeof window !== 'undefined' ? window : globalThis);
