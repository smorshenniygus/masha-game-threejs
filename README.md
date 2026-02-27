# Masha Game (Three.js PS1-style demo)

Small browser game with two states:

- `STATE_A` - World: move kitty, approach NPC, start dialogue.
- `STATE_B` - Club: dance floor, spotlights, music, friends.

After dialogue ends in World, game runs `fade -> transition -> fade` into Club.

## Stack

- Three.js (ESM)
- Vite
- TypeScript

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Controls

- `WASD` / `Arrows` - movement (World)
- `E` - talk to NPC (when in range)
- `Space` / `Enter` / `Click` - next dialogue line

## Assets

Put assets in:

```text
public/assets/models/
  kitty.glb
  world_landscape.glb
  house_a.glb
  house_b.glb
  npc_girl.glb
  club_room.glb
  dj_booth.glb
  friend_girl_1.glb
  friend_girl_2.glb
  friend_boy_1.glb
  friend_boy_2.glb

public/assets/audio/
  club_track.mp3
```

If files are missing, game still works:

- model slots fallback to primitives
- missing audio logs warning and continues silently

## Replace models/music

1. Add `.glb` files to `public/assets/models/` with exact names above.
2. Add music track to `public/assets/audio/club_track.mp3`.
3. Restart `npm run dev` if needed.

## Architecture

- `src/main.ts` - app entry
- `src/core/Game.ts` - orchestration, main loop, transitions
- `src/core/Assets.ts` - GLTF/audio loading, cache, fallback behavior
- `src/core/Input.ts` - keyboard/pointer input
- `src/core/StateMachine.ts` - state registration/switching
- `src/scenes/WorldScene.ts` - first scene gameplay + dialogue
- `src/scenes/ClubScene.ts` - second scene gameplay + lights/music/dance
- `src/ui/UI.ts` - HTML overlay (hint/dialog/fade)
- `src/render/PS1Renderer.ts` - low-res render + quantization + dither + UV wobble

## PS1 style knobs

PS1-like options are configured in `src/core/Game.ts` when creating `PS1Renderer`:

- `pixelScale`
- `enableDither`
- `enableUvWobble`
- `colorLevels`

## Notes

- No PBR pipeline (`MeshStandardMaterial`, reflections, HDRI) is used.
- Imported model materials are sanitized to flat-shaded Lambert.
- Audio starts only after user gesture in dialogue flow (`E` / next line input).
