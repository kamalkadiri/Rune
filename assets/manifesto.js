/* RUNE manifesto: live scene behind the text, pixel headings that decode into place,
   paragraphs that rise in, figures that resolve through a dither, and a reading-progress bar. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---- scene -------------------------------------------------------------
  var canvas = document.getElementById('scene');
  var src = document.getElementById('scene-src');
  if (window.RuneScene && canvas && src) {
    new window.RuneScene({
      canvas: canvas,
      image: src,
      framing: 'scroll',
      pointerTarget: window,
      scrollWake: true,
      warp: 1,
      glyphSize: 1.5
    });
  }

  // ---- pixel headings ----------------------------------------------------
  var CREAM = window.RuneHex('#F4ECE2', [244, 236, 226]);
  var PEACH = window.RuneHex('#F2A37A', [242, 163, 122]);
  var GLYPHS = '.:-=+/o0#';
  var heads = [];
  var byEl = new Map();
  document.querySelectorAll('.px').forEach(function (el) {
    var cv = document.createElement('canvas');
    cv.className = 'px-canvas';
    cv.setAttribute('aria-hidden', 'true');
    el.appendChild(cv);
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    var h = {
      el: el, cv: cv, target: +el.getAttribute('data-px') || 20, text: text,
      glow: el.getAttribute('data-glow') === 'none' ? null : PEACH,
      shown: el.getAttribute('data-decode') === 'off' || reduced, current: null, running: false
    };
    heads.push(h);
    byEl.set(el, h);
  });

  function draw(h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = h.cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr));
    var hh = Math.max(1, Math.round(r.height * dpr));
    if (h.cv.width !== w || h.cv.height !== hh) { h.cv.width = w; h.cv.height = hh; }
    var ctx = h.cv.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    if (!h.shown) return;
    window.RunePixelText(ctx, h.el, r, dpr, h.target, CREAM, h.glow, h.current);
  }

  function decode(h) {
    if (h.running) return;
    h.shown = true;
    if (reduced) { h.current = null; draw(h); return; }
    h.running = true;
    var final = h.text;
    var n = final.length;
    var when = [];
    for (var i = 0; i < n; i++) when.push((i / Math.max(1, n)) * 0.65 + Math.random() * 0.35);
    var dur = Math.min(1300, 450 + n * 45);
    var start = performance.now();
    var lastSwap = 0;
    var step = function (now) {
      var t = Math.min(1, (now - start) / dur);
      if (now - lastSwap > 45 || t >= 1) {
        lastSwap = now;
        var s = '';
        for (var k = 0; k < n; k++) {
          var c = final[k];
          s += (c === ' ' || t >= when[k]) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        h.current = t < 1 ? s : null;
        draw(h);
      }
      if (t < 1) requestAnimationFrame(step); else h.running = false;
    };
    requestAnimationFrame(step);
  }

  function redrawAll() { heads.forEach(function (h) { if (!h.running) draw(h); }); }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 120);
  });
  try {
    Promise.all([document.fonts.load('400 40px Tinos'), document.fonts.ready]).catch(function () {}).then(redrawAll);
  } catch (e) { redrawAll(); }
  redrawAll();

  // ---- figures resolve through a dither ------------------------------------
  var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function ditherIn(fig) {
    var img = fig.querySelector('img');
    var plate = fig.querySelector('.plate');
    if (!img || !plate) return;
    var pixelated = fig.classList.contains('history');
    var finish = function () { img.style.opacity = '1'; };
    if (reduced) { finish(); return; }
    var go = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = plate.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width * dpr));
      var H = Math.max(1, Math.round(r.height * dpr));
      var cv = document.createElement('canvas');
      cv.className = 'dither-canvas';
      cv.setAttribute('aria-hidden', 'true');
      cv.width = W;
      cv.height = H;
      plate.appendChild(cv);
      var ctx = cv.getContext('2d');
      var block = Math.max(2, Math.round(7 * dpr));
      var cols = Math.ceil(W / block), rows = Math.ceil(H / block);
      var mk = document.createElement('canvas');
      mk.width = cols;
      mk.height = rows;
      var mctx = mk.getContext('2d');
      var md = mctx.createImageData(cols, rows);
      var thr = new Float32Array(cols * rows);
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          thr[y * cols + x] = ((BAYER[y % 4][x % 4] + 0.5) / 16) * 0.55 + (y / rows) * 0.45;
        }
      }
      var start = performance.now(), dur = 1150;
      var step = function (now) {
        var raw = Math.min(1, (now - start) / dur);
        var t = raw * 1.06;
        for (var i = 0; i < thr.length; i++) md.data[i * 4 + 3] = thr[i] < t ? 255 : 0;
        mctx.putImageData(md, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = !pixelated;
        ctx.drawImage(img, 0, 0, W, H);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mk, 0, 0, cols * block, rows * block);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#F2A37A';
        for (var j = 0; j < thr.length; j++) {
          if (thr[j] >= t && thr[j] < t + 0.05) ctx.fillRect((j % cols) * block, ((j / cols) | 0) * block, block, block);
        }
        if (raw < 1) requestAnimationFrame(step);
        else { finish(); cv.parentNode && cv.parentNode.removeChild(cv); }
      };
      requestAnimationFrame(step);
    };
    if (img.complete && img.naturalWidth) go();
    else img.addEventListener('load', go, { once: true });
  }

  // ---- reveal on scroll ----------------------------------------------------
  var targets = document.querySelectorAll('.reveal, .px, .dither-fig');
  var show = function (el) {
    if (el.classList.contains('px')) { var h = byEl.get(el); if (h) decode(h); }
    else if (el.classList.contains('dither-fig')) ditherIn(el);
    else el.classList.add('in');
  };
  if (!('IntersectionObserver' in window) || reduced) {
    targets.forEach(show);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        show(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    targets.forEach(function (el) { io.observe(el); });
  }

  // ---- progress bar and section label --------------------------------------
  var fill = document.getElementById('bar-fill');
  var label = document.getElementById('bar-label');
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-label]'));
  var shownLabel = 'Manifesto';
  var labelAnim = null;
  function setLabel(text) {
    if (text === shownLabel || !label) return;
    shownLabel = text;
    if (reduced) { label.textContent = text; return; }
    cancelAnimationFrame(labelAnim);
    var start = performance.now(), dur = 420;
    var step = function (now) {
      var t = Math.min(1, (now - start) / dur);
      var cut = Math.floor(t * text.length);
      var s = text.slice(0, cut);
      for (var i = cut; i < text.length; i++) s += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      label.textContent = s;
      if (t < 1) labelAnim = requestAnimationFrame(step);
    };
    labelAnim = requestAnimationFrame(step);
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var p = Math.min(1, Math.max(0, (window.scrollY || 0) / max));
      if (fill) fill.style.width = (p * 100).toFixed(2) + '%';
      var mark = window.innerHeight * 0.4;
      var active = 'Manifesto';
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= mark) active = sections[i].getAttribute('data-label');
      }
      setLabel(active);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
