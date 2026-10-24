// js/core/pixel.js — pixel decorations on one shared WebGL context (ported from lm-detector, MIT).
import { _reducedMotion, prefersReducedMotion } from './motion.js';
// ─── Pixel decoration ───
// Ported from lm-detector web/src/lib/pixel-renderer.ts and pixel-effects.ts
// (https://github.com/Ikaleio/lm-detector), MIT License, Copyright (c) 2026 xqy2006.
// One offscreen WebGL context draws every decoration and the frame is copied
// into each host's own 2D canvas, so the page never nears the browser's cap on
// live WebGL contexts. Hosts are plain markup: any `.px[data-px]` that enters
// the DOM is attached and detached once it leaves, because the tables here are
// rebuilt with innerHTML and nothing else would call attach or dispose.
const PX_PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform vec4 u_color;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx + u_seed) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float steps(float fps) { return floor(u_time * fps) / fps; }
void ink(float a) {
  a = clamp(a, 0., 1.) * u_color.a;
  gl_FragColor = vec4(u_color.rgb * a, a);
}
`;
const PX_EFFECTS = {
  // Columns fall at random speeds and switch on at random each pass.
  rain: `
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  float t = steps(20.);
  float h = hash(vec2(p.x, 7.));
  float len = 3. + floor(hash(vec2(p.x, 11.)) * 8.);
  float span = u_res.y + len * 2.;
  float travel = t * (5. + h * 9.) + h * 50.;
  float d = mod(travel, span) - len - (u_res.y - 1. - p.y);
  float active = step(.45, hash(vec2(p.x, floor(travel / span))));
  float trail = step(0., d) * step(d, len) * (1. - d / (len + 1.));
  float glyph = step(.3, hash(p + floor(t * 9.) * vec2(3., 1.)));
  float lead = step(0., d) * (1. - step(1., d));
  ink(active * max(trail * trail * glyph * .8, lead));
}`,
  // No-signal snow with a rolling bright band.
  static: `
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  float frame = floor(u_time * 15.);
  float n = hash(p + frame * vec2(17., 5.));
  float roll = fract(p.y / u_res.y * .6 - u_time * .18);
  float band = smoothstep(0., .08, roll) * (1. - smoothstep(.08, .25, roll));
  float glitch = step(.96, hash(vec2(floor(p.y / 2.), frame)));
  ink(step(.55 - band * .3, n) * (.35 + band * .5) + glitch * step(.5, n) * .4);
}`,
  // Bitmap blocks appear along the diagonal, then wipe away.
  blocks: `
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  vec2 b = floor(p / 4.);
  vec2 inner = mod(p, 4.);
  vec2 grid = ceil(u_res / 4.);
  float t = u_time * .4;
  float cycle = floor(t);
  float phase = fract(t) * 2.5;
  float order = (b.x + grid.y - b.y) / (grid.x + grid.y) * .75 + hash(b + cycle * 7.) * .25;
  float front = phase < 1.25 ? phase : phase - 1.25;
  float on = phase < 1.25 ? step(order, front) : step(front, order);
  float edge = step(abs(order - front), .04);
  float cellMask = step(inner.x, 2.5) * step(inner.y, 2.5);
  ink(cellMask * max(on * (.35 + .35 * hash(b + 3. + cycle)), edge));
}`,
};
function initPixelDecorations() {
  const FPS = 24, PLAYBACK_RATE = 0.5, STILL_TIME = 3.7;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return; // No WebGL: decorations stay transparent.
  canvas.width = 256;
  canvas.height = 64;
  const start = performance.now();
  const views = new Map();
  const programs = new Map();
  let vertex = null, lost = false, frame = 0, lastDraw = -Infinity;
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();

  // A 2D canvas turns any CSS color (oklch, color-mix results) into sRGB.
  function parseColor(value) {
    if (colorCache.has(value)) return colorCache.get(value);
    let color = [0, 0, 0, 0];
    if (probe) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#0000';
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      color = [r / 255, g / 255, b / 255, a / 255];
    }
    colorCache.set(value, color);
    return color;
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    if (!gl.isContextLost()) console.error('pixel shader compile failed', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  function setup() {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0., 1.); }');
  }
  function program(effect) {
    if (programs.has(effect)) return programs.get(effect);
    const fragment = PX_EFFECTS[effect] ? compile(gl.FRAGMENT_SHADER, PX_PRELUDE + PX_EFFECTS[effect]) : null;
    const prog = gl.createProgram();
    let result = null;
    if (vertex && fragment && prog) {
      gl.attachShader(prog, vertex);
      gl.attachShader(prog, fragment);
      gl.bindAttribLocation(prog, 0, 'a_pos');
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        result = { prog, res: gl.getUniformLocation(prog, 'u_res'), time: gl.getUniformLocation(prog, 'u_time'), seed: gl.getUniformLocation(prog, 'u_seed'), color: gl.getUniformLocation(prog, 'u_color') };
      } else if (!gl.isContextLost()) {
        console.error(`pixel shader "${effect}" link failed`, gl.getProgramInfoLog(prog));
      }
    }
    programs.set(effect, result);
    return result;
  }
  function readColor(view) {
    const source = getComputedStyle(view.host).color;
    if (source === view.colorSource) return false;
    view.colorSource = source;
    view.color = parseColor(source);
    view.dirty = true;
    return true;
  }
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const view = views.get(entry.target);
      if (!view) continue;
      const { width, height } = entry.contentRect;
      const columns = Math.ceil(width / view.cell), rows = Math.ceil(height / view.cell);
      view.canvas.style.width = `${columns * view.cell}px`;
      view.canvas.style.height = `${rows * view.cell}px`;
      if (columns === view.columns && rows === view.rows) continue;
      view.columns = view.canvas.width = columns;
      view.rows = view.canvas.height = rows;
      view.dirty = true;
    }
    schedule();
  });
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const view = views.get(entry.target);
      if (!view) continue;
      view.visible = entry.isIntersecting;
      view.dirty ||= entry.isIntersecting;
    }
    schedule();
  }, { rootMargin: '64px' });
  function attach(host) {
    if (views.has(host)) return;
    const c = document.createElement('canvas');
    const context = c.getContext('2d');
    if (!context) return;
    c.width = c.height = 0;
    host.append(c);
    const view = { host, canvas: c, context, effect: host.dataset.px, cell: Number(host.dataset.cell) || 3, seed: Math.random() * 64, columns: 0, rows: 0, visible: false, colorSource: '', color: [0, 0, 0, 0], dirty: true };
    views.set(host, view);
    readColor(view);
    resize.observe(host);
    intersection.observe(host);
  }
  function detach(host) {
    resize.unobserve(host);
    intersection.unobserve(host);
    views.get(host)?.canvas.remove();
    views.delete(host);
  }
  function invalidate(recolor) {
    for (const view of views.values()) {
      if (recolor) readColor(view);
      view.dirty = true;
    }
    schedule();
  }
  function schedule() {
    if (frame || lost || document.hidden) return;
    const animate = !prefersReducedMotion();
    for (const view of views.values()) {
      if (view.visible && view.columns && view.rows && (animate || view.dirty)) {
        frame = requestAnimationFrame(tick);
        return;
      }
    }
  }
  function tick(now) {
    frame = 0;
    const animate = !prefersReducedMotion();
    const due = animate && now - lastDraw >= 1000 / FPS - 1;
    if (due) lastDraw = now;
    // Reduced motion: every decoration stops on the same still frame.
    const time = animate ? ((now - start) / 1000 * PLAYBACK_RATE) % 3600 : STILL_TIME;
    for (const view of views.values()) {
      if (!view.visible || !view.columns || !view.rows || !(due || view.dirty)) continue;
      draw(view, time);
    }
    schedule();
  }
  function draw(view, time) {
    const p = program(view.effect);
    view.dirty = false;
    if (!p) return;
    if (canvas.width < view.columns) canvas.width = view.columns;
    if (canvas.height < view.rows) canvas.height = view.rows;
    gl.viewport(0, 0, view.columns, view.rows);
    gl.useProgram(p.prog);
    gl.uniform2f(p.res, view.columns, view.rows);
    gl.uniform1f(p.time, time);
    gl.uniform1f(p.seed, view.seed);
    gl.uniform4fv(p.color, view.color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    view.context.clearRect(0, 0, view.columns, view.rows);
    // The WebGL origin is bottom-left, so the viewport sits at the bottom of the drawing buffer.
    view.context.drawImage(canvas, 0, canvas.height - view.rows, view.columns, view.rows, 0, 0, view.columns, view.rows);
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.px[data-px]')) attach(node);
    node.querySelectorAll('.px[data-px]').forEach(attach);
  }
  new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(scan);
    for (const host of [...views.keys()]) if (!host.isConnected) detach(host);
  }).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(() => invalidate(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => invalidate(true));
  _reducedMotion.addEventListener('change', () => invalidate(false));
  document.addEventListener('visibilitychange', schedule);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; programs.clear(); cancelAnimationFrame(frame); frame = 0; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; setup(); invalidate(false); });
  setup();
  scan(document.body);
}
export { initPixelDecorations };
