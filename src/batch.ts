import { createProgram } from "./gl";
import { SHAPE_FS, SHAPE_VS } from "./shaders";

export type Color = readonly [number, number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hueRotate(c: Color, a: number): Color {
  if (a === 0) return c;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const k = 0.5773503;
  const [r, g, b] = c;
  const d = k * k * (r + g + b) * (1 - cs);
  return [
    clamp01(r * cs + k * (b - g) * sn + d),
    clamp01(g * cs + k * (r - b) * sn + d),
    clamp01(b * cs + k * (g - r) * sn + d),
    c[3],
  ];
}

const FLOATS_PER_VERT = 6;

export class ShapeBatch {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uView: WebGLUniformLocation | null;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data: Float32Array;
  private count = 0;
  private readonly maxVerts: number;

  constructor(gl: WebGL2RenderingContext, maxVerts = 16384) {
    this.gl = gl;
    this.maxVerts = maxVerts;
    this.data = new Float32Array(maxVerts * FLOATS_PER_VERT);
    this.prog = createProgram(gl, SHAPE_VS, SHAPE_FS);
    this.uView = gl.getUniformLocation(this.prog, "u_view");

    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FLOATS_PER_VERT * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS_PER_VERT * 4, 8);
    gl.bindVertexArray(null);
  }

  vert(x: number, y: number, c: Color): void {
    if (this.count >= this.maxVerts) return;
    const i = this.count * FLOATS_PER_VERT;
    const d = this.data;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = c[0];
    d[i + 3] = c[1];
    d[i + 4] = c[2];
    d[i + 5] = c[3];
    this.count++;
  }

  tri(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    c: Color,
  ): void {
    this.vert(x1, y1, c);
    this.vert(x2, y2, c);
    this.vert(x3, y3, c);
  }

  quad(x: number, y: number, w: number, h: number, c: Color): void {
    this.vert(x, y, c);
    this.vert(x + w, y, c);
    this.vert(x + w, y + h, c);
    this.vert(x, y, c);
    this.vert(x + w, y + h, c);
    this.vert(x, y + h, c);
  }

  rquad(
    cx: number,
    cy: number,
    w: number,
    h: number,
    angle: number,
    c: Color,
  ): void {
    const hw = w / 2;
    const hh = h / 2;
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const x1 = cx - hw * cs + hh * sn,
      y1 = cy - hw * sn - hh * cs;
    const x2 = cx + hw * cs + hh * sn,
      y2 = cy + hw * sn - hh * cs;
    const x3 = cx + hw * cs - hh * sn,
      y3 = cy + hw * sn + hh * cs;
    const x4 = cx - hw * cs - hh * sn,
      y4 = cy - hw * sn + hh * cs;
    this.tri(x1, y1, x2, y2, x3, y3, c);
    this.tri(x1, y1, x3, y3, x4, y4, c);
  }

  flush(view: readonly [number, number, number, number]): void {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform4f(this.uView, view[0], view[1], view[2], view[3]);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.data.subarray(0, this.count * FLOATS_PER_VERT),
    );
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
    this.count = 0;
  }
}
