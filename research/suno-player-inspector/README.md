# Nova Suno Player Inspector

Experimental research project for understanding how Suno's web player obtains media, starts playback, updates state, and exposes useful metadata.

## Goal

Before rebuilding Nova Player again, capture enough evidence to answer:

- Which endpoints provide library/song metadata?
- Which fields carry `audio_url`, `media_urls`, clip IDs, duration and artwork?
- Which concrete URL becomes the browser media element's `currentSrc`?
- What calls `HTMLMediaElement.play()`?
- Does Suno use `<audio>`, `<video>`, MediaSource/blob URLs, MediaSession, iframes, postMessage, or a combination?
- Which requests happen when Play / Pause / Next / Previous / seeking / volume / lyrics are used?
- Which part of playback can Nova reuse cleanly without depending on hidden Suno UI?
- Where can Nova attach its own live audio analyser so RGB remains genuinely audio-reactive?

## Safety boundary

This tool is observation-only.

It does not:
- replay captured requests;
- create API probes;
- export cookies or Authorization headers;
- export URL query values;
- submit forms or trigger Suno controls automatically.

It wraps browser APIs only to log metadata and then immediately delegates to the original browser/Suno implementation.

## First tool

`nova-suno-player-inspector.user.js`

Captured evidence includes:

- fetch/XHR endpoint + method + status + content type;
- request/response **shapes**, not credentials;
- selected useful player fields (`audio_url`, `media_urls`, IDs, duration, content type, delivery, encoding, etc.);
- browser resource timing;
- `<audio>` / `<video>` discovery and lifecycle;
- actual `currentSrc`, readyState/networkState, duration, time, volume and playback errors;
- calls to `play()`, `pause()` and `load()` with short call stacks;
- MediaSession action-handler registration;
- MediaMetadata title/artist/artwork;
- iframe metadata;
- postMessage data shapes;
- Shadow DOM/media mutations;
- manual action marks and JSON export.

## Test workflow

1. Install the userscript in Tampermonkey.
2. Open Suno normally.
3. Refresh once so the inspector starts at `document-start`.
4. Click **Clear**.
5. Click **Mark** and enter one action, e.g. `Play song from Library`.
6. Perform only that action.
7. Wait a few seconds.
8. Click **Mark** for the next isolated action, e.g. `Next`.
9. Repeat for Pause, seek, volume, lyrics, queue, etc.
10. Click **Export** and give the JSON report to Nova.

Best experiments repeat the same action twice. Correlation is a clue; repeatability is stronger evidence.

## Research phases

### Phase 1 — Playback truth
Map metadata response → media URL → actual browser media source → play call.

### Phase 2 — State/control truth
Map Play/Pause/Next/Prev/seek/volume to page code, network activity and MediaSession.

### Phase 3 — Audio analyser
Determine whether Nova can attach Web Audio to the actual playback element without breaking Suno. If not, identify the cleanest alternative.

### Phase 4 — Nova Player rebuild
Keep Suno as a source adapter. Nova owns UI, library presentation, lyrics, RGB and audio-reactive effects.

## Branch policy

This research lives on `lab/suno-player-inspector` and should not be merged into the normal Nova runtime until the findings are proven and the experimental hooks are removed or hardened.
