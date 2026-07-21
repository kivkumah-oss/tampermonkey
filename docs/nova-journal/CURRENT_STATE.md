# Nova Core — Current State

Last reviewed: **2026-07-21**

## Current release baseline

At the time of this entry:

- Bootstrap: `2.3.0`
- Manifest: `2.6.39`
- Nova Site Render Gate: `1.0.0`
- Nova HERO Failure Intelligence: `0.3.0`
- Nova Default Module State: `2.1.0`
- Nova Module Loader: `1.2.0`
- Nova HERO Intelligence module: `0.1.0`
- Nova POPS Modern UI module: `1.0.0`

Always verify `nova.manifest.json` before assuming these are still current.

## Repository structure

Important locations:

- `bootstrap/nova-bootstrap.user.js` — the only installed userscript entry point.
- `nova.manifest.json` — registry and version source of truth.
- `core/` — shared runtime services.
- `modules/` — site-specific or feature-specific modules.
- `docs/nova-journal/` — persistent engineering memory and handoff notes.

## Bootstrap behaviour

Nova Bootstrap runs at `document-start`.

The intended startup order is now:

1. Read the active cached manifest immediately.
2. Start cached Core components without waiting for GitHub.
3. Start matching cached modules.
4. Reveal critical pages only when Nova has completed the relevant rendering work.
5. Check GitHub in the background.
6. Stage any update for the next refresh.

This is called **Fast Boot**.

First installation is naturally slower because no cached manifest or component code exists yet. Normal refreshes should use the local cache path.

## Render control

`core/nova-site-render-gate.js` prevents unfinished page states from being shown on critical sites.

### POPS

The original POPS page should remain covered until:

- the POPS module is active;
- the modern UI has been applied;
- at least one operational action/card has been styled.

The goal is to remove the visible flash of the old POPS interface before Nova styling appears.

### HERO

The HERO page should remain covered until:

- the Nova HERO panel exists and is visible;
- the main shipment event request has completed;
- all tracked HERO shipment event-detail requests have completed;
- the panel is no longer marked loading;
- a short quiet window confirms the data has settled.

The goal is to avoid showing a half-filled panel whose values visibly change a fraction of a second later.

## Module startup

Enabled modules marked `autoload: true` should launch automatically on matching pages.

Module visibility remains user-controlled. A manual Hide/Launch choice should be preserved rather than reset on every refresh.

`core/nova-default-module-state.js` also provides a same-origin relative-fetch bridge because Firefox/Tampermonkey sandbox execution rejected relative URLs such as `/api/fcs/...` in some dynamically executed modules.

## HERO Intelligence

Main module:

- `modules/hero/nova-hero-intelligence.js`

Purpose:

- build a shipment journey console;
- show pick, pack, slam, dwell, problem-solve, and ATROPS evidence;
- present operationally useful cards and status stages;
- read HERO events and event details using same-origin authenticated requests.

The current main HERO module predates some newer Core fixes. A future cleanup should integrate newer failure parsing directly into this module so only one component owns the Problem Solve fields.

## HERO Failure Intelligence

Core component:

- `core/nova-hero-failure-intelligence.js`

Purpose:

- inspect both `ReportDefect` and `FAIL_SHIPMENT` events;
- parse structured failure information from event details;
- classify the operational defect reason;
- protect populated fields from later refresh/reset overwrites.

Current output categories include:

- `Item missing`
- `Transparency / serial number issue`
- `Damaged`
- `Unscannable`
- `Defect reason not exposed`

Important distinction:

- **Event** answers what happened, for example `ReportDefect`.
- **Defect** answers why it happened, for example `Item missing`.

The parser prioritises specific structured evidence over generic descriptions:

1. item-level `failureReason`;
2. `DefectReasonCode`;
3. `DefectReasonText`;
4. `shipmentFailureReason`;
5. `DefectType`;
6. event description as fallback.

This matters because a shipment may have a broad type such as damaged while a more specific reason identifies a transparency or serial-number failure.

The component also adds a `Defect Evidence` row so the human-readable category does not hide the raw reason code.

## POPS Modern UI

Module:

- `modules/pops/nova-pops-modern-ui.js`

Purpose:

- modernise the POPS header and workflow controls;
- centralise navigation/status information;
- apply gradient action cards and ready-state styling;
- provide saved colour settings;
- monitor React/AWS UI mutations and reapply styling when needed.

The module currently debounces mutation-driven restyling and also performs periodic health checks.

## Current architectural risks

### Dual ownership in HERO

The main HERO module and HERO Failure Intelligence can both write Problem Solve fields. The overwrite guard makes this stable today, but the cleaner design is a single owner with native parsing inside the main module.

### First-install render delay

Fast Boot depends on cached code. On a brand-new installation, Nova must still download the manifest and required Core components. The render gate prevents unfinished UI from flashing, but first load can remain slower.

### Route-bound evidence

HERO evidence is bound to the exact current URL, FC, and shipment. Any future route parser change must preserve this protection to prevent data from one shipment appearing on another.

### Generic defect evidence

Some `ReportDefect` events expose only a generic description. Nova must not invent a category. When no specific structured reason exists, show `Defect reason not exposed`.

## Immediate validation checklist

After Bootstrap `2.3.0` is installed:

1. Refresh POPS.
2. Confirm the old page does not visibly flash before the modern UI.
3. Refresh HERO on a shipment with several event-detail calls.
4. Confirm the loading cover remains until the panel has settled.
5. Confirm defect Event and Defect reason remain separate.
6. Confirm a transparency failure displays `Transparency / serial number issue`.
7. Confirm changing shipment routes does not leave stale data behind.
8. Confirm Nova Info reports the expected manifest and Bootstrap versions.

## Next likely engineering task

Integrate HERO Failure Intelligence into `modules/hero/nova-hero-intelligence.js`, add a request-generation guard to the main refresh cycle, and retire the temporary dual-writer arrangement once equivalent behaviour is proven.
