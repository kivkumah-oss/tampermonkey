# Nova Project History

This is a compact history of how the project evolved and why the current architecture exists.

## Phase 1 — Standalone operational scripts

The project began as individual Tampermonkey helpers built around real Amazon FC pain points.

Important early tools and patterns included:

- SPP / SmartPac jam recovery;
- Rodeo result parsing;
- condition filters such as C4, C7, C13, C15, and C1320;
- SP00 printing through local Printmon;
- Eagle Eye lookups;
- JP, dwell, and redirect speed helpers;
- copy buttons and investigation shortcuts;
- movable/minimisable panels with saved position and state;
- colour settings, gradients, and RGB effects.

The scripts worked, but each one repeated UI, storage, update, and lifecycle logic. Work PCs accumulated many separate files and each feature became harder to maintain consistently.

### Major SPP lessons

The SPP tool established several principles still used in Nova:

- show evidence and let the investigator decide;
- do not automate irreversible operational actions;
- sort by operational urgency, not merely row order;
- preserve raw identifiers while providing readable labels;
- allow condition/process filters because one noisy condition can bury the useful cases;
- retain manual controls for printing and external tools;
- remember panel state to reduce repetitive clicks.

## Phase 2 — Nova Player as a safe prototype sandbox

Nova Player was used to learn how a reusable UI could work away from Amazon operational pages.

Features explored there included:

- floating cyberpunk windows;
- playback controls;
- lyrics parsing;
- progress and timing;
- shuffle/previous/next;
- remote control between pages/devices;
- audio-reactive visuals;
- RGB Lab and theme settings;
- persistent panel state.

The philosophy became:

> Prototype in a safer environment, then promote proven systems into shared Core.

This is where Nova stopped being only a name for one script and became the identity of the whole framework.

## Phase 3 — GitHub-managed Bootstrap

The next goal was to install one Tampermonkey userscript and manage everything else from GitHub.

Bootstrap responsibilities grew to include:

- manifest download;
- trusted source validation;
- component caching;
- Core execution;
- module registry publication;
- update staging;
- recovery from cached/previous manifests;
- a loading/status HUD.

The repository was reorganised around:

- `bootstrap/`
- `core/`
- `modules/`
- `assets/`
- `docs/`

This was the key transition from scripts to platform.

## Phase 4 — Core extraction

Reusable systems were moved out of feature scripts and into Core components.

Examples include:

- `nova-theme`;
- `nova-audio-theme`;
- `nova-session`;
- `nova-memory`;
- `nova-trace`;
- `nova-api-body-catcher`;
- `nova-dom-inspector`;
- `nova-investigation-export`;
- `nova-menu`;
- `nova-window-manager`;
- `nova-module-loader`;
- `nova-default-module-state`.

Core established shared APIs so modules could depend on a stable runtime rather than copying infrastructure.

## Phase 5 — Reliable module autostart

A major difficulty was that code could be downloaded and listed in Nova Menu without appearing automatically after refresh.

The project separated four concepts that had previously been mixed together:

1. the module exists in the manifest;
2. the module code is cached;
3. the current site matches the module;
4. the module is visible/launched.

Autostart logic was then built to:

- launch matching `autoload` modules;
- retry when page timing is awkward;
- preserve user Hide/Launch choices;
- support modules allowed on any page separately from site-specific modules.

This was validated successfully in real use.

## Phase 6 — POPS becomes a Nova module

POPS Modern UI proved that an existing operational page could be transformed by a manifest-managed module rather than a standalone userscript.

The module:

- modernises the header;
- groups navigation and status information;
- styles actions/cards;
- highlights ready states;
- provides saved colours;
- repairs itself after page mutations.

Later testing exposed a flash of the original POPS page before Nova styling. That visual flaw led to Fast Boot and the Site Render Gate, improving the architecture rather than only POPS.

## Phase 7 — HERO Intelligence

HERO became the most demanding Nova module because it combines:

- page-route parsing;
- shipment event timelines;
- multiple event-detail requests;
- operational interpretation;
- actor extraction;
- asynchronous rendering;
- stale-route risk;
- overlapping refresh ownership.

The initial module provided cards for:

- pick;
- pack;
- slam/kickout;
- send runner;
- dwell;
- problem solve;
- categorisation;
- ATROPS/age verification;
- bridging evidence.

### Scout and evidence-driven API investigation

A safe investigation workflow confirmed HERO APIs rather than guessing:

- shipment event list endpoint;
- event-detail endpoint using request ID and details key;
- successful authenticated same-origin responses;
- event structures containing specific failure information.

Safe exports omitted raw sensitive bodies while still proving endpoint behaviour and shapes.

### Relative fetch failure

The HERO module initially failed because a relative `/api/...` URL was not accepted in the Firefox/Tampermonkey dynamic execution environment.

The solution was moved into Core as same-origin URL resolution rather than permanently patching one module.

### Defect intelligence

Real testing showed that `ReportDefect` alone is not the answer an investigator needs.

Nova now distinguishes:

- the event (`ReportDefect`, `FAIL_SHIPMENT`);
- the operational reason (`Item missing`, `Damaged`, `Transparency / serial number issue`, `Unscannable`).

The parser favours specific structured evidence and preserves raw codes.

### Refresh race

Correct defect information appeared and then disappeared because the main module and the new parser wrote the same fields asynchronously.

A route-bound evidence object and overwrite observer stabilised the UI. Future cleanup should consolidate ownership into the main HERO module.

## Phase 8 — Fast Boot and Site Render Gate

Martins noticed that POPS briefly showed its old page and HERO displayed partial information before settling.

Instead of accepting this as a framework trade-off, Nova changed startup architecture:

- cached manifest first;
- cached Core first;
- background GitHub checks;
- critical-page prepaint cover;
- readiness based on actual module/data completion;
- safety timeout on failure.

This marks the point where Nova Core began controlling not just whether modules load, but **which page frame the user sees first**.

## Working rules for future sessions

### Engineering style

- Investigate before patching.
- Separate event, reason, evidence, and interpretation.
- Prefer the most specific structured data.
- Route-bind async work.
- Treat flicker, races, and stale data as architecture issues.
- Keep manual operational judgement where automation could be risky.
- Do not claim success until Martins tests the real page.

### GitHub workflow

For an existing file:

1. fetch the current file and blob SHA;
2. edit the complete content;
3. update sequentially, never two writes to the same path in parallel;
4. bump the component version;
5. bump manifest version and timestamp when cache invalidation is required;
6. fetch the updated lines back;
7. state clearly whether syntax/runtime testing actually occurred.

### Delivery preference

When supplying downloadable script files to Martins, use `.txt` rather than `.user.js` unless he explicitly asks otherwise.

### Communication style

Martins values direct technical explanations without corporate padding. Humour and mild swearing are welcome, but accuracy must remain underneath it.

A useful response explains:

- what he observed;
- why he was right to question it;
- the actual root cause;
- what changed;
- how to verify it on the real page.

### Safety boundary

Never assist with authentication bypass, credential extraction, token capture, cookie replay, or unsafe secret storage.

Normal same-origin authenticated requests made through the already logged-in page are acceptable when used for authorised operational tooling.

## Current project identity

Nova is now:

- one installed Bootstrap;
- a versioned manifest;
- cached Core services;
- matched/autoloaded modules;
- shared UI and diagnostics;
- evidence-driven operational interpretation;
- persistent engineering memory in this journal.

The quality bar is no longer “the script appears.”

The quality bar is:

- correct;
- stable;
- fast;
- honest about unknowns;
- operationally useful;
- maintainable through Core.
