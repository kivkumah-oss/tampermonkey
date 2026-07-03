# Nova Suno Remote

**Pocket Gremlin Edition**

Lead build: **Cody / Codex**  
Product brain, testing, workflow direction: **kivkumah**  
Co-architect and earlier groundwork: **Nova**

Nova Suno Remote is a Tampermonkey userscript that turns a normal browser page into a small remote player for a personal Suno library. It started as a messy proof-of-concept and grew into a pocket gremlin app wearing a Tampermonkey trench coat.

## What It Does

- Plays saved Suno songs from any page after a safe Prime capture.
- Captures the personal Suno library through a tiny authenticated Suno popup.
- Saves library metadata locally in Tampermonkey storage.
- Survives browser and PC restarts.
- Uses a cross-tab audio lock so only one Nova player sings at a time.
- Lets the `Nova Music` icon move around and remember its position.
- Registers with `NovaCore` / `NovaWorkHub` when a Bootstrap hub is present, while still working standalone.
- Provides a draggable remote player, lyrics reader, debug panel, and RGB Lab.
- Supports audio-reactive glow, equalizer bars, palettes, intensity settings, and selectable reactive UI parts.
- Keeps lyrics readable while allowing the player UI to party.

## Safety Model

This script is designed as a read-only personal-library remote.

- It does not store Suno passwords.
- It does not store cookies.
- It does not store authorization headers.
- It does not copy browser tokens or device IDs.
- Prime capture opens Suno normally, lets Suno authenticate itself, listens for feed responses, and saves song metadata/audio URLs locally.

## Install

1. Install Tampermonkey.
2. Create a new userscript.
3. Paste `Nova_Suno_Remote_Any_Page_v0_1.user.js`.
4. Save and refresh a normal page such as Google.
5. Press `Prime Full` to capture the library.
6. Use the remote player from any page.

## Main Controls

- `Prime Quick`: Opens a small Suno popup and captures the first loaded feed.
- `Prime Full`: Opens a tiny Suno popup, auto-scrolls the library, captures all loaded pages, then closes.
- `Lyrics`: Opens a separate draggable lyrics reader.
- `RGB`: Opens Nova RGB Lab.
- `Debug`: Shows capture/playback/RGB state.

## RGB Lab

RGB Lab lets the player react to music.

- Reaction source: `Balanced`, `Energy`, `Bass`, `Mids`, `Highs`.
- Palette: `Nova RGB`, `Fire`, `Cyber`, `Violet`, `Ice`, `Toxic`.
- Intensity: `Soft`, `Medium`, `Gremlin`.
- React parts: `Panel`, `Header`, `Buttons`, `Active Song`, `Progress`, `Equalizer`, `Orb`, `Lyrics Glow`.

## Notes

This is still a userscript, not a full native app. Browser changes, Suno changes, or expired audio URLs may require another Prime capture or a script update.

The point of this project was not just to make playback work. It was to prove that a simple Tampermonkey script could become a useful, playful, personal tool with real product energy.
