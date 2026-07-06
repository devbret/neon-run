export const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const BACKGROUND_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform float u_scroll;
uniform float u_aspect;
uniform float u_horizon;
uniform float u_beat;
uniform float u_hue;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.5773503);
  float cs = cos(a);
  return c * cs + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cs);
}

void main() {
  float h = u_horizon;
  vec2 uv = v_uv;
  float pulse = exp(-3.5 * fract(u_beat));
  vec3 col;

  if (uv.y >= h) {
    float sky = (uv.y - h) / (1.0 - h);
    col = mix(vec3(0.16, 0.03, 0.28), vec3(0.01, 0.0, 0.06), sky);

    vec2 sp = uv * vec2(u_aspect, 1.0) * 70.0;
    float sr = hash(floor(sp));
    float star = smoothstep(0.986, 1.0, sr);
    star *= 0.55 + 0.45 * sin(u_time * 2.5 + sr * 90.0);
    col += vec3(star) * smoothstep(0.0, 0.35, sky);

    vec2 p = vec2(uv.x * u_aspect, uv.y);
    vec2 sc = vec2(0.62 * u_aspect, h + 0.23);
    float d = length(p - sc);
    float sun = 1.0 - smoothstep(0.145, 0.152, d);
    float fr = fract(uv.y * 34.0 - u_time * 0.4);
    float bw = clamp((sc.y + 0.03 - uv.y) * 1.4, 0.0, 0.42);
    sun *= step(bw, abs(fr - 0.5));
    vec3 suncol = mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.85, 0.35),
                      clamp((uv.y - sc.y) * 3.5 + 0.5, 0.0, 1.0));
    col = mix(col, suncol, sun);
    col += suncol * exp(-d * 7.0) * (0.35 + 0.15 * pulse);

    float m1 = h - 0.02 + 0.16 * fbm(vec2(uv.x * u_aspect * 1.6 + u_scroll * 0.012, 3.7));
    float m2 = h - 0.01 + 0.09 * fbm(vec2(uv.x * u_aspect * 2.6 + u_scroll * 0.03, 8.1));
    col = mix(col, vec3(0.07, 0.01, 0.15), step(uv.y, m1));
    col += vec3(0.65, 0.1, 0.7) * (1.0 - smoothstep(0.0, 0.006, abs(uv.y - m1))) * 0.7;
    col = mix(col, vec3(0.04, 0.0, 0.1), step(uv.y, m2));
    col += vec3(1.0, 0.2, 0.75) * (1.0 - smoothstep(0.0, 0.005, abs(uv.y - m2))) * 0.9;
  } else {
    float t = h - uv.y;
    float z = 0.1 / (t + 0.01);
    vec2 gp = vec2((uv.x - 0.5) * u_aspect * z * 6.0, z * 3.0 + u_scroll * 0.55);
    vec2 gv = fract(gp);
    vec2 dl = min(gv, 1.0 - gv);
    vec2 fw = fwidth(gp);
    vec2 ln = vec2(1.0) - smoothstep(fw, fw * 3.0 + 0.02, dl);
    float grid = max(ln.x, ln.y);
    float fade = smoothstep(0.0, 0.18, t);
    vec3 base = mix(vec3(0.10, 0.01, 0.16), vec3(0.03, 0.0, 0.07), fade);
    col = base + vec3(1.0, 0.18, 0.8) * grid * fade * (0.72 + 0.4 * pulse);
  }

  col += vec3(1.0, 0.35, 0.8) * exp(-abs(uv.y - h) * 60.0) * (0.5 + 0.2 * pulse);
  outColor = vec4(max(hueRotate(col, u_hue), 0.0), 1.0);
}
`;

export const SHAPE_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
uniform vec4 u_view;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_pos * u_view.xy + u_view.zw, 0.0, 1.0);
}
`;

export const SHAPE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = v_color; }
`;

export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform float u_threshold;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(u_threshold, u_threshold + 0.3, l);
  outColor = vec4(c * k, 1.0);
}
`;

export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec2 u_dir;
void main() {
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 c = texture(u_tex, v_uv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(u_tex, v_uv + u_dir * float(i)).rgb * w[i];
    c += texture(u_tex, v_uv - u_dir * float(i)).rgb * w[i];
  }
  outColor = vec4(c, 1.0);
}
`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec2 u_res;
uniform float u_time;
uniform float u_flash;
uniform vec4 u_ripple[3];

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  float asp = u_res.x / u_res.y;

  vec2 cuv = v_uv - 0.5;
  float r2 = dot(cuv, cuv);
  vec2 suv = 0.5 + cuv * (1.0 + 0.07 * r2) / 1.035;

  for (int i = 0; i < 3; i++) {
    vec4 rp = u_ripple[i];
    float age = u_time - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 1.1) {
      vec2 d = suv - rp.xy;
      d.x *= asp;
      float dist = length(d) + 1e-4;
      float band = exp(-pow((dist - age * 1.1) * 11.0, 2.0));
      suv -= (d / dist) * band * rp.w * (1.0 - age / 1.1) * 0.03;
    }
  }

  vec2 off = cuv * 0.004;
  vec3 col;
  col.r = texture(u_scene, suv + off).r;
  col.g = texture(u_scene, suv).g;
  col.b = texture(u_scene, suv - off).b;

  col += texture(u_bloom, suv).rgb * 1.25;

  col *= 0.93 + 0.07 * sin(suv.y * u_res.y * 3.14159);
  col *= mix(1.0, 0.55, smoothstep(0.45, 0.95, length(cuv) * 1.3));
  col += (hash(v_uv * 913.7 + fract(u_time) * 137.0) - 0.5) * 0.035;
  col = mix(col, vec3(1.0, 0.45, 0.65), u_flash);

  outColor = vec4(col, 1.0);
}
`;
