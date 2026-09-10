# Suno Player Capture Plan

Run these as isolated experiments. Clear between experiments unless noted.

## A. Baseline

1. Open Suno Library.
2. Refresh.
3. Do nothing for 15 seconds.
4. Export as `A-baseline.json`.

Purpose: identify boot traffic, idle polling, media elements created before user interaction, MediaSession state, and background noise.

## B. First play

1. Clear.
2. Mark `B1 play first visible Library song`.
3. Click one Suno Play button once.
4. Let it play 10 seconds.
5. Export.

Questions:
- What endpoint already supplied the clip metadata?
- Which `audio_url` / `media_urls` value corresponds to the resource request?
- Is the playback source HTTP(S), blob, MediaSource, or something else?
- Which code path calls `HTMLMediaElement.play()`?
- Which media lifecycle events occur?

## C. Pause / resume

1. Clear while a song is already playing.
2. Mark `C1 pause` and pause.
3. Wait 3 seconds.
4. Mark `C2 resume` and resume.
5. Wait 5 seconds.
6. Export.

Purpose: distinguish local media-element control from API/state/telemetry requests.

## D. Next

1. Clear while playing.
2. Mark `D1 next`.
3. Press Next once.
4. Wait 8 seconds.
5. Export.
6. Repeat the same experiment with the same starting song if practical.

Purpose: identify queue/state changes, metadata fetches, new media resource, and whether Next is purely client-side or server-assisted.

## E. Seek

1. Clear while playing.
2. Mark `E1 seek forward`.
3. Drag progress to a later point.
4. Wait 5 seconds.
5. Export.

Purpose: determine whether seeking uses normal media ranges, changes source, or emits state/telemetry only.

## F. Volume

1. Clear while playing.
2. Mark `F1 change volume`.
3. Change volume once.
4. Wait 3 seconds.
5. Export.

Purpose: map volume state and confirm whether it is browser-local or persisted remotely.

## G. Lyrics

1. Clear.
2. Mark `G1 open lyrics`.
3. Open lyrics for the current song.
4. Wait for them to fully render.
5. Export.

Purpose: identify whether lyrics arrive in existing clip metadata, a dedicated endpoint, streamed page state, or DOM-only content.

## H. Fresh page → direct song

1. Open one song page directly in a new tab.
2. Refresh with Inspector enabled.
3. Mark `H1 direct-song play`.
4. Press Play.
5. Export.

Purpose: compare Library playback with direct-song playback.

## I. MediaSession controls

If browser/OS media controls are visible:

1. Clear while playing.
2. Mark `I1 OS next`.
3. Use the browser/OS Next control.
4. Export.

Purpose: determine whether Suno registers MediaSession action handlers and whether Nova can eventually integrate without hidden button clicking.

## Evidence standard

Treat one timing coincidence as a hypothesis, not proof. Stronger conclusions require at least one of:

- the same relationship appears in repeated captures;
- an API field value matches the concrete media source path/clip ID;
- a media method call stack points at the relevant app code;
- the observed state changes only when the marked action occurs;
- the browser media lifecycle confirms the transition.

## What NOT to do

The Inspector is intentionally passive. Do not replay captured API calls, alter request bodies, brute-force endpoints, or automate hidden Suno actions during this research phase.
