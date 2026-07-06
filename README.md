# Neon Run

![Screenshot from Neon Run.](https://hosting.photobucket.com/bbcfb0d4-be20-44a0-94dc-65bff8947cf2/48cf1e6b-c45c-41db-84dd-ea2ed63a3454.png)

Neon Run is a browser-based synthwave endless runner built entirely on raw WebGL2 and TypeScript with zero asset files.

## Application Overview

A synthwave endless runner which lives entirely in the browser. Built on WebGL2 with no game engine, no libraries and zero asset files. It's all TypeScript served by Vite, with a DOM/CSS neon HUD and the whole game compiles down to a few kilobytes of JavaScript.

The player is a glowing cyan cube racing across a neon ground line toward an ever-rising speed cap, jumping and double-jumping over spikes and blocks, diving under floating bars, clearing pits and moving past drones. Scoring rewards aggression; golden orbs chain a combo multiplier, shaving close to hazards pays bonuses, green orbs forgive mistakes and distance milestones, sector transitions and personal bests are celebrated. The controls carry a modern platformer feel and the run ends on a single hit, with your best score persisted in `localStorage`.

Everything on screen and in your ears is computed at runtime. The backdrop is a single procedural fragment shader; all gameplay objects are colored triangles rendered into one dynamic vertex buffer. Every 300 meters the entire palette rotates to a new sector. The soundtrack is a synthwave loop synthesized live by a `WebAudio` sequencer whose clock feeds back into the game to time the lasers and pulse the grid on the beat.
