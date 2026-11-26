// Progress shape, legacy migration, and card import parsers.
(function () {
  var RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };

  function blank() {
    return {
      version: 2,
      xp: 0,
      history: [],
      reviews: [],
      streak: 0,
      lastDay: null,
      bests: {},
      settings: defaultSettings(),
      progress: {},
      custom: [],
      decks: [],
      overrides: {},
      hidden: {},
      hiddenDecks: {},
      migrationDone: false
    };
  }

  function defaultSettings() {
    return {
      sound: false,
      theme: 'dark',
      newPerDay: 20,
      maxReviews: 200,
      retention: 0.9,
      leechThreshold: 8,
      learnAheadMinutes: 20,
      typeFirst: false,
      sessionSize: 20
    };
  }

  function normalize(saved) {
    var base = blank();
    if (!saved || typeof saved !== 'object') return base;
    var settings = Object.assign(defaultSettings(), saved.settings || {});
    if (typeof settings.retention !== 'number') settings.retention = 0.9;
    settings.retention = Math.min(0.97, Math.max(0.7, settings.retention));
    settings.newPerDay = clampInt(settings.newPerDay, 0, 200, 20);
    settings.maxReviews = clampInt(settings.maxReviews, 0, 2000, 200);
    settings.leechThreshold = clampInt(settings.leechThreshold, 2, 50, 8);
    settings.learnAheadMinutes = clampInt(settings.learnAheadMinutes, 0, 180, 20);
    settings.sessionSize = clampInt(settings.sessionSize, 5, 100, 20);
    if (settings.theme !== 'light') settings.theme = 'dark';
    return {
      version: 2,
      xp: Number(saved.xp) || 0,
      history: Array.isArray(saved.history) ? saved.history.slice(-4000) : [],
      reviews: Array.isArray(saved.reviews) ? saved.reviews.slice(-8000) : [],
      streak: Number(saved.streak) || 0,
      lastDay: saved.lastDay || null,
      bests: saved.bests && typeof saved.bests === 'object' ? saved.bests : {},
      settings: settings,
      progress: saved.progress && typeof saved.progress === 'object' ? saved.progress : {},
      custom: Array.isArray(saved.custom) ? saved.custom : [],
      decks: Array.isArray(saved.decks) ? saved.decks : [],
      overrides: saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {},
      hidden: saved.hidden && typeof saved.hidden === 'object' ? saved.hidden : {},
      hiddenDecks: saved.hiddenDecks && typeof saved.hiddenDecks === 'object' ? saved.hiddenDecks : {},
      migrationDone: !!saved.migrationDone
    };
  }

  function clampInt(n, a, b, fallback) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return fallback;
    return Math.min(b, Math.max(a, n));
  }

  function parseDayStart(day) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return new Date(day + 'T00:00:00').getTime();
  }

  function migrateV1(v1) {
    var src = v1 && v1.data && v1.app === 'recall.run' ? v1.data : v1;
    if (!src || typeof src !== 'object') return blank();
    var out = blank();
    out.migrationDone = true;
    out.xp = Number(src.xp) || 0;
    out.history = Array.isArray(src.history) ? src.history.slice(-4000) : [];
    out.streak = Number(src.streak) || 0;
    out.lastDay = src.lastDay || null;
    out.bests = src.bests && typeof src.bests === 'object' ? src.bests : {};
    if (src.settings && typeof src.settings === 'object') out.settings.sound = !!src.settings.sound;
    var cards = src.cards && typeof src.cards === 'object' ? src.cards : {};
    Object.keys(cards).forEach(function (id) {
      var p = cards[id] || {};
      var grade = RATINGS[p.rating] || 3;
      var interval = Math.max(0, Math.round(Number(p.interval) || 0));
      var reps = Math.max(0, Math.round(Number(p.reps) || 0));
      var due = parseDayStart(p.due);
      var last = parseDayStart(p.last);
      if (last) last += 12 * 3600000;
      var stability = interval > 0 ? interval : (reps > 0 ? globalThis.Engine.initStability(grade) : 0);
      out.progress[id] = {
        stability: stability,
        difficulty: reps > 0 ? globalThis.Engine.initDifficulty(grade) : 0,
        due: due || Date.now(),
        state: reps > 0 ? 'review' : (p.rating ? 'learning' : 'new'),
        reps: reps,
        lapses: p.rating === 'again' ? 1 : 0,
        scheduledDays: interval,
        lastReview: last,
        rating: p.rating ? grade : 0,
        leech: false
      };
    });
    var custom = Array.isArray(src.custom) ? src.custom : [];
    if (custom.length) {
      out.decks.push({ id: 'my-cards', name: 'My cards', blurb: 'Cards saved in the previous version.' });
      custom.forEach(function (card) {
        if (!card || !card.q) return;
        out.custom.push({
          id: String(card.id || ('u' + Math.random().toString(36).slice(2))),
          deckId: 'my-cards',
          type: 'basic',
          tags: card.topic ? [String(card.topic).toLowerCase()] : [],
          front: String(card.q),
          back: String(card.a || ''),
          keys: Array.isArray(card.keys) ? card.keys : [],
          source: 'user'
        });
      });
    }
    return out;
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var q = false;
    var s = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; }
          else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    function idx(name) { return header.indexOf(name); }
    var di = idx('deck'), ti = idx('type'), fi = idx('front'), bi = idx('back'), gi = idx('tags');
    if (fi < 0 || bi < 0) {
      if (header.length >= 2 && fi < 0) { fi = 0; bi = 1; di = header.length > 2 ? 2 : -1; }
      else return [];
    }
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var cols = rows[r];
      if (!cols || cols.every(function (x) { return !String(x || '').trim(); })) continue;
      var front = cols[fi] || '';
      var back = cols[bi] || '';
      if (!String(front).trim() || !String(back).trim()) continue;
      var tags = gi >= 0 ? String(cols[gi] || '') : '';
      out.push({
        deck: di >= 0 ? String(cols[di] || 'Imported').trim() || 'Imported' : 'Imported',
        type: normalizeType(ti >= 0 ? cols[ti] : guessType(front)),
        front: String(front).trim(),
        back: String(back).trim(),
        tags: splitTags(tags)
      });
    }
    return out;
  }

  function splitTags(tags) {
    if (Array.isArray(tags)) return tags.map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean);
    var s = String(tags || '').trim();
    if (!s) return [];
    var parts = /[,;|]/.test(s) ? s.split(/[,;|]/) : s.split(/\s+/);
    return parts.map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
  }

  function normalizeType(t) {
    var s = String(t || '').trim().toLowerCase();
    if (s === 'cloze' || s === 'z') return 'cloze';
    if (s === 'interview' || s === 'i') return 'interview';
    if (s === 'code' || s === 'c' || s === 'c++') return 'code';
    if (s === 'basic' || s === 'b' || s === 'flash' || s === 'qa') return 'basic';
    return '';
  }

  function guessType(front) {
    if (/\{\{c\d+::/.test(front)) return 'cloze';
    return 'basic';
  }

  function parseMarkdown(text) {
    var src = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!src) return [];
    var deck = 'Imported';
    var lines = src.split('\n');
    if (/^#\s+/.test(lines[0]) && !/^##\s+/.test(lines[0])) {
      deck = lines[0].replace(/^#\s+/, '').trim() || deck;
      src = lines.slice(1).join('\n').trim();
    }
    var chunks = src.split(/\n---\s*\n/);
    var out = [];
    chunks.forEach(function (chunk) {
      chunk = chunk.trim();
      if (!chunk) return;
      var localDeck = deck;
      var type = '';
      var tags = [];
      var id = '';
      var bodyLines = chunk.split('\n');
      var start = 0;
      if (/^#\s+/.test(bodyLines[0]) && !/^##\s+/.test(bodyLines[0])) {
        localDeck = bodyLines[0].replace(/^#\s+/, '').trim() || localDeck;
        start = 1;
      }
      var front = '';
      if (/^##\s+/.test(bodyLines[start] || '')) {
        front = bodyLines[start].replace(/^##\s+/, '').trim();
        start += 1;
      }
      var rest = [];
      for (var i = start; i < bodyLines.length; i++) {
        var line = bodyLines[i];
        var meta = /^(type|tags|deck|id)\s*:\s*(.*)$/i.exec(line.trim());
        if (meta && rest.length === 0) {
          var key = meta[1].toLowerCase();
          var val = meta[2].trim();
          if (key === 'type') type = normalizeType(val);
          else if (key === 'tags') tags = splitTags(val);
          else if (key === 'deck') localDeck = val || localDeck;
          else if (key === 'id') id = val;
        } else rest.push(line);
      }
      var back = rest.join('\n').trim();
      if (!front) {
        var q = chunk.match(/(?:^|\n)Q:\s*([\s\S]*?)\nA:\s*([\s\S]*)$/i);
        if (q) {
          front = q[1].trim();
          back = q[2].trim();
          back = back.replace(/\n(?:type|tags|deck|id)\s*:\s*.+$/gi, function (m) {
            var mm = /^(type|tags|deck|id)\s*:\s*(.*)$/i.exec(m.trim());
            if (!mm) return m;
            if (mm[1].toLowerCase() === 'tags') tags = splitTags(mm[2]);
            if (mm[1].toLowerCase() === 'type') type = normalizeType(mm[2]);
            if (mm[1].toLowerCase() === 'deck') localDeck = mm[2].trim() || localDeck;
            return '';
          }).trim();
        }
      }
      if (!front || !back) return;
      out.push({
        id: id,
        deck: localDeck,
        type: type || guessType(front),
        front: front,
        back: back,
        tags: tags
      });
    });
    return out;
  }

  function parseJsonCards(obj) {
    if (Array.isArray(obj)) return obj.map(normalizeIncoming).filter(Boolean);
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj.cards)) {
      var deck = obj.deck || obj.name || 'Imported';
      return obj.cards.map(function (card) {
        var n = normalizeIncoming(card);
        if (n && !n.deck) n.deck = deck;
        return n;
      }).filter(Boolean);
    }
    var one = normalizeIncoming(obj);
    return one ? [one] : [];
  }

  function normalizeIncoming(card) {
    if (!card || typeof card !== 'object') return null;
    var front = card.front || card.q || card.question || '';
    var back = card.back || card.a || card.answer || '';
    if (!String(front).trim() || !String(back).trim()) return null;
    return {
      id: card.id ? String(card.id) : '',
      deck: String(card.deck || card.topic || 'Imported'),
      type: normalizeType(card.type) || guessType(front),
      front: String(front).trim(),
      back: String(back).trim(),
      tags: splitTags(card.tags || card.tag || '')
    };
  }

  function isBackup(obj) {
    return !!(obj && obj.app === 'recall.run' && obj.data && typeof obj.data === 'object');
  }

  globalThis.Store = {
    blank: blank,
    normalize: normalize,
    migrateV1: migrateV1,
    parseCsv: parseCsv,
    parseMarkdown: parseMarkdown,
    parseJsonCards: parseJsonCards,
    normalizeIncoming: normalizeIncoming,
    isBackup: isBackup,
    splitTags: splitTags,
    normalizeType: normalizeType,
    defaultSettings: defaultSettings
  };
})();
