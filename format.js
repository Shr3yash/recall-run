// Small markdown, math, and syntax highlighter. No network, no HTML pass-through.
(function () {
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ',
    lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω',
    Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Gamma: 'Γ', tau: 'τ', rho: 'ρ'
  };
  var SYMS = {
    times: '×', cdot: '·', le: '≤', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
    infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', ldots: '…', dots: '…',
    pm: '±', mid: '∣', otimes: '⊗', oplus: '⊕'
  };
  var MOPS = { log: 1, exp: 1, max: 1, min: 1, sin: 1, cos: 1, Pr: 1, ln: 1, det: 1 };

  function math(src) {
    try {
      var str = String(src);
      var i = 0;
      function parseSeq() {
        var html = '';
        while (i < str.length && str[i] !== '}') html += parseAtom();
        return html;
      }
      function parseGroup() {
        if (str[i] !== '{') return parseAtom();
        i++;
        var inner = parseSeq();
        if (str[i] === '}') i++;
        return inner;
      }
      function parseAtom() {
        if (i >= str.length) return '';
        if (str[i] === '\\') {
          i++;
          var cmd = '';
          while (i < str.length && /[A-Za-z]/.test(str[i])) cmd += str[i++];
          if (cmd === 'frac') {
            var a = parseGroup();
            var b = parseGroup();
            return '<span class="frac"><span class="num">' + a + '</span><span class="den">' + b + '</span></span>';
          }
          if (cmd === 'sqrt') return '√<span class="sqrt">' + parseGroup() + '</span>';
          if (cmd === 'text' || cmd === 'mathrm') return '<span class="mop">' + parseGroup() + '</span>';
          if (GREEK[cmd]) return GREEK[cmd];
          if (SYMS[cmd]) return SYMS[cmd];
          if (MOPS[cmd]) return '<span class="mop">' + cmd + '</span>';
          if (cmd === ',') return ' ';
          return escapeHtml(cmd);
        }
        if (str[i] === '{' ) return parseGroup();
        if (str[i] === '_' || str[i] === '^') {
          var sup = str[i] === '^';
          i++;
          var inner = (str[i] === '{') ? parseGroup() : escapeHtml(str[i++] || '');
          var tag = sup ? 'sup' : 'sub';
          return '<' + tag + '>' + inner + '</' + tag + '>';
        }
        if (str[i] === ' ') { i++; return ' '; }
        return escapeHtml(str[i++]);
      }
      return parseSeq();
    } catch (e) {
      return escapeHtml(src);
    }
  }

  var CPP = new Set(('alignas alignof auto bool break case catch char char16_t char32_t char8_t class co_await co_return co_yield concept const consteval constexpr constinit continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator override private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while __global__ __device__ __host__ __shared__ __syncthreads __restrict__').split(' '));
  var PY = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  var JS = new Set('async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof undefined var void while with yield of'.split(' '));
  var SH = new Set('if then else fi for in do done while case esac function return local export unset echo source'.split(' '));

  function family(lang) {
    var l = String(lang || '').toLowerCase();
    if (/^(c|cc|cpp|cxx|h|hh|hpp|cu|cuda)$/.test(l)) return 'cpp';
    if (/^(py|python)$/.test(l)) return 'py';
    if (/^(js|javascript|mjs)$/.test(l)) return 'js';
    if (/^(sh|bash|zsh|shell)$/.test(l)) return 'sh';
    if (l === 'json') return 'json';
    return 'plain';
  }

  function keywords(fam) {
    if (fam === 'cpp') return CPP;
    if (fam === 'py') return PY;
    if (fam === 'js') return JS;
    if (fam === 'sh') return SH;
    return null;
  }

  function highlight(code, lang) {
    var fam = family(lang);
    var kw = keywords(fam);
    var src = String(code ?? '').replace(/\r\n/g, '\n');
    var out = '';
    var i = 0;
    function atLineStart(idx) {
      var j = idx;
      while (j > 0 && src[j - 1] !== '\n') {
        if (src[j - 1] !== ' ' && src[j - 1] !== '\t') return false;
        j--;
      }
      return true;
    }
    while (i < src.length) {
      var c = src[i];
      if (c === '/' && src[i + 1] === '/' && fam !== 'py' && fam !== 'sh') {
        var j = src.indexOf('\n', i);
        if (j < 0) j = src.length;
        out += '<span class="tok-com">' + escapeHtml(src.slice(i, j)) + '</span>';
        i = j;
        continue;
      }
      if (c === '/' && src[i + 1] === '*' && fam !== 'py' && fam !== 'sh') {
        var k = src.indexOf('*/', i + 2);
        var end = k < 0 ? src.length : k + 2;
        out += '<span class="tok-com">' + escapeHtml(src.slice(i, end)) + '</span>';
        i = end;
        continue;
      }
      if ((fam === 'py' || fam === 'sh') && c === '#' ) {
        var eol = src.indexOf('\n', i);
        if (eol < 0) eol = src.length;
        out += '<span class="tok-com">' + escapeHtml(src.slice(i, eol)) + '</span>';
        i = eol;
        continue;
      }
      if (fam === 'cpp' && c === '#' && atLineStart(i)) {
        var eol2 = src.indexOf('\n', i);
        if (eol2 < 0) eol2 = src.length;
        out += '<span class="tok-pp">' + escapeHtml(src.slice(i, eol2)) + '</span>';
        i = eol2;
        continue;
      }
      if (c === '"' || c === "'" || (c === '`' && fam === 'js')) {
        var q = c;
        var n = i + 1;
        while (n < src.length && src[n] !== q && src[n] !== '\n') {
          if (src[n] === '\\') n++;
          n++;
        }
        if (n < src.length && src[n] === q) n++;
        out += '<span class="tok-str">' + escapeHtml(src.slice(i, n)) + '</span>';
        i = n;
        continue;
      }
      if (/[0-9]/.test(c) && (i === 0 || !/[A-Za-z_]/.test(src[i - 1]))) {
        var m = i + 1;
        while (m < src.length && /[0-9.xXa-fA-F]/.test(src[m])) m++;
        out += '<span class="tok-num">' + escapeHtml(src.slice(i, m)) + '</span>';
        i = m;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var p = i + 1;
        while (p < src.length && /[A-Za-z0-9_]/.test(src[p])) p++;
        var word = src.slice(i, p);
        if (kw && kw.has(word)) out += '<span class="tok-kw">' + escapeHtml(word) + '</span>';
        else out += escapeHtml(word);
        i = p;
        continue;
      }
      out += escapeHtml(c);
      i++;
    }
    return out;
  }

  function inline(raw) {
    var slots = [];
    function hold(html) {
      slots.push(html);
      return '\uE000' + (slots.length - 1) + '\uE000';
    }
    var s = String(raw ?? '');
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (_, m) { return hold('<span class="math math-display">' + math(m) + '</span>'); });
    s = s.replace(/\$([^$\n]+?)\$/g, function (_, m) { return hold('<span class="math">' + math(m) + '</span>'); });
    s = s.replace(/`([^`\n]+)`/g, function (_, c) { return hold('<code class="inline-code">' + escapeHtml(c) + '</code>'); });
    s = escapeHtml(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, t, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\uE000(\d+)\uE000/g, function (_, i) { return slots[+i]; });
    return s;
  }

  function markdown(src) {
    var lines = String(src ?? '').replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    var html = '';
    while (i < lines.length) {
      var line = lines[i];
      if (line.startsWith('```')) {
        var lang = line.slice(3).trim();
        var buf = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
        if (i < lines.length && lines[i].startsWith('```')) i++;
        html += '<pre class="code-view"><code>' + highlight(buf.join('\n'), lang) + '</code></pre>';
        continue;
      }
      if (!line.trim()) { i++; continue; }
      if (/^### /.test(line)) { html += '<h4>' + inline(line.slice(4)) + '</h4>'; i++; continue; }
      if (/^## /.test(line)) { html += '<h3>' + inline(line.slice(3)) + '</h3>'; i++; continue; }
      if (/^# /.test(line)) { html += '<h2>' + inline(line.slice(2)) + '</h2>'; i++; continue; }
      if (/^> /.test(line)) {
        var quote = [];
        while (i < lines.length && /^> /.test(lines[i])) quote.push(inline(lines[i++].slice(2)));
        html += '<blockquote class="lesson">' + quote.join('<br>') + '</blockquote>';
        continue;
      }
      if (/^- /.test(line)) {
        var items = [];
        while (i < lines.length && /^- /.test(lines[i])) items.push('<li>' + inline(lines[i++].slice(2)) + '</li>');
        html += '<ul>' + items.join('') + '</ul>';
        continue;
      }
      if (/^\d+\. /.test(line)) {
        var ordered = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) ordered.push('<li>' + inline(lines[i++].replace(/^\d+\. /, '')) + '</li>');
        html += '<ol>' + ordered.join('') + '</ol>';
        continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^```|^#{1,3} |^> |^- |^\d+\. /.test(lines[i])) para.push(lines[i++]);
      html += '<p>' + para.map(inline).join('<br>') + '</p>';
    }
    return html;
  }

  function face(src, opts) {
    opts = opts || {};
    var clozes = [];
    var text = String(src ?? '');
    if (opts.cloze) {
      text = text.replace(/\{\{c\d+::([\s\S]*?)\}\}/g, function (_, body) {
        var parts = String(body).split('||');
        clozes.push({ ans: parts[0], hint: parts.slice(1).join('||') });
        return '\uE001' + (clozes.length - 1) + '\uE001';
      });
    }
    var html = markdown(text);
    if (!clozes.length) return html;
    return html.replace(/\uE001(\d+)\uE001/g, function (_, idx) {
      var c = clozes[+idx];
      if (!c) return '';
      if (opts.reveal) return '<span class="cloze-show">' + inline(c.ans) + '</span>';
      return '<span class="cloze-blank">' + (c.hint ? escapeHtml(c.hint) : '…') + '</span>';
    });
  }

  globalThis.Format = {
    escapeHtml: escapeHtml,
    math: math,
    highlight: highlight,
    markdown: markdown,
    inline: inline,
    face: face
  };
})();
