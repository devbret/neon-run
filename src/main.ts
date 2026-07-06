import { AudioEngine } from "./audio";
import { hueRotate } from "./batch";
import { Game, PLAYER_H, PLAYER_W, PLAYER_X } from "./game";
import { Particles } from "./particles";
import { Renderer } from "./renderer";

const canvas = document.getElementById("glcanvas") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
if (!gl) throw new Error("WebGL2 is not supported by this browser");

const game = new Game();
let renderer = new Renderer(gl);
const particles = new Particles();
const audio = new AudioEngine();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game = game;
}

const scoreEl = document.getElementById("score")!;
const bestEl = document.getElementById("best")!;
const comboEl = document.getElementById("combo")!;
const shieldEl = document.getElementById("shield-ind")!;
const menuEl = document.getElementById("menu")!;
const deadEl = document.getElementById("dead")!;
const deadTitleEl = document.getElementById("dead-title")!;
const finalEl = document.getElementById("final")!;
const pausedEl = document.getElementById("paused")!;
const toastEl = document.getElementById("toast")!;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  renderer.resize(canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
const DIVE_KEYS = new Set(["ArrowDown", "KeyS"]);

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function setPaused(paused: boolean): void {
  if (game.state !== "run" || game.paused === paused) return;
  game.paused = paused;
  pausedEl.style.display = paused ? "" : "none";
  if (paused) audio.suspend();
  else audio.resume();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    setPaused(!game.paused);
    return;
  }
  if (e.code === "KeyM") {
    toast(audio.toggleMute() ? "muted" : "sound on");
    return;
  }
  if (game.paused) return;
  if (JUMP_KEYS.has(e.code)) {
    e.preventDefault();
    if (!e.repeat) {
      audio.unlock();
      game.jumpPress();
    }
  } else if (DIVE_KEYS.has(e.code)) {
    e.preventDefault();
    if (!e.repeat) game.dive();
  }
});
window.addEventListener("keyup", (e) => {
  if (JUMP_KEYS.has(e.code)) game.jumpRelease();
});
const SWIPE_DIST = 30;
const SWIPE_TIME = 250;
let swipe: { id: number; y0: number; t0: number; dived: boolean } | null = null;

window.addEventListener("pointerdown", (e) => {
  if (game.paused) {
    setPaused(false);
    return;
  }
  audio.unlock();
  swipe = {
    id: e.pointerId,
    y0: e.clientY,
    t0: performance.now(),
    dived: false,
  };
  game.jumpPress();
});
window.addEventListener("pointermove", (e) => {
  if (!swipe || e.pointerId !== swipe.id || swipe.dived) return;
  if (performance.now() - swipe.t0 > SWIPE_TIME) return;
  if (e.clientY - swipe.y0 > SWIPE_DIST) {
    swipe.dived = true;
    game.dive();
  }
});
window.addEventListener("pointerup", (e) => {
  if (swipe && e.pointerId === swipe.id) swipe = null;
  game.jumpRelease();
});
window.addEventListener("pointercancel", () => {
  swipe = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPaused(true);
});

let glLost = false;
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  glLost = true;
  setPaused(true);
});
canvas.addEventListener("webglcontextrestored", () => {
  renderer = new Renderer(gl);
  renderer.resize(canvas.width, canvas.height);
  glLost = false;
});

let trailAcc = 0;
function emitTrail(dt: number): void {
  trailAcc += dt * 80;
  const p = game.player;
  const c = hueRotate([0.3, 0.95, 1, 1], game.hue);
  while (trailAcc >= 1) {
    trailAcc--;
    const s = 0.1 + Math.random() * 0.08;
    particles.add(
      PLAYER_X - PLAYER_W * 0.4,
      p.y + PLAYER_H * (0.2 + Math.random() * 0.6),
      -game.speed * (0.4 + Math.random() * 0.3),
      (Math.random() - 0.5) * 1.2,
      0.35 + Math.random() * 0.3,
      s,
      s,
      c[0],
      c[1],
      c[2],
    );
  }
}

function groundPuff(n: number, up: number): void {
  for (let i = 0; i < n; i++) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const s = 0.07 + Math.random() * 0.06;
    particles.add(
      PLAYER_X + dir * 0.3,
      0.05,
      dir * (1 + Math.random() * 3),
      up * (0.5 + Math.random() * 1.5),
      0.3 + Math.random() * 0.25,
      s,
      s,
      1,
      0.5,
      0.9,
      10,
      0.4,
    );
  }
}

function burst(cx: number, cy: number, n: number, cyanRatio: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 12;
    const cyan = Math.random() < cyanRatio;
    const s = 0.08 + Math.random() * 0.14;
    particles.add(
      cx,
      cy,
      Math.cos(a) * speed,
      Math.sin(a) * speed + 3,
      0.5 + Math.random() * 0.9,
      s,
      s,
      cyan ? 0.3 : 1,
      cyan ? 0.95 : 0.3,
      cyan ? 1 : 0.7,
      22,
      0.9,
    );
  }
}

function sparkle(
  cx: number,
  cy: number,
  n: number,
  r: number,
  g: number,
  b: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    const s = 0.05 + Math.random() * 0.07;
    particles.add(
      cx,
      cy,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      0.3 + Math.random() * 0.4,
      s,
      s,
      r,
      g,
      b,
      4,
      0.5,
    );
  }
}

let streakAcc = 0;
function emitStreaks(dt: number): void {
  if (game.speed < 10.5) return;
  streakAcc += (game.speed - 10) * dt * 2.2;
  while (streakAcc >= 1) {
    streakAcc--;
    particles.add(
      renderer.viewW + 1.5,
      0.2 + Math.random() * 5.8,
      -(game.speed * 2.2 + Math.random() * 6),
      0,
      0.5,
      1.6,
      0.025,
      0.8,
      0.95,
      1,
    );
  }
}

let nextShootingStar = 4;
function maybeShootingStar(dt: number): void {
  nextShootingStar -= dt;
  if (nextShootingStar > 0) return;
  nextShootingStar = 5 + Math.random() * 9;
  const vx = -7 - Math.random() * 3;
  const vy = -2.5;
  particles.add(
    renderer.viewW * (0.3 + Math.random() * 0.7),
    5 + Math.random() * 1.3,
    vx,
    vy,
    1.4,
    1.1,
    0.03,
    1,
    1,
    1,
    0,
    1,
    Math.atan2(vy, vx),
  );
}

const playerCY = (): number => game.player.y + PLAYER_H / 2;
const pad = (n: number): string => String(n).padStart(4, "0");

const SIM_STEP = 1 / 120;
const MAX_FRAME = 0.1;
let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  requestAnimationFrame(frame);
  if (game.paused || glLost) return;

  game.spawnX = renderer.viewW + 2;
  game.beat = audio.beat(game.time);
  acc += dt;
  while (acc >= SIM_STEP) {
    game.update(SIM_STEP);
    acc -= SIM_STEP;
  }

  for (const ev of game.events) {
    switch (ev) {
      case "start":
        particles.clear();
        renderer.clearGhosts();
        break;
      case "jump":
        audio.jump();
        groundPuff(6, 1);
        break;
      case "jump2":
        audio.jump2();
        sparkle(PLAYER_X, playerCY(), 10, 0.4, 0.95, 1);
        renderer.addRipple(PLAYER_X, playerCY(), 0.25, time);
        break;
      case "land":
        audio.land();
        groundPuff(10, 0.5);
        break;
      case "dive":
        audio.dive();
        break;
      case "orb":
        audio.orb(game.combo);
        sparkle(PLAYER_X, playerCY(), 8, 1, 0.85, 0.3);
        break;
      case "shield":
        audio.shieldGet();
        sparkle(PLAYER_X, playerCY(), 16, 0.35, 1, 0.6);
        break;
      case "shieldbreak":
        audio.shieldBreak();
        burst(PLAYER_X, playerCY(), 30, 0.2);
        renderer.addRipple(PLAYER_X, playerCY(), 0.6, time);
        break;
      case "nearmiss":
        audio.nearMiss();
        sparkle(PLAYER_X + 0.5, playerCY(), 6, 1, 1, 0.6);
        break;
      case "milestone":
        audio.milestone();
        toast(`${game.score - (game.score % 500)}`);
        break;
      case "biome":
        toast(`sector ${game.biome + 1}`);
        break;
      case "newbest":
        toast("new best");
        break;
      case "death":
      case "fall":
        if (ev === "fall") audio.fall();
        else audio.death();
        burst(PLAYER_X, Math.max(playerCY(), -0.5), 80, 0.6);
        renderer.addRipple(PLAYER_X, Math.max(playerCY(), 0), 0.9, time);
        deadTitleEl.textContent =
          ev === "fall" ? "lost in the void" : "wrecked";
        finalEl.textContent = `${game.score} pts · ${Math.floor(game.dist)} m`;
        break;
    }
  }
  game.events.length = 0;

  if (game.state === "run") {
    emitTrail(dt);
    emitStreaks(dt);
  }
  maybeShootingStar(dt);
  particles.update(dt);
  renderer.render(game, particles, time, acc);

  scoreEl.textContent = pad(game.score);
  bestEl.textContent = `best ${pad(game.best)}`;
  comboEl.textContent = game.combo > 1 ? `combo ×${game.combo}` : "";
  shieldEl.style.visibility = game.shield ? "visible" : "hidden";
  menuEl.style.display = game.state === "menu" ? "" : "none";
  deadEl.style.display = game.state === "dead" ? "" : "none";
}
requestAnimationFrame(frame);
