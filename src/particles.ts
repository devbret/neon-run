import type { Color, ShapeBatch } from "./batch";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  grav: number;
  drag: number;
  rot: number;
}

const MAX_PARTICLES = 4000;

export class Particles {
  private pool: Particle[] = [];

  add(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    grav = 0,
    drag = 1,
    rot = 0,
  ): void {
    if (this.pool.length >= MAX_PARTICLES) return;
    this.pool.push({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      w,
      h,
      r,
      g,
      b,
      grav,
      drag,
      rot,
    });
  }

  clear(): void {
    this.pool.length = 0;
  }

  update(dt: number): void {
    const pool = this.pool;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool[i] = pool[pool.length - 1];
        pool.pop();
        continue;
      }
      if (p.drag !== 1) {
        const k = p.drag ** dt;
        p.vx *= k;
        p.vy *= k;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(batch: ShapeBatch): void {
    for (const p of this.pool) {
      const t = p.life / p.maxLife;
      const s = 0.4 + 0.6 * t;
      const c: Color = [p.r, p.g, p.b, t * 0.9];
      if (p.rot !== 0) {
        batch.rquad(p.x, p.y, p.w * s, p.h * s, p.rot, c);
      } else {
        batch.quad(
          p.x - (p.w * s) / 2,
          p.y - (p.h * s) / 2,
          p.w * s,
          p.h * s,
          c,
        );
      }
    }
  }
}
