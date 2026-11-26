// Architecture, C++ trace, vocabulary, speaking, and mock drills.
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function initializeArch() { ui.archPhase = 'ready'; ui.archPicks = []; ui.archTime = 20; }
function changeArch(i) {
  cleanUp();
  ui.archIx = (i + ARCH.length) % ARCH.length;
  initializeArch();
  render();
}
function startArch() {
  ui.archPhase = 'study';
  render();
  startTimer(20, function (sec) {
    ui.archTime = sec;
    if ($('#phaseTimer')) $('#phaseTimer').textContent = sec + 's';
    if ($('#phaseFill')) $('#phaseFill').style.width = (sec / 20 * 100) + '%';
  }, function () { ui.archPhase = 'reconstruct'; render(); });
}
function skipArchStudy() { clearInterval(tick); tick = null; ui.archPhase = 'reconstruct'; render(); }
function pickArch(i) {
  var a = ARCH[ui.archIx];
  if (ui.archPicks.indexOf(i) >= 0 || ui.archPicks.length >= a.path.length) return;
  ui.archPicks.push(i);
  render();
}
function unpickArch() { ui.archPicks.pop(); render(); }
function submitArch() {
  var a = ARCH[ui.archIx];
  if (ui.archPicks.length !== a.path.length) return;
  var correct = ui.archPicks.filter(function (j, i) { return j === i; }).length;
  ui.archScore = correct;
  ui.archPhase = 'result';
  practice('arch', 10 + correct * 8, a.id + ':' + correct + '/' + a.path.length);
  render();
}
function renderArch() {
  var a = ARCH[ui.archIx];
  var head = pageIntro('SPATIAL RECALL', 'Architecture lab', 'Study a system path briefly, hide it, then rebuild it in order.');
  var bar = '<div class="toolbar"><div class="seg"><button class="pill" type="button" onclick="changeArch(' + (ui.archIx - 1) + ')">← Previous</button><span class="chip">' + (ui.archIx + 1) + ' / ' + ARCH.length + '</span><button class="pill" type="button" onclick="changeArch(' + (ui.archIx + 1) + ')">Next →</button></div><span class="chip">' + escapeHtml(a.name) + '</span></div>';
  var common = '<div class="stage-tag">SYSTEM BLUEPRINT · ' + escapeHtml(a.name) + '</div><h2>' + escapeHtml(a.caption) + '</h2><p class="muted">' + escapeHtml(a.brief) + '</p>';
  if (ui.archPhase === 'ready') return head + bar + '<div class="arena challenge">' + common + '<div class="lesson" style="margin:22px 0">You get 20 seconds with the reference flow. Then it disappears and you rebuild the sequence.</div><button class="btn primary" type="button" onclick="startArch()">Start 20-second snapshot →</button></div>';
  if (ui.archPhase === 'study') return head + bar + '<div class="arena challenge">' + common + '<div class="question-top" style="margin-top:22px"><span class="stage-tag">MEMORIZE THE FLOW</span><span class="big-timer" id="phaseTimer">20s</span></div><div class="timer-track"><div class="timer-fill" id="phaseFill"></div></div><div class="arch-nodes">' + a.path.map(function (n, i) { return '<span class="node">' + escapeHtml(n) + '</span>' + (i < a.path.length - 1 ? '<span class="arrow">→</span>' : ''); }).join('') + '</div><div class="hint-label">Remember these design reasons too</div><div class="rubric">' + a.decisions.map(function (x) { return '<span class="rubric-item">' + escapeHtml(x) + '</span>'; }).join('') + '</div><button class="btn ghost small" type="button" onclick="skipArchStudy()">Hide now</button></div>';
  if (ui.archPhase === 'reconstruct') {
    var pool = a.path.map(function (n, i) { return { n: n, i: i }; }).sort(function (x, y) { return ((x.i * 7 + ui.archIx * 3) % 11) - ((y.i * 7 + ui.archIx * 3) % 11); });
    return head + bar + '<div class="arena challenge">' + common + '<div class="stage-tag" style="margin-top:25px">RECONSTRUCT FROM MEMORY</div><p>Choose the nodes in the order you saw them.</p><div class="sequence">' + (ui.archPicks.length ? ui.archPicks.map(function (i, j) { return '<span class="choice" style="cursor:default">' + (j + 1) + '. ' + escapeHtml(a.path[i]) + '</span>'; }).join('<span class="arrow">→</span>') : '<span class="muted">Your sequence appears here.</span>') + '</div><div class="hint-label">Available components</div><div class="choice-box">' + pool.map(function (x) { return '<button class="choice" type="button" onclick="pickArch(' + x.i + ')" ' + (ui.archPicks.indexOf(x.i) >= 0 ? 'disabled' : '') + '>' + escapeHtml(x.n) + '</button>'; }).join('') + '</div><div class="actions"><button class="btn primary" type="button" onclick="submitArch()" ' + (ui.archPicks.length !== a.path.length ? 'disabled' : '') + '>Check</button><button class="btn" type="button" onclick="unpickArch()" ' + (!ui.archPicks.length ? 'disabled' : '') + '>Undo</button></div></div>';
  }
  return head + bar + '<div class="arena challenge">' + common + '<div class="score">' + ui.archScore + ' / ' + a.path.length + '</div><div class="muted">Nodes in the correct position</div><div class="arch-nodes">' + a.path.map(function (n, i) { return '<span class="node" style="border-color:' + (ui.archPicks[i] === i ? '#b7fa76' : '#ff818e') + '">' + escapeHtml(n) + '</span>' + (i < a.path.length - 1 ? '<span class="arrow">→</span>' : ''); }).join('') + '</div><div class="answer-box"><b>What an interviewer would probe</b><ul>' + a.decisions.map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ul><p><b>Trap:</b> ' + escapeHtml(a.trap) + '</p></div><div class="actions" style="margin-top:18px"><button class="btn primary" type="button" onclick="changeArch(' + (ui.archIx + 1) + ')">Next blueprint →</button><button class="btn" type="button" onclick="initializeArch();render()">Repeat</button></div></div>';
}

function initializeTrace() { ui.tracePhase = 'ready'; ui.traceTime = TRACES[ui.traceIx].seconds; }
function changeTrace(i) { cleanUp(); ui.traceIx = (i + TRACES.length) % TRACES.length; initializeTrace(); render(); }
function startTrace() {
  ui.tracePhase = 'study';
  render();
  var seconds = TRACES[ui.traceIx].seconds;
  startTimer(seconds, function (s) {
    ui.traceTime = s;
    if ($('#phaseTimer')) $('#phaseTimer').textContent = s + 's';
    if ($('#phaseFill')) $('#phaseFill').style.width = (s / seconds * 100) + '%';
  }, function () { ui.tracePhase = 'answer'; render(); });
}
function hideTrace() { clearInterval(tick); tick = null; ui.tracePhase = 'answer'; render(); }
function normOutput(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/["']/g, ''); }
function checkTrace() {
  var t = TRACES[ui.traceIx];
  var guess = $('#traceAnswer') ? $('#traceAnswer').value : '';
  if (!guess.trim()) { toast('Write the output first.'); return; }
  ui.traceGuess = guess;
  ui.traceCorrect = normOutput(guess) === normOutput(t.answer);
  ui.tracePhase = 'result';
  practice('trace', ui.traceCorrect ? 12 : 4, t.id);
  render();
}
function renderTrace() {
  var t = TRACES[ui.traceIx];
  var head = pageIntro('READ, HIDE, EXECUTE', 'C++ trace', 'Read a small C++ program, then say exactly what it prints. Whitespace is collapsed. The check is strict about the tokens.');
  var bar = '<div class="toolbar"><div class="seg"><button class="pill" type="button" onclick="changeTrace(' + (ui.traceIx - 1) + ')">← Previous</button><span class="chip">' + (ui.traceIx + 1) + ' / ' + TRACES.length + '</span><button class="pill" type="button" onclick="changeTrace(' + (ui.traceIx + 1) + ')">Next →</button></div><span class="chip">' + escapeHtml(t.tag) + '</span></div>';
  if (ui.tracePhase === 'ready') return head + bar + '<div class="arena challenge"><div class="stage-tag">C++ SNAPSHOT</div><h2>Can you execute it?</h2><p class="muted">You get ' + t.seconds + ' seconds with the program. Then it disappears.</p><button class="btn primary" type="button" onclick="startTrace()">Show the code</button></div>';
  if (ui.tracePhase === 'study') return head + bar + '<div class="arena challenge"><div class="question-top"><span class="stage-tag">READ IT</span><span class="big-timer" id="phaseTimer">' + t.seconds + 's</span></div><div class="timer-track"><div class="timer-fill" id="phaseFill"></div></div><pre class="code-view"><code>' + Format.highlight(t.code, 'cpp') + '</code></pre><button class="btn ghost small" type="button" onclick="hideTrace()">Hide early</button></div>';
  if (ui.tracePhase === 'answer') return head + bar + '<div class="arena challenge"><span class="stage-tag">FROM MEMORY</span><h2>What does it print?</h2><textarea class="response mono" id="traceAnswer" placeholder="Exact output"></textarea><div class="actions" style="margin-top:15px"><button class="btn primary" type="button" onclick="checkTrace()">Check</button><button class="btn ghost" type="button" onclick="startTrace()">Study again</button></div></div>';
  return head + bar + '<div class="arena challenge"><div class="stage-tag">' + (ui.traceCorrect ? 'CORRECT' : 'NOT QUITE') + '</div><h2>' + (ui.traceCorrect ? 'That output matches.' : 'Here is the actual output.') + '</h2><div class="hint-label">Expected</div><pre class="code-view"><code>' + escapeHtml(t.answer) + '</code></pre><div class="hint-label">Yours</div><pre class="code-view"><code>' + escapeHtml(ui.traceGuess || '') + '</code></pre><div class="answer-box"><b>Why</b><p>' + escapeHtml(t.why) + '</p></div><details style="margin:17px 0"><summary class="muted" style="cursor:pointer">Show the program</summary><pre class="code-view"><code>' + Format.highlight(t.code, 'cpp') + '</code></pre></details><div class="actions"><button class="btn primary" type="button" onclick="changeTrace(' + (ui.traceIx + 1) + ')">Next</button><button class="btn" type="button" onclick="initializeTrace();render()">Repeat</button></div></div>';
}

function wordOptionsFor(ix) {
  return shuffle(WORDS[ix][3].map(function (text, i) { return { text: text, correct: i === 0 }; }));
}
function initializeWord() {
  ui.wordPhase = 'ask';
  ui.wordChoice = -1;
  if (typeof ui.wordIx !== 'number' || ui.wordIx < 0) ui.wordIx = 0;
  ui.wordIx = ui.wordIx % WORDS.length;
  ui.wordOptions = wordOptionsFor(ui.wordIx);
}
function changeWord() {
  ui.wordIx = (ui.wordIx + 1) % WORDS.length;
  initializeWord();
  render();
}
function pickWord(i) {
  if (ui.wordPhase === 'done') return;
  ui.wordChoice = i;
  ui.wordPhase = 'done';
  practice('words', ui.wordOptions[i].correct ? 6 : 2, WORDS[ui.wordIx][0]);
  render();
}
function renderWords() {
  var w = WORDS[ui.wordIx];
  var head = pageIntro('SAY IT PRECISELY', 'Word forge', 'Pick the sentence that would survive a follow-up question.');
  var term = w[0], vague = w[1], right = w[2], why = w[4];
  return head + '<div class="arena"><div class="arena-head"><span class="stage-tag">IN CONTEXT</span><span class="chip">' + (ui.wordIx + 1) + ' / ' + WORDS.length + '</span></div><div class="challenge"><div class="vocab-word">' + escapeHtml(term) + '</div><div class="hint-label">Replace this</div><div class="prompt-quote">' + escapeHtml(vague) + '</div><div class="options-grid">' + ui.wordOptions.map(function (op, i) {
    var cls = '';
    if (ui.wordPhase === 'done') cls = op.correct ? 'correct' : (i === ui.wordChoice ? 'wrong' : '');
    return '<button class="opt ' + cls + '" type="button" onclick="pickWord(' + i + ')" ' + (ui.wordPhase === 'done' ? 'disabled' : '') + '>' + escapeHtml(op.text) + '</button>';
  }).join('') + '</div>' + (ui.wordPhase === 'done' ? '<div class="answer-box"><b>' + (ui.wordOptions[ui.wordChoice] && ui.wordOptions[ui.wordChoice].correct ? 'That one.' : 'Clearer version') + '</b><p>' + escapeHtml(right) + '</p><p>' + escapeHtml(why) + '</p></div><button class="btn primary" type="button" onclick="changeWord()">Next</button>' : '') + '</div></div>';
}

function initializeSpeak() {
  ui.speaking = false; ui.speakElapsed = 0; ui.speakFeedback = null; ui.speechFinal = ''; ui.speakText = '';
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
}
function changeSpeak(i) { cleanUp(); ui.speakIx = (i + SPEAK.length) % SPEAK.length; initializeSpeak(); render(); }
function beginSpeak() {
  if (ui.speaking) return;
  ui.speaking = true; ui.speakElapsed = 0; ui.speakFeedback = null; render();
  var start = Date.now();
  tick = setInterval(function () {
    ui.speakElapsed = Math.round((Date.now() - start) / 1000);
    if ($('#speakClock')) $('#speakClock').textContent = fmtTime(ui.speakElapsed);
    if (ui.speakElapsed >= SPEAK[ui.speakIx].seconds) endSpeak();
  }, 250);
}
function startRecognition() {
  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) { toast('This browser has no live transcription. Type the answer.'); return; }
  if (!ui.speaking) beginSpeak();
  try {
    recognizer = new Speech();
    recognizer.lang = 'en-US';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var s = e.results[i][0].transcript;
        if (e.results[i].isFinal) ui.speechFinal += ' ' + s;
        else interim += s;
      }
      var box = $('#speechText');
      if (box) box.value = (ui.speechFinal + ' ' + interim).trim();
    };
    recognizer.onerror = function () { toast('Transcription stopped. You can keep typing.'); };
    recognizer.start();
  } catch (e) { toast('Microphone access failed.'); }
}
function audioStart() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('Audio recording is not available here.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    audioChunks = [];
    audioRecorder = new MediaRecorder(stream);
    audioRecorder.ondataavailable = function (e) { if (e.data.size) audioChunks.push(e.data); };
    audioRecorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(new Blob(audioChunks, { type: audioRecorder.mimeType || 'audio/webm' }));
      var area = $('#audioArea');
      if (area) area.innerHTML = '<audio controls src="' + audioUrl + '" style="width:100%"></audio><p class="smallprint">Playback stays on this device.</p>';
    };
    audioRecorder.start();
    if (!ui.speaking) beginSpeak();
  }).catch(function () { toast('Microphone permission was not granted.'); });
}
function wordCount(s) { return (String(s).trim().match(/\b[\w'-]+\b/g) || []).length; }
function analyzeSpeak(text, sec, items) {
  var words = wordCount(text);
  var fillers = (text.match(/\b(?:um+|uh+|erm+|you know|basically|kind of|sort of|i mean)\b/gi) || []);
  var wpm = sec >= 8 ? Math.round(words / (sec / 60)) : null;
  var found = items.filter(function (k) { return text.toLowerCase().indexOf(k.toLowerCase()) >= 0; });
  return { words: words, fillers: fillers, wpm: wpm, found: found, missing: items.filter(function (x) { return found.indexOf(x) < 0; }) };
}
function endSpeak() {
  if (!ui.speaking) return;
  ui.speaking = false;
  clearInterval(tick); tick = null;
  if (recognizer) { try { recognizer.stop(); } catch (e) {} recognizer = null; }
  if (audioRecorder && audioRecorder.state === 'recording') audioRecorder.stop();
  var text = ($('#speechText') && $('#speechText').value) || ui.speechFinal;
  ui.speakText = text;
  ui.speakFeedback = analyzeSpeak(text, Math.max(ui.speakElapsed, 1), SPEAK[ui.speakIx].keys);
  practice('speak', text.trim() ? 10 : 3, SPEAK[ui.speakIx].title);
  render();
}
function renderSpeak() {
  var s = SPEAK[ui.speakIx];
  var head = pageIntro('SAY IT OUT LOUD', 'Speaking dojo', 'A timer and a checklist. Transcription is optional and depends on the browser.');
  var bar = '<div class="toolbar"><div class="seg"><button class="pill" type="button" onclick="changeSpeak(' + (ui.speakIx - 1) + ')">← Previous</button><span class="chip">' + (ui.speakIx + 1) + ' / ' + SPEAK.length + '</span><button class="pill" type="button" onclick="changeSpeak(' + (ui.speakIx + 1) + ')">Next →</button></div><span class="chip">' + escapeHtml(s.tag) + ' · ' + s.seconds + 's</span></div>';
  var fb = ui.speakFeedback;
  return head + bar + '<div class="speak-layout"><div class="challenge"><div class="stage-tag">' + escapeHtml(s.tag) + '</div><h2>' + escapeHtml(s.title) + '</h2><p class="muted">' + escapeHtml(s.prompt) + '</p><div class="lesson"><b>Shape:</b> ' + escapeHtml(s.cue) + '</div><textarea class="response" id="speechText" style="min-height:150px" placeholder="Notes or a transcript">' + escapeHtml(ui.speakText || '') + '</textarea><div class="actions" style="margin-top:14px">' + (!ui.speaking ? '<button class="btn primary" type="button" onclick="beginSpeak()">Start timer</button>' : '<button class="btn primary" type="button" onclick="endSpeak()">Finish</button>') + '<button class="btn ghost" type="button" onclick="startRecognition()">Transcribe</button><button class="btn ghost" type="button" onclick="audioStart()">Record</button></div><p class="smallprint">Audio stays on this device. Live transcription may use the browser speech service.</p><div id="audioArea"></div>' + (fb ? '<div class="feedback-box"><h3>A rough read</h3><div class="speech-metrics" style="margin:16px 0"><div class="speech-metric"><b>' + fb.words + '</b><span>words</span></div><div class="speech-metric"><b>' + (fb.wpm == null ? '—' : fb.wpm) + '</b><span>words / min</span></div><div class="speech-metric"><b>' + fb.fillers.length + '</b><span>filler phrases</span></div></div><p>' + (fb.missing.length ? '<b>Cues not in the text:</b> ' + escapeHtml(fb.missing.join(', ')) : 'The cue words showed up. That is not the same as a complete answer.') + '</p><div class="actions"><button class="btn primary" type="button" onclick="changeSpeak(' + (ui.speakIx + 1) + ')">Next</button><button class="btn" type="button" onclick="initializeSpeak();render()">Try again</button></div></div>' : '') + '</div><div class="panel"><div style="text-align:center"><div class="mic-ring ' + (ui.speaking ? 'recording' : '') + '">◉</div><div class="big-timer" id="speakClock">' + fmtTime(ui.speakElapsed) + '</div><p class="muted">' + s.seconds + 's target</p></div><div class="divider"></div><h3>Cover these</h3><div class="rubric">' + s.keys.map(function (k) { return '<span class="rubric-item">' + escapeHtml(k) + '</span>'; }).join('') + '</div></div></div>';
}

function initializeMock() { ui.mockIx = 0; ui.mockPhase = 'ready'; ui.mockScores = []; ui.mockElapsed = 0; ui.mockSet = shuffle(MOCK).slice(0, 5); }
function beginMock() { ui.mockPhase = 'answer'; ui.mockIx = 0; ui.mockScores = []; startMockRound(); }
function startMockRound() {
  ui.mockPhase = 'answer'; ui.mockElapsed = 0; render();
  var start = Date.now();
  var q = ui.mockSet[ui.mockIx];
  tick = setInterval(function () {
    ui.mockElapsed = Math.round((Date.now() - start) / 1000);
    if ($('#mockClock')) $('#mockClock').textContent = fmtTime(ui.mockElapsed);
    if ($('#phaseFill')) $('#phaseFill').style.width = Math.max(0, 100 - ui.mockElapsed / q.time * 100) + '%';
    if (ui.mockElapsed >= q.time) finishMockRound();
  }, 250);
}
function finishMockRound() { clearInterval(tick); tick = null; ui.mockDraft = $('#mockAnswer') ? $('#mockAnswer').value : ''; ui.mockPhase = 'grade'; render(); }
function nextMock() {
  var q = ui.mockSet[ui.mockIx];
  var done = q.checks.map(function (_, i) { return $('#check' + i) && $('#check' + i).checked; }).filter(Boolean).length;
  ui.mockScores.push(done);
  practice('mock', 4 + done * 3, q.tag);
  ui.mockIx++;
  if (ui.mockIx >= ui.mockSet.length) { ui.mockPhase = 'complete'; render(); }
  else startMockRound();
}
function renderMock() {
  var head = pageIntro('MIXED PRESSURE', 'Mock gauntlet', 'Short rounds across C++, serving, training, and debugging. The checklist stays hidden until you finish the round.');
  if (ui.mockPhase === 'ready') return head + '<div class="arena challenge"><div class="stage-tag">FIVE ROUNDS</div><h2>Switch contexts on purpose.</h2><p class="muted">Each round is timed. Score only the points you actually made.</p><button class="btn primary" type="button" onclick="beginMock()">Start</button></div>';
  if (ui.mockPhase === 'complete') {
    var total = ui.mockScores.reduce(function (a, b) { return a + b; }, 0);
    var max = ui.mockScores.length * 4;
    return head + '<div class="arena challenge"><div class="stage-tag">DONE</div><h2>Gauntlet finished.</h2><div class="score">' + total + ' <span style="color:var(--muted);font-size:20px">/ ' + max + '</span></div><div class="rubric">' + ui.mockScores.map(function (s, i) { return '<span class="rubric-item">Round ' + (i + 1) + ': ' + s + '/4</span>'; }).join('') + '</div><div class="actions"><button class="btn primary" type="button" onclick="initializeMock();render()">Run again</button><button class="btn" type="button" onclick="go(\'stats\')">Stats</button></div></div>';
  }
  var q = ui.mockSet[ui.mockIx];
  return head + '<div class="arena"><div class="arena-head"><span class="stage-tag">ROUND ' + (ui.mockIx + 1) + ' / ' + ui.mockSet.length + ' · ' + escapeHtml(q.tag) + '</span><span class="chip" id="mockClock">' + fmtTime(ui.mockElapsed) + '</span></div><div class="progress"><div class="bar" style="width:' + (ui.mockIx / ui.mockSet.length * 100) + '%"></div></div><div class="challenge" style="margin-top:15px"><div class="timer-track"><div class="timer-fill" id="phaseFill" style="width:' + Math.max(0, 100 - ui.mockElapsed / q.time * 100) + '%"></div></div><h2>' + escapeHtml(q.q) + '</h2>' + (ui.mockPhase === 'answer'
    ? '<textarea class="response" id="mockAnswer" style="min-height:150px" placeholder="Outline, assumptions, tradeoffs"></textarea><div class="actions" style="margin-top:15px"><button class="btn primary" type="button" onclick="finishMockRound()">Show the checklist</button></div>'
    : '<div class="answer-box"><h3>Score what you actually said</h3>' + q.checks.map(function (c, i) { return '<label class="listline" style="cursor:pointer;justify-content:flex-start"><input type="checkbox" id="check' + i + '" style="accent-color:var(--lime);width:18px;height:18px"> ' + escapeHtml(c) + '</label>'; }).join('') + '</div><button class="btn primary" type="button" style="margin-top:16px" onclick="nextMock()">' + (ui.mockIx === ui.mockSet.length - 1 ? 'Finish' : 'Next round') + '</button>') + '</div></div>';
}
