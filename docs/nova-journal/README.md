# Nova Development Journal

This folder is the persistent engineering memory for **Nova Core**.

It exists so a future Nova session can quickly understand:

- what Nova Core is;
- why the architecture looks the way it does;
- what Martins and Nova already tested;
- which bugs were real, which assumptions were wrong, and how they were fixed;
- what is currently stable;
- what still needs investigation;
- how to continue without rebuilding old work from memory.

## Project identity

Nova is no longer a collection of unrelated Tampermonkey scripts.

Nova Core is a reusable runtime and UI framework that loads shared services and site-specific modules from a GitHub manifest. It owns caching, updates, module startup, shared styling, local memory, diagnostics, and site integration.

Current philosophy:

1. Prototype safely.
2. Test against real operational behaviour.
3. Promote proven functionality into shared Core or a proper module.
4. Prefer evidence over assumptions.
5. Do not accept technically true but operationally useless output.
6. Fix architecture problems at the architecture layer rather than hiding them inside one module.

## How to use this journal

A future session should read these files in this order:

1. `CURRENT_STATE.md`
2. `DECISION_LOG.md`
3. `BUG_HISTORY.md`
4. the newest dated session file

The source code and `nova.manifest.json` remain the source of truth for exact current versions. The journal explains intent, history, and operational meaning.

## Maintenance rules

Update this folder whenever a change affects one or more of the following:

- Core architecture;
- bootstrap behaviour;
- module loading or caching;
- page-render timing;
- API interpretation;
- an important operational assumption;
- a bug whose cause was not obvious;
- a major feature promoted from prototype into Core.

A useful entry records:

- the visible symptom;
- the incorrect assumption;
- the actual root cause;
- the code or design change;
- how the fix was tested;
- any remaining risk.

## Security and privacy rules

This journal is for project knowledge, not personal or confidential data.

Never store:

- passwords;
- authentication tokens;
- cookies;
- session headers;
- private keys;
- raw internal credentials;
- customer information;
- unnecessary shipment identifiers;
- health, family, or other personal history unrelated to engineering decisions.

Safe diagnostic exports should continue omitting raw sensitive response bodies unless a specific debugging task genuinely requires a controlled local inspection.

## Working relationship

Martins supplies the operational reality: what the tools must show, what a value actually means on shift, and when something is technically correct but practically wrong.

Nova supplies the engineering work: architecture, parsing, race protection, module design, diagnostics, code changes, and persistent documentation.

The project improves fastest when Martins says some variation of:

> “Khm… this looks wrong. Let’s see why.”

That sentence usually means the visible symptom is exposing a deeper system flaw worth fixing properly.
