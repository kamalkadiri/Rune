/*
 * RUNE scene: the dithered landscape rendered in WebGL.
 * The cursor opens a small lens of ASCII glyphs and drags the image like liquid;
 * a short glyph trail follows and fades. Text elements passed in `textEls` are
 * redrawn as pixel-serif lettering inside the scene.
 *
 * new RuneScene({
 *   canvas, image,                 // <canvas> and an <img> (same origin)
 *   textEls: [{ el, target }],     // optional DOM text to pixelate into the scene
 *   textColor, shadowColor,        // pixel text colours
 *   warp, glyphSize,               // effect strength and glyph cell size
 *   framing: 'landing' | 'scroll', // crop behaviour
 *   pointerTarget,                 // element or window that receives pointer events
 *   scrollWake                     // stir the scene's margins while scrolling
 * })
 */
(function (global) {
  'use strict';

  var VS = 'attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uImg;',
    'uniform sampler2D uFlow;',
    'uniform sampler2D uGlyph;',
    'uniform sampler2D uText;',
    'uniform vec2 uRes;',
    'uniform float uAspect;',
    'uniform float uImgAspect;',
    'uniform vec2 uMouse;',
    'uniform float uHover;',
    'uniform float uTime;',
    'uniform float uG;',
    'uniform float uDpr;',
    'uniform vec2 uGrid;',
    'uniform float uWarp;',
    'uniform float uScan;',
    'uniform float uMotion;',
    'uniform float uTextOn;',
    'uniform vec2 uPos;',
    'uniform float uZoom;',
    '',
    'vec2 cover(vec2 uv) {',
    '  vec2 s = vec2(1.0);',
    '  if (uAspect > uImgAspect) { s.y = uImgAspect / uAspect; } else { s.x = uAspect / uImgAspect; }',
    '  s = s / uZoom;',
    '  return uv * s + uPos * (1.0 - s);',
    '}',
    'vec3 scene(vec2 uv, vec2 w) {',
    '  vec3 c = texture2D(uImg, cover(uv + w)).rgb;',
    '  vec4 t = texture2D(uText, uv);',
    '  return mix(c, t.rgb, t.a * uTextOn);',
    '}',
    'float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }',
    'float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }',
    'float lens(vec2 uv) {',
    '  vec2 d = (uv - uMouse) * vec2(uAspect, 1.0);',
    '  return uHover * (1.0 - smoothstep(0.035, 0.12, length(d)));',
    '}',
    'vec2 dispAt(vec4 f) {',
    '  vec2 v = (f.rg - 0.5) * 2.0;',
    '  return v * uWarp * vec2(5.0 / uGrid.x, 5.0 / uGrid.y);',
    '}',
    'float scanBand(vec2 uv) {',
    '  float x = uv.x + (uv.y - 0.5) * 0.18;',
    '  float front = mix(-0.25, 1.25, uScan);',
    '  return 1.0 - smoothstep(0.0, 0.12, abs(x - front));',
    '}',
    '',
    'void main() {',
    '  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 uv = px / uRes;',
    '',
    '  vec4 f = texture2D(uFlow, uv);',
    '  vec2 d = dispAt(f);',
    '  vec2 suv = uv - d;',
    '  float wy = cover(suv).y;',
    '  float water = smoothstep(0.80, 0.90, wy) * uMotion;',
    '  vec2 wv = vec2((sin(wy * 520.0 + uTime * 1.7) * 0.6 + sin(wy * 140.0 - uTime * 1.1) * 0.4) * 0.0018 * water, 0.0);',
    '  vec3 base;',
    '  base.r = scene(suv - d * 0.22, wv).r;',
    '  base.g = scene(suv, wv).g;',
    '  base.b = scene(suv + d * 0.22, wv).b;',
    '',
    '  vec2 cs = vec2(6.0, 8.0) * uG;',
    '  vec2 cell = floor(px / cs);',
    '  vec2 cuv = (cell + 0.5) * cs / uRes;',
    '  vec4 fc = texture2D(uFlow, cuv);',
    '  float amt = max(max(fc.b, lens(cuv)), scanBand(cuv));',
    '  float on = step(bayer4(cell) + 0.03, smoothstep(0.12, 0.55, amt));',
    '  if (on < 0.5) { gl_FragColor = vec4(base, 1.0); return; }',
    '',
    '  vec3 cc = scene(cuv - dispAt(fc), vec2(0.0));',
    '  float l = dot(cc, vec3(0.299, 0.587, 0.114));',
    '  l = clamp((l - 0.3) / 0.6, 0.0, 1.0);',
    '  float gi = floor(l * 8.999);',
    '  vec2 gp = floor((px - cell * cs) / uG);',
    '  gp = clamp(gp, vec2(0.0), vec2(5.0, 7.0));',
    '  float g = texture2D(uGlyph, vec2((gi * 6.0 + gp.x + 0.5) / 54.0, (gp.y + 0.5) / 8.0)).r;',
    '  vec3 bg = mix(vec3(0.051, 0.078, 0.141), cc, 0.14);',
    '  vec3 fg = min(cc * 1.18 + 0.03, vec3(1.0));',
    '  vec3 ascii = mix(bg, fg, g);',
    '  ascii *= 0.9 + 0.1 * step(0.5, fract(px.y / (2.0 * uDpr)));',
    '  gl_FragColor = vec4(ascii, 1.0);',
    '}'
  ].join('\n');

  // 5x7 bitmap glyphs, sparse to dense: . : - / + = o 0 #
  function glyphBytes() {
    var G = [
      ['00000', '00000', '00000', '00000', '00000', '00100', '00000'],
      ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
      ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
      ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
      ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
      ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
      ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
      ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
      ['01010', '01010', '11111', '01010', '11111', '01010', '01010']
    ];
    var W = 54, H = 8, out = new Uint8Array(W * H * 4);
    G.forEach(function (rows, gi) {
      rows.forEach(function (row, y) {
        for (var x = 0; x < 5; x++) {
          if (row[x] === '1') {
            var i = (y * W + gi * 6 + x) * 4;
            out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255;
          }
        }
      });
    });
    return out;
  }

  function parseHex(hex, fb) {
    if (typeof hex !== 'string') return fb;
    var h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6}/.test(h)) return fb;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  var scratch = null;

  /*
   * Draw the text of `el` as pixel-serif lettering onto the 2D context `tx`.
   * refRect is the client rect of the canvas that `tx` belongs to.
   * target sets the size of one pixel: the font is rasterised at about `target` px and scaled up.
   * Returns true when something was drawn.
   */
  function drawPixelText(tx, el, refRect, dpr, target, ink, glow, textOverride) {
    var text = (textOverride != null ? textOverride : (el.textContent || '')).replace(/\s+/g, ' ').trim();
    if (!text) return false;
    var cs = getComputedStyle(el);
    var cssPx = parseFloat(cs.fontSize);
    if (!cssPx) return false;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var fontPx = cssPx * dpr;
    var block = Math.max(1, Math.round(fontPx / target));
    var size = fontPx / block;
    var cssLh = parseFloat(cs.lineHeight);
    if (!cssLh || isNaN(cssLh)) cssLh = cssPx * 1.15;
    var lh = cssLh * dpr / block;
    var pad = 4;
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    var padT = parseFloat(cs.paddingTop) || 0;
    var boxW = (r.width - padL - padR) * dpr / block;
    var boxH = (r.height - padT - (parseFloat(cs.paddingBottom) || 0)) * dpr / block;
    var font = (cs.fontWeight || '400') + ' ' + size + 'px ' + (cs.fontFamily || 'serif');
    if (!scratch) scratch = document.createElement('canvas');
    var sc = scratch;
    var sx = sc.getContext('2d', { willReadFrequently: true });
    sx.font = font;

    // Keep the page's own line count, so a one-line heading stays on one line.
    var domLines = Math.max(1, Math.round(boxH * block / dpr / cssLh));
    var lines = [];
    if (domLines === 1) {
      lines.push(text);
    } else {
      var limit = boxW * 1.06 + 1;
      var words = text.split(' ');
      var cur = '';
      for (var k = 0; k < words.length; k++) {
        var test = cur ? cur + ' ' + words[k] : words[k];
        if (cur && sx.measureText(test).width > limit) { lines.push(cur); cur = words[k]; } else { cur = test; }
      }
      if (cur) lines.push(cur);
    }
    var widths = lines.map(function (ln) { return sx.measureText(ln).width; });
    var contentW = Math.max(boxW, Math.max.apply(null, widths));
    var align = cs.textAlign;
    var extra = align === 'center' ? (contentW - boxW) / 2 : 0;
    var sw = Math.ceil(contentW) + pad * 2;
    var sh = Math.ceil(Math.max(boxH, lines.length * lh)) + pad * 2;
    sc.width = sw;
    sc.height = sh;
    sx = sc.getContext('2d', { willReadFrequently: true });
    sx.clearRect(0, 0, sw, sh);
    sx.font = font;
    sx.fillStyle = '#ffffff';
    sx.textBaseline = 'alphabetic';
    var m = sx.measureText('Hg');
    var asc = m.fontBoundingBoxAscent || size * 0.891;
    var desc = m.fontBoundingBoxDescent || size * 0.216;
    lines.forEach(function (ln, i) {
      var lw = widths[i];
      var x = pad + extra;
      if (align === 'center') x = pad + (contentW - lw) / 2;
      else if (align === 'right' || align === 'end') x = pad + extra + boxW - lw;
      var y = pad + i * lh + (lh - (asc + desc)) / 2 + asc;
      sx.fillText(ln, Math.round(x), Math.round(y));
    });

    var id = sx.getImageData(0, 0, sw, sh);
    var d = id.data, n = sw * sh;
    var mask = new Uint8Array(n);
    for (var i = 0; i < n; i++) mask[i] = d[i * 4 + 3] > 90 ? 1 : 0;
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var p = y * sw + x, j = p * 4;
        if (mask[p]) {
          d[j] = ink[0]; d[j + 1] = ink[1]; d[j + 2] = ink[2]; d[j + 3] = 255;
        } else if (glow && x > 0 && y > 0 && mask[p - sw - 1]) {
          d[j] = glow[0]; d[j + 1] = glow[1]; d[j + 2] = glow[2]; d[j + 3] = 255;
        } else {
          d[j + 3] = 0;
        }
      }
    }
    sx.putImageData(id, 0, 0);
    var ox = Math.round((r.left + padL - refRect.left) * dpr - (pad + extra) * block);
    var oy = Math.round((r.top + padT - refRect.top) * dpr - pad * block);
    tx.imageSmoothingEnabled = false;
    tx.drawImage(sc, ox, oy, sw * block, sh * block);
    return true;
  }

  function RuneScene(opts) {
    this.o = Object.assign({
      textEls: [], textColor: '#0B1431', shadowColor: '#FFECDC', warp: 1, glyphSize: 1.5,
      framing: 'landing', pointerTarget: null, scrollWake: false
    }, opts || {});
    this.canvas = this.o.canvas;
    this.image = this.o.image;
    this.ready = false;
    this.textReady = false;
    this.textOn = 0;
    this.view = { x: 0.5, y: 0.5, zoom: 1, tx: 0.5, ty: 0.5, tzoom: 1 };
    this.scrollProgress = 0;
    this.scrollVel = 0;
    this._lastScrollY = window.scrollY || 0;
    this._boot();
  }

  RuneScene.prototype._boot = function () {
    var self = this, c = this.canvas, gl = null;
    try {
      gl = c.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false }) ||
        c.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return;
    this.gl = gl;
    if (!this._initGL()) { this.gl = null; return; }
    try { this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { this.reduced = false; }
    this._initPointer();
    if (this.o.framing === 'scroll') this._initScroll();
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(c);
    } else {
      window.addEventListener('resize', function () { self._resize(); });
    }
    var fontsReady = Promise.resolve();
    try {
      if (document.fonts && document.fonts.load) {
        fontsReady = Promise.all([document.fonts.load('400 40px Tinos'), document.fonts.ready]);
      }
    } catch (e) { fontsReady = Promise.resolve(); }
    fontsReady.catch(function () {}).then(function () { self.queueText(); });
    var im = this.image;
    var go = function () { self._uploadImage(); };
    if (im.complete && im.naturalWidth) go();
    else im.addEventListener('load', go, { once: true });
  };

  RuneScene.prototype._initGL = function () {
    var gl = this.gl;
    function mk(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[rune] shader', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }
    var vs = mk(gl.VERTEX_SHADER, VS), fs = mk(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      console.warn('[rune] link', gl.getProgramInfoLog(pr));
      return false;
    }
    gl.useProgram(pr);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uImg', 'uFlow', 'uGlyph', 'uText', 'uRes', 'uAspect', 'uImgAspect', 'uMouse', 'uHover', 'uTime',
      'uG', 'uDpr', 'uGrid', 'uWarp', 'uScan', 'uMotion', 'uTextOn', 'uPos', 'uZoom'].forEach(function (n) {
      U[n] = gl.getUniformLocation(pr, n);
    });
    this.U = U;
    function tex(unit, filter) {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.texImg = tex(0, gl.LINEAR);
    this.texFlow = tex(1, gl.LINEAR);
    this.texText = tex(3, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.texGlyph = tex(2, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 54, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, glyphBytes());
    gl.uniform1i(U.uImg, 0);
    gl.uniform1i(U.uFlow, 1);
    gl.uniform1i(U.uGlyph, 2);
    gl.uniform1i(U.uText, 3);
    return true;
  };

  RuneScene.prototype._initPointer = function () {
    var self = this, c = this.canvas;
    var target = this.o.pointerTarget || c;
    this.ptr = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, sx: 0.5, sy: 0.5, has: false, target: 0, hover: 0 };
    var move = function (e) {
      var r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var p = self.ptr;
      p.x = (e.clientX - r.left) / r.width;
      p.y = (e.clientY - r.top) / r.height;
      if (!p.has) { p.px = p.x; p.py = p.y; p.sx = p.x; p.sy = p.y; }
      p.has = true;
      p.target = 1;
    };
    var leave = function () { self.ptr.has = false; self.ptr.target = 0; };
    target.addEventListener('pointermove', move, { passive: true });
    target.addEventListener('pointerdown', move, { passive: true });
    if (target === window) {
      document.documentElement.addEventListener('pointerleave', leave);
      window.addEventListener('blur', leave);
    } else {
      target.addEventListener('pointerleave', leave);
    }
    target.addEventListener('pointercancel', leave);
  };

  RuneScene.prototype._initScroll = function () {
    var self = this;
    var update = function () {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      self.scrollProgress = Math.min(1, Math.max(0, (window.scrollY || 0) / max));
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  };

  RuneScene.prototype._resize = function () {
    var c = this.canvas, gl = this.gl;
    if (!c || !gl) return;
    var cw = c.clientWidth || 1, ch = c.clientHeight || 1;
    var dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6e6 / (cw * ch))));
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = dpr;
    gl.viewport(0, 0, w, h);
    this._initSim(cw, ch);
    this._updateFraming(cw / ch, true);
    this.queueText();
  };

  // Landing: on narrow screens pin the castle's right edge to the screen edge.
  // Scroll: the view drifts across the landscape as the reader moves through the page.
  RuneScene.prototype._updateFraming = function (aspect, snap) {
    var imgAspect = this.imgAspect || 2;
    var v = this.view;
    if (this.o.framing === 'scroll') {
      var p = this.scrollProgress;
      v.tzoom = 1.1 + 0.16 * p;
      v.tx = 0.22 + 0.58 * p;
      v.ty = 0.38 + 0.22 * p;
    } else {
      var vis = Math.min(1, aspect / imgAspect);
      var castleRight = 0.721;
      var rightEdge = Math.max(0.5 + vis / 2, castleRight);
      v.tx = vis < 0.999 ? Math.min(1, Math.max(0, (rightEdge - vis) / (1 - vis))) : 0.5;
      v.ty = 0.5;
      v.tzoom = 1;
    }
    if (snap) { v.x = v.tx; v.y = v.ty; v.zoom = v.tzoom; }
    if (this.image && this.o.framing !== 'scroll') {
      this.image.style.objectPosition = (v.tx * 100).toFixed(2) + '% 50%';
    }
  };

  RuneScene.prototype._initSim = function (w, h) {
    var GW = 128;
    var GH = Math.max(16, Math.min(256, Math.round(GW * h / Math.max(1, w))));
    if (this.sim && this.sim.GW === GW && this.sim.GH === GH) return;
    var n = GW * GH;
    this.sim = {
      GW: GW, GH: GH, n: n,
      vx: new Float32Array(n), vy: new Float32Array(n), ink: new Float32Array(n),
      nvx: new Float32Array(n), nvy: new Float32Array(n), nink: new Float32Array(n),
      bytes: new Uint8Array(n * 4), fresh: true
    };
  };

  RuneScene.prototype._uploadImage = function () {
    var gl = this.gl;
    if (!gl) return;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texImg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    } catch (e) {
      console.warn('[rune] image could not be used as a texture', e);
      return;
    }
    var im = this.image;
    this.imgAspect = (im.naturalWidth && im.naturalHeight) ? im.naturalWidth / im.naturalHeight : 2;
    this._updateFraming(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight), true);
    this.t0 = performance.now();
    this.last = this.t0;
    this.ready = true;
    this.canvas.style.opacity = '1';
    this._applyTextColor();
    var self = this;
    var loop = function () { self._raf = requestAnimationFrame(loop); self._frame(); };
    loop();
  };

  RuneScene.prototype._applyTextColor = function () {
    var hide = this.ready && this.textReady;
    var col = this.o.textColor;
    this.o.textEls.forEach(function (t) { t.el.style.color = hide ? 'transparent' : col; });
  };

  RuneScene.prototype.queueText = function () {
    if (!this.gl) return;
    var self = this;
    clearTimeout(this._textTimer);
    this._textTimer = setTimeout(function () { self._buildText(); }, 60);
  };

  RuneScene.prototype._buildText = function () {
    var gl = this.gl, c = this.canvas;
    if (!gl || !this.o.textEls.length) return;
    var dpr = this.dpr || 1, W = c.width, H = c.height;
    if (!this._tc) this._tc = document.createElement('canvas');
    var tc = this._tc;
    if (tc.width !== W || tc.height !== H) { tc.width = W; tc.height = H; }
    var tx = tc.getContext('2d');
    tx.clearRect(0, 0, W, H);
    var cr = c.getBoundingClientRect();
    var ink = parseHex(this.o.textColor, [11, 20, 49]);
    var glow = parseHex(this.o.shadowColor, [255, 236, 220]);
    var drew = false;
    this.o.textEls.forEach(function (t) {
      if (t.el && drawPixelText(tx, t.el, cr, dpr, t.target || 20, ink, glow)) drew = true;
    });
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texText);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    } catch (e) { drew = false; }
    this.textOn = drew ? 1 : 0;
    this.textReady = drew;
    this._applyTextColor();
  };

  RuneScene.prototype._splat = function (x0, y0, x1, y1, dt, inkScale, velScale) {
    var s = this.sim, GW = s.GW, GH = s.GH, VMAX = 4;
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.05 || dist > GW) return;
    var r = GW * 0.045, r2 = r * r;
    var steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    var vxm = (dx / dt) * 0.2 * velScale, vym = (dy / dt) * 0.2 * velScale;
    var inkAdd = Math.min(0.6, 0.08 + Math.min(dist, 12) * 0.08) * inkScale;
    var vx = s.vx, vy = s.vy, ink = s.ink;
    for (var k = 1; k <= steps; k++) {
      var t = k / steps, cx = x0 + dx * t, cy = y0 + dy * t;
      var xa = Math.max(0, Math.floor(cx - r * 2)), xb = Math.min(GW - 1, Math.ceil(cx + r * 2));
      var ya = Math.max(0, Math.floor(cy - r * 2)), yb = Math.min(GH - 1, Math.ceil(cy + r * 2));
      for (var y = ya; y <= yb; y++) {
        var ddy = y - cy;
        for (var x = xa; x <= xb; x++) {
          var ddx = x - cx;
          var w = Math.exp(-(ddx * ddx + ddy * ddy) / r2);
          if (w < 0.01) continue;
          var i = y * GW + x;
          var u = vx[i] + vxm * w, v = vy[i] + vym * w;
          vx[i] = u > VMAX ? VMAX : (u < -VMAX ? -VMAX : u);
          vy[i] = v > VMAX ? VMAX : (v < -VMAX ? -VMAX : v);
          var q = ink[i] + inkAdd * w;
          ink[i] = q > 1 ? 1 : q;
        }
      }
    }
  };

  RuneScene.prototype._advect = function (dt) {
    var s = this.sim, GW = s.GW, GH = s.GH;
    var vx = s.vx, vy = s.vy, ink = s.ink, nvx = s.nvx, nvy = s.nvy, nink = s.nink;
    var dv = Math.pow(0.955, dt), di = Math.pow(0.962, dt);
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        var i = y * GW + x, u = vx[i], v = vy[i];
        if (u === 0 && v === 0) { nvx[i] = 0; nvy[i] = 0; nink[i] = ink[i] * di; continue; }
        var px = x - u * dt, py = y - v * dt;
        if (px < 0) px = 0; else if (px > GW - 1) px = GW - 1;
        if (py < 0) py = 0; else if (py > GH - 1) py = GH - 1;
        var x0 = px | 0, y0 = py | 0;
        var x1 = x0 < GW - 1 ? x0 + 1 : x0, y1 = y0 < GH - 1 ? y0 + 1 : y0;
        var fx = px - x0, fy = py - y0;
        var a = y0 * GW + x0, b = y0 * GW + x1, c = y1 * GW + x0, e = y1 * GW + x1;
        var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        nvx[i] = (vx[a] * w00 + vx[b] * w10 + vx[c] * w01 + vx[e] * w11) * dv;
        nvy[i] = (vy[a] * w00 + vy[b] * w10 + vy[c] * w01 + vy[e] * w11) * dv;
        nink[i] = (ink[a] * w00 + ink[b] * w10 + ink[c] * w01 + ink[e] * w11) * di;
      }
    }
    s.vx = nvx; s.nvx = vx; s.vy = nvy; s.nvy = vy; s.ink = nink; s.nink = ink;
  };

  RuneScene.prototype._encode = function () {
    var s = this.sim, VMAX = 4, vx = s.vx, vy = s.vy, ink = s.ink, by = s.bytes;
    for (var i = 0; i < s.n; i++) {
      var u = vx[i], v = vy[i], k = ink[i];
      if (u < 0.003 && u > -0.003) { u = 0; vx[i] = 0; }
      if (v < 0.003 && v > -0.003) { v = 0; vy[i] = 0; }
      if (k < 0.004) { k = 0; ink[i] = 0; }
      var j = i * 4;
      by[j] = 128 + Math.round((u / VMAX) * 127);
      by[j + 1] = 128 + Math.round((v / VMAX) * 127);
      by[j + 2] = Math.round(k * 255);
      by[j + 3] = 255;
    }
  };

  RuneScene.prototype._frame = function () {
    var gl = this.gl, c = this.canvas, s = this.sim;
    if (!gl || !s) return;
    var now = performance.now();
    var dt = Math.min(3, Math.max(0.25, (now - this.last) / 16.667));
    this.last = now;
    var t = (now - this.t0) / 1000;
    var p = this.ptr;

    if (p.has) {
      this._splat(p.px * s.GW - 0.5, p.py * s.GH - 0.5, p.x * s.GW - 0.5, p.y * s.GH - 0.5, dt, 1, 1);
      p.px = p.x; p.py = p.y;
    }

    if (this.o.framing === 'scroll') {
      var sy = window.scrollY || 0;
      var dy = sy - this._lastScrollY;
      this._lastScrollY = sy;
      this.scrollVel += (dy - this.scrollVel) * 0.35;
      this._updateFraming(c.clientWidth / Math.max(1, c.clientHeight), false);
      if (this.o.scrollWake && !this.reduced && Math.abs(this.scrollVel) > 0.4) {
        // Stir the margins in the direction the page is moving.
        var mv = Math.max(-40, Math.min(40, this.scrollVel)) / Math.max(1, c.clientHeight) * s.GH * 1.4;
        var side = [0.07 + Math.random() * 0.08, 0.93 - Math.random() * 0.08];
        for (var k = 0; k < 2; k++) {
          var gx = side[k] * s.GW - 0.5;
          var gy = (0.2 + Math.random() * 0.6) * s.GH - 0.5;
          this._splat(gx, gy + mv, gx, gy, dt, 0.45, 1.6);
        }
      }
    }
    var v = this.view, ease = 1 - Math.pow(0.9, dt);
    v.x += (v.tx - v.x) * ease;
    v.y += (v.ty - v.y) * ease;
    v.zoom += (v.tzoom - v.zoom) * ease;

    this._advect(dt);
    this._encode();
    p.hover += (p.target - p.hover) * (1 - Math.pow(0.86, dt));
    var pe = 1 - Math.pow(0.55, dt);
    p.sx += (p.x - p.sx) * pe;
    p.sy += (p.y - p.sy) * pe;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texFlow);
    if (s.fresh) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.GW, s.GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.bytes);
      s.fresh = false;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, s.GW, s.GH, gl.RGBA, gl.UNSIGNED_BYTE, s.bytes);
    }

    var scan = 1;
    if (!this.reduced) {
      var q = Math.min(1, Math.max(0, (t - 0.25) / 2.4));
      scan = q * q * (3 - 2 * q);
    }
    var dpr = this.dpr || 1, U = this.U;
    gl.uniform2f(U.uRes, c.width, c.height);
    gl.uniform1f(U.uAspect, c.width / c.height);
    gl.uniform1f(U.uImgAspect, this.imgAspect || 2);
    gl.uniform2f(U.uMouse, p.sx, p.sy);
    gl.uniform1f(U.uHover, p.hover);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uG, Math.max(1, this.o.glyphSize * dpr));
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform2f(U.uGrid, s.GW, s.GH);
    gl.uniform1f(U.uWarp, this.reduced ? this.o.warp * 0.5 : this.o.warp);
    gl.uniform1f(U.uScan, scan);
    gl.uniform1f(U.uMotion, this.reduced ? 0 : 1);
    gl.uniform1f(U.uTextOn, this.textOn);
    gl.uniform2f(U.uPos, v.x, v.y);
    gl.uniform1f(U.uZoom, v.zoom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  global.RuneScene = RuneScene;
  global.RunePixelText = drawPixelText;
  global.RuneHex = parseHex;
})(window);
