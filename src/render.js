// ===================== RENDERIZADOR WebGL2 =====================
const M4 = {
  ident() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  persp(o, fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  look(o, ex, ey, ez, fx, fy, fz, rx, ry, rz, ux, uy, uz) { // base ortonormal já pronta (direita, cima, frente)
    o[0] = rx; o[1] = ux; o[2] = -fx; o[3] = 0; o[4] = ry; o[5] = uy; o[6] = -fy; o[7] = 0; o[8] = rz; o[9] = uz; o[10] = -fz; o[11] = 0;
    o[12] = -(rx * ex + ry * ey + rz * ez); o[13] = -(ux * ex + uy * ey + uz * ez); o[14] = (fx * ex + fy * ey + fz * ez); o[15] = 1; return o;
  },
  mul(o, a, b) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  fromRT(o, R, p) { o[0] = R[0]; o[1] = R[3]; o[2] = R[6]; o[3] = 0; o[4] = R[1]; o[5] = R[4]; o[6] = R[7]; o[7] = 0; o[8] = R[2]; o[9] = R[5]; o[10] = R[8]; o[11] = 0; o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o; },
  trans(o, x, y, z) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; o[12] = x; o[13] = y; o[14] = z; return o; },
  rotY(o, a) { const c = Math.cos(a), s = Math.sin(a); o.fill(0); o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1; return o; },
  rotX(o, a) { const c = Math.cos(a), s = Math.sin(a); o.fill(0); o[0] = 1; o[5] = c; o[6] = s; o[9] = -s; o[10] = c; o[15] = 1; return o; },
};

const GLSL_COMMON = `
uniform vec3 u_sun, u_sunCol, u_zenith, u_horizon, u_ground, u_ambSky, u_ambGround, u_cam;
uniform float u_fogD, u_exposure;
vec3 skyCol(vec3 d){
  float h = d.y; vec3 c = mix(u_horizon, u_zenith, pow(clamp(h, 0., 1.), 0.5));
  c = mix(c, u_ground, smoothstep(0.0, -0.3, h));
  float s = max(dot(d, u_sun), 0.);
  c += u_sunCol * (pow(s, 900.) * 12. + pow(s, 40.) * 0.18 + pow(s, 6.) * 0.05);
  return c;
}
vec3 applyFog(vec3 c, vec3 wp){
  vec3 d = wp - u_cam; float dist = length(d); float f = 1. - exp(-pow(dist * u_fogD, 2.));
  vec3 dn = d / max(dist, 0.001);
  vec3 fc = mix(u_horizon, u_horizon * 0.6 + u_sunCol * 0.18, pow(max(dot(dn, u_sun), 0.), 6.));
  return mix(c, fc, f);
}
vec3 tonemap(vec3 x){ x *= u_exposure; x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); return pow(clamp(x, 0., 1.), vec3(1. / 2.2)); }
`;
const VS_MESH = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_pos; layout(location=1) in vec4 a_nrm; layout(location=2) in vec2 a_uv0; layout(location=3) in vec2 a_uv1;
uniform mat4 u_vp, u_model; uniform vec3 u_pmin, u_psize; uniform vec4 u_uvb0, u_uvb1;
out vec3 v_wp; out vec3 v_n; out vec2 v_uv; out vec2 v_uv1;
void main(){
  vec3 p = u_pmin + a_pos.xyz * u_psize; vec4 wp = u_model * vec4(p, 1.);
  v_wp = wp.xyz; v_n = mat3(u_model) * a_nrm.xyz;
  v_uv = u_uvb0.xy + a_uv0 * (u_uvb0.zw - u_uvb0.xy); v_uv1 = u_uvb1.xy + a_uv1 * (u_uvb1.zw - u_uvb1.xy);
  gl_Position = u_vp * wp;
}`;
const FS_WORLD = `#version 300 es
precision highp float;
in vec3 v_wp; in vec3 v_n; in vec2 v_uv; in vec2 v_uv1;
uniform sampler2D u_tex, u_ao; uniform float u_hasAo, u_alphaTest, u_water, u_time, u_aoStr;
out vec4 o;
${GLSL_COMMON}
void main(){
  vec2 uv = v_uv; if (u_water > 0.5) uv += vec2(u_time * 0.010, u_time * 0.007);
  vec4 t = texture(u_tex, uv);
  if (u_alphaTest > 0. && t.a < u_alphaTest) discard;
  vec3 n = normalize(v_n); if (!gl_FrontFacing) n = -n;
  float ao = 1.; if (u_hasAo > 0.5) ao = mix(1., texture(u_ao, v_uv1).r, u_aoStr);
  float ndl = max(dot(n, u_sun), 0.);
  vec3 amb = mix(u_ambGround, u_ambSky, n.y * 0.5 + 0.5);
  vec3 col = t.rgb * (u_sunCol * ndl * mix(0.5, 1., ao) + amb * ao);
  if (u_water > 0.5) {
    vec3 V = normalize(u_cam - v_wp);
    vec3 nw = normalize(vec3(sin(v_wp.x * 0.07 + u_time * 0.9) * 0.07 + sin(v_wp.z * 0.13 + u_time * 1.3) * 0.05, 1., cos(v_wp.z * 0.09 + u_time) * 0.07));
    float fr = pow(1. - max(dot(V, nw), 0.), 4.) * 0.8 + 0.04; vec3 R = reflect(-V, nw);
    col = mix(col, skyCol(R), fr) + u_sunCol * pow(max(dot(R, u_sun), 0.), 250.) * 1.2;
  }
  col = applyFog(col, v_wp);
  o = vec4(tonemap(col), t.a);
}`;
const FS_CAR = `#version 300 es
precision highp float;
in vec3 v_wp; in vec3 v_n; in vec2 v_uv; in vec2 v_uv1;
uniform sampler2D u_tex; uniform vec4 u_color; uniform float u_hasTex, u_metal, u_rough, u_coat, u_emis;
out vec4 o;
${GLSL_COMMON}
void main(){
  vec4 t = u_hasTex > 0.5 ? texture(u_tex, v_uv) : vec4(1.);
  vec3 alb = u_color.rgb * t.rgb; float alpha = u_color.a * t.a;
  vec3 n = normalize(v_n); vec3 V = normalize(u_cam - v_wp); if (dot(n, V) < 0.) n = -n;
  float ndv = max(dot(n, V), 0.); float ndl = max(dot(n, u_sun), 0.);
  vec3 R = reflect(-V, n);
  vec3 env = skyCol(R);
  vec3 F0 = mix(vec3(0.04), alb, u_metal);
  vec3 fres = F0 + (1. - F0) * pow(1. - ndv, 5.);
  float sh = mix(6., 260., pow(1. - u_rough, 1.3));
  vec3 H = normalize(u_sun + V);
  vec3 spec = u_sunCol * pow(max(dot(n, H), 0.), sh) * (sh + 8.) / 25. * fres;
  vec3 amb = mix(u_ambGround, u_ambSky, n.y * 0.5 + 0.5);
  vec3 diff = alb * (1. - u_metal) * (u_sunCol * ndl + amb);
  vec3 col = diff + env * fres * mix(0.55, 1.0, 1. - u_rough) + spec;
  if (u_coat > 0.5) col += env * (0.04 + 0.96 * pow(1. - ndv, 5.)) * 0.55;
  col += u_emis * alb * 6.;
  col = applyFog(col, v_wp);
  o = vec4(tonemap(col), alpha);
}`;
const VS_SKY = `#version 300 es
out vec2 v_p; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); v_p = p * 2. - 1.; gl_Position = vec4(v_p, 0.9999, 1.); }`;
const FS_SKY = `#version 300 es
precision highp float; in vec2 v_p; out vec4 o;
uniform vec3 u_right, u_up, u_fwd; uniform float u_tanH, u_asp;
${GLSL_COMMON}
void main(){ vec3 d = normalize(u_fwd + u_right * v_p.x * u_tanH * u_asp + u_up * v_p.y * u_tanH); o = vec4(tonemap(skyCol(d)), 1.); }`;
const VS_QUAD = `#version 300 es
precision highp float; layout(location=0) in vec2 a_p; uniform mat4 u_vp; uniform vec3 u_c, u_r, u_f; uniform vec2 u_s; out vec2 v_q; out vec3 v_wp;
void main(){ vec3 wp = u_c + u_r * a_p.x * u_s.x + u_f * a_p.y * u_s.y; v_q = a_p; v_wp = wp; gl_Position = u_vp * vec4(wp, 1.); }`;
const FS_QUAD = `#version 300 es
precision highp float; in vec2 v_q; in vec3 v_wp; out vec4 o; uniform float u_a;
void main(){ vec2 q = abs(v_q); float d = pow(pow(q.x, 3.) + pow(q.y, 3.), 1. / 3.); float a = smoothstep(1., 0.35, d) * u_a; o = vec4(0., 0., 0., a); }`;
const VS_PART = `#version 300 es
precision highp float; layout(location=0) in vec4 a_p; layout(location=1) in float a_a; uniform mat4 u_vp; uniform float u_px; out float v_a;
void main(){ gl_Position = u_vp * vec4(a_p.xyz, 1.); v_a = a_a; gl_PointSize = clamp(a_p.w * u_px / max(gl_Position.w, 0.1), 1., 220.); }`;
const FS_PART = `#version 300 es
precision highp float; in float v_a; out vec4 o; uniform vec3 u_col;
void main(){ vec2 q = gl_PointCoord * 2. - 1.; float d = dot(q, q); if (d > 1.) discard; o = vec4(u_col, v_a * (1. - d) * (1. - d)); }`;

class Renderer {
  constructor(canvas, opt) {
    this.canvas = canvas; this.opt = opt || {};
    const gl = this.gl = canvas.getContext('webgl2', { antialias: !!this.opt.aa, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!this.opt.preserve });
    if (!gl) throw new Error('WebGL2 indisponível');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic'); this.maxAniso = this.aniso ? gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    this.anisoLevel = 4;
    this.progs = {}; this.vp = new Float32Array(16); this.view = new Float32Array(16); this.proj = new Float32Array(16);
    this.tmpA = new Float32Array(16); this.tmpB = new Float32Array(16); this.tmpC = new Float32Array(16); this.ident = M4.ident();
    this.planes = new Float64Array(24); this.drawDist = 900; this.time = 0; this.stats = { calls: 0, prims: 0 };
    this.env = { sun: normalize3([-0.55, 0.52, 0.40]), sunCol: [2.5, 1.95, 1.4], zenith: [0.10, 0.26, 0.58], horizon: [0.55, 0.70, 0.88], ground: [0.16, 0.17, 0.19], ambSky: [0.38, 0.50, 0.72], ambGround: [0.24, 0.21, 0.18], exposure: 0.82 };
    this.progs.world = this.prog(VS_MESH, FS_WORLD, ['u_vp', 'u_model', 'u_pmin', 'u_psize', 'u_uvb0', 'u_uvb1', 'u_tex', 'u_ao', 'u_hasAo', 'u_alphaTest', 'u_water', 'u_time', 'u_aoStr']);
    this.progs.car = this.prog(VS_MESH, FS_CAR, ['u_vp', 'u_model', 'u_pmin', 'u_psize', 'u_uvb0', 'u_uvb1', 'u_tex', 'u_color', 'u_hasTex', 'u_metal', 'u_rough', 'u_coat', 'u_emis']);
    this.progs.sky = this.prog(VS_SKY, FS_SKY, ['u_right', 'u_up', 'u_fwd', 'u_tanH', 'u_asp']);
    this.progs.quad = this.prog(VS_QUAD, FS_QUAD, ['u_vp', 'u_c', 'u_r', 'u_f', 'u_s', 'u_a']);
    this.progs.part = this.prog(VS_PART, FS_PART, ['u_vp', 'u_px', 'u_col']);
    this.quadVao = gl.createVertexArray(); gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.maxPart = 400; this.partData = new Float32Array(this.maxPart * 4); this.partAlpha = new Float32Array(this.maxPart);
    this.partVao = gl.createVertexArray(); gl.bindVertexArray(this.partVao);
    this.partB1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.partB1); gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    this.partB2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.partB2); gl.bufferData(gl.ARRAY_BUFFER, this.partAlpha.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.whiteTex = this.makeTex(new Uint8Array([255, 255, 255, 255]), 1, 1, false);
    this.emptyVao = gl.createVertexArray();
  }
  prog(vs, fs, uniforms) {
    const gl = this.gl, mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = { p };
    for (const n of uniforms.concat(['u_sun', 'u_sunCol', 'u_zenith', 'u_horizon', 'u_ground', 'u_ambSky', 'u_ambGround', 'u_cam', 'u_fogD', 'u_exposure', 'u_col'])) u[n] = gl.getUniformLocation(p, n);
    return u;
  }
  makeTex(data, w, h, srgb) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t;
  }
  texFromBitmap(bmp, srgb) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(this.anisoLevel, this.maxAniso));
    return t;
  }
  setAniso(level) { this.anisoLevel = level; const gl = this.gl; if (!this.aniso) return; for (const t of this.allTex || []) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(level, this.maxAniso)); } }
  async loadTex(url, srgb, scale) {
    const r = await fetch(url); const b = await r.blob(); let bmp;
    const o = { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'none' };
    try {
      bmp = await createImageBitmap(b, o);
      if (scale && scale < 1) { const w = Math.max(64, Math.round(bmp.width * scale)), h = Math.max(64, Math.round(bmp.height * scale)); bmp.close && bmp.close(); bmp = await createImageBitmap(b, Object.assign({ resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }, o)); }
    } catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(b); });
    }
    const t = this.texFromBitmap(bmp, srgb); (this.allTex = this.allTex || []).push(t); return t;
  }
  makeVAO(vbo, ibo, pr) {
    const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.UNSIGNED_SHORT, true, 8, pr.p);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 4, pr.nr);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.UNSIGNED_SHORT, true, 4, pr.u);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.UNSIGNED_SHORT, true, 4, pr.u1 !== undefined ? pr.u1 : pr.u);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bindVertexArray(null); return v;
  }
  uploadBin(buf) { const gl = this.gl, b = gl.createBuffer(), i = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buf, gl.STATIC_DRAW); gl.bindVertexArray(null); return { v: b, i }; }
  prepPrim(vbo, pr) {
    pr.vao = this.makeVAO(vbo.v, vbo.i, pr); const bb = pr.bb;
    pr.cx = (bb[0] + bb[3]) / 2; pr.cy = (bb[1] + bb[4]) / 2; pr.cz = (bb[2] + bb[5]) / 2; pr.rad = 0.5 * Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    pr.gl = pr.it === 2 ? this.gl.UNSIGNED_SHORT : this.gl.UNSIGNED_INT;
  }
  async loadCity(man, buf, texScale, onProg) {
    this.city = man; this.cityVbo = this.uploadBin(buf); const nT = man.mats.length * 2 + 0; let done = 0;
    for (const pr of man.prims) this.prepPrim(this.cityVbo, pr);
    for (const m of man.mats) {
      m.glTex = await this.loadTex('assets/' + m.tex, true, texScale); if (m.ao) m.glAo = await this.loadTex('assets/' + m.ao, false, texScale); onProg && onProg(++done / man.mats.length);
    }
    // agrupa primitivas por material, ordem de desenho: opaco, máscara, blend
    man.groups = man.mats.map(() => []); for (const pr of man.prims) man.groups[pr.m].push(pr);
    man.order = man.mats.map((m, i) => i).sort((a, b) => ({ opaque: 0, mask: 1, blend: 2 })[man.mats[a].mode] - ({ opaque: 0, mask: 1, blend: 2 })[man.mats[b].mode]);
  }
  // carrega um carro (geometria + texturas) sem trocar o carro em uso; base = pasta do carro, ex.: 'assets/cars/bmw-m3-gtr/'
  async loadCar(man, buf, texScale, base) {
    const vbo = this.uploadBin(buf); man.vbo = vbo;
    for (const pr of man.body) this.prepPrim(vbo, pr);
    for (const k in man.wheels) for (const pr of man.wheels[k].prims) this.prepPrim(vbo, pr);
    for (const m of man.mats) if (m.tex) m.glTex = await this.loadTex((base || 'assets/') + m.tex, true, texScale);
    if (!this.car) this.car = man;
    return man;
  }
  setCar(man) { this.car = man; }
  resize(w, h) { this.canvas.width = w; this.canvas.height = h; this.gl.viewport(0, 0, w, h); this.aspect = w / h; }
  setEnv(p) {
    const gl = this.gl, e = this.env; gl.uniform3fv(p.u_sun, e.sun); gl.uniform3fv(p.u_sunCol, e.sunCol); gl.uniform3fv(p.u_zenith, e.zenith); gl.uniform3fv(p.u_horizon, e.horizon);
    gl.uniform3fv(p.u_ground, e.ground); gl.uniform3fv(p.u_ambSky, e.ambSky); gl.uniform3fv(p.u_ambGround, e.ambGround); gl.uniform3fv(p.u_cam, this.camPos);
    gl.uniform1f(p.u_fogD, 2.2 / this.drawDist); gl.uniform1f(p.u_exposure, e.exposure);
  }
  frustum() { // planos de Gribb-Hartmann a partir de vp
    const m = this.vp, P = this.planes; let k = 0;
    const set = (a, b, c, d) => { const l = Math.hypot(a, b, c) || 1; P[k++] = a / l; P[k++] = b / l; P[k++] = c / l; P[k++] = d / l; };
    set(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); set(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); set(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); set(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  }
  visible(cx, cy, cz, r) { const P = this.planes; for (let i = 0; i < 24; i += 4) if (P[i] * cx + P[i + 1] * cy + P[i + 2] * cz + P[i + 3] < -r) return false; return true; }
  drawPrim(p, pr) {
    const gl = this.gl, bb = pr.bb; gl.uniform3f(p.u_pmin, bb[0], bb[1], bb[2]); gl.uniform3f(p.u_psize, bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    const u = pr.uvb, u1 = pr.uvb1 || u; gl.uniform4f(p.u_uvb0, u[0], u[1], u[2], u[3]); gl.uniform4f(p.u_uvb1, u1[0], u1[1], u1[2], u1[3]);
    gl.bindVertexArray(pr.vao); gl.drawElements(gl.TRIANGLES, pr.ni, pr.gl, pr.i); this.stats.calls++;
  }
  // frame: {cam:{pos,right,up,fwd,fov}, car:{...} , particles, time, shadow}
  render(F) {
    const gl = this.gl, cam = F.cam, e = this.env; this.time = F.time; this.stats.calls = 0; this.stats.prims = 0;
    // F.rect {x,y,w,h} (frações, y do topo) desenha só numa região (retrovisor); F.flipX espelha; F.studio {bg} = só o carro em fundo liso
    let aspect = this.aspect, rectOn = false;
    if (F.rect) { const CW = this.canvas.width, CH = this.canvas.height, rw = Math.max(2, Math.round(F.rect.w * CW)), rh = Math.max(2, Math.round(F.rect.h * CH)), rx = Math.round(F.rect.x * CW), ry = Math.round(CH - F.rect.y * CH - rh); gl.enable(gl.SCISSOR_TEST); gl.viewport(rx, ry, rw, rh); gl.scissor(rx, ry, rw, rh); aspect = rw / rh; rectOn = true; }
    this.camPos = cam.pos; M4.persp(this.proj, cam.fov, aspect, 0.35, 3600); if (F.flipX) this.proj[0] = -this.proj[0];
    M4.look(this.view, cam.pos[0], cam.pos[1], cam.pos[2], cam.fwd[0], cam.fwd[1], cam.fwd[2], cam.right[0], cam.right[1], cam.right[2], cam.up[0], cam.up[1], cam.up[2]);
    M4.mul(this.vp, this.proj, this.view); this.frustum();
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); if (F.studio) gl.clearColor(F.studio.bg, F.studio.bg, F.studio.bg, 1); else gl.clearColor(0.4, 0.55, 0.75, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // céu
    let s = this.progs.sky; if (!F.studio) { gl.useProgram(s.p); this.setEnv(s); gl.uniform3fv(s.u_right, cam.right); gl.uniform3fv(s.u_up, cam.up); gl.uniform3fv(s.u_fwd, cam.fwd);
    gl.uniform1f(s.u_tanH, Math.tan(cam.fov / 2)); gl.uniform1f(s.u_asp, aspect); gl.depthMask(false); gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true); }
    // cidade
    if (this.city && !F.studio) this.drawCity(false);
    // sombra
    if (F.car && !F.studio) this.drawShadow(F.car);
    // carro opaco
    if (F.car) this.drawCar(F.car, false);
    // partículas
    if (F.particles && F.particles.n) this.drawParticles(F.particles);
    // blend
    if (this.city && !F.studio) this.drawCity(true);
    if (F.car) this.drawCar(F.car, true);
    if (rectOn) { gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  }
  // foto 2D do carro com fundo transparente: renderiza sobre fundo preto e sobre fundo branco e calcula o alfa pela diferença
  captureCar(car, o) {
    o = o || {}; const gl = this.gl, cv = this.canvas, oW = cv.width, oH = cv.height, W = 1280, H = 640, S = car.scale || 1;
    const az = o.az == null ? -0.62 : o.az, el = o.el == null ? 0.14 : o.el, dist = (o.dist || 11.5) * S, tgt = [0, 0.62 * S, 0];
    const pos = [tgt[0] + Math.sin(az) * Math.cos(el) * dist, tgt[1] + Math.sin(el) * dist, tgt[2] + Math.cos(az) * Math.cos(el) * dist];
    const f = normalize3([tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]), r = normalize3([-f[2], 0, f[0]]), up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    cv.width = W; cv.height = H; this.aspect = W / H; gl.viewport(0, 0, W, H);
    const px = [new Uint8Array(W * H * 4), new Uint8Array(W * H * 4)], fr = Object.assign({}, car, { p: [0, car.hModel, 0] });
    for (let i = 0; i < 2; i++) { this.render({ cam: { pos, right: r, up, fwd: f, fov: o.fov || 0.5 }, time: 0, car: fr, studio: { bg: i } }); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px[i]); }
    cv.width = oW; cv.height = oH; this.aspect = oW / oH; gl.viewport(0, 0, oW, oH);
    const out = new Uint8ClampedArray(W * H * 4); let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((H - 1 - y) * W + x) * 4, j = (y * W + x) * 4, B = px[0], Wt = px[1];
      let a = 1 - ((Wt[i] - B[i]) + (Wt[i + 1] - B[i + 1]) + (Wt[i + 2] - B[i + 2])) / 765; if (a < 0) a = 0; if (a > 1) a = 1;
      if (a > 0.02) { out[j] = Math.min(255, B[i] / a); out[j + 1] = Math.min(255, B[i + 1] / a); out[j + 2] = Math.min(255, B[i + 2] / a); out[j + 3] = a * 255; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const big = document.createElement('canvas'); big.width = W; big.height = H; big.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    const m = 8, sx = Math.max(0, x0 - m), sy = Math.max(0, y0 - m), sw = Math.min(W, x1 + m) - sx, sh = Math.min(H, y1 + m) - sy, ow = o.out || 560, oh = Math.round(ow * sh / sw);
    const c2 = document.createElement('canvas'); c2.width = ow; c2.height = oh; const g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(big, sx, sy, sw, sh, 0, 0, ow, oh);
    return c2.toDataURL('image/png');
  }

  drawCity(blendPass) {
    const gl = this.gl, p = this.progs.world, man = this.city, cp = this.camPos, dd = this.drawDist; gl.useProgram(p.p); this.setEnv(p);
    gl.uniformMatrix4fv(p.u_vp, false, this.vp); gl.uniformMatrix4fv(p.u_model, false, this.ident); gl.uniform1f(p.u_time, this.time); gl.uniform1f(p.u_aoStr, this.opt.ao === false ? 0 : 0.9);
    gl.uniform1i(p.u_tex, 0); gl.uniform1i(p.u_ao, 1);
    for (const mi of man.order) {
      const m = man.mats[mi]; if ((m.mode === 'blend') !== blendPass) continue;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.glTex);
      const hasAo = m.glAo && this.opt.ao !== false; gl.uniform1f(p.u_hasAo, hasAo ? 1 : 0); if (hasAo) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.glAo); }
      gl.uniform1f(p.u_alphaTest, m.mode === 'mask' ? 0.5 : 0); gl.uniform1f(p.u_water, m.name === 'sea' ? 1 : 0);
      if (m.mode === 'blend') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1); } else { gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.POLYGON_OFFSET_FILL); }
      for (const pr of man.groups[mi]) {
        const dx = pr.cx - cp[0], dy = pr.cy - cp[1], dz = pr.cz - cp[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d - pr.rad > dd) continue; if (!this.visible(pr.cx, pr.cy, pr.cz, pr.rad)) continue; this.stats.prims++;
        this.drawPrim(p, pr);
      }
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  carMats(c) { // matrizes do chassi e das rodas
    const A = this.tmpA, B = this.tmpB, Cm = this.tmpC; const chassis = M4.fromRT(new Float32Array(16), c.R, c.p);
    const body = M4.mul(new Float32Array(16), chassis, M4.trans(A, 0, -c.hModel, 0)); const wheels = []; const S = c.scale || 1; for (let k = 0; k < 12; k++) body[k] *= S;
    const names = ['FL', 'FR', 'RL', 'RR'];
    for (let i = 0; i < 4; i++) {
      const w = c.wheels[i], pv = this.car.wheels[names[i]].pivot;
      M4.mul(A, chassis, M4.trans(B, pv[0] * S, c.anchorY - w.d, pv[2] * S)); M4.mul(B, A, M4.rotY(Cm, w.steer ? c.steerA : 0));
      const m = new Float32Array(16); M4.mul(m, B, M4.rotX(Cm, w.spin)); for (let k = 0; k < 12; k++) m[k] *= S; wheels.push(m);
    }
    return { body, wheels };
  }
  drawCar(c, blendPass) {
    const gl = this.gl, p = this.progs.car, man = this.car; if (!man) return; gl.useProgram(p.p); this.setEnv(p); gl.uniformMatrix4fv(p.u_vp, false, this.vp); gl.uniform1i(p.u_tex, 0);
    const mm = this.carM || (this.carM = null); const mats = this.carMats(c);
    const drawGroup = (prims, model) => {
      gl.uniformMatrix4fv(p.u_model, false, model);
      for (const pr of prims) {
        const m = man.mats[pr.m]; if ((m.mode === 'blend') !== blendPass) continue;
        gl.uniform4f(p.u_color, m.color[0], m.color[1], m.color[2], m.color[3]); gl.uniform1f(p.u_metal, m.metal); gl.uniform1f(p.u_rough, m.rough); gl.uniform1f(p.u_coat, m.coat ? 1 : 0);
        const emis = (m.brake || m.name.indexOf('detailglassred') >= 0) ? (c.brake > 0.1 ? 0.55 : 0.08) : 0; gl.uniform1f(p.u_emis, emis);
        if (m.glTex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.glTex); gl.uniform1f(p.u_hasTex, 1); } else gl.uniform1f(p.u_hasTex, 0);
        this.drawPrim(p, pr);
      }
    };
    if (blendPass) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); }
    if (!c.hideBody) drawGroup(man.body, mats.body);
    const names = ['FL', 'FR', 'RL', 'RR']; if (!c.hideBody) for (let i = 0; i < 4; i++) drawGroup(man.wheels[names[i]].prims, mats.wheels[i]);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  drawShadow(c) {
    if (!c.shadow) return; const gl = this.gl, p = this.progs.quad, s = c.shadow; gl.useProgram(p.p); gl.uniformMatrix4fv(p.u_vp, false, this.vp);
    gl.uniform3f(p.u_c, s.c[0] + s.n[0] * 0.05, s.c[1] + s.n[1] * 0.05, s.c[2] + s.n[2] * 0.05); gl.uniform3fv(p.u_r, s.r); gl.uniform3fv(p.u_f, s.f); gl.uniform2f(p.u_s, 1.35 * (c.scale || 1), 2.7 * (c.scale || 1)); gl.uniform1f(p.u_a, s.a);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  drawParticles(P) {
    const gl = this.gl, p = this.progs.part; gl.useProgram(p.p); gl.uniformMatrix4fv(p.u_vp, false, this.vp); gl.uniform1f(p.u_px, this.canvas.height * 0.5 / Math.tan(0.5 * (P.fov || 1))); gl.uniform3f(p.u_col, 0.78, 0.78, 0.8);
    gl.bindVertexArray(this.partVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.partB1); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P.data, 0, P.n * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partB2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P.alpha, 0, P.n);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.POINTS, 0, P.n); gl.disable(gl.BLEND); gl.depthMask(true);
  }
}
function normalize3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
