# Plan: true short-code sharing (Cloudflare Worker + KV)

Status: **design doc — deferred, not implemented.** No code in this repo implements this yet.

## Context

PBScheduler is a single static `index.html` file with zero backend, by design. The Share feature (task #58, later shrunk in commit `9c8355f`) currently encodes the *entire* schedule snapshot into the share string itself — gzip (via `CompressionStream`) + base64url, with Tournament payloads additionally remapped to short keys. There is no separate "code" vs "URL": `buildShareUrl` just appends the same encoded blob after `#share=`. Depending on the view/data size this runs 350–1800 chars, never a short `play3719`-style code, because a real short code requires a server to hold the code→payload mapping — which the app has deliberately never had.

The plan below is what's needed for a real short-code system once this app is packaged as an "official app": Cloudflare Worker + KV, gated by Turnstile + rate limiting so the open POST endpoint can't be freely hammered. It's written so a future implementation session can act on it directly without re-deriving the architecture.

**Decisions already made:**
- New short codes will **replace** the client-side long-code generation outright — no dual "short vs long" toggle going forward for newly-created shares.
- No Cloudflare account/Worker/KV exists yet for this project — manual setup steps are included below.
- Live pricing/limits for Workers, KV, and Turnstile were **not** independently verified when this doc was written (network access to `developers.cloudflare.com` was unavailable) — every figure below is marked **[VERIFY AT SIGNUP]** and must be confirmed against the current Cloudflare dashboard/ToS before relying on it.

## Current implementation (reference)

All in `index.html`:
- `encodeSharePayload(type, data)` / `decodeSharePayload(str)` — ~lines 7043–7123. JSON → gzip (`CompressionStream`, fallback to uncompressed) → base64url, prefixed `z`/`j`. `decodeSharePayload` also still parses a pre-`type` legacy format for old links.
- `buildShareUrl(type, data)` — ~7125–7128. Returns `{url, code}`, both derived from the same encoded string.
- `serializeSessionForShare` (~7130–7145) — full `rounds` array, no shrinking.
- `serializeTournamentForShare` / `compactTeam` / `compactFixture` / `compactKnockoutMatch` (~7150–7192) — short-keyed remap; `buildTournamentShareUrl` (~7216–7224) retries once dropping optional fields if over `MAX_QR_CHARS = 1800` (line 7050).
- `loadSharedViewFromString` (~7347–7353) and per-type loaders `loadSharedTournament` (7337), `loadSharedSession` (7312, also handles `"ladder"`).
- Share buttons: `shareBtn` (session/ladder, ~7302–7305), `tournamentShareBtn` (~7307–7310).
- No existing network calls anywhere except a same-origin `fetch("./manifest.json")` for PWA install logic — this feature would introduce the app's first real backend call.

## Target architecture

```
Browser                          Cloudflare Worker                    KV (SHARE_CODES)
  |  POST /share                       |                                    |
  |  { type, data, turnstileToken } -->|-- verify Turnstile token           |
  |                                    |-- rate-limit check (IP)            |
  |                                    |-- gzip+b64 payload (reuse existing |
  |                                    |   compaction logic, ported to JS)  |
  |                                    |-- generate short code, check       |
  |                                    |   collision, PUT with TTL -------->|
  |  <-- { code } ----------------------|                                    |
  |                                    |                                    |
  |  GET /share/:code ----------------->|-- GET from KV ------------------->|
  |  <-- { type, data } or 404 ---------|<-----------------------------------|
```

### Worker responsibilities
1. **POST (create share)** — accepts the already-compressed client payload (reuse the existing `encodeSharePayload` output as the request body so the Worker does no gzip work itself and stored KV values stay small), validates size (cap well under KV's value-size limit, e.g. reject >100KB), verifies the Turnstile token server-side via Cloudflare's `siteverify` endpoint (secret key stored as a Worker secret, never shipped to the client), applies rate limiting, generates a short code (e.g. 6–7 char base62, regenerate on KV collision), stores `code -> payload` with an expiration TTL, returns `{code}`.
2. **GET /share/:code** — KV lookup, returns the stored payload or 404. No auth needed (codes are meant to be shared).
3. **Retention** — KV `expirationTtl` set at write time (recommend 60–90 days; matches "temporary schedule" nature of the data). No cleanup job needed since KV handles TTL expiry natively.

### Abuse protection
- **Turnstile**: widget rendered in the share modal, gates the POST only (GET stays open — reading a code someone already has isn't abusable). Verify server-side; reject POSTs with missing/invalid tokens with 403.
- **Rate limiting**: primary approach is a Cloudflare dashboard rate-limiting rule on the Worker route (per-IP request cap). **[VERIFY AT SIGNUP]** whether native rate-limiting rules are available on the free plan or require a paid tier — if unavailable free, fall back to a simple KV- or Durable-Object-backed per-IP counter with a short sliding window (e.g. 10 creates/hour/IP) enforced in Worker code as the safety net either way.
- **CORS**: lock `Access-Control-Allow-Origin` to the app's actual deployed origin(s), not `*`.

## App changes (index.html) — future session

- Replace the URL-embedding path in `buildShareUrl`/`buildTournamentShareUrl`: keep the existing local compaction (`serializeSessionForShare`, `serializeTournamentForShare`, gzip+base64) since it minimizes what's uploaded/stored, but instead of embedding the blob in `#share=`, POST it to the Worker and use the returned code to build a short URL (e.g. `#s=play3719`).
- `decodeSharePayload`/`loadSharedViewFromString`: detect the new short-code format (fixed short alphanumeric pattern) and fetch-then-decode from the Worker's GET endpoint instead of decoding inline. **Recommendation**: keep the existing inline-decode path alive read-only for old long-format links already shared out in the wild (no maintenance cost, just stop generating them) — this satisfies "replace outright" for new shares without breaking links people already sent. Revisit if dropping legacy decode entirely is preferred later.
- Share modal UX becomes async: needs a loading state while the POST is in flight, and a clear error state (network failure, Worker down, Turnstile failure) — since there's no client-side fallback once this ships, a failed create should surface plainly rather than silently degrading.
- Add the Turnstile widget script (from Cloudflare's CDN) and site key to the share modal markup.

## Manual Cloudflare setup (no account exists yet)

1. Create a Cloudflare account (free tier).
2. Install `wrangler` CLI, `wrangler login`.
3. `wrangler kv:namespace create SHARE_CODES` (and a `--preview` namespace for local dev).
4. Cloudflare dashboard → Turnstile → add a widget for the app's domain, note the site key + secret key.
5. `wrangler.toml`: KV binding, and a route/workers.dev subdomain for the Worker (a `workers.dev` subdomain is fine to start; a custom subdomain is a later nicety).
6. `wrangler secret put TURNSTILE_SECRET`.
7. `wrangler deploy`.
8. Point `index.html`'s new share-create/fetch calls at the deployed Worker URL.
9. **[VERIFY AT SIGNUP]** current Workers/KV free-tier request/storage limits and Turnstile terms directly in the dashboard/ToS before relying on any numbers from this doc.

## Verification plan (future implementation session)

- `wrangler dev` locally; `curl` POST and GET against the local Worker to confirm code generation, storage, retrieval, and 404-on-missing.
- Browser: share a Tournament, a Session, and a Ladder round from the running app; open the resulting short-code URL in a fresh incognito window and confirm it loads correctly.
- Confirm a POST with a missing/invalid Turnstile token is rejected (403) and the UI surfaces that as an error, not a silent failure.
- Rapid-fire POSTs from one client confirm the rate limit kicks in.
- If old-format long share links are kept decodable: paste a pre-existing long `#share=` link and confirm it still loads via the legacy inline-decode path.

## Files to touch when implementing

- New `worker/` directory (same repo, own top-level folder, so app + worker version together): `wrangler.toml`, `src/index.js` (or `.ts`).
- `index.html`: the share-encoding block (~lines 7043–7353) and the two share-button handlers (~7302–7310) for the new async POST/fetch flow, plus a `<script>` tag for the Turnstile widget.
