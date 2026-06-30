# Nova Install & Test Checklist

## Current Build

Nova Build: `0.5.0+`

Core entrypoint:

```txt
bootstrap/nova-bootstrap.user.js
```

Raw install URL:

```txt
https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/bootstrap/nova-bootstrap.user.js
```

## Install / Update in Tampermonkey

1. Open the raw install URL.
2. Install or update the script in Tampermonkey.
3. Make sure the script is enabled.
4. Open any page matched by the script.
5. Refresh the page once after install.

## Expected Console Output

Open DevTools console and check for:

```txt
[Nova Core] NovaSession loaded
[Nova Trace Network] Loaded. Use NovaTraceNetwork.start().
[Nova Core] NovaMenu initialized
[Nova Core] Bootstrap loaded
```

Bootstrap should report:

```txt
Theme: true
Session: true
Trace Network: true
Menu: true
```

## Expected Page UI

A floating button should appear:

```txt
Nova
```

Click it. The panel should show:

- Session section
- DevKit / Trace section
- Module registry section
- Build label

## Core API Smoke Test

Run in console:

```js
Boolean(window.Nova)
Boolean(window.NovaSession)
Boolean(window.NovaTraceNetwork)
Boolean(window.NovaMenu)
Nova.getModules().length
```

Expected:

```txt
true
true
true
true
4 or more
```

## Session Test

1. Click `Nova`.
2. Click `Start Session`.
3. Check Session status shows `recording`.
4. Refresh the page.
5. Open Nova menu again.
6. Session should still exist.
7. Page counter should increase.

Console check:

```js
NovaSession.isActive()
NovaSession.current.pages.length
NovaSession.current.events.length
NovaSession.getStats()
```

## Trace Auto-Resume Test

1. Open Nova menu.
2. Click `Start Trace`.
3. Refresh page.
4. Open Nova menu again.
5. Trace should show active or auto-resumed.
6. Trace page counter should increase.

Console check:

```js
NovaTraceNetwork.isActive()
NovaTraceNetwork.getStatus()
```

Expected status should include:

```txt
enabled: true
persisted: true
pageCount: 2 or more
```

## Trace Capture Test

1. Start Trace.
2. Use the website normally.
3. Trigger something that loads data.
4. Open Nova menu.
5. Local events should increase if the page uses fetch/XHR after Trace starts.

Console check:

```js
NovaTraceNetwork.getLogs()
NovaSession.current.events.filter(e => e.module === 'trace-network')
```

## Export Test

Use either menu button:

```txt
Copy Session
Copy Trace
```

Or console:

```js
NovaSession.copy()
NovaTraceNetwork.copy()
```

Expected:

- JSON copied to clipboard.
- No headers, bodies, cookies, tokens, or secrets are included.

## Stop / Clear Test

1. Click `Stop Trace`.
2. Trace should show `off` after refresh.
3. Click `Stop Session`.
4. Session should show `stopped`.
5. Click `Clear Session` only when you want to remove local saved session data.

## Known Notes

- Trace only records safe request metadata.
- Trace does not store headers, request bodies, response bodies, cookies, or tokens.
- Trace records only requests made after Trace starts or auto-resumes.
- Local Trace logs reset per page, but Nova Session persists across refresh/pages.
- Registry is loaded from `modules/modules.registry.json`.

## Mission Status

Completed:

- Mission 001: Nova Session Engine
- Mission 002: Trace Integration
- Mission 003: Bootstrap Integration
- Mission 004: Module Registry
- Mission 005: Modules Menu
- Mission 006: Registry Entries
- Mission 007: Trace Controls
- Mission 008: Session Status
- Mission 009: Trace Auto-Resume
- Mission 010: Trace Status UI
- Mission 011: Install/Test Checklist
