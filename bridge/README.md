# Bridge: browser ↔ IBM 7094

`server.js` keeps a few warm ELIZA sessions running on emulated IBM 7094s under CTSS and hands one to each visitor over a WebSocket.

```
browser ──WebSocket /ws──► bridge ──telnet :7094──► s709 (IBM 7094) ──► CTSS ──► r eliza
```

## What it does, and why

- **One CTSS machine per line.** The reconstructed CTSS wedges when several ELIZAs are loaded on the same machine (three accounts on one CTSS froze it within a few replies; one ELIZA per machine ran four rounds of concurrent conversations with no fault). Configure lines as `ELIZA_LINES=host:port:user:password,...`.
- **Warm sessions.** Each line is already past `login`, `r eliza`, the script number and the greeting when a visitor arrives. When they leave, ELIZA is stopped with QUIT (Ctrl-\\), the account logs out, and a fresh ELIZA starts, so every visitor gets an empty MEMORY.
- **Typing is acknowledged.** CTSS drops characters typed while ELIZA is busy, so the bridge waits for CTSS to echo each line and retypes the terminating empty line until it is taken. ELIZA exiting (`R …`, `NEW SCRIPT`) is detected and the line recycled.
- **Input** is cut to 72 columns, control characters are stripped, `? ! ; :` become periods, and digits are spelled out (`2` → `TWO`) because the 1965 code hangs printing numbers. **Replies** pass through exactly as printed: uppercase, spaces before punctuation.
- **First boot** compiles the loader, SLIP and ELIZA inside CTSS (about a minute per machine). Keep `dasd/` on a volume so it happens once.
- **Dead ttys.** A line CTSS stops answering is held open, so s709 doesn't hand that tty to the next caller, and the bridge dials again.

## Settings

| env | default | |
|---|---|---|
| `ELIZA_LINES` | `eliza:eliza` on `CTSS_HOST:CTSS_PORT` | one entry per line |
| `ELIZA_SCRIPT` | `200` | `200` = DOCTOR from the 1966 CACM paper, `100` = the script found with the printout |
| `PORT` | `8080` | |
| `ALLOWED_ORIGINS` | any | comma-separated |
| `SOCKETS_PER_IP` | `2` | |
| `MSGS_PER_MIN` | `20` | per IP |
| `IDLE_MS` | `600000` | close idle visitors |
| `SITE_DIR` | none | also serve the static site |

`GET /health` returns `{ready, inUse, lines}`.

## Protocol

Server → client: `{type:"hello", greeting, script}` or `{type:"busy"}`. Client → server: `{type:"say", text}`. Server → client: `{type:"reply", text}` or `{type:"error", reason}`.

## Script 200 on the real code

The CACM version of DOCTOR uses features (`PRE`, `NEWKEY`, links inside reassembly rules) that the surviving 1965 code doesn't implement, so the real machine sometimes answers `= DIT` where the paper's ELIZA says `WHAT RESEMBLANCE DO YOU SEE`. That is the real program and is left alone. `ELIZA_SCRIPT=100` avoids it, at the cost of the longer 1965 greeting.
