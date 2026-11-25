/*
 * RUNE engraving scene (landing page).
 * The engraving is drawn in WebGL: the fine guilloche lines in the sky drift and undulate,
 * the harbour water ripples and carries moving glints, and the cursor sends out rings like a
 * finger drawn through still water, etched in the picture's own blue ink.
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
    'uniform float uTime;',
    'uniform float uDpr;',
    'uniform float uMotion;',
    'uniform vec2 uTexel;',
    'uniform vec3 uInk;',
    'uniform vec3 uPaper;',
    'uniform vec4 uRip[' + RIPPLES + '];',
    '',
    'vec2 scaleS() {',
    '  vec2 s = vec2(1.0);',
    '  if (uAspect > uImgAspect) { s.y = uImgAspect / uAspect; } else { s.x = uAspect / uImgAspect; }',
    '  return s;',
    '}',
    '',
    'void main() {',
    '  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 uv = px / uRes;',
    '  vec2 s = scaleS();',
    '',
    '  // ripples from the cursor (screen space, aspect corrected)',
    '  vec2 rOff = vec2(0.0);',
    '  float ring = 0.0;',
    '  for (int i = 0; i < ' + RIPPLES + '; i++) {',
    '    vec4 r = uRip[i];',
    '    float age = uTime - r.z;',
    '    if (r.w <= 0.0 || age < 0.0 || age > 3.2) continue;',
    '    vec2 d = (uv - r.xy) * vec2(uAspect, 1.0);',
    '    float dist = length(d);',
    '    float k = dist - age * 0.2;',
    '    float env = exp(-k * k / 0.0022) * exp(-age * 1.25) * r.w * smoothstep(0.0, 0.12, age);',
    '    float ph = k * 105.0;',
    '    rOff += (d / max(dist, 0.0001)) * sin(ph) * env * 0.0055;',
    '    ring += env * smoothstep(0.86, 1.0, cos(ph));',
    '  }',
    '  vec2 suv = uv - vec2(rOff.x / uAspect, rOff.y);',
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
    '  // cursor rings, etched in the picture\'s ink',
    '  c = mix(c, uInk, clamp(ring, 0.0, 1.0) * 0.38);',
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
    ['uImg', 'uMask', 'uRes', 'uAspect', 'uImgAspect', 'uPos', 'uTime', 'uDpr', 'uMotion', 'uTexel',
      'uInk', 'uPaper', 'uRip'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
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
    this.ptr = { lastX: null, lastY: null, lastT: 0 };
    var toUv = function (e) {
      var r = c.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width / r.height];
    };
    c.addEventListener('pointermove', function (e) {
      var p = toUv(e);
      if (!p || !self.t0) return;
      var now = (performance.now() - self.t0) / 1000;
      var P = self.ptr;
      if (P.lastX === null) { P.lastX = p[0]; P.lastY = p[1]; P.lastT = now; return; }
      var dx = (p[0] - P.lastX) * p[2], dy = p[1] - P.lastY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.05 || (dist > 0.012 && now - P.lastT > 0.22)) {
        self.addRipple(p[0], p[1], Math.min(1, 0.35 + dist * 6));
        P.lastX = p[0]; P.lastY = p[1]; P.lastT = now;
      }
    }, { passive: true });
    c.addEventListener('pointerdown', function (e) {
      var p = toUv(e);
      if (p && self.t0) self.addRipple(p[0], p[1], 1.5);
    }, { passive: true });
    c.addEventListener('pointerleave', function () { self.ptr.lastX = null; });
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

  // Keep the bell tower and town in view on narrow screens; keep the sky on very wide ones.
  EngravingScene.prototype._frame_pos = function (aspect) {
    var ia = this.imgAspect || (this.image.naturalWidth / Math.max(1, this.image.naturalHeight)) || 1.78;
    var visX = Math.min(1, aspect / ia), visY = Math.min(1, ia / aspect);
    var fx = this.o.focusX;
    var px = visX < 0.999 ? Math.min(1, Math.max(0, (fx - visX / 2) / (1 - visX))) : 0.5;
    var py = visY < 0.999 ? 0.3 : 0.5;
    this.pos = [px, py];
    if (this.image) this.image.style.objectPosition = (px * 100).toFixed(2) + '% ' + (py * 100).toFixed(2) + '%';
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
    var ia = this.imgAspect, c = this.canvas;
    var aspect = c.clientWidth / Math.max(1, c.clientHeight);
    var sx = 1, sy = 1;
    if (aspect > ia) sy = ia / aspect; else sx = aspect / ia;
    for (var k = 0; k < 6; k++) {
      var ix = 0.22 + Math.random() * 0.74, iy = 0.82 + Math.random() * 0.15;
      var ux = (ix - this.pos[0] * (1 - sx)) / sx, uy = (iy - this.pos[1] * (1 - sy)) / sy;
      if (ux > 0.03 && ux < 0.97 && uy > 0.03 && uy < 0.97) { this.addRipple(ux, uy, 0.32); return; }
    }
  };

  EngravingScene.prototype._draw = function () {
    var gl = this.gl, c = this.canvas, U = this.U;
    var t = (performance.now() - this.t0) / 1000;
    this._ambient(t);
    gl.uniform2f(U.uRes, c.width, c.height);
    gl.uniform1f(U.uAspect, c.width / c.height);
    gl.uniform1f(U.uImgAspect, this.imgAspect);
    gl.uniform2f(U.uPos, this.pos[0], this.pos[1]);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uDpr, this.dpr || 1);
    gl.uniform1f(U.uMotion, this.reduced ? 0 : 1);
    gl.uniform2f(U.uTexel, this.texel[0], this.texel[1]);
    gl.uniform4fv(U.uRip, this.rip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  global.EngravingScene = EngravingScene;
})(window);
