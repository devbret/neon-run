import { type Color, hueRotate, ShapeBatch } from "./batch";
import {
  type Game,
  LASER_H,
  type Obstacle,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
} from "./game";
import {
  createProgram,
  createTarget,
  deleteTarget,
  type RenderTarget,
} from "./gl";
import type { Particles } from "./particles";
import {
  BACKGROUND_FS,
  BLUR_FS,
  BRIGHT_FS,
  COMPOSITE_FS,
  FULLSCREEN_VS,
} from "./shaders";

const VIEW_H = 10;
const VIEW_Y0 = -3.5;
const BLOOM_THRESHOLD = 0.4;

const CYAN: Color = [0.25, 0.95, 1, 1];
const WHITE: Color = [1, 1, 1, 1];
const PINK: Color = [1, 0.3, 0.75, 1];
const GOLD: Color = [1, 0.85, 0.3, 1];
const GREEN: Color = [0.35, 1, 0.6, 1];
const RED: Color = [1, 0.2, 0.35, 1];
const DARK: Color = [0.05, 0.01, 0.1, 1];
const VOID: Color = [0.01, 0, 0.03, 0.92];

interface Pass {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface Ghost {
  y: number;
  angle: number;
  w: number;
  h: number;
  scroll: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private batch: ShapeBatch;
  private bg: Pass;
  private bright: Pass;
  private blur: Pass;
  private comp: Pass;
  private scene!: RenderTarget;
  private pingA!: RenderTarget;
  private pingB!: RenderTarget;
  private w = 0;
  private h = 0;
  private ghosts: Ghost[] = [];
  private ripples = new Float32Array(12);
  private rippleSlot = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.batch = new ShapeBatch(gl);
    this.bg = this.pass(BACKGROUND_FS, [
      "u_time",
      "u_scroll",
      "u_aspect",
      "u_horizon",
      "u_beat",
      "u_hue",
    ]);
    this.bright = this.pass(BRIGHT_FS, ["u_tex", "u_threshold"]);
    this.blur = this.pass(BLUR_FS, ["u_tex", "u_dir"]);
    this.comp = this.pass(COMPOSITE_FS, [
      "u_scene",
      "u_bloom",
      "u_res",
      "u_time",
      "u_flash",
      "u_ripple[0]",
    ]);

    gl.useProgram(this.bright.prog);
    gl.uniform1i(this.bright.u.u_tex, 0);
    gl.useProgram(this.blur.prog);
    gl.uniform1i(this.blur.u.u_tex, 0);
    gl.useProgram(this.comp.prog);
    gl.uniform1i(this.comp.u.u_scene, 0);
    gl.uniform1i(this.comp.u.u_bloom, 1);
  }

  get viewW(): number {
    return this.h > 0 ? VIEW_H * (this.w / this.h) : 16;
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    if (this.w > 0) {
      deleteTarget(gl, this.scene);
      deleteTarget(gl, this.pingA);
      deleteTarget(gl, this.pingB);
    }
    this.w = w;
    this.h = h;
    this.scene = createTarget(gl, w, h);
    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    this.pingA = createTarget(gl, hw, hh);
    this.pingB = createTarget(gl, hw, hh);
  }

  addRipple(wx: number, wy: number, strength: number, time: number): void {
    const i = this.rippleSlot * 4;
    this.ripples[i] = wx / this.viewW;
    this.ripples[i + 1] = (wy - VIEW_Y0) / VIEW_H;
    this.ripples[i + 2] = time;
    this.ripples[i + 3] = strength;
    this.rippleSlot = (this.rippleSlot + 1) % 3;
  }

  clearGhosts(): void {
    this.ghosts.length = 0;
  }

  render(game: Game, particles: Particles, time: number, lookAhead = 0): void {
    if (this.w === 0) return;
    const gl = this.gl;
    const b = this.batch;

    const run = game.state === "run";
    const ext = run ? lookAhead : 0;
    const scrollNow =
      game.scroll +
      (run ? game.speed : game.state === "menu" ? 1.6 : 0) * lookAhead;

    const pink = hueRotate(PINK, game.hue);
    const cyan = hueRotate(CYAN, game.hue);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);

    gl.useProgram(this.bg.prog);
    gl.uniform1f(this.bg.u.u_time, time);
    gl.uniform1f(this.bg.u.u_scroll, scrollNow);
    gl.uniform1f(this.bg.u.u_aspect, this.w / this.h);
    gl.uniform1f(this.bg.u.u_horizon, -VIEW_Y0 / VIEW_H);
    gl.uniform1f(this.bg.u.u_beat, game.beat);
    gl.uniform1f(this.bg.u.u_hue, game.hue);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const vw = this.viewW;
    const shakeX = (Math.random() - 0.5) * game.shake * 0.3;
    const shakeY = (Math.random() - 0.5) * game.shake * 0.3;
    const sx = 2 / vw;
    const sy = 2 / VIEW_H;
    const view = [
      sx,
      sy,
      -shakeX * sx - 1,
      -(VIEW_Y0 + shakeY) * sy - 1,
    ] as const;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const xoff = -game.speed * ext;
    const worldView = [sx, sy, view[2] + xoff * sx, view[3]] as const;
    this.drawGround(game, vw - xoff, pink);
    for (const o of game.obstacles) this.drawObstacle(o, game, time, pink);
    this.drawOrbs(game, time);
    b.flush(worldView);
    if (game.state !== "dead") this.drawPlayer(game, time, cyan, ext);
    b.flush(view);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.drawGhosts(game, cyan, scrollNow);
    particles.draw(b);
    b.flush(view);
    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingA.fb);
    gl.viewport(0, 0, this.pingA.w, this.pingA.h);
    gl.useProgram(this.bright.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1f(this.bright.u.u_threshold, BLOOM_THRESHOLD);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const blurPass = (
      src: RenderTarget,
      dst: RenderTarget,
      dx: number,
      dy: number,
    ): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.useProgram(this.blur.prog);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(this.blur.u.u_dir, dx / src.w, dy / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    blurPass(this.pingA, this.pingB, 1.2, 0);
    blurPass(this.pingB, this.pingA, 0, 1.2);
    blurPass(this.pingA, this.pingB, 2.4, 0);
    blurPass(this.pingB, this.pingA, 0, 2.4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.comp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pingA.tex);
    gl.uniform2f(this.comp.u.u_res, this.w, this.h);
    gl.uniform1f(this.comp.u.u_time, time);
    gl.uniform1f(this.comp.u.u_flash, Math.min(1, game.flash));
    gl.uniform4fv(this.comp.u["u_ripple[0]"], this.ripples);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  private drawGround(game: Game, vw: number, pink: Color): void {
    const b = this.batch;
    for (const g of game.pits) {
      b.quad(g.x, VIEW_Y0, g.w, -VIEW_Y0 + 0.02, VOID);
    }
    let xs = 0;
    for (const g of game.pits) {
      const gx = Math.max(0, g.x);
      const ge = Math.min(vw, g.x + g.w);
      if (ge <= 0 || gx >= vw) continue;
      if (gx > xs) {
        b.quad(xs, -0.07, gx - xs, 0.12, pink);
        b.quad(xs, -0.025, gx - xs, 0.05, WHITE);
      }
      xs = Math.max(xs, ge);
    }
    if (xs < vw) {
      b.quad(xs, -0.07, vw - xs, 0.12, pink);
      b.quad(xs, -0.025, vw - xs, 0.05, WHITE);
    }
    for (const g of game.pits) {
      b.quad(g.x - 0.06, -0.6, 0.08, 0.66, pink);
      b.quad(g.x + g.w - 0.02, -0.6, 0.08, 0.66, pink);
    }
  }

  private drawObstacle(
    o: Obstacle,
    game: Game,
    time: number,
    pink: Color,
  ): void {
    const b = this.batch;
    if (o.kind === "spike") {
      b.tri(o.x, 0, o.x + o.w, 0, o.x + o.w / 2, o.h, pink);
      b.tri(
        o.x + 0.16,
        0,
        o.x + o.w - 0.16,
        0,
        o.x + o.w / 2,
        o.h - 0.24,
        DARK,
      );
    } else if (o.kind === "drone") {
      const cx = o.x + o.w / 2;
      b.rquad(cx, o.y, 0.8, 0.8, Math.PI / 4, pink);
      b.rquad(cx, o.y, 0.62, 0.62, Math.PI / 4, DARK);
      const blink = game.beat - Math.floor(game.beat) < 0.5;
      b.rquad(cx, o.y, 0.2, 0.2, Math.PI / 4 + time * 2, blink ? WHITE : pink);
    } else if (o.kind === "laser") {
      const cx = o.x + o.w / 2;
      const red = hueRotate(RED, game.hue);
      b.rquad(cx, 0.16, 0.34, 0.34, Math.PI / 4, pink);
      b.rquad(cx, 0.16, 0.2, 0.2, Math.PI / 4, DARK);
      b.rquad(cx, LASER_H, 0.34, 0.34, Math.PI / 4, pink);
      b.rquad(cx, LASER_H, 0.2, 0.2, Math.PI / 4, DARK);
      if (game.beamOn(o)) {
        b.quad(cx - 0.14, 0, 0.28, LASER_H, [red[0], red[1], red[2], 0.85]);
        b.quad(cx - 0.05, 0, 0.1, LASER_H, WHITE);
      } else if (game.beamWarming(o)) {
        const flick = 0.25 + 0.3 * (game.beat * 4 - Math.floor(game.beat * 4));
        b.quad(cx - 0.03, 0, 0.06, LASER_H, [red[0], red[1], red[2], flick]);
      }
    } else {
      b.quad(o.x, o.y, o.w, o.h, pink);
      b.quad(o.x + 0.08, o.y + 0.08, o.w - 0.16, o.h - 0.16, DARK);
    }
  }

  private drawOrbs(game: Game, time: number): void {
    const b = this.batch;
    for (const o of game.orbs) {
      const spin = time * 3 + o.phase;
      if (o.kind === "shield") {
        const oy = o.y + Math.sin(time * 2 + o.phase) * 0.15;
        b.rquad(o.x, oy, 0.5, 0.5, spin * 0.7, GREEN);
        b.rquad(o.x, oy, 0.36, 0.36, spin * 0.7, DARK);
        b.rquad(o.x, oy, 0.16, 0.16, -spin, [0.7, 1, 0.8, 1]);
      } else {
        b.rquad(o.x, o.y, 0.3, 0.3, spin, GOLD);
        b.rquad(o.x, o.y, 0.15, 0.15, spin, WHITE);
      }
    }
  }

  private drawPlayer(game: Game, time: number, cyan: Color, ext: number): void {
    const p = game.player;
    let py = p.y;
    let angle = p.angle;
    if (!p.grounded) {
      py += p.vy * ext;
      angle -= 5.5 * ext;
      if (p.y >= 0 && py < 0) py = 0;
    }
    let scaleX = 1 + p.squash * 0.9;
    let scaleY = 1 - p.squash;
    if (!p.grounded) {
      const stretch = Math.min(0.35, Math.abs(p.vy) * 0.018);
      scaleY = 1 + stretch;
      scaleX = 1 - stretch * 0.5;
    }
    const w = PLAYER_W * scaleX;
    const h = PLAYER_H * scaleY;
    const cy = py + h / 2;

    if (game.state === "run") {
      this.ghosts.push({
        y: py,
        angle,
        w,
        h,
        scroll: game.scroll + game.speed * ext,
      });
      if (this.ghosts.length > 40) this.ghosts.shift();
    }

    if (game.invuln > 0 && Math.floor(time * 18) % 2 === 0) return;

    this.batch.rquad(PLAYER_X, cy, w, h, angle, cyan);
    this.batch.rquad(PLAYER_X, cy, w * 0.55, h * 0.55, angle, WHITE);

    if (game.shield) {
      const ringA = time * 1.8;
      const side = 1.25;
      for (let i = 0; i < 4; i++) {
        const a = ringA + (i * Math.PI) / 2;
        this.batch.rquad(
          PLAYER_X + (Math.cos(a) * side) / 2,
          cy + (Math.sin(a) * side) / 2,
          0.05,
          side,
          a,
          [0.35, 1, 0.6, 0.85],
        );
      }
    }
  }

  private drawGhosts(game: Game, cyan: Color, scrollNow: number): void {
    if (game.state !== "run") return;
    const n = this.ghosts.length;
    for (let k = 1; k <= 5; k++) {
      const idx = n - 1 - k * 3;
      if (idx < 0) break;
      const g = this.ghosts[idx];
      const gx = PLAYER_X - (scrollNow - g.scroll);
      const alpha = 0.14 * (1 - k / 6);
      this.batch.rquad(gx, g.y + g.h / 2, g.w, g.h, g.angle, [
        cyan[0],
        cyan[1],
        cyan[2],
        alpha,
      ]);
    }
  }

  private pass(fs: string, uniforms: string[]): Pass {
    const prog = createProgram(this.gl, FULLSCREEN_VS, fs);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniforms)
      u[name] = this.gl.getUniformLocation(prog, name);
    return { prog, u };
  }
}
