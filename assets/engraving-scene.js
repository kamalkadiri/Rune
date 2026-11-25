/*
 * RUNE engraving scene (landing page).
 * The engraving is drawn in WebGL: the fine guilloche lines in the sky drift and undulate,
 * the harbour water ripples and carries moving glints, and the cursor carries a soft loupe that
 * magnifies the engraving a little and deepens its ink, like a print looked at under a glass.
 *
 * new EngravingScene({ canvas, image, mask, focusX, ink, paper })
 *   image, mask: <img> elements (same origin). mask: R = sky, G = water.
 *   focusX: image x kept in view on narrow screens (0..1).
 */
(function (global) {
  'use strict';

  var RIPPLES = 14;

  var VS = 'attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uImg;',
    'uniform sampler2D uMask;',
    'uniform vec2 uRes;',
    'uniform float uAspect;',
    'uniform float uImgAspect;',
    'uniform vec2 uPos;',
    'uniform vec2 uS;',
    'uniform float uTime;',
    'uniform float uDpr;',
    'uniform float uMotion;',
    'uniform vec2 uTexel;',
    'uniform vec3 uInk;',
    'uniform vec3 uPaper;',
    'uniform vec4 uRip[' + RIPPLES + '];',
    'uniform vec2 uMouse;',
    'uniform float uHover;',
    'uniform float uPulse;',
    '',
    'void main() {',
    '  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 uv = px / uRes;',
    '  vec2 s = uS;',
    '',
    '  // faint rings on the water (screen space, aspect corrected): they move the picture, nothing is drawn',
    '  vec2 rOff = vec2(0.0);',
    '  for (int i = 0; i < ' + RIPPLES + '; i++) {',
    '    vec4 r = uRip[i];',
    '    float age = uTime - r.z;',
    '    if (r.w <= 0.0 || age < 0.0 || age > 3.2) continue;',
    '    vec2 d = (uv - r.xy) * vec2(uAspect, 1.0);',
    '    float dist = length(d);',
    '    float k = dist - age * 0.2;',
    '    float env = exp(-k * k / 0.0022) * exp(-age * 1.25) * r.w * smoothstep(0.0, 0.12, age);',
    '    float ph = k * 105.0;',
    '    rOff += (d / max(dist, 0.0001)) * sin(ph) * env * 0.0045;',
    '  }',
    '',
    '  // the loupe: a soft-edged glass that follows the cursor',
    '  vec2 dm = (uv - uMouse) * vec2(uAspect, 1.0);',
    '  float R = 0.13;',
    '  float prof = uHover * (1.0 - smoothstep(R * 0.5, R, length(dm)));',
    '  float mag = 1.0 + (0.27 + 0.22 * uPulse) * prof;',
    '  vec2 luv = uMouse + (uv - uMouse) / mag;',
    '  vec2 suv = luv - vec2(rOff.x / uAspect, rOff.y);',
    '  vec2 iuv = suv * s + uPos * (1.0 - s);',
    '',
    '  vec4 m = texture2D(uMask, iuv);',
    '  float sky = m.r * uMotion;',
    '  float water = m.g * uMotion;',
    '  float t = uTime;',
    '',
    '  vec2 off = vec2(0.0);',
    '  // sky: the engraved lines undulate',
    '  off.y += sky * (0.0022 * sin(iuv.x * 29.0 + t * 0.5) + 0.0014 * sin(iuv.x * 11.0 - t * 0.33 + iuv.y * 17.0));',
    '  // water: ripples that deepen towards the foreground',
    '  float depth = smoothstep(0.76, 1.0, iuv.y);',
    '  float sw = sin(iuv.y * 210.0 - t * 1.3 + sin(iuv.x * 7.0 + t * 0.35) * 2.2);',
    '  off.x += water * sw * (0.0010 + 0.0022 * depth);',
    '  off.y += water * 0.0008 * sin(iuv.x * 46.0 + t * 0.9 + iuv.y * 30.0);',
    '',
    '  vec2 q = iuv + off;',
    '  vec3 c = texture2D(uImg, q).rgb;',
    '  // light sharpening keeps the engraved strokes crisp when the picture is scaled up',
    '  vec3 nb = texture2D(uImg, q + vec2(uTexel.x, 0.0)).rgb + texture2D(uImg, q - vec2(uTexel.x, 0.0)).rgb',
    '          + texture2D(uImg, q + vec2(0.0, uTexel.y)).rgb + texture2D(uImg, q - vec2(0.0, uTexel.y)).rgb;',
    '  c = clamp(c + (c - nb * 0.25) * 0.35, 0.0, 1.0);',
    '',
    '  // sky: redraw the guilloche lines so they drift slowly through the open sky',
    '  float spacingPx = uRes.y / (150.0 * s.y);',
    '  float lp = (iuv.y + 0.05 * sin(iuv.x * 3.1 + 0.4) + 0.012 * sin(iuv.x * 12.0 + iuv.y * 9.0 + t * 0.35)) * 150.0 + t * 0.12;',
    '  float fr = fract(lp);',
    '  float d0 = min(fr, 1.0 - fr);',
    '  float w = 0.55 * uDpr / spacingPx;',
    '  float aa = 0.9 * uDpr / spacingPx;',
    '  float line = 1.0 - smoothstep(w, w + aa, d0);',
    '  vec3 pale = mix(uPaper, uInk, 0.42);',
    '  c = mix(c, uPaper, m.r * 0.6);',
    '  c = mix(c, pale, line * m.r * 0.55);',
    '',
    '  // water: thin glints that travel along the ripples',
    '  float rows = iuv.y * 170.0;',
    '  float row = floor(rows);',
    '  float hr = fract(sin(row * 12.9898) * 43758.5453);',
    '  float dash = smoothstep(0.9, 1.0, sin(iuv.x * (38.0 + hr * 46.0) - t * (0.35 + hr * 0.55) + hr * 6.2831));',
    '  float rowLine = 1.0 - smoothstep(0.0, 0.32, abs(fract(rows) - 0.5));',
    '  c = mix(c, uPaper, dash * rowLine * water * 0.4);',
    '',
    '  // very wide screens: the plate fades into the paper at its sides; the sky lines carry on across',
    '  float edge = uS.x > 1.0 ? smoothstep(0.0, 0.06, iuv.x) * (1.0 - smoothstep(0.94, 1.0, iuv.x)) : 1.0;',
    '  if (edge < 0.999) {',
    '    float band = 1.0 - smoothstep(0.30, 0.44, iuv.y);',
    '    vec3 margin = mix(uPaper, pale, line * band * 0.55);',
    '    c = mix(margin, c, edge);',
    '  }',
    '',
    '  // under the loupe the engraved strokes read darker and crisper',
    '  c = mix(c, c * c * 1.03, prof * 0.42);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  function hex(h) {
    var s = (h || '').replace('#', '');
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }

  function EngravingScene(o) {
    this.o = Object.assign({ focusX: 0.47, ink: '#1B4A8C', paper: '#F8F7F3' }, o || {});
    this.canvas = this.o.canvas;
    this.image = this.o.image;
    this.mask = this.o.mask;
    this.rip = new Float32Array(RIPPLES * 4);
    this.ripIdx = 0;
    this.pos = [0.5, 0.5];
    this.scale = [1, 1];
    this._boot();
  }

  EngravingScene.prototype._boot = function () {
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
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(c);
    } else {
      window.addEventListener('resize', function () { self._resize(); });
    }
    var pending = 2;
    var done = function () { if (--pending === 0) self._start(); };
    [this.image, this.mask].forEach(function (im) {
      if (im.complete && im.naturalWidth) done();
      else im.addEventListener('load', done, { once: true });
    });
  };

  EngravingScene.prototype._initGL = function () {
    var gl = this.gl;
    function mk(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('[rune] shader', gl.getShaderInfoLog(sh)); return null; }
      return sh;
    }
    var vs = mk(gl.VERTEX_SHADER, VS), fs = mk(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('[rune] link', gl.getProgramInfoLog(pr)); return false; }
    gl.useProgram(pr);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uImg', 'uMask', 'uRes', 'uAspect', 'uImgAspect', 'uPos', 'uS', 'uTime', 'uDpr', 'uMotion', 'uTexel',
      'uInk', 'uPaper', 'uRip', 'uMouse', 'uHover', 'uPulse'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    U.uRip = gl.getUniformLocation(pr, 'uRip[0]') || U.uRip;
    this.U = U;
    function tex(unit) {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.texImg = tex(0);
    this.texMask = tex(1);
    gl.uniform1i(U.uImg, 0);
    gl.uniform1i(U.uMask, 1);
    gl.uniform3fv(U.uInk, hex(this.o.ink));
    gl.uniform3fv(U.uPaper, hex(this.o.paper));
    return true;
  };

  EngravingScene.prototype._initPointer = function () {
    var self = this, c = this.canvas;
    this.ptr = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, hover: 0, target: 0, pulse: 0, has: false };
    var move = function (e) {
      var r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var P = self.ptr;
      P.x = (e.clientX - r.left) / r.width;
      P.y = (e.clientY - r.top) / r.height;
      if (!P.has) { P.sx = P.x; P.sy = P.y; P.has = true; }
      P.target = 1;
    };
    c.addEventListener('pointermove', move, { passive: true });
    c.addEventListener('pointerdown', function (e) { move(e); self.ptr.pulse = 1; }, { passive: true });
    var leave = function () { self.ptr.target = 0; self.ptr.has = false; };
    c.addEventListener('pointerleave', leave);
    c.addEventListener('pointercancel', leave);
  };

  EngravingScene.prototype.addRipple = function (x, y, strength) {
    var i = this.ripIdx * 4;
    this.rip[i] = x;
    this.rip[i + 1] = y;
    this.rip[i + 2] = (performance.now() - this.t0) / 1000;
    this.rip[i + 3] = strength;
    this.ripIdx = (this.ripIdx + 1) % RIPPLES;
  };

  EngravingScene.prototype._resize = function () {
    var c = this.canvas, gl = this.gl;
    if (!c || !gl) return;
    var cw = c.clientWidth || 1, ch = c.clientHeight || 1;
    var dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6e6 / (cw * ch))));
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = dpr;
    gl.viewport(0, 0, w, h);
    this._frame_pos(cw / ch);
  };

  // How much of the picture the screen shows. Narrow screens keep the bell tower and town in view;
  // wide screens always show at least MIN_HEIGHT of the picture's height (sky to lake), so on very
  // wide windows the picture no longer fills the width and fades into the paper at its sides.
  var MIN_HEIGHT = 0.92;
  EngravingScene.prototype._frame_pos = function (aspect) {
    var ia = this.imgAspect || (this.image.naturalWidth / Math.max(1, this.image.naturalHeight)) || 1.78;
    var sx = 1, sy = 1;
    if (aspect > ia) sy = ia / aspect; else sx = aspect / ia;
    if (sy < MIN_HEIGHT) { sx = MIN_HEIGHT / sy; sy = MIN_HEIGHT; }
    var fx = this.o.focusX;
    var px = sx < 0.999 ? Math.min(1, Math.max(0, (fx - sx / 2) / (1 - sx))) : 0.5;
    var py = sy < 0.999 ? 0.3 : 0.5;
    this.pos = [px, py];
    this.scale = [sx, sy];
    if (this.image) {
      this.image.style.objectFit = sx > 1.001 ? 'contain' : 'cover';
      this.image.style.objectPosition = (px * 100).toFixed(2) + '% ' + (py * 100).toFixed(2) + '%';
    }
  };

  EngravingScene.prototype._start = function () {
    var gl = this.gl, self = this;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texImg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texMask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.mask);
    } catch (e) {
      console.warn('[rune] images could not be used as textures', e);
      return;
    }
    var im = this.image;
    this.imgAspect = im.naturalWidth / im.naturalHeight;
    this.texel = [1 / im.naturalWidth, 1 / im.naturalHeight];
    this._frame_pos(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.t0 = performance.now();
    this.nextDrop = 1.5;
    this.canvas.style.opacity = '1';
    var loop = function () { self._raf = requestAnimationFrame(loop); self._draw(); };
    loop();
  };

  // A few faint rings on the water now and then, as if something touched the surface.
  EngravingScene.prototype._ambient = function (t) {
    if (this.reduced || t < this.nextDrop) return;
    this.nextDrop = t + 1.8 + Math.random() * 2.2;
    var sx = this.scale[0], sy = this.scale[1];
    for (var k = 0; k < 6; k++) {
      var ix = 0.22 + Math.random() * 0.74, iy = 0.82 + Math.random() * 0.15;
      var ux = (ix - this.pos[0] * (1 - sx)) / sx, uy = (iy - this.pos[1] * (1 - sy)) / sy;
      if (ux > 0.03 && ux < 0.97 && uy > 0.03 && uy < 0.97) { this.addRipple(ux, uy, 0.32); return; }
    }
  };

  EngravingScene.prototype._draw = function () {
    var gl = this.gl, c = this.canvas, U = this.U;
    var now = performance.now();
    var t = (now - this.t0) / 1000;
    var dt = Math.min(3, Math.max(0.25, (now - (this.last || now)) / 16.667));
    this.last = now;
    this._ambient(t);
    var P = this.ptr;
    var follow = 1 - Math.pow(0.82, dt);
    P.sx += (P.x - P.sx) * follow;
    P.sy += (P.y - P.sy) * follow;
    P.hover += (P.target - P.hover) * (1 - Math.pow(0.88, dt));
    P.pulse *= Math.pow(0.9, dt);
    gl.uniform2f(U.uRes, c.width, c.height);
    gl.uniform1f(U.uAspect, c.width / c.height);
    gl.uniform1f(U.uImgAspect, this.imgAspect);
    gl.uniform2f(U.uPos, this.pos[0], this.pos[1]);
    gl.uniform2f(U.uS, this.scale[0], this.scale[1]);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uDpr, this.dpr || 1);
    gl.uniform1f(U.uMotion, this.reduced ? 0 : 1);
    gl.uniform2f(U.uTexel, this.texel[0], this.texel[1]);
    gl.uniform4fv(U.uRip, this.rip);
    gl.uniform2f(U.uMouse, P.sx, P.sy);
    gl.uniform1f(U.uHover, P.hover);
    gl.uniform1f(U.uPulse, this.reduced ? 0 : P.pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  global.EngravingScene = EngravingScene;
})(window);
