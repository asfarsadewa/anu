// The smooth display, on the GPU. The art stays the same. The first pass melts dither into flat colour.
// The second finds edges and redraws them as lines at any scale: 45 degrees and the 2:1 slope that isometric art is made of.
// It follows the xBR method: compare the colour differences across and along a corner, then blend over a soft line.

// The most output pixels the shader may fill. Each one reads 21 texels, and this must hold 30 frames a second on a mid-range phone
const BUDGET = 1300000;
// The largest whole scale inside the budget. The browser filters the rest of the way to the screen
export function pickScale(W, H, zoom) {
  let k = 1;
  while (k < zoom && W * H * (k + 1) * (k + 1) <= BUDGET) k++;
  return k;
}

const VERT = `attribute vec2 a; uniform float flip; varying vec2 v;
void main() { v = vec2(a.x * .5 + .5, a.y * flip * .5 + .5); gl_Position = vec4(a, 0., 1.); }`;
const HEAD = `precision highp float; uniform sampler2D t; uniform vec2 px; varying vec2 v;
const vec3 Y = vec3(.3, .59, .11);
float df(vec3 a, vec3 b) { return dot(abs(a - b), Y); }
vec3 at(float x, float y) { return texture2D(t, v + vec2(x, y) * px).rgb; }
`;
// A pixel that differs a little from four neighbours that agree is grain. A strong difference is detail, such as an eye, and it stays
const MELT = HEAD + `void main() {
  vec3 e = at(0., 0.), b = at(0., -1.), d = at(-1., 0.), f = at(1., 0.), h = at(0., 1.), m = (b + d + f + h) * .25;
  float spread = max(max(df(b, m), df(h, m)), max(df(d, m), df(f, m))), gap = df(e, m);
  float k = (1. - smoothstep(.05, .11, spread)) * (1. - smoothstep(.13, .24, gap));
  gl_FragColor = vec4(mix(e, m, k * .5), 1.);
}`;
const EDGE = HEAD + `uniform float size;
const float EQ = .045;
bool same(vec3 a, vec3 b) { return df(a, b) < EQ; }
// One corner, turned so that it points at +x +y. f is the neighbour along x, h along y, and i is across the corner
vec3 corner(vec3 col, vec2 p, vec3 e, vec3 f, vec3 h, vec3 i, vec3 b, vec3 d, vec3 c, vec3 g, vec3 f4, vec3 i4, vec3 h5, vec3 i5) {
  if (same(e, f) || same(e, h)) return col;
  float along = df(e, c) + df(e, g) + df(i, h5) + df(i, f4) + 4. * df(h, f);
  float across = df(h, d) + df(h, i5) + df(f, i4) + df(f, b) + 4. * df(e, i);
  if (along >= across) return col;
  bool open = (!same(f, b) && !same(f, c)) || (!same(h, d) && !same(h, g)) || (same(e, i) && ((!same(f, f4) && !same(f, i4)) || (!same(h, h5) && !same(h, i5)))) || same(e, g) || same(e, c);
  float w = .42 + .5 / size;
  float cov = open ? smoothstep(-w, w, p.y + p.x - 1.5) : 0.;
  float fg = df(f, g), hc = df(h, c);
  if (fg * 2. <= hc && !same(e, g) && !same(d, g)) cov = max(cov, smoothstep(-w, w, p.y + .5 * p.x - 1.));
  if (fg >= hc * 2. && !same(e, c) && !same(b, c)) cov = max(cov, smoothstep(-w, w, p.y + 2. * p.x - 2.));
  return mix(col, df(e, f) <= df(e, h) ? f : h, cov);
}
void main() {
  vec3 a1 = at(-1., -2.), b1 = at(0., -2.), c1 = at(1., -2.), a0 = at(-2., -1.), a = at(-1., -1.), b = at(0., -1.), c = at(1., -1.), c4 = at(2., -1.);
  vec3 d0 = at(-2., 0.), d = at(-1., 0.), e = at(0., 0.), f = at(1., 0.), f4 = at(2., 0.), g0 = at(-2., 1.), g = at(-1., 1.), h = at(0., 1.), i = at(1., 1.), i4 = at(2., 1.);
  vec3 g5 = at(-1., 2.), h5 = at(0., 2.), i5 = at(1., 2.);
  vec2 q = fract(v / px);
  vec3 col = e;
  col = corner(col, q, e, f, h, i, b, d, c, g, f4, i4, h5, i5);
  col = corner(col, vec2(q.y, 1. - q.x), e, h, d, g, f, b, i, a, h5, g5, d0, g0);
  col = corner(col, vec2(1. - q.x, 1. - q.y), e, d, b, a, h, f, g, c, d0, a0, b1, a1);
  col = corner(col, vec2(1. - q.y, q.x), e, b, f, c, d, h, a, i, b1, c1, f4, c4);
  gl_FragColor = vec4(col, 1.);
}`;

export class Smoother {
  // Returns null if this device has no usable WebGL. The caller then uses the plain path
  static make(after) {
    const canvas = document.createElement('canvas');
    canvas.id = 'c-smooth'; canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!p || !p.precision) return null;
    const s = new Smoother(canvas, gl);
    if (!s.melt || !s.edge) return null;
    after.after(canvas);
    return s;
  }
  constructor(canvas, gl) {
    this.canvas = canvas; this.gl = gl; this.lost = false; this.onLost = null; this.W = 0; this.H = 0;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; if (this.onLost) this.onLost(); });
    this.melt = this.program(MELT); this.edge = this.program(EDGE);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DITHER); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    this.source = this.texture(); this.melted = this.texture(); this.fbo = gl.createFramebuffer();
  }
  program(frag) {
    const { gl } = this, pr = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      gl.attachShader(pr, sh);
    }
    gl.bindAttribLocation(pr, 0, 'a'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    const u = {}; for (const k of ['t', 'px', 'flip', 'size']) u[k] = gl.getUniformLocation(pr, k);
    return { pr, u };
  }
  texture() {
    const { gl } = this, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  resize(W, H, zoom, cssW, cssH) {
    const { gl, canvas } = this, k = pickScale(W, H, zoom);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    if (canvas.width !== W * k || canvas.height !== H * k) { canvas.width = W * k; canvas.height = H * k; }
    this.scale = k;
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    gl.bindTexture(gl.TEXTURE_2D, this.source); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, this.melted); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.melted, 0);
  }
  pass(p, flip, target) {
    const { gl, W, H } = this;
    gl.useProgram(p.pr); gl.uniform1i(p.u.t, 0); gl.uniform2f(p.u.px, 1 / W, 1 / H); gl.uniform1f(p.u.flip, flip);
    if (p.u.size) gl.uniform1f(p.u.size, this.scale);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    if (target) gl.viewport(0, 0, W, H); else gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  draw(pix) {
    if (this.lost || !this.W) return;
    const { gl, W, H } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pix.buffer, pix.byteOffset, pix.byteLength));
    this.pass(this.melt, 1, this.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.melted);
    this.pass(this.edge, -1, null);
  }
}
