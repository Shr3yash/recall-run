var data, ui, session = null, tick = null, recognizer = null, audioRecorder = null, audioChunks = [], audioUrl = null, toastId = null, installEvent = null;
var PAGES = ['dashboard', 'study', 'library', 'stats', 'leeches', 'arch', 'trace', 'words', 'speak', 'mock'];
var MODES = [['today', 'Today'], ['recall', 'Free recall'], ['flash', 'Flashcards'], ['cloze', 'Cloze'], ['interview', 'Interview'], ['code', 'C++'], ['mixed', 'Mixed'], ['drill', '5 min']];
var STUDY_KINDS = { today: 1, recall: 1, flash: 1, cloze: 1, interview: 1, code: 1, mixed: 1, drill: 1 };

function $(sel) { return document.querySelector(sel); }
function escapeHtml(s) { return Format.escapeHtml(s); }
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function pageIntro(k, title, desc) { return '<div class="page-intro"><div class="eyebrow">' + escapeHtml(k) + '</div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(desc) + '</p></div>'; }
function toast(msg) {
  var old = document.querySelector('.toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastId);
  toastId = setTimeout(function () { t.remove(); }, 2400);
}
function playTone() {
  if (!data.settings.sound) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var c = new Ctx();
    var o = c.createOscillator();
    var g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(570, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.11);
    g.gain.setValueAtTime(0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    o.start(); o.stop(c.currentTime + 0.2);
    setTimeout(function () { c.close(); }, 450);
  } catch (e) {}
}
function cleanUp() {
  if (tick) { clearInterval(tick); tick = null; }
  if (recognizer) { try { recognizer.abort(); } catch (e) {} recognizer = null; }
  if (audioRecorder && audioRecorder.state === 'recording') { try { audioRecorder.stop(); } catch (e) {} }
}
function startTimer(seconds, onTick, onDone) {
  clearInterval(tick);
  var end = Date.now() + seconds * 1000;
  onTick(seconds);
  tick = setInterval(function () {
    var remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    onTick(remaining);
    if (remaining <= 0) { clearInterval(tick); tick = null; onDone(); }
  }, 150);
}

function load() {
  try {
    var raw = localStorage.getItem('recall_run_v2');
    if (raw) { data = Store.normalize(JSON.parse(raw)); data.migrationDone = true; return; }
  } catch (e) {}
  try {
    var old = localStorage.getItem('recall_run_v1');
    if (old) { data = Store.migrateV1(JSON.parse(old)); save(); return; }
  } catch (e) {}
  data = Store.blank();
  data.migrationDone = true;
}
function save() {
  try { localStorage.setItem('recall_run_v2', JSON.stringify(data)); }
  catch (e) { toast('Could not save in this browser.'); }
}
function freshUi() {
  return {
    page: 'dashboard', mode: 'today', deckFilter: null, query: '', edit: null, importPreview: null,
    libraryDeck: null, showHidden: false,
    archIx: 0, archPhase: 'ready', archPicks: [], archTime: 20, archScore: 0,
    traceIx: 0, tracePhase: 'ready', traceTime: 18, traceGuess: '', traceCorrect: false,
    wordIx: 0, wordPhase: 'ask', wordChoice: -1, wordOptions: [],
    speakIx: 0, speaking: false, speakElapsed: 0, speakFeedback: null, speechFinal: '', speakText: '',
    mockSet: [], mockIx: 0, mockPhase: 'ready', mockScores: [], mockElapsed: 0, mockDraft: ''
  };
}
function applyTheme() {
  var light = data.settings.theme === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#f4f6fb' : '#080c16');
}
function practice(kind, xp, detail) {
  var today = Engine.localDay();
  if (data.lastDay !== today) {
    if (data.lastDay && Engine.daysBetween(data.lastDay, today) === 1) data.streak += 1;
    else data.streak = 1;
    data.lastDay = today;
  }
  data.xp += xp || 0;
  data.history.push({ day: today, at: Date.now(), kind: kind, xp: xp || 0, detail: detail || '' });
  if (data.history.length > 4000) data.history = data.history.slice(-4000);
  save();
  if (xp) { playTone(); toast('+' + xp + ' XP'); }
  updateChrome();
}

function deckRecords() {
  var out = [];
  (globalThis.PACKS || []).forEach(function (p) {
    out.push({ id: p.id, name: p.name, blurb: p.blurb || '', source: 'built-in', hidden: !!data.hiddenDecks[p.id] });
  });
  data.decks.forEach(function (d) {
    out.push({ id: d.id, name: d.name, blurb: d.blurb || '', source: 'user', hidden: !!data.hiddenDecks[d.id] });
  });
  return out;
}
function visibleDecks() { return deckRecords().filter(function (d) { return !d.hidden; }); }
function deckName(id) {
  var rows = deckRecords();
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i].name;
  return id || 'Notes';
}
function applyOverride(raw, fallbackDeck) {
  var o = data.overrides[raw.id] || {};
  var deckId = o.deckId || raw.deckId || fallbackDeck;
  var tags = o.tags || raw.tags || [];
  if (!Array.isArray(tags)) tags = Store.splitTags(tags);
  return {
    id: raw.id,
    type: o.type || raw.type || 'basic',
    tags: tags,
    front: o.front != null ? o.front : (raw.front || raw.q || ''),
    back: o.back != null ? o.back : (raw.back || raw.a || ''),
    keys: o.keys || raw.keys || [],
    deckId: deckId,
    deck: deckName(deckId),
    source: raw.source || (raw.q ? 'user' : 'built-in')
  };
}
function allCards() {
  var out = [];
  var seen = {};
  (globalThis.PACKS || []).forEach(function (pack) {
    pack.cards.forEach(function (raw) {
      if (data.hidden[raw.id] || seen[raw.id]) return;
      var card = applyOverride(raw, pack.id);
      if (data.hiddenDecks[card.deckId]) return;
      seen[card.id] = 1;
      out.push(card);
    });
  });
  data.custom.forEach(function (raw) {
    if (data.hidden[raw.id] || seen[raw.id]) return;
    var card = applyOverride(raw, raw.deckId || 'my-cards');
    if (data.hiddenDecks[card.deckId]) return;
    seen[card.id] = 1;
    out.push(card);
  });
  return out;
}
function cardById(id) {
  var cards = allCards();
  for (var i = 0; i < cards.length; i++) if (cards[i].id === id) return cards[i];
  return null;
}
function builtinIds() {
  var set = {};
  (globalThis.PACKS || []).forEach(function (p) { p.cards.forEach(function (c) { set[c.id] = 1; }); });
  return set;
}
function studyPool() {
  var cards = allCards();
  if (!ui.deckFilter) return cards;
  return cards.filter(function (c) { return ui.deckFilter[c.deckId]; });
}
function isDue(p, now) {
  if (!p || !p.reps || p.state === 'new') return false;
  if (p.state === 'learning' || p.state === 'relearning') return p.due <= now + (data.settings.learnAheadMinutes || 0) * 60000;
  return p.due < Engine.endOfLocalDay(now);
}
function dueCount() {
  var now = Date.now();
  var n = 0;
  allCards().forEach(function (c) { if (isDue(data.progress[c.id], now)) n++; });
  return n;
}
function countFlag(flag, day) {
  var ids = {};
  data.reviews.forEach(function (r) {
    if (r.day !== day) return;
    if (flag === 'first' && r.first) ids[r.id] = 1;
    if (flag === 'review' && !r.first) ids[r.id] = (ids[r.id] || 0) + 1;
  });
  if (flag === 'first') return Object.keys(ids).length;
  var n = 0;
  Object.keys(ids).forEach(function (k) { n += ids[k]; });
  return n;
}
function newSeenToday() { return countFlag('first', Engine.localDay()); }
function reviewsSeenToday() { return countFlag('review', Engine.localDay()); }
function todayStudyCount(kind) {
  var day = Engine.localDay();
  return data.history.filter(function (h) {
    if (h.day !== day) return false;
    if (kind) return h.kind === kind;
    return !!STUDY_KINDS[h.kind];
  }).length;
}
function queueOptions(mode) {
  return {
    cards: studyPool(),
    progress: data.progress,
    mode: mode || ui.mode,
    now: Date.now(),
    settings: data.settings,
    newSeen: newSeenToday(),
    reviewsSeen: reviewsSeenToday()
  };
}

function navMarkup() {
  var sections = [
    ['Home', [['dashboard', '◈', 'Command center']]],
    ['Study', [['study', '◉', 'Review']]],
    ['Library', [['library', '✎', 'Decks and cards']]],
    ['Progress', [['stats', '▤', 'Stats'], ['leeches', '⚑', 'Leeches']]],
    ['Drills', [['arch', '⬡', 'Architecture lab'], ['trace', '⌘', 'C++ trace'], ['words', '✦', 'Word forge'], ['speak', '◌', 'Speaking dojo'], ['mock', '⚔', 'Mock gauntlet']]]
  ];
  var brand = '<div class="brand"><div class="logo">R</div><div><div class="brand-title">RECALL<span style="color:var(--lime)">.RUN</span></div><div class="brand-sub">Systems recall desk</div></div></div>';
  var nav = sections.map(function (sec) {
    return '<div class="nav-label">' + sec[0] + '</div><nav class="nav">' + sec[1].map(function (item) {
      var on = ui.page === item[0] || (item[0] === 'study' && ui.page === 'study');
      return '<button class="nav-btn' + (on ? ' active' : '') + '" type="button" data-act="go" data-arg="' + item[0] + '"><span class="nav-ic">' + item[1] + '</span>' + item[2] + '</button>';
    }).join('') + '</nav>';
  }).join('');
  var rankLeft = 500 - (data.xp % 500);
  return brand + nav + '<div class="sidebar-bottom"><div class="tiny-cap">Current streak</div><div class="side-streak">' + data.streak + ' <span style="font-size:14px;color:var(--orange)">days</span></div><div class="progress"><div class="bar" style="width:' + Math.min(100, (data.xp % 500) / 500 * 100) + '%"></div></div><div class="smallprint" style="margin-top:8px">' + rankLeft + ' XP to next rank</div></div>';
}
function crumb() {
  var names = { dashboard: 'Command', study: 'Review', library: 'Decks', stats: 'Stats', leeches: 'Leeches', arch: 'Architecture', trace: 'C++ trace', words: 'Word forge', speak: 'Speaking', mock: 'Mock' };
  return names[ui.page] || 'Recall';
}
function updateChrome() {
  var side = document.getElementById('sidebar');
  if (side) side.innerHTML = navMarkup();
  var due = document.querySelector('.due-badge');
  if (due) due.textContent = dueCount() + ' due';
  var xp = document.querySelector('.xp-badge');
  if (xp) xp.innerHTML = '✳ <b>' + data.xp.toLocaleString() + '</b> XP';
  var c = document.querySelector('.crumb');
  if (c) c.textContent = crumb();
  var theme = document.getElementById('themeBtn');
  if (theme) theme.textContent = data.settings.theme === 'light' ? 'Dark' : 'Light';
}
function locationToken() { return ui.page === 'study' ? 'study-' + ui.mode : ui.page; }
function go(page) {
  cleanUp();
  captureEditor();
  var mode = null;
  if (String(page).indexOf('study-') === 0) { mode = page.slice(6); page = 'study'; }
  if (PAGES.indexOf(page) < 0) page = 'dashboard';
  var entering = ui.page !== page;
  ui.page = page;
  if (mode && MODES.some(function (m) { return m[0] === mode; })) {
    if (ui.mode !== mode) session = null;
    ui.mode = mode;
  }
  if (entering && page === 'arch') initializeArch();
  if (entering && page === 'trace') initializeTrace();
  if (entering && page === 'words') initializeWord();
  if (entering && page === 'speak') initializeSpeak();
  if (entering && page === 'mock') initializeMock();
  var token = locationToken();
  if (location.hash !== '#' + token) history.replaceState(null, '', '#' + token);
  render();
  window.scrollTo(0, 0);
  var side = document.querySelector('.sidebar');
  if (side) side.classList.remove('open');
}
function render() {
  captureEditor();
  try {
    applyTheme();
    updateChrome();
    var views = { dashboard: renderDashboard, study: renderStudy, library: renderLibrary, stats: renderStats, leeches: renderLeeches, arch: renderArch, trace: renderTrace, words: renderWords, speak: renderSpeak, mock: renderMock };
    var fn = views[ui.page] || renderDashboard;
    document.getElementById('content').innerHTML = '<main class="page">' + fn() + '</main>';
    afterRender();
  } catch (err) {
    document.getElementById('content').innerHTML = '<main class="page"><div class="panel"><h2>This page hit an error.</h2><p class="muted">' + escapeHtml(err && err.message ? err.message : 'Unknown error') + '</p></div></main>';
  }
}
function afterRender() {
  if (ui.page === 'study') bindDrill();
  var box = document.getElementById('studyAnswer');
  if (box && session && !session.revealed) box.focus();
  var install = document.getElementById('installBtn');
  if (install) install.hidden = !installEvent;
  if (ui.edit && document.getElementById('prevFront')) previewEditor();
}
function bindDrill() {
  if (!session || !session.drillEnds) return;
  if (tick) { clearInterval(tick); tick = null; }
  tick = setInterval(function () {
    if (!session || !session.drillEnds) { clearInterval(tick); tick = null; return; }
    var left = Math.max(0, session.drillEnds - Date.now());
    var el = document.getElementById('drillClock');
    if (el) el.textContent = fmtTime(Math.ceil(left / 1000));
    var fill = document.getElementById('drillFill');
    if (fill) fill.style.width = (left / 300000 * 100) + '%';
    if (left <= 0) {
      clearInterval(tick); tick = null;
      session.timeUp = true;
      if (el) el.textContent = '00:00';
    }
  }, 250);
}

function rankName() {
  var names = ['Rookie', 'Builder', 'Debugger', 'Architect', 'Staff brain'];
  return names[Math.min(4, Math.floor(data.xp / 500))];
}
function renderDashboard() {
  var cards = allCards();
  var seen = cards.filter(function (c) { return data.progress[c.id] && data.progress[c.id].reps; }).length;
  var retention = retentionStats(30);
  var quests = [
    { label: 'Review ten cards', sub: 'Any study mode.', have: todayStudyCount(null), need: 10, go: 'study' },
    { label: 'One C++ recall', sub: 'Write it, then grade it.', have: todayStudyCount('code'), need: 1, go: 'study-code' },
    { label: 'Explain one idea', sub: 'Interview mode.', have: todayStudyCount('interview'), need: 1, go: 'study-interview' },
    { label: 'A 5-minute drill', sub: 'As many due cards as you can.', have: todayStudyCount('drill'), need: 1, go: 'study-drill' }
  ];
  var drills = [['arch', '⬡', 'Architecture lab', 'Rebuild a flow from a 20-second look.'], ['trace', '⌘', 'C++ trace', 'Read a program, then say what it prints.'], ['words', '✦', 'Word forge', 'Swap a vague sentence for a precise one.'], ['speak', '◌', 'Speaking dojo', 'Timed explanations, out loud if you want.'], ['mock', '⚔', 'Mock gauntlet', 'Five mixed rounds with the checklist hidden.']];
  return '<div class="hero"><div class="eyebrow">LONG-TERM RECALL</div><h1>Keep the systems<br><em>in your head.</em></h1><p>CUDA, data movement, serving, training, RL, and C++. Grade honestly. The scheduler brings the weak ones back.</p><div class="actions"><button class="btn primary" type="button" data-act="go" data-arg="study-today">Start today\'s queue</button><button class="btn ghost" type="button" data-act="go" data-arg="study-drill">5-minute drill</button><button class="btn ghost" type="button" id="installBtn" data-act="install" hidden>Install</button></div></div>'
    + '<div class="stats-grid"><div class="stat"><span class="stat-ic">⟳</span><div class="tiny-cap">Due now</div><div class="val">' + dueCount() + '</div><div class="lbl">' + newSeenToday() + ' / ' + data.settings.newPerDay + ' new today</div></div>'
    + '<div class="stat"><span class="stat-ic">◷</span><div class="tiny-cap">Streak</div><div class="val">' + data.streak + '</div><div class="lbl">Best ' + bestStreak() + ' days</div></div>'
    + '<div class="stat"><span class="stat-ic">◉</span><div class="tiny-cap">Retention, 30 days</div><div class="val">' + (retention ? Math.round(retention.rate * 100) + '%' : '—') + '</div><div class="lbl">' + (retention ? retention.n + ' graded recalls' : 'Shows up after repeat reviews') + '</div></div>'
    + '<div class="stat"><span class="stat-ic">✳</span><div class="tiny-cap">Cards</div><div class="val">' + seen + '<span style="font-size:16px;color:var(--muted)"> / ' + cards.length + '</span></div><div class="lbl">Level ' + (Math.floor(data.xp / 500) + 1) + ' · ' + rankName() + '</div></div></div>'
    + '<div class="two-col"><div><div class="section-head"><div><h2>Decks</h2><p>Interleaved by default, so one topic does not crowd out the others.</p></div></div><div class="deck-grid">' + visibleDecks().map(function (d) {
      var st = deckCounts(d.id);
      return '<button class="deck-tile" type="button" data-act="open-deck" data-arg="' + escapeHtml(d.id) + '"><div class="tiny-cap">' + st.due + ' due</div><h3>' + escapeHtml(d.name) + '</h3><p>' + st.total + ' cards · ' + st.seen + ' seen</p></button>';
    }).join('') + '</div></div><div><div class="section-head"><div><h2>Today</h2><p>One pass. Come back tomorrow.</p></div></div><div class="panel">' + quests.map(function (q) {
      var done = q.have >= q.need;
      return '<div class="quest"><div class="quest-mark' + (done ? ' done' : '') + '">' + (done ? '✓' : '◌') + '</div><div class="quest-text"><b>' + q.label + '</b><small>' + q.sub + '</small></div><div><div class="quest-xp">' + (done ? 'DONE' : Math.min(q.have, q.need) + '/' + q.need) + '</div><button class="btn small ghost" type="button" data-act="go" data-arg="' + q.go + '">Go</button></div></div>';
    }).join('') + '</div></div></div>'
    + '<div class="section-head"><div><h2>Extra drills</h2><p>Same desk, different muscles.</p></div></div><div class="three-col">' + drills.map(function (d) {
      return '<div class="game-card"><div class="game-top"><div class="game-icon">' + d[1] + '</div></div><h3>' + d[2] + '</h3><p>' + d[3] + '</p><button class="btn small ghost" type="button" data-act="go" data-arg="' + d[0] + '">Open</button></div>';
    }).join('') + '</div><p class="footer-note">Scheduling is FSRS with the default weights. Grades are yours. Nothing leaves this browser unless you export a backup.</p>';
}
function deckCounts(id) {
  var cards = allCards().filter(function (c) { return c.deckId === id; });
  var due = 0, seen = 0, now = Date.now();
  cards.forEach(function (c) {
    var p = data.progress[c.id];
    if (p && p.reps) seen++;
    if (isDue(p, now)) due++;
  });
  return { total: cards.length, due: due, seen: seen };
}

function modeBlurb(mode) {
  var copy = {
    today: 'Due cards first, then new ones up to your daily limit. Topics are interleaved.',
    recall: 'Type the answer before you look. Then grade the retrieval, not the familiarity.',
    flash: 'Look, flip, grade. Faster than typing, easier to lie to yourself.',
    cloze: 'The blank is the question. Fill it in your head, then reveal.',
    interview: 'Explain it the way you would out loud. The back is an outline, not a script.',
    code: 'Write the C++. The reference is there to grade against, not to copy first.',
    mixed: 'A short session that jumps decks and card types on purpose.',
    drill: 'Five minutes. Due cards, then a few new ones if you run out.'
  };
  return copy[mode] || copy.today;
}
function renderStudy() {
  var known = MODES.some(function (m) { return m[0] === ui.mode; }) ? ui.mode : 'today';
  ui.mode = known;
  var head = pageIntro('REVIEW', 'Study', modeBlurb(ui.mode));
  var pills = '<div class="toolbar"><div class="seg mode-scroll">' + MODES.map(function (m) {
    return '<button class="pill' + (ui.mode === m[0] ? ' active' : '') + '" type="button" data-act="mode" data-arg="' + m[0] + '">' + m[1] + '</button>';
  }).join('') + '</div><span class="chip">' + dueCount() + ' due</span></div>';
  var decks = '<div class="deck-scroll">' + '<button class="pill' + (!ui.deckFilter ? ' active' : '') + '" type="button" data-act="deck-all">All decks</button>' + visibleDecks().map(function (d) {
    var on = ui.deckFilter && ui.deckFilter[d.id];
    return '<button class="pill' + (on ? ' active' : '') + '" type="button" data-act="deck" data-arg="' + escapeHtml(d.id) + '">' + escapeHtml(d.name) + '</button>';
  }).join('') + '</div>';
  if (!session || session.mode !== ui.mode) return head + pills + decks + renderStudyStart();
  if (session.index >= session.queue.length) return head + pills + decks + renderStudyDone();
  return head + pills + decks + renderStudyCard();
}
function renderStudyStart() {
  var q = Engine.buildQueue(queueOptions(ui.mode));
  var fresh = 0, due = 0;
  q.forEach(function (c) {
    var p = data.progress[c.id];
    if (!p || !p.reps) fresh++; else due++;
  });
  if (!q.length) return '<div class="panel arena empty"><div class="empty-icon">✓</div><h2>Nothing queued in this mode.</h2><p class="muted">Either nothing is due, the new-card limit is spent, or this mode has no cards in the selected decks.</p><button class="btn" type="button" data-act="go" data-arg="library">Add a card</button></div>';
  var label = ui.mode === 'drill' ? 'Start 5:00' : 'Start';
  return '<div class="arena challenge"><div class="stage-tag">' + escapeHtml(ui.mode) + '</div><h2>' + q.length + ' cards in this pass</h2><p class="muted">' + due + ' due or learning · ' + fresh + ' new. New cards left today: ' + Math.max(0, data.settings.newPerDay - newSeenToday()) + '.</p><button class="btn primary" type="button" data-act="start">' + label + '</button></div>';
}
function renderStudyDone() {
  var pct = session.answered ? Math.round(session.passed / session.answered * 100) : 0;
  return '<div class="arena challenge empty"><div class="stage-tag">PASS COMPLETE</div><h2>' + session.answered + ' graded</h2><p class="muted">' + pct + '% were Hard, Good, or Easy. Again comes back inside the pass, up to twice, then waits out its learning step.</p><div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-act="start">Continue</button><button class="btn" type="button" data-act="go" data-arg="dashboard">Command center</button></div></div>';
}
function renderStudyCard() {
  var card = session.queue[session.index];
  var style = Engine.styleFor(session.mode, card, data.settings.typeFirst);
  var p = data.progress[card.id];
  var state = !p || !p.reps ? 'NEW' : (p.state === 'review' ? 'REVIEW' : 'LEARNING');
  var clock = session.drillEnds ? '<span class="big-timer" id="drillClock" style="font-size:28px">' + fmtTime(Math.max(0, Math.ceil((session.drillEnds - Date.now()) / 1000))) + '</span>' : '<span class="muted subtle">' + (session.index + 1) + ' / ' + session.queue.length + '</span>';
  var front = Format.face(card.front, { cloze: card.type === 'cloze' || style === 'cloze', reveal: session.revealed });
  var body = '';
  if (!session.revealed) {
    if (style === 'flip') body = '<div class="actions"><button class="btn primary" type="button" data-act="reveal">Show answer</button><span class="fineprint">Space</span></div>';
    else {
      var placeholder = style === 'code' ? 'Write the C++ before you look.' : (style === 'cloze' ? 'Type the missing part, if you want a record of it.' : 'Write what you remember. Keyword matching is not the grade.');
      body = '<textarea class="response' + (style === 'code' ? ' mono' : '') + '" id="studyAnswer" placeholder="' + placeholder + '"></textarea><div class="actions" style="margin-top:14px"><button class="btn primary" type="button" data-act="reveal">Reveal</button><span class="fineprint">Ctrl / ⌘ Enter</span></div>';
    }
  } else {
    var typed = session.typed ? '<div class="hint-label">What you wrote</div><pre class="code-view"><code>' + escapeHtml(session.typed) + '</code></pre>' : '';
    var back = '<div class="answer-box"><span class="stage-tag">REFERENCE</span>' + Format.face(card.back, { cloze: true, reveal: true }) + '</div>';
    var keys = (card.keys || []).length ? '<div class="rubric">' + card.keys.map(function (k) { return '<span class="rubric-item">' + escapeHtml(k) + '</span>'; }).join('') + '</div>' : '';
    var now = Date.now();
    body = (style === 'cloze' ? '<div class="hint-label">Filled in</div>' + front : '') + typed + back + keys + ratingRow(session.outcomes, now);
    if (style === 'cloze') front = '';
  }
  var fill = session.drillEnds ? '<div class="timer-track"><div class="timer-fill" id="drillFill" style="width:' + Math.max(0, (session.drillEnds - Date.now()) / 3000) + '%"></div></div>' : '<div class="progress"><div class="bar" style="width:' + (session.index / session.queue.length * 100) + '%"></div></div>';
  return '<div class="arena"><div class="arena-head"><span class="stage-tag">' + escapeHtml(card.deck) + ' · ' + state + ' · ' + escapeHtml(card.type) + '</span>' + clock + '</div>' + fill + '<div class="challenge"><div class="tags">' + card.tags.map(function (t) { return '<span class="tag-pill">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' + (front ? '<div class="card-face">' + front + '</div>' : '') + body + '</div></div>';
}
function ratingRow(outcomes, now) {
  var rows = [[1, 'Again', 'Missed it', 'again'], [2, 'Hard', 'Gaps', 'hard'], [3, 'Good', 'Got it', 'good'], [4, 'Easy', 'Easy', 'easy']];
  return '<div class="hint-label">Grade the recall, not how obvious it looks now</div><div class="rating-row">' + rows.map(function (r) {
    var label = outcomes && outcomes[r[0]] ? Engine.formatInterval(outcomes[r[0]], now) : '';
    return '<button class="rating ' + r[3] + '" type="button" data-act="grade" data-arg="' + r[0] + '">' + r[1] + '<small>' + label + ' · ' + r[2] + '</small></button>';
  }).join('') + '</div><p class="fineprint">Keys 1–4 after the answer is up, as long as you are not in a text box.</p>';
}
function startSession(list) {
  var now = Date.now();
  var queue = list || Engine.buildQueue(queueOptions(ui.mode));
  session = {
    mode: ui.mode, queue: queue, index: 0, revealed: false, outcomes: null, typed: '',
    answered: 0, passed: 0, againCounts: {}, startedAt: now, grading: false, timeUp: false,
    drillEnds: ui.mode === 'drill' ? now + 5 * 60 * 1000 : null
  };
  render();
}
function revealStudy() {
  if (!session || session.revealed) return;
  var card = session.queue[session.index];
  if (!card) return;
  var box = document.getElementById('studyAnswer');
  session.typed = box ? box.value : '';
  var state = data.progress[card.id] || Engine.fresh();
  session.outcomes = Engine.scheduleAll(state, Date.now(), {
    retention: data.settings.retention,
    leechThreshold: data.settings.leechThreshold,
    seed: card.id
  });
  session.revealed = true;
  render();
}
function gradeStudy(rating) {
  if (!session || !session.revealed || session.grading) return;
  var card = session.queue[session.index];
  var next = session.outcomes && session.outcomes[rating];
  if (!card || !next) return;
  session.grading = true;
  var prev = data.progress[card.id] || Engine.fresh();
  var first = !(prev.reps > 0);
  data.progress[card.id] = next;
  var now = Date.now();
  data.reviews.push({ id: card.id, day: Engine.localDay(now), at: now, rating: rating, first: first, mode: session.mode });
  if (data.reviews.length > 8000) data.reviews = data.reviews.slice(-8000);
  practice(session.mode, { 1: 4, 2: 8, 3: 12, 4: 15 }[rating], card.id);
  session.answered += 1;
  if (rating > 1) session.passed += 1;
  if (rating === 1) {
    session.againCounts[card.id] = (session.againCounts[card.id] || 0) + 1;
    if (session.againCounts[card.id] <= 2) {
      session.queue = session.queue.filter(function (c, i) { return i <= session.index || c.id !== card.id; });
      var at = Math.min(session.queue.length, session.index + 4);
      session.queue.splice(at, 0, card);
    }
  }
  session.index += 1;
  session.revealed = false;
  session.outcomes = null;
  session.typed = '';
  session.grading = false;
  if (session.drillEnds && Date.now() >= session.drillEnds) {
    session.timeUp = true;
    session.index = session.queue.length;
  }
  render();
}

function renderLibrary() {
  var head = pageIntro('YOUR CARDS', 'Decks and cards', 'Built-in cards can be edited or hidden. Your own cards live in this browser with the review history.');
  var tools = '<div class="actions" style="margin-bottom:14px"><button class="btn primary" type="button" data-act="new-card">New card</button><button class="btn" type="button" data-act="new-deck">New deck</button><label class="btn" style="cursor:pointer">Import<input id="importFile" type="file" accept=".json,.md,.markdown,.csv,.txt,text/plain" hidden onchange="onImportFile(event)"></label><button class="btn ghost" type="button" data-act="export">Export backup</button></div>';
  var search = '<div class="field"><label for="searchBox">Search</label><input class="input" id="searchBox" placeholder="Words, tags, decks" value="' + escapeHtml(ui.query || '') + '" oninput="onSearchInput(this)"></div><div id="searchResults">' + searchResultsHtml(ui.query) + '</div>';
  var preview = ui.importPreview ? importPreviewHtml() : '';
  var editor = ui.edit ? editorHtml() : '';
  var tiles = '<div class="deck-grid">' + deckRecords().filter(function (d) { return ui.showHidden || !d.hidden; }).map(function (d) {
    var st = deckCounts(d.id);
    return '<div class="deck-tile' + (ui.libraryDeck === d.id ? ' on' : '') + (d.hidden ? ' dim' : '') + '"><button type="button" data-act="open-deck" data-arg="' + escapeHtml(d.id) + '"><div class="tiny-cap">' + (d.hidden ? 'HIDDEN' : st.due + ' due') + '</div><h3>' + escapeHtml(d.name) + '</h3><p>' + st.total + ' cards</p></button><div class="actions"><button class="btn small ghost" type="button" data-act="add-in" data-arg="' + escapeHtml(d.id) + '">Add</button><button class="btn small ghost" type="button" data-act="export-deck" data-arg="' + escapeHtml(d.id) + '">JSON</button><button class="btn small red" type="button" data-act="delete-deck" data-arg="' + escapeHtml(d.id) + '">' + (d.source === 'built-in' ? (d.hidden ? 'Restore' : 'Hide') : 'Delete') + '</button></div></div>';
  }).join('') + '</div>';
  var list = ui.libraryDeck ? cardListHtml(ui.libraryDeck) : '';
  var help = '<details class="panel" style="margin-top:16px"><summary class="muted" style="cursor:pointer">Import formats</summary><p>JSON can be a backup from this app, or <code class="inline-code">{"deck":"Name","cards":[{"type":"basic","front":"...","back":"...","tags":["a"]}]}</code>.</p><p>Markdown starts with <code class="inline-code"># Deck</code>, then <code class="inline-code">## question</code>, optional <code class="inline-code">type:</code> and <code class="inline-code">tags:</code> lines, then the answer. Separate cards with a line that is just <code class="inline-code">---</code>.</p><p>CSV columns: <code class="inline-code">deck,type,front,back,tags</code>.</p></details>';
  return head + tools + '<div class="two-col"><div class="panel">' + search + '</div><div class="panel"><label class="listline" style="cursor:pointer" data-act="toggle-hidden"><span>Show hidden built-in decks</span><input type="checkbox" ' + (ui.showHidden ? 'checked' : '') + '></label><p class="smallprint">Hiding a deck keeps it out of review. It does not delete the scheduler state.</p></div></div>' + preview + editor + '<div class="section-head"><div><h2>Decks</h2></div></div>' + tiles + list + help;
}
function searchResultsHtml(q) {
  if (!q || !q.trim()) return '';
  var hits = allCards().filter(function (c) {
    var blob = (c.front + '\n' + c.back + '\n' + c.tags.join(' ') + '\n' + c.deck).toLowerCase();
    return blob.indexOf(q.trim().toLowerCase()) >= 0;
  }).slice(0, 30);
  if (!hits.length) return '<p class="muted">No matches.</p>';
  return '<div class="result-list">' + hits.map(function (c) {
    return '<button class="result" type="button" data-act="edit" data-arg="' + escapeHtml(c.id) + '"><b>' + escapeHtml(c.deck) + '</b><span>' + escapeHtml(c.front.replace(/\s+/g, ' ').slice(0, 140)) + '</span></button>';
  }).join('') + '</div>';
}
function onSearchInput(el) { ui.query = el.value; var box = document.getElementById('searchResults'); if (box) box.innerHTML = searchResultsHtml(ui.query); }
function cardListHtml(deckId) {
  var cards = allCards().filter(function (c) { return c.deckId === deckId; });
  var hidden = [];
  (globalThis.PACKS || []).forEach(function (p) {
    p.cards.forEach(function (raw) { if (data.hidden[raw.id] && (raw.deckId || p.id) === deckId) hidden.push(raw); });
  });
  var rows = cards.map(function (c) {
    var p = data.progress[c.id];
    var meta = p && p.reps ? (p.state + ' · ' + (p.lapses || 0) + ' lapses') : 'new';
    return '<div class="listline"><div><b>' + escapeHtml(c.type) + '</b> <span class="muted">' + escapeHtml(c.front.replace(/\s+/g, ' ').slice(0, 110)) + '</span><div class="smallprint">' + escapeHtml(meta) + '</div></div><div class="actions"><button class="btn small" type="button" data-act="edit" data-arg="' + escapeHtml(c.id) + '">Edit</button><button class="btn small red" type="button" data-act="delete-card" data-arg="' + escapeHtml(c.id) + '">Delete</button></div></div>';
  }).join('');
  var hid = hidden.map(function (c) {
    return '<div class="listline"><span class="muted">Hidden · ' + escapeHtml((c.front || '').slice(0, 80)) + '</span><button class="btn small" type="button" data-act="restore-card" data-arg="' + escapeHtml(c.id) + '">Restore</button></div>';
  }).join('');
  return '<div class="panel" style="margin-top:16px"><h3>' + escapeHtml(deckName(deckId)) + '</h3>' + (rows || '<p class="muted">No visible cards.</p>') + hid + '</div>';
}
function editorHtml() {
  var e = ui.edit;
  var decks = visibleDecks();
  if (!decks.some(function (d) { return d.id === e.deckId; }) && e.deckId) decks = deckRecords().filter(function (d) { return d.id === e.deckId; }).concat(decks);
  return '<div class="panel editor" style="margin-top:16px"><h3>' + (e.id ? 'Edit card' : 'New card') + '</h3><div class="two-col"><div><div class="field"><label for="edDeck">Deck</label><select class="input" id="edDeck">' + decks.map(function (d) { return '<option value="' + escapeHtml(d.id) + '"' + (d.id === e.deckId ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>'; }).join('') + '</select></div><div class="field"><label for="edType">Type</label><select class="input" id="edType" onchange="previewEditor()">' + ['basic', 'cloze', 'interview', 'code'].map(function (t) { return '<option' + (e.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div><div class="field"><label for="edTags">Tags</label><input class="input" id="edTags" value="' + escapeHtml(e.tags) + '"></div><div class="field"><label for="edFront">Front · markdown. Cloze looks like {{c1::answer}}</label><textarea class="response" id="edFront" oninput="previewEditor()">' + escapeHtml(e.front) + '</textarea></div><div class="field"><label for="edBack">Back · markdown, fenced code, $math$</label><textarea class="response" id="edBack" oninput="previewEditor()">' + escapeHtml(e.back) + '</textarea></div><div class="actions"><button class="btn primary" type="button" data-act="save-card">Save</button><button class="btn" type="button" data-act="close-edit">Close</button></div></div><div><div class="tiny-cap">Front</div><div id="prevFront" class="preview"></div><div class="tiny-cap" style="margin-top:12px">Back</div><div id="prevBack" class="preview"></div></div></div></div>';
}
function previewEditor() {
  var typeEl = document.getElementById('edType');
  if (!typeEl) return;
  var type = typeEl.value;
  document.getElementById('prevFront').innerHTML = Format.face(document.getElementById('edFront').value, { cloze: type === 'cloze', reveal: false });
  document.getElementById('prevBack').innerHTML = Format.face(document.getElementById('edBack').value, { cloze: true, reveal: true });
}
function captureEditor() {
  if (!ui.edit) return;
  var front = document.getElementById('edFront');
  if (!front) return;
  ui.edit.front = front.value;
  ui.edit.back = document.getElementById('edBack').value;
  ui.edit.tags = document.getElementById('edTags').value;
  ui.edit.type = document.getElementById('edType').value;
  ui.edit.deckId = document.getElementById('edDeck').value;
}
function openEditor(card) {
  ui.edit = card ? {
    id: card.id, source: card.source, deckId: card.deckId, type: card.type,
    tags: (card.tags || []).join(', '), front: card.front, back: card.back
  } : {
    id: null, source: 'user', deckId: (visibleDecks()[0] && visibleDecks()[0].id) || 'my-cards',
    type: 'basic', tags: '', front: '', back: ''
  };
  ui.page = 'library';
  render();
}
function saveEditor() {
  captureEditor();
  var e = ui.edit;
  if (!e || !e.front.trim() || !e.back.trim()) { toast('A card needs a front and a back.'); return; }
  var tags = Store.splitTags(e.tags);
  var type = Store.normalizeType(e.type) || 'basic';
  if (e.id && e.source !== 'user' && builtinIds()[e.id]) {
    data.overrides[e.id] = { deckId: e.deckId, type: type, tags: tags, front: e.front, back: e.back };
  } else if (e.id) {
    var idx = data.custom.findIndex(function (c) { return c.id === e.id; });
    var row = { id: e.id, deckId: e.deckId, type: type, tags: tags, front: e.front, back: e.back, source: 'user' };
    if (idx >= 0) data.custom[idx] = row; else data.custom.push(row);
    delete data.overrides[e.id];
  } else {
    if (!e.deckId) e.deckId = ensureDeck('Notes');
    data.custom.push({ id: newId(), deckId: e.deckId, type: type, tags: tags, front: e.front, back: e.back, source: 'user' });
  }
  ui.edit = null;
  save();
  toast('Card saved.');
  render();
}
function newId() { return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
function ensureDeck(name) {
  name = String(name || 'Imported').trim() || 'Imported';
  var all = deckRecords();
  for (var i = 0; i < all.length; i++) if (all[i].name.toLowerCase() === name.toLowerCase()) return all[i].id;
  var id = 'deck-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  if (!id || id === 'deck-') id = 'deck-' + Date.now().toString(36);
  var base = id, n = 2;
  while (deckRecords().some(function (d) { return d.id === id; })) id = base + '-' + (n++);
  data.decks.push({ id: id, name: name, blurb: '' });
  return id;
}
function deleteCard(id) {
  if (!confirm('Remove this card from review on this browser?')) return;
  if (builtinIds()[id]) data.hidden[id] = true;
  else data.custom = data.custom.filter(function (c) { return c.id !== id; });
  delete data.progress[id];
  delete data.overrides[id];
  save();
  render();
}
function importPreviewHtml() {
  var p = ui.importPreview;
  if (p.kind === 'backup') {
    var n = p.data && p.data.progress ? Object.keys(p.data.progress).length : 0;
    return '<div class="panel" style="margin-top:16px"><h3>Restore backup</h3><p>This replaces XP, schedules, and your cards on this browser. ' + n + ' scheduled cards in the file.</p><div class="actions"><button class="btn primary" type="button" data-act="confirm-import">Replace local progress</button><button class="btn" type="button" data-act="cancel-import">Cancel</button></div></div>';
  }
  var sample = (p.cards || []).slice(0, 3).map(function (c) { return '<li>' + escapeHtml(c.front.slice(0, 120)) + '</li>'; }).join('');
  return '<div class="panel" style="margin-top:16px"><h3>Import ' + (p.cards || []).length + ' cards</h3><ul>' + sample + '</ul><div class="actions"><button class="btn primary" type="button" data-act="confirm-import">Add them</button><button class="btn" type="button" data-act="cancel-import">Cancel</button></div></div>';
}
function onImportFile(e) {
  var f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function () { stageImport(String(reader.result || ''), f.name); };
  reader.onerror = function () { toast('Could not read that file.'); };
  reader.readAsText(f);
}
function stageImport(text, name) {
  var trimmed = text.trim();
  var lower = name.toLowerCase();
  if (lower.endsWith('.json') || trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
    try {
      var obj = JSON.parse(trimmed);
      if (Store.isBackup(obj)) {
        var next = (obj.version >= 2 || (obj.data && (obj.data.version >= 2 || obj.data.progress))) ? Store.normalize(obj.data) : Store.migrateV1(obj);
        next.migrationDone = true;
        ui.importPreview = { kind: 'backup', data: next, name: name };
        ui.page = 'library';
        render();
        return;
      }
      ui.importPreview = { kind: 'cards', cards: Store.parseJsonCards(obj), name: name };
      ui.page = 'library';
      render();
      return;
    } catch (err) {
      if (lower.endsWith('.json')) { toast('That JSON did not parse.'); return; }
    }
  }
  var cards = (lower.endsWith('.csv') || /^deck\s*,/i.test(trimmed)) ? Store.parseCsv(text) : Store.parseMarkdown(text);
  if (!cards.length) { toast('No cards found in that file.'); return; }
  ui.importPreview = { kind: 'cards', cards: cards, name: name };
  ui.page = 'library';
  render();
}
function confirmImport() {
  var p = ui.importPreview;
  if (!p) return;
  if (p.kind === 'backup') {
    data = p.data;
    ui.importPreview = null;
    session = null;
    save();
    applyTheme();
    toast('Backup restored.');
    render();
    return;
  }
  var builtins = builtinIds();
  var n = 0;
  (p.cards || []).forEach(function (card) {
    if (!card || !card.front || !card.back) return;
    var deckId = ensureDeck(card.deck || 'Imported');
    var id = card.id && /^[A-Za-z0-9_-]{1,80}$/.test(card.id) && !builtins[card.id] ? card.id : newId();
    var row = { id: id, deckId: deckId, type: card.type || 'basic', tags: card.tags || [], front: card.front, back: card.back, source: 'user' };
    var idx = data.custom.findIndex(function (c) { return c.id === id; });
    if (idx >= 0) data.custom[idx] = row; else data.custom.push(row);
    n++;
  });
  ui.importPreview = null;
  save();
  toast('Imported ' + n + ' cards.');
  render();
}
function exportBackup() {
  download(JSON.stringify({ app: 'recall.run', version: 2, exported: Date.now(), data: data }, null, 2), 'recall-run-backup-' + Engine.localDay() + '.json');
}
function exportDeck(id) {
  var cards = allCards().filter(function (c) { return c.deckId === id; }).map(function (c) {
    return { id: c.id, type: c.type, front: c.front, back: c.back, tags: c.tags };
  });
  download(JSON.stringify({ deck: deckName(id), cards: cards }, null, 2), 'recall-deck-' + id + '.json');
}
function download(text, name) {
  var blob = new Blob([text], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function retentionStats(days) {
  var since = Date.now() - days * 86400000;
  var rows = data.reviews.filter(function (r) { return !r.first && r.at >= since; });
  if (!rows.length) return null;
  var pass = rows.filter(function (r) { return r.rating > 1; }).length;
  return { n: rows.length, rate: pass / rows.length, again: rows.length - pass };
}
function bestStreak() {
  var days = [];
  var seen = {};
  data.history.forEach(function (h) { if (!seen[h.day]) { seen[h.day] = 1; days.push(h.day); } });
  days.sort();
  var best = 0, cur = 0, prev = null;
  days.forEach(function (d) {
    if (prev && Engine.daysBetween(prev, d) === 1) cur += 1;
    else cur = 1;
    if (cur > best) best = cur;
    prev = d;
  });
  return best;
}
function activityMap() {
  var map = {};
  data.history.forEach(function (h) { map[h.day] = (map[h.day] || 0) + 1; });
  return map;
}
function heatmapHtml() {
  var weeks = 18;
  var counts = activityMap();
  var today = new Date(); today.setHours(12, 0, 0, 0);
  var mondayOffset = (today.getDay() + 6) % 7;
  var start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);
  var cells = '';
  for (var i = 0; i < weeks * 7; i++) {
    var d = new Date(start);
    d.setDate(start.getDate() + i);
    var key = Engine.localDay(d.getTime());
    var future = Engine.localDay(d.getTime()) > Engine.localDay();
    var n = future ? 0 : (counts[key] || 0);
    var cls = future ? 'future' : (n >= 8 ? 'h4' : n >= 4 ? 'h3' : n >= 2 ? 'h2' : n ? 'h1' : '');
    cells += '<div class="heat ' + cls + '" title="' + key + ': ' + n + '"></div>';
  }
  return '<div class="heat-grid">' + cells + '</div><div class="mini-legend">Less <div class="heat"></div><div class="heat h1"></div><div class="heat h2"></div><div class="heat h3"></div><div class="heat h4"></div> More</div>';
}
function forecastHtml() {
  var today = Engine.localDay();
  var buckets = [];
  for (var i = 0; i < 14; i++) buckets.push(0);
  var overdue = 0;
  allCards().forEach(function (c) {
    var p = data.progress[c.id];
    if (!p || !p.reps || !p.due) return;
    if (p.state === 'learning' || p.state === 'relearning') {
      if (p.due <= Date.now() + (data.settings.learnAheadMinutes || 0) * 60000) buckets[0] += 1;
      return;
    }
    var delta = Engine.daysBetween(today, Engine.localDay(p.due));
    if (delta < 0) overdue += 1;
    else if (delta < 14) buckets[delta] += 1;
  });
  var max = Math.max.apply(null, buckets.concat([1]));
  return '<p class="muted">' + overdue + ' overdue, sitting in today until you review them.</p><div class="forecast">' + buckets.map(function (n, i) {
    return '<div class="forecast-col" title="' + n + '"><div class="forecast-bar" style="height:' + Math.round(n / max * 100) + '%"></div><span>' + (i === 0 ? 'now' : i) + '</span></div>';
  }).join('') + '</div>';
}
function weakTagsHtml() {
  var stats = {};
  data.reviews.forEach(function (r) {
    if (r.first) return;
    var card = cardById(r.id);
    if (!card) return;
    card.tags.forEach(function (t) {
      if (!stats[t]) stats[t] = { n: 0, fail: 0 };
      stats[t].n += 1;
      if (r.rating === 1) stats[t].fail += 1;
    });
  });
  var rows = Object.keys(stats).filter(function (t) { return stats[t].n >= 2; }).map(function (t) {
    return { tag: t, n: stats[t].n, rate: stats[t].fail / stats[t].n };
  }).sort(function (a, b) { return b.rate - a.rate || b.n - a.n; }).slice(0, 8);
  if (!rows.length) return '<p class="muted">Tag weakness shows up after a tag has at least two repeat reviews.</p>';
  return rows.map(function (r) {
    return '<div class="listline"><b>' + escapeHtml(r.tag) + '</b><span class="chip">' + Math.round(r.rate * 100) + '% again · ' + r.n + '</span></div>';
  }).join('');
}
function renderStats() {
  var retention = retentionStats(30);
  var allTime = retentionStats(3650);
  var head = pageIntro('THE LOOP', 'Stats', 'Retention counts a repeat review as a success when it was not Again. The first time you see a card does not count.');
  var settings = '<div class="panel"><h3>Scheduler</h3><div class="field"><label for="newPerDay">New cards per day</label><input class="input" id="newPerDay" type="number" min="0" max="200" value="' + data.settings.newPerDay + '" onchange="setNum(\'newPerDay\', this.value, 0, 200)"></div>'
    + '<div class="field"><label for="maxReviews">Review cap per day</label><input class="input" id="maxReviews" type="number" min="0" max="2000" value="' + data.settings.maxReviews + '" onchange="setNum(\'maxReviews\', this.value, 0, 2000)"></div>'
    + '<div class="field"><label for="retention">Target retention <span id="retLabel">' + Math.round(data.settings.retention * 100) + '%</span></label><input id="retention" type="range" min="70" max="97" value="' + Math.round(data.settings.retention * 100) + '" oninput="document.getElementById(\'retLabel\').textContent=this.value+\'%\'" onchange="setRetention(this.value)"></div>'
    + '<p class="smallprint">Higher retention means shorter intervals. It applies the next time you grade a card.</p>'
    + '<div class="field"><label for="leechAt">Lapses before a card is a leech</label><input class="input" id="leechAt" type="number" min="2" max="30" value="' + data.settings.leechThreshold + '" onchange="setNum(\'leechThreshold\', this.value, 2, 30)"></div>'
    + '<div class="listline"><span>Type the answer on basic cards in Today and Mixed</span><button class="btn small ghost" type="button" data-act="type-first">' + (data.settings.typeFirst ? 'On' : 'Off') + '</button></div>'
    + '<div class="listline"><span>Sound</span><button class="btn small ghost" type="button" data-act="sound">' + (data.settings.sound ? 'On' : 'Off') + '</button></div>'
    + '<div class="divider"></div><div class="actions"><button class="btn" type="button" data-act="export">Export backup</button><button class="btn red" type="button" data-act="reset">Reset this browser</button></div></div>';
  return head + '<div class="stats-grid"><div class="stat"><div class="tiny-cap">Streak</div><div class="val">' + data.streak + '</div><div class="lbl">Best ' + bestStreak() + '</div></div>'
    + '<div class="stat"><div class="tiny-cap">30-day retention</div><div class="val">' + (retention ? Math.round(retention.rate * 100) + '%' : '—') + '</div><div class="lbl">' + (retention ? retention.again + ' agains / ' + retention.n : 'No repeat reviews yet') + '</div></div>'
    + '<div class="stat"><div class="tiny-cap">All-time retention</div><div class="val">' + (allTime ? Math.round(allTime.rate * 100) + '%' : '—') + '</div><div class="lbl">' + data.reviews.length + ' grades stored</div></div>'
    + '<div class="stat"><div class="tiny-cap">Due</div><div class="val">' + dueCount() + '</div><div class="lbl">' + allCards().length + ' cards in view</div></div></div>'
    + '<div class="two-col"><div><div class="panel"><h3>Reviews</h3><p class="muted subtle">Each square is a day. The grid starts on a Monday.</p>' + heatmapHtml() + '</div><div class="panel" style="margin-top:16px"><h3>Due over the next 14 days</h3>' + forecastHtml() + '</div><div class="panel" style="margin-top:16px"><h3>Weakest tags</h3><p class="smallprint">Share of repeat reviews graded Again.</p>' + weakTagsHtml() + '</div></div>' + settings + '</div>'
    + '<p class="footer-note">FSRS-5 default weights. Self-grades are not a measurement of how a real interview would go. <a href="https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm" target="_blank" rel="noopener noreferrer">Algorithm notes</a>.</p>';
}
function leechList() {
  var th = data.settings.leechThreshold || 8;
  var leeches = [], risk = [];
  allCards().forEach(function (c) {
    var p = data.progress[c.id];
    if (!p) return;
    if (p.leech || p.lapses >= th) leeches.push(c);
    else if (p.lapses >= 3) risk.push(c);
  });
  return { leeches: leeches, risk: risk, th: th };
}
function renderLeeches() {
  var lists = leechList();
  function rows(cards) {
    if (!cards.length) return '<p class="muted">None.</p>';
    return cards.map(function (c) {
      var p = data.progress[c.id];
      return '<div class="listline"><div><b>' + escapeHtml(c.deck) + '</b><div class="muted">' + escapeHtml(c.front.replace(/\s+/g, ' ').slice(0, 140)) + '</div><div class="smallprint">' + p.lapses + ' lapses · ' + escapeHtml(p.state) + '</div></div><div class="actions"><button class="btn small" type="button" data-act="edit" data-arg="' + escapeHtml(c.id) + '">Edit</button><button class="btn small ghost" type="button" data-act="reset-card" data-arg="' + escapeHtml(c.id) + '">Reset schedule</button></div></div>';
    }).join('');
  }
  return pageIntro('CARDS THAT STICK', 'Leeches', 'A leech has failed at least ' + lists.th + ' times after it had graduated. At risk means three or more lapses.')
    + '<div class="actions" style="margin-bottom:12px"><button class="btn primary" type="button" data-act="review-leeches"' + (lists.leeches.length + lists.risk.length ? '' : ' disabled') + '>Review these</button></div>'
    + '<div class="two-col"><div class="panel"><h3>Leeches</h3>' + rows(lists.leeches) + '</div><div class="panel"><h3>At risk</h3>' + rows(lists.risk) + '</div></div>';
}
function setNum(key, value, min, max) {
  var n = Math.round(Number(value));
  if (!isFinite(n)) return;
  data.settings[key] = Math.min(max, Math.max(min, n));
  save();
}
function setRetention(pct) {
  var n = Number(pct);
  if (!isFinite(n)) return;
  data.settings.retention = Math.min(0.97, Math.max(0.7, n / 100));
  save();
}

function onKey(e) {
  var tag = document.activeElement && document.activeElement.tagName;
  var typing = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ui.page === 'study') {
    e.preventDefault();
    if (session && !session.revealed) revealStudy();
    return;
  }
  if (ui.page !== 'study' || !session || typing) return;
  if (session.index >= session.queue.length) return;
  if ((e.key === ' ' || e.key === 'Enter') && !session.revealed) { e.preventDefault(); revealStudy(); return; }
  if (session.revealed && e.key >= '1' && e.key <= '4') { e.preventDefault(); gradeStudy(Number(e.key)); }
}
function onClick(e) {
  var el = e.target.closest('[data-act]');
  if (!el) return;
  var act = el.getAttribute('data-act');
  var arg = el.getAttribute('data-arg');
  if (act === 'go') go(arg);
  else if (act === 'menu') document.querySelector('.sidebar').classList.toggle('open');
  else if (act === 'theme') { data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light'; save(); render(); }
  else if (act === 'mode') setMode(arg);
  else if (act === 'deck-all') { ui.deckFilter = null; session = null; render(); }
  else if (act === 'deck') toggleDeck(arg);
  else if (act === 'start') startSession();
  else if (act === 'reveal') revealStudy();
  else if (act === 'grade') gradeStudy(Number(arg));
  else if (act === 'open-deck') { ui.libraryDeck = arg; ui.page = 'library'; if (location.hash !== '#library') history.replaceState(null, '', '#library'); render(); }
  else if (act === 'new-card') openEditor(null);
  else if (act === 'add-in') openEditor({ id: null, source: 'user', deckId: arg, type: 'basic', tags: [], front: '', back: '' });
  else if (act === 'new-deck') {
    var name = window.prompt('Deck name');
    if (!name || !name.trim()) return;
    ensureDeck(name.trim());
    save();
    render();
  }
  else if (act === 'edit') { var card = cardById(arg); if (card) openEditor(card); }
  else if (act === 'close-edit') { ui.edit = null; render(); }
  else if (act === 'save-card') saveEditor();
  else if (act === 'delete-card') deleteCard(arg);
  else if (act === 'restore-card') { delete data.hidden[arg]; save(); render(); }
  else if (act === 'delete-deck') {
    var rec = deckRecords().filter(function (d) { return d.id === arg; })[0];
    if (!rec) return;
    if (rec.source === 'built-in') {
      if (rec.hidden) delete data.hiddenDecks[arg];
      else { if (!confirm('Hide this deck from review?')) return; data.hiddenDecks[arg] = true; }
    } else {
      if (!confirm('Delete this deck and the cards you added to it?')) return;
      data.decks = data.decks.filter(function (d) { return d.id !== arg; });
      var gone = {};
      data.custom = data.custom.filter(function (c) { if (c.deckId === arg) { gone[c.id] = 1; return false; } return true; });
      Object.keys(gone).forEach(function (id) { delete data.progress[id]; });
    }
    if (ui.libraryDeck === arg) ui.libraryDeck = null;
    save(); render();
  }
  else if (act === 'export') exportBackup();
  else if (act === 'export-deck') exportDeck(arg);
  else if (act === 'confirm-import') confirmImport();
  else if (act === 'cancel-import') { ui.importPreview = null; render(); }
  else if (act === 'toggle-hidden') {
    e.preventDefault();
    ui.showHidden = !ui.showHidden;
    render();
  }
  else if (act === 'type-first') { data.settings.typeFirst = !data.settings.typeFirst; save(); render(); }
  else if (act === 'sound') { data.settings.sound = !data.settings.sound; save(); render(); }
  else if (act === 'reset') {
    if (!confirm('Delete XP, review history, edits, and your cards on this browser?')) return;
    var theme = data.settings.theme;
    data = Store.blank();
    data.migrationDone = true;
    data.settings.theme = theme;
    session = null;
    save();
    render();
  }
  else if (act === 'reset-card') {
    delete data.progress[arg];
    save();
    toast('Schedule cleared.');
    render();
  }
  else if (act === 'review-leeches') {
    var lists = leechList();
    var cards = lists.leeches.concat(lists.risk);
    if (!cards.length) return;
    ui.mode = 'flash';
    ui.page = 'study';
    startSession(cards);
  }
  else if (act === 'install') {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent = null;
  }
}
function setMode(mode) {
  if (!MODES.some(function (m) { return m[0] === mode; })) return;
  if (ui.mode !== mode) session = null;
  ui.mode = mode;
  ui.page = 'study';
  var token = 'study-' + mode;
  if (location.hash !== '#' + token) history.replaceState(null, '', '#' + token);
  render();
}
function toggleDeck(id) {
  var ids = visibleDecks().map(function (d) { return d.id; });
  if (!ui.deckFilter) ui.deckFilter = {};
  if (ui.deckFilter[id]) delete ui.deckFilter[id];
  else ui.deckFilter[id] = true;
  if (!Object.keys(ui.deckFilter).length || Object.keys(ui.deckFilter).length === ids.length) ui.deckFilter = null;
  session = null;
  render();
}

function boot() {
  load();
  ui = freshUi();
  applyTheme();
  var token = (location.hash || '').replace(/^#/, '');
  document.body.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', function () {
    var next = (location.hash || '').replace(/^#/, '');
    if (next && next !== locationToken()) go(next);
  });
  window.addEventListener('beforeunload', function () { save(); });
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    var b = document.getElementById('installBtn');
    if (b) b.hidden = false;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
  go(token || 'dashboard');
}
boot();
