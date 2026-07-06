import { describe, expect, it } from "vitest";
import { Game, PLAYER_X } from "./game";

const STEP = 1 / 120;

function makeGame(): Game {
  const g = new Game();
  g.reset();
  g.events.length = 0;
  return g;
}

function clearWorld(g: Game): void {
  g.obstacles.length = 0;
  g.pits.length = 0;
  g.orbs.length = 0;
}

function sim(g: Game, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) g.update(STEP);
}

describe("run lifecycle", () => {
  it("starts a run from the menu on jump press", () => {
    const g = new Game();
    expect(g.state).toBe("menu");
    g.jumpPress();
    expect(g.state).toBe("run");
    expect(g.events).toContain("start");
  });

  it("ignores restart presses during the lockout, then restarts", () => {
    const g = makeGame();
    clearWorld(g);
    g.pits.push({ x: PLAYER_X - 0.5, w: 6 });
    sim(g, 0.6);
    expect(g.state).toBe("dead");
    expect(g.events).toContain("fall");
    g.jumpPress();
    expect(g.state).toBe("dead");
    sim(g, 0.6);
    g.jumpPress();
    expect(g.state).toBe("run");
  });

  it("caps speed at its maximum", () => {
    const g = makeGame();
    g.speed = 17;
    g.update(STEP);
    expect(g.speed).toBeLessThanOrEqual(17);
  });

  it("fires a biome event when crossing a sector boundary", () => {
    const g = makeGame();
    clearWorld(g);
    g.dist = 299.99;
    g.update(STEP);
    expect(g.biome).toBe(1);
    expect(g.events).toContain("biome");
  });
});

describe("jumping", () => {
  it("jumps and lands", () => {
    const g = makeGame();
    g.jumpPress();
    expect(g.player.grounded).toBe(false);
    expect(g.events).toContain("jump");
    sim(g, 1);
    expect(g.player.grounded).toBe(true);
    expect(g.events).toContain("land");
  });

  it("cuts the jump short on release", () => {
    const g = makeGame();
    g.jumpPress();
    g.update(STEP);
    g.jumpRelease();
    expect(g.player.vy).toBeLessThanOrEqual(5);
  });

  it("allows one double jump", () => {
    const g = makeGame();
    g.jumpPress();
    sim(g, 0.2);
    g.jumpPress();
    expect(g.events).toContain("jump2");
    expect(g.player.jumpsLeft).toBe(0);
  });

  it("buffers a jump pressed just before landing", () => {
    const g = makeGame();
    g.jumpPress();
    g.update(STEP);
    g.jumpPress();
    let guard = 0;
    while (!(g.player.vy < 0 && g.player.y < 0.3) && guard++ < 2000)
      g.update(STEP);
    expect(guard).toBeLessThan(2000);
    g.events.length = 0;
    g.jumpPress();
    expect(g.events).not.toContain("jump");
    sim(g, 0.2);
    expect(g.events).toContain("land");
    expect(g.events).toContain("jump");
    expect(g.player.grounded).toBe(false);
  });

  it("dive clears a buffered jump", () => {
    const g = makeGame();
    g.jumpPress();
    g.update(STEP);
    g.jumpPress();
    let guard = 0;
    while (!(g.player.vy < 0 && g.player.y < 0.3) && guard++ < 2000)
      g.update(STEP);
    g.events.length = 0;
    g.jumpPress();
    g.dive();
    expect(g.events).toContain("dive");
    sim(g, 0.3);
    expect(g.events).toContain("land");
    expect(g.events).not.toContain("jump");
    expect(g.player.grounded).toBe(true);
  });

  it("grants a coyote jump after walking off a pit edge", () => {
    const g = makeGame();
    clearWorld(g);
    g.pits.push({ x: PLAYER_X - 0.5, w: 4 });
    g.update(STEP);
    expect(g.player.grounded).toBe(false);
    g.events.length = 0;
    g.jumpPress();
    expect(g.events).toContain("jump");
    expect(g.events).not.toContain("jump2");
  });
});

describe("collisions", () => {
  it("dies on a block and records the best score", () => {
    const g = makeGame();
    clearWorld(g);
    g.obstacles.push({ kind: "block", x: PLAYER_X + 3, y: 0, w: 0.95, h: 1.4 });
    sim(g, 1);
    expect(g.state).toBe("dead");
    expect(g.events).toContain("death");
    expect(g.best).toBe(g.score);
  });

  it("a shield absorbs one hit and grants invulnerability", () => {
    const g = makeGame();
    clearWorld(g);
    g.shield = true;
    g.obstacles.push({ kind: "block", x: PLAYER_X + 3, y: 0, w: 0.95, h: 1.4 });
    sim(g, 1);
    expect(g.state).toBe("run");
    expect(g.shield).toBe(false);
    expect(g.invuln).toBeGreaterThan(0);
    expect(g.events).toContain("shieldbreak");
    expect(g.obstacles.some((o) => o.kind === "block")).toBe(false);
  });

  it("a laser kills only while the beam is on", () => {
    const on = makeGame();
    clearWorld(on);
    on.beat = 0;
    on.obstacles.push({
      kind: "laser",
      x: PLAYER_X + 2,
      y: 0,
      w: 0.16,
      h: 3.4,
      phase: 0,
    });
    sim(on, 0.6);
    expect(on.state).toBe("dead");

    const off = makeGame();
    clearWorld(off);
    off.beat = 1;
    off.obstacles.push({
      kind: "laser",
      x: PLAYER_X + 2,
      y: 0,
      w: 0.16,
      h: 3.4,
      phase: 0,
    });
    sim(off, 0.6);
    expect(off.state).toBe("run");
  });

  it("awards a near-miss bonus for a close shave", () => {
    const g = makeGame();
    clearWorld(g);
    g.obstacles.push({ kind: "bar", x: PLAYER_X + 2, y: 1.0, w: 2.4, h: 0.45 });
    sim(g, 1.4);
    expect(g.state).toBe("run");
    expect(g.events).toContain("nearmiss");
    expect(g.bonus).toBe(25);
  });

  it("dies when falling into a pit", () => {
    const g = makeGame();
    clearWorld(g);
    g.pits.push({ x: PLAYER_X - 0.5, w: 5 });
    sim(g, 0.6);
    expect(g.state).toBe("dead");
    expect(g.events).toContain("fall");
  });
});

describe("orbs", () => {
  it("chains a combo across score orbs", () => {
    const g = makeGame();
    clearWorld(g);
    g.orbs.push({ x: PLAYER_X + 1, y: 0.5, kind: "score", phase: 0 });
    g.orbs.push({ x: PLAYER_X + 2, y: 0.5, kind: "score", phase: 0 });
    sim(g, 0.6);
    expect(g.bonus).toBe(30);
    expect(g.combo).toBe(3);
    expect(g.orbs.length).toBe(0);
  });

  it("grants a shield from a shield orb", () => {
    const g = makeGame();
    clearWorld(g);
    g.orbs.push({ x: PLAYER_X + 1, y: 0.5, kind: "shield", phase: 0 });
    sim(g, 0.4);
    expect(g.shield).toBe(true);
    expect(g.events).toContain("shield");
  });
});
