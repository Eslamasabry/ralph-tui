# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-20
**Commit:** 2f8b65d1
**Branch:** main

## OVERVIEW

WebSocket server and client for remote ralph-tui control. Enables multi-instance TUI with tabs, two-tier token authentication, and config push capabilities.

## STRUCTURE

```
src/remote/
├── server.ts           # WebSocket server (1427 lines) - message routing, auth, engine control
├── client.ts           # WebSocket client (1110 lines) - auto-reconnect, latency tracking
├── token.ts            # Token management (439 lines) - two-tier system (server + connection)
├── instance-manager.ts # Tab state manager (802 lines) - multi-instance coordination
├── audit.ts            # JSONL audit logger (213 lines)
├── config.ts           # Remote configs (218 lines) - ~/.config/ralph-tui/remotes.toml
└── types.ts            # Type definitions (606 lines) - WS messages, tokens, config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| WebSocket protocol | `types.ts` | All WSMessage types, auth flow |
| Token lifecycle | `token.ts:148-176` | getOrCreateServerToken(), issueConnectionToken() |
| Auth handlers | `server.ts:1227-1294` | handleAuth(), handleTokenRefresh() |
| Reconnection logic | `client.ts:916-1036` | scheduleReconnect(), attemptReconnect() |
| Config push | `server.ts:1022-1220` | handlePushConfig() with backup/rotation |
| Audit logging | `audit.ts` | JSONL format, log rotation at 10MB |
| Test file | `tests/remote/remote.test.ts` | 1513 lines, full integration tests |

## CONVENTIONS

**Two-Tier Token System**:
- Server token: 90-day lifetime, stored in `~/.config/ralph-tui/remote.json`
- Connection token: 24-hour lifetime, issued on auth, in-memory only

**Message Correlation**: All WS messages use `id` field for request/response matching

**Port Binding**: Server tries up to 10 ports (default: 7890-7899) if port in use

**Constant-Time Compare**: Token validation uses constant-time comparison to prevent timing attacks

## ANTI-PATTERNS (THIS MODULE)

**Deprecated functions** (use new names):
- `getOrCreateToken()` → `getOrCreateServerToken()` (`token.ts:182-188`)
- `rotateToken()` → `rotateServerToken()` (`token.ts:214-217`)
- `validateToken()` → `validateServerToken()` (`token.ts:275-278`)
- `token.value` → access via `serverToken.value` object (`types.ts:51-55`)

**Token Properties**:
- Legacy `token`, `tokenCreatedAt`, `tokenVersion` fields will be migrated automatically

**WebSocket Data**:
- Do not store tokens in WebSocket data - connection tokens are in-memory only
- Server tokens validated per-message, connection tokens stored in ClientState
