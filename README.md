# Neon Run

![Screenshot from Neon Run.](https://hosting.photobucket.com/bbcfb0d4-be20-44a0-94dc-65bff8947cf2/1c35a395-e850-407f-82d2-b08f5fdb49a9.png)

A browser-based game built in TypeScript on `WebGL2` with no game engine, libraries or asset files.

## Application Overview

A synthwave endless runner which lives entirely in the browser. Built on `WebGL2` with no game engine, no libraries and zero asset files. It's all TypeScript served by Vite, with a DOM/CSS neon HUD and the whole game compiles down to a 12 kilobytes of JavaScript.

The player is a glowing cyan cube racing across a neon ground line toward an ever-rising speed cap, jumping and double-jumping over spikes and blocks, diving under floating bars, clearing pits and moving past drones. Scoring rewards aggression; golden orbs chain a combo multiplier, shaving close to hazards pays bonuses, green orbs forgive mistakes and distance milestones, sector transitions and personal bests are celebrated. The controls carry a modern platformer feel and the run ends on a single hit, with your best score persisted in `localStorage`.

Everything on screen and in your ears is computed at runtime. The backdrop is a single procedural fragment shader; all gameplay objects are colored triangles rendered into one dynamic vertex buffer. Every 300 meters the entire palette rotates to a new sector. The soundtrack is a synthwave loop synthesized live by a `WebAudio` sequencer whose clock feeds back into the game to time the lasers and pulse the grid on the beat.

## Basic Setup Instructions

Below are the required software programs and instructions for installing and using this application on a Linux machine.

### Programs Needed

- [Git](https://git-scm.com/downloads)

- [Node.js](https://nodejs.org/en)

### Steps

1. Install the above programs

2. Open a terminal

3. Clone this repository: `git clone git@github.com:devbret/neon-run.git`

4. Navigate to the repo's directory: `cd neon-run`

5. Install the frontend: `npm install`

6. Launch the frontend: `npm run dev`

7. Stop the development server: `CTRL + c`

## Other Considerations

This project repo is intended to demonstrate an ability to do the following:

- Deliver a complete browser-based game out of roughly 12 KB of JavaScript, with zero asset files

- Generate all pixels at runtime with raw `WebGL2` shaders and no game engine or libraries

- Compose a soundtrack which is synthesized live by a WebAudio sequencer and whose beat feeds back into gameplay

If you have any questions or would like to collaborate, please reach out either on GitHub or via [my website](https://bretbernhoft.com/).
