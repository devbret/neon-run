export type GameState = "menu" | "run" | "dead";
export type GameEvent =
  | "start"
  | "jump"
  | "jump2"
  | "land"
  | "dive"
  | "death"
  | "fall"
  | "orb"
  | "shield"
  | "shieldbreak"
  | "nearmiss"
  | "milestone"
  | "biome"
  | "newbest";

export type ObstacleKind = "spike" | "block" | "bar" | "drone" | "laser";
export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  baseY?: number;
  phase?: number;
  amp?: number;
  passed?: boolean;
  minClear?: number;
}
export interface Pit {
  x: number;
  w: number;
}
export interface Orb {
  x: number;
  y: number;
  kind: "score" | "shield";
  phase: number;
}

interface Player {
  y: number;
  vy: number;
  grounded: boolean;
  jumpsLeft: number;
  angle: number;
  squash: number;
}

export const PLAYER_X = 4;
export const PLAYER_W = 0.6;
export const PLAYER_H = 0.7;
export const LASER_H = 3.4;
export const HUES = [0, 1.15, 2.3, 3.5, 4.6];

const GRAVITY = 42;
const JUMP_V = 13.5;
const JUMP_V2 = 12;
const JUMP_CUT = 5;
const DIVE_V = -20;
const BASE_SPEED = 7;
const MAX_SPEED = 17;
const SPEED_RAMP = 0.14;
const RESTART_LOCKOUT = 0.5;
const COYOTE_TIME = 0.09;
const JUMP_BUFFER = 0.11;
const COMBO_WINDOW = 3.5;
const COMBO_MAX = 8;
const NEAR_MISS_MARGIN = 0.45;
const BIOME_LEN = 300;
const BEST_KEY = "neon-run.best";

export class Game {
  state: GameState = "menu";
  time = 0;
  speed = BASE_SPEED;
  dist = 0;
  bonus = 0;
  scroll = 0;
  best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  combo = 1;
  shield = false;
  invuln = 0;
  hue = 0;
  biome = 0;
  beat = 0;
  paused = false;
  player: Player = {
    y: 0,
    vy: 0,
    grounded: true,
    jumpsLeft: 1,
    angle: 0,
    squash: 0,
  };
  obstacles: Obstacle[] = [];
  pits: Pit[] = [];
  orbs: Orb[] = [];
  spawnX = 22;
  shake = 0;
  flash = 0;
  readonly events: GameEvent[] = [];

  private nextGap = 14;
  private diedAt = -1;
  private coyote = 0;
  private jumpBuf = 0;
  private comboT = 0;
  private nextShieldAt = 400;
  private milestone = 500;
  private announcedBest = false;

  get score(): number {
    return Math.floor(this.dist + this.bonus);
  }

  reset(): void {
    this.state = "run";
    this.speed = BASE_SPEED;
    this.dist = 0;
    this.bonus = 0;
    this.combo = 1;
    this.comboT = 0;
    this.shield = false;
    this.invuln = 0;
    this.biome = 0;
    this.obstacles.length = 0;
    this.pits.length = 0;
    this.orbs.length = 0;
    this.nextGap = 14;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.nextShieldAt = 400 + Math.random() * 200;
    this.milestone = 500;
    this.announcedBest = false;
    this.player = {
      y: 0,
      vy: 0,
      grounded: true,
      jumpsLeft: 1,
      angle: 0,
      squash: 0,
    };
    this.events.push("start");
  }

  jumpPress(): void {
    if (this.state === "menu") {
      this.reset();
      return;
    }
    if (this.state === "dead") {
      if (this.time - this.diedAt > RESTART_LOCKOUT) this.reset();
      return;
    }
    const p = this.player;
    if (p.grounded || this.coyote > 0) {
      this.doJump();
    } else if (p.jumpsLeft > 0) {
      p.vy = JUMP_V2;
      p.jumpsLeft--;
      this.events.push("jump2");
    } else {
      this.jumpBuf = JUMP_BUFFER;
    }
  }

  jumpRelease(): void {
    if (this.state === "run" && this.player.vy > JUMP_CUT)
      this.player.vy = JUMP_CUT;
  }

  dive(): void {
    if (this.state === "run" && !this.player.grounded) {
      this.player.vy = Math.min(this.player.vy, DIVE_V);
      this.events.push("dive");
    }
  }

  beamOn(o: Obstacle): boolean {
    const b = (this.beat + (o.phase ?? 0)) / 2;
    return b - Math.floor(b) < 0.5;
  }

  beamWarming(o: Obstacle): boolean {
    const b = (this.beat + (o.phase ?? 0)) / 2;
    return b - Math.floor(b) > 0.82;
  }

  private doJump(): void {
    const p = this.player;
    p.vy = JUMP_V;
    p.grounded = false;
    p.jumpsLeft = 1;
    this.coyote = 0;
    this.events.push("jump");
  }

  private isOverPit(): boolean {
    return this.pits.some((g) => PLAYER_X > g.x && PLAYER_X < g.x + g.w);
  }

  update(dt: number): void {
    this.time += dt;
    this.shake *= Math.exp(-7 * dt);
    this.flash *= Math.exp(-4 * dt);
    this.invuln = Math.max(0, this.invuln - dt);

    const targetHue = HUES[this.biome % HUES.length];
    let dh = targetHue - this.hue;
    dh =
      ((((dh + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;
    this.hue += dh * Math.min(1, dt * 1.5);

    if (this.state !== "run") {
      if (this.state === "menu") this.scroll += dt * 1.6;
      return;
    }

    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt);
    const dx = this.speed * dt;
    this.dist += dx;
    this.scroll += dx;

    if (this.combo > 1) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 1;
    }

    const b = Math.floor(this.dist / BIOME_LEN);
    if (b !== this.biome) {
      this.biome = b;
      this.events.push("biome");
    }

    const p = this.player;
    const overPit = this.isOverPit();
    if (p.grounded && overPit) {
      p.grounded = false;
      p.vy = 0;
      this.coyote = COYOTE_TIME;
    }
    if (!p.grounded) {
      this.coyote = Math.max(0, this.coyote - dt);
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      p.angle -= 5.5 * dt;
      if (p.vy <= 0 && p.y <= 0 && !overPit) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
        p.jumpsLeft = 1;
        p.angle = 0;
        p.squash = 0.4;
        this.events.push("land");
        if (this.jumpBuf > 0) {
          this.jumpBuf = 0;
          this.doJump();
        }
      }
      if (p.y < -1.4) {
        this.die("fall");
        return;
      }
    }
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    p.squash *= Math.exp(-9 * dt);

    for (const o of this.obstacles) {
      o.x -= dx;
      if (o.kind === "drone") {
        o.y =
          (o.baseY ?? 1.3) +
          Math.sin(this.time * 3 + (o.phase ?? 0)) * (o.amp ?? 0.55);
      }
    }
    for (const g of this.pits) g.x -= dx;
    for (const o of this.orbs) o.x -= dx;
    while (
      this.obstacles.length > 0 &&
      this.obstacles[0].x + this.obstacles[0].w < -2
    )
      this.obstacles.shift();
    while (this.pits.length > 0 && this.pits[0].x + this.pits[0].w < -2)
      this.pits.shift();
    while (this.orbs.length > 0 && this.orbs[0].x < -2) this.orbs.shift();

    this.nextGap -= dx;
    if (this.nextGap <= 0) this.spawnPattern();

    if (this.dist > this.nextShieldAt) {
      this.orbs.push({
        x: this.spawnX,
        y: 1.7,
        kind: "shield",
        phase: Math.random() * 7,
      });
      this.nextShieldAt += 450 + Math.random() * 250;
    }

    const pcy = p.y + PLAYER_H / 2;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (Math.abs(o.x - PLAYER_X) < 0.55 && Math.abs(o.y - pcy) < 0.6) {
        if (o.kind === "shield") {
          this.shield = true;
          this.events.push("shield");
        } else {
          this.bonus += 10 * this.combo;
          this.combo = Math.min(COMBO_MAX, this.combo + 1);
          this.comboT = COMBO_WINDOW;
          this.events.push("orb");
        }
        this.orbs.splice(i, 1);
      }
    }

    const px = PLAYER_X - PLAYER_W * 0.42;
    const pw = PLAYER_W * 0.84;
    const py = p.y + 0.02;
    const ph = PLAYER_H * 0.92;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      let ox = o.x;
      let ow = o.w;
      let oy = o.y;
      let oh = o.h;
      if (o.kind === "spike") {
        ox += o.w * 0.3;
        ow = o.w * 0.4;
        oh = o.h * 0.8;
      } else if (o.kind === "drone") {
        ox += 0.07;
        ow = 0.6;
        oy = o.y - 0.3;
        oh = 0.6;
      } else if (o.kind === "laser" && !this.beamOn(o)) {
        continue;
      }

      const xOverlap = px < ox + ow && px + pw > ox;
      if (xOverlap) {
        if (py < oy + oh && py + ph > oy) {
          if (this.invuln > 0) continue;
          if (this.shield) {
            this.shield = false;
            this.invuln = 1;
            this.shake = Math.max(this.shake, 0.5);
            if (o.kind !== "laser") this.obstacles.splice(i, 1);
            this.events.push("shieldbreak");
            continue;
          }
          this.die("death");
          return;
        }
        if (o.kind !== "laser") {
          const clear = py >= oy + oh ? py - (oy + oh) : oy - (py + ph);
          o.minClear = Math.min(o.minClear ?? Infinity, clear);
        }
      } else if (!o.passed && o.x + o.w < px) {
        o.passed = true;
        if ((o.minClear ?? Infinity) < NEAR_MISS_MARGIN) {
          this.bonus += 25 * this.combo;
          this.events.push("nearmiss");
        }
      }
    }

    if (this.score >= this.milestone) {
      this.events.push("milestone");
      this.milestone += 500;
    }
    if (!this.announcedBest && this.best > 0 && this.score > this.best) {
      this.announcedBest = true;
      this.events.push("newbest");
    }
  }

  private die(kind: "death" | "fall"): void {
    this.state = "dead";
    this.shake = 1;
    this.flash = 0.9;
    this.diedAt = this.time;
    this.events.push(kind);
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
  }

  private spawnPattern(): void {
    const x = this.spawnX;
    let width = 1;
    const claim = (w: number): void => {
      width = Math.max(width, w);
    };
    const spike = (off = 0): void => {
      this.obstacles.push({
        kind: "spike",
        x: x + off,
        y: 0,
        w: 0.85,
        h: 0.95,
      });
      claim(off + 0.85);
    };
    const block = (): void => {
      this.obstacles.push({
        kind: "block",
        x,
        y: 0,
        w: 0.95,
        h: 1.3 + Math.random() * 0.4,
      });
      claim(0.95);
    };
    const bar = (off = 0): void => {
      this.obstacles.push({
        kind: "bar",
        x: x + off,
        y: 1.65,
        w: 2.4,
        h: 0.45,
      });
      claim(off + 2.4);
    };
    const pit = (w: number, off = 0): void => {
      this.pits.push({ x: x + off, w });
      claim(off + w);
    };
    const drone = (off = 0): void => {
      this.obstacles.push({
        kind: "drone",
        x: x + off,
        y: 1.3,
        w: 0.75,
        h: 0.6,
        baseY: 1.1 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        amp: 0.55,
      });
      claim(off + 0.75);
    };
    const laser = (): void => {
      this.obstacles.push({
        kind: "laser",
        x,
        y: 0,
        w: 0.16,
        h: LASER_H,
        phase: Math.random() < 0.5 ? 0 : 1,
      });
      claim(0.16);
    };

    const d = this.dist;
    const patterns: (() => void)[] = [() => spike()];
    if (d > 50) patterns.push(block);
    if (d > 110)
      patterns.push(() => {
        spike();
        spike(1.05);
      });
    if (d > 170) patterns.push(() => bar());
    if (d > 230)
      patterns.push(() =>
        pit(
          2.4 +
            Math.random() * Math.max(0, Math.min(1.8, this.speed * 0.32 - 2.4)),
        ),
      );
    if (d > 300) patterns.push(() => drone());
    if (d > 360)
      patterns.push(() => {
        spike();
        bar(3.2);
      });
    if (d > 430) patterns.push(laser);
    if (d > 500)
      patterns.push(() => {
        spike();
        spike(1.0);
        spike(2.0);
      });
    if (d > 580)
      patterns.push(() => {
        pit(2.6);
        spike(3.4);
      });
    if (d > 660)
      patterns.push(() => {
        drone();
        drone(1.9);
      });
    patterns[Math.floor(Math.random() * patterns.length)]();

    const gap = Math.max(4.5, this.speed * (0.85 + Math.random() * 0.55));
    if (Math.random() < 0.55) this.spawnOrbs(x + width + gap * 0.45);
    this.nextGap = width + gap;
  }

  private spawnOrbs(cx: number): void {
    const roll = Math.random();
    const add = (ox: number, oy: number): void => {
      this.orbs.push({ x: ox, y: oy, kind: "score", phase: Math.random() * 7 });
    };
    if (roll < 0.5) {
      const hmax = 1.4 + Math.random() * 1.2;
      const span = 3.2;
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        add(cx - span / 2 + span * t, 0.4 + hmax * 4 * t * (1 - t));
      }
    } else if (roll < 0.8) {
      for (let i = 0; i < 3; i++) add(cx + (i - 1) * 0.8, 0.55);
    } else {
      for (let i = 0; i < 4; i++) add(cx + (i - 1.5) * 0.8, 2.3);
    }
  }
}
