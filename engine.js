// FSRS-5 scheduler (default weights) plus day-based review and short learning steps.
(function () {
  var W = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395,
    0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621
  ];
  var DECAY = -0.5;
  var FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  function constrainDifficulty(d) { return clamp(d, 1, 10); }

  function constrainStability(s) { return clamp(s, 0.01, 36500); }

  function initStability(grade) { return Math.max(W[grade - 1], 0.1); }

  function initDifficulty(grade) {
    return constrainDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
  }

  function meanReversion(init, current) {
    return W[7] * init + (1 - W[7]) * current;
  }

  function nextDifficulty(d, grade) {
    var next = d - W[6] * (grade - 3);
    return constrainDifficulty(meanReversion(initDifficulty(4), next));
  }

  function nextRecallStability(d, s, r, grade) {
    var hardPenalty = grade === 2 ? W[15] : 1;
    var easyBonus = grade === 4 ? W[16] : 1;
    return constrainStability(
      s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus)
    );
  }

  function nextForgetStability(d, s, r) {
    return constrainStability(
      W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
    );
  }

  function nextShortTermStability(s, grade) {
    return constrainStability(s * Math.exp(W[17] * (grade - 3 + W[18])));
  }

  function retrievability(stability, elapsedDays) {
    if (!(stability > 0)) return 0;
    if (!(elapsedDays > 0)) return 1;
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  function intervalDays(stability, retention) {
    var r = clamp(retention || 0.9, 0.7, 0.97);
    var ivl = (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
    if (!isFinite(ivl) || ivl < 0) return stability;
    return ivl;
  }

  function hash32(str) {
    var h = 2166136261;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function fuzzDays(days, seed) {
    if (days < 3) return days;
    var range = days < 7 ? 0.05 : days < 30 ? 0.08 : 0.04;
    var min = Math.max(2, Math.round(days * (1 - range)));
    var max = Math.max(min, Math.round(days * (1 + range)));
    var x = hash32(seed) % 1000 / 1000;
    return min + Math.floor(x * (max - min + 1));
  }

  function startOfLocalDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addLocalDays(ts, days) {
    var d = new Date(startOfLocalDay(ts));
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  function localDay(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function daysBetween(a, b) {
    var p = function (s) { return new Date(s + 'T12:00:00').getTime(); };
    return Math.round((p(b) - p(a)) / 86400000);
  }

  function fresh() {
    return {
      stability: 0,
      difficulty: 0,
      due: 0,
      state: 'new',
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      lastReview: null,
      rating: 0,
      leech: false
    };
  }

  function schedule(state, grade, now, opts) {
    opts = opts || {};
    var retention = opts.retention || 0.9;
    var leechAt = opts.leechThreshold || 8;
    var seed = opts.seed || 'card';
    var cur = state && state.reps ? state : fresh();
    var reviewed = cur.reps > 0 && cur.stability > 0 && cur.lastReview;
    var elapsed = reviewed ? Math.max(0, (now - cur.lastReview) / 86400000) : 0;
    var s, d;
    if (!reviewed) {
      s = initStability(grade);
      d = initDifficulty(grade);
    } else {
      var r = retrievability(cur.stability, elapsed);
      d = nextDifficulty(cur.difficulty, grade);
      var learning = cur.state === 'learning' || cur.state === 'relearning';
      if (grade === 1) s = nextForgetStability(cur.difficulty, cur.stability, r);
      else if (learning && elapsed < 1) s = nextShortTermStability(cur.stability, grade);
      else s = nextRecallStability(cur.difficulty, cur.stability, r, grade);
    }

    var lapses = cur.lapses || 0;
    if (grade === 1 && cur.state === 'review') lapses += 1;

    var next = {
      stability: s,
      difficulty: d,
      reps: (cur.reps || 0) + 1,
      lapses: lapses,
      lastReview: now,
      rating: grade,
      leech: lapses >= leechAt,
      elapsedDays: elapsed
    };

    var learningState = cur.state === 'review' || cur.state === 'relearning' ? 'relearning' : 'learning';
    if (grade === 1) {
      var minutes = (cur.state === 'review' || cur.state === 'relearning') ? 10 : 1;
      next.state = learningState;
      next.scheduledDays = 0;
      next.due = now + minutes * 60000;
      return next;
    }
    if (grade === 2 && (cur.state === 'learning' || cur.state === 'relearning')) {
      next.state = cur.state;
      next.scheduledDays = 0;
      next.due = now + 6 * 60000;
      return next;
    }

    var rounded = clamp(Math.round(intervalDays(s, retention)), 1, 36500);
    var days = fuzzDays(rounded, seed + '|' + (cur.reps || 0) + '|' + grade + '|' + localDay(now));
    next.state = 'review';
    next.scheduledDays = days;
    next.due = addLocalDays(now, days);
    return next;
  }

  function scheduleAll(state, now, opts) {
    var out = {};
    var grades = [1, 2, 3, 4];
    for (var i = 0; i < grades.length; i++) out[grades[i]] = schedule(state, grades[i], now, opts);
    var dayGrades = [];
    for (var j = 0; j < grades.length; j++) {
      if (out[grades[j]].state === 'review') dayGrades.push(grades[j]);
    }
    for (var k = 1; k < dayGrades.length; k++) {
      var prev = out[dayGrades[k - 1]];
      var cur = out[dayGrades[k]];
      if (cur.scheduledDays <= prev.scheduledDays) {
        cur.scheduledDays = Math.min(36500, prev.scheduledDays + 1);
        cur.due = addLocalDays(now, cur.scheduledDays);
      }
    }
    return out;
  }

  function formatInterval(next, now) {
    if (!next) return '';
    if (next.state === 'learning' || next.state === 'relearning') {
      var mins = Math.max(1, Math.round(Math.max(0, next.due - now) / 60000));
      if (mins < 90) return mins + 'm';
      var hours = Math.max(1, Math.round(mins / 60));
      return hours + 'h';
    }
    var days = next.scheduledDays || 0;
    if (days <= 1) return '1d';
    if (days < 90) return days + 'd';
    if (days < 365) {
      var months = days / 30;
      return (months >= 10 ? Math.round(months) : months.toFixed(1).replace(/\.0$/, '')) + 'mo';
    }
    var years = days / 365;
    return (years >= 10 ? Math.round(years) : years.toFixed(1).replace(/\.0$/, '')) + 'y';
  }

  function endOfLocalDay(ts) {
    return addLocalDays(ts, 1);
  }

  function interleave(cards, keyFn) {
    var groups = new Map();
    var order = [];
    for (var i = 0; i < cards.length; i++) {
      var key = keyFn(cards[i]);
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key).push(cards[i]);
    }
    var out = [];
    var added = true;
    while (added) {
      added = false;
      for (var k = 0; k < order.length; k++) {
        var g = groups.get(order[k]);
        if (g.length) { out.push(g.shift()); added = true; }
      }
    }
    return out;
  }

  function modeAllows(mode, card) {
    if (mode === 'recall') return card.type === 'basic' || card.type === 'interview';
    if (mode === 'cloze') return card.type === 'cloze';
    if (mode === 'interview') return card.type === 'interview';
    if (mode === 'code') return card.type === 'code';
    return true;
  }

  function styleFor(mode, card, typeFirst) {
    if (mode === 'recall') return 'type';
    if (mode === 'flash' || mode === 'drill') return 'flip';
    if (mode === 'cloze') return 'cloze';
    if (mode === 'interview') return 'interview';
    if (mode === 'code') return 'code';
    if (card.type === 'cloze') return 'cloze';
    if (card.type === 'code') return 'code';
    if (card.type === 'interview') return 'interview';
    if (typeFirst && card.type === 'basic') return 'type';
    return 'flip';
  }

  function buildQueue(opts) {
    var cards = opts.cards || [];
    var progress = opts.progress || {};
    var now = opts.now || Date.now();
    var settings = opts.settings || {};
    var mode = opts.mode || 'today';
    var newBudget = Math.max(0, (settings.newPerDay != null ? settings.newPerDay : 20) - (opts.newSeen || 0));
    var reviewBudget = Math.max(0, (settings.maxReviews != null ? settings.maxReviews : 200) - (opts.reviewsSeen || 0));
    var ahead = now + (settings.learnAheadMinutes != null ? settings.learnAheadMinutes : 20) * 60000;
    var endToday = endOfLocalDay(now);
    var learning = [];
    var due = [];
    var fresh = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!modeAllows(mode, card)) continue;
      var p = progress[card.id];
      if (!p || !p.reps || p.state === 'new') { fresh.push(card); continue; }
      if (p.state === 'learning' || p.state === 'relearning') {
        if (p.due <= ahead) learning.push(card);
        continue;
      }
      if (p.due < endToday) due.push(card);
    }
    learning.sort(function (a, b) { return (progress[a.id].due || 0) - (progress[b.id].due || 0); });
    due.sort(function (a, b) { return (progress[a.id].due || 0) - (progress[b.id].due || 0); });
    var dueCut = due.slice(0, reviewBudget);
    var newCut = fresh.slice(0, newBudget);
    var keyFn = function (c) { return c.deckId || c.deck || 'deck'; };
    var mixed = learning.concat(interleave(dueCut, keyFn), interleave(newCut, keyFn));
    if (mode === 'drill') {
      var extraNew = Math.min(5, newBudget);
      return learning.concat(interleave(due, keyFn), interleave(fresh, keyFn).slice(0, extraNew));
    }
    if (mode === 'today') return mixed;
    var cap = settings.sessionSize || 20;
    if (mode === 'mixed') return mixed.slice(0, cap);
    return mixed.slice(0, Math.max(cap, 20));
  }

  globalThis.Engine = {
    W: W,
    FACTOR: FACTOR,
    DECAY: DECAY,
    fresh: fresh,
    initStability: initStability,
    initDifficulty: initDifficulty,
    retrievability: retrievability,
    intervalDays: intervalDays,
    schedule: schedule,
    scheduleAll: scheduleAll,
    formatInterval: formatInterval,
    startOfLocalDay: startOfLocalDay,
    addLocalDays: addLocalDays,
    endOfLocalDay: endOfLocalDay,
    localDay: localDay,
    daysBetween: daysBetween,
    interleave: interleave,
    modeAllows: modeAllows,
    styleFor: styleFor,
    buildQueue: buildQueue,
    hash32: hash32
  };
})();
