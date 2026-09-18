// PBScheduler ladder-sync Worker
//
// Lets ladder players submit their own match results from a personal "magic
// link" (a bearer token, no login/signup) and lets the organizer's app pull
// them in. See worker/README-DEPLOY.md for how to deploy this.
//
// Two trust tiers, no gaps between them:
//   - The player-submit routes (/api/submit/:token) are gated ONLY by the
//     token in the path -- the token IS the credential.
//   - Every other route is gated by one admin secret per ladder
//     (X-Admin-Token header), checked against that ladder's own stored
//     admin token. There is no route reachable by neither check.
//
// KV layout (single namespace, binding LADDERS):
//   ladder:<ladderId>:meta            -> { name, format, roster, adminToken, playerTokens, status }
//   ladder:<ladderId>:match:<matchId> -> { id, ts, teamA, teamB, scoreA, scoreB, submittedBy }
//   token:<playerToken>               -> { ladderId, playerName }
//
// Matches are stored one KV key per match (never a shared array), so two
// players submitting at the same time can never race on a read-modify-write.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } });
    const bad = (msg, status = 400) => json({ error: msg }, status);
    const body = async () => {
      try {
        return await request.json();
      } catch {
        return {};
      }
    };
    const randomToken = () => crypto.randomUUID();

    const parts = url.pathname.split("/").filter(Boolean); // "/api/ladders/:id/roster" -> ["api","ladders",":id","roster"]

    async function getMeta(ladderId) {
      return env.LADDERS.get(`ladder:${ladderId}:meta`, "json");
    }
    async function requireAdmin(ladderId) {
      const meta = await getMeta(ladderId);
      const token = request.headers.get("X-Admin-Token");
      if (!meta || !token || token !== meta.adminToken) return null;
      return meta;
    }
    function isNonEmptyStringArray(arr) {
      return Array.isArray(arr) && arr.length > 0 && arr.every((v) => typeof v === "string" && v.trim());
    }

    // POST /api/ladders -- enable sync for a ladder (bootstrap)
    if (request.method === "POST" && parts.length === 2 && parts[0] === "api" && parts[1] === "ladders") {
      const { ladderId, name, format } = await body();
      if (!ladderId || !name || (format !== "singles" && format !== "doubles")) {
        return bad("ladderId, name, and format ('singles'|'doubles') are required");
      }
      const existing = await getMeta(ladderId);
      if (existing) {
        // Never re-hand out an existing admin token to whoever calls this next --
        // that would let anyone who knows/guesses a ladder id read another
        // organizer's admin credential just by re-calling this endpoint.
        return bad("a ladder with this id already has sync enabled", 409);
      }
      const adminToken = randomToken();
      const meta = { name, format, roster: [], adminToken, playerTokens: {}, status: "open" };
      await env.LADDERS.put(`ladder:${ladderId}:meta`, JSON.stringify(meta));
      return json({ adminToken });
    }

    // PUT /api/ladders/:id/roster -- push the current roster
    if (request.method === "PUT" && parts.length === 4 && parts[0] === "api" && parts[1] === "ladders" && parts[3] === "roster") {
      const ladderId = parts[2];
      const meta = await requireAdmin(ladderId);
      if (!meta) return bad("unauthorized", 401);
      const { roster } = await body();
      if (!Array.isArray(roster) || !roster.every((n) => typeof n === "string")) return bad("roster must be an array of names");
      meta.roster = roster;
      await env.LADDERS.put(`ladder:${ladderId}:meta`, JSON.stringify(meta));
      return json({ ok: true });
    }

    // POST /api/ladders/:id/links -- mint or rotate a player's magic-link token
    if (request.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "ladders" && parts[3] === "links") {
      const ladderId = parts[2];
      const meta = await requireAdmin(ladderId);
      if (!meta) return bad("unauthorized", 401);
      const { playerName } = await body();
      if (!playerName || !meta.roster.includes(playerName)) return bad("playerName must be in the ladder's roster");
      const old = meta.playerTokens[playerName];
      if (old) await env.LADDERS.delete(`token:${old}`);
      const token = randomToken();
      meta.playerTokens[playerName] = token;
      await env.LADDERS.put(`ladder:${ladderId}:meta`, JSON.stringify(meta));
      await env.LADDERS.put(`token:${token}`, JSON.stringify({ ladderId, playerName }));
      return json({ token });
    }

    // GET /api/submit/:token -- what a player's device needs to render the submit form
    if (request.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "submit") {
      const rec = await env.LADDERS.get(`token:${parts[2]}`, "json");
      if (!rec) return bad("invalid or expired link", 404);
      const meta = await getMeta(rec.ladderId);
      if (!meta || meta.status !== "open") return bad("this ladder is no longer accepting results", 404);
      return json({ ladderName: meta.name, format: meta.format, playerName: rec.playerName, roster: meta.roster });
    }

    // POST /api/submit/:token -- submit a result
    if (request.method === "POST" && parts.length === 3 && parts[0] === "api" && parts[1] === "submit") {
      const rec = await env.LADDERS.get(`token:${parts[2]}`, "json");
      if (!rec) return bad("invalid or expired link", 404);
      const meta = await getMeta(rec.ladderId);
      if (!meta || meta.status !== "open") return bad("this ladder is no longer accepting results", 404);
      const { matchId, teamA, teamB, scoreA, scoreB } = await body();
      if (!matchId || typeof matchId !== "string") return bad("matchId is required");
      if (!isNonEmptyStringArray(teamA) || !isNonEmptyStringArray(teamB)) return bad("teamA and teamB must be non-empty name arrays");
      const names = [...teamA, ...teamB];
      // The submitter's own identity comes from the token, never a form field --
      // this also rejects anyone filing a match they weren't even part of.
      if (!names.includes(rec.playerName)) return bad("you must be a player in this match");
      if (!names.every((n) => meta.roster.includes(n))) return bad("unknown player -- everyone must be in the ladder's roster");
      if (typeof scoreA !== "number" || typeof scoreB !== "number" || !Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA === scoreB) {
        return bad("scores must be two different numbers");
      }
      // matchId is generated client-side (once, when the submit form opens) so a
      // retried request after a dropped response overwrites the same key
      // instead of creating a duplicate match.
      const match = { id: matchId, ts: Date.now(), teamA, teamB, scoreA, scoreB, submittedBy: rec.playerName };
      await env.LADDERS.put(`ladder:${rec.ladderId}:match:${matchId}`, JSON.stringify(match));
      return json({ ok: true, matchId });
    }

    // GET /api/ladders/:id/matches -- organizer pulls everything to sync locally
    if (request.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "ladders" && parts[3] === "matches") {
      const ladderId = parts[2];
      const meta = await requireAdmin(ladderId);
      if (!meta) return bad("unauthorized", 401);
      const prefix = `ladder:${ladderId}:match:`;
      let cursor;
      let keys = [];
      do {
        const page = await env.LADDERS.list({ prefix, cursor });
        keys = keys.concat(page.keys);
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      const matches = await Promise.all(keys.map((k) => env.LADDERS.get(k.name, "json")));
      return json({ matches: matches.filter(Boolean) });
    }

    // DELETE /api/ladders/:id/matches/:matchId -- organizer deletes one match
    // (needed so a local delete doesn't get silently resurrected by the next sync)
    if (request.method === "DELETE" && parts.length === 5 && parts[0] === "api" && parts[1] === "ladders" && parts[3] === "matches") {
      const ladderId = parts[2];
      const matchId = parts[4];
      const meta = await requireAdmin(ladderId);
      if (!meta) return bad("unauthorized", 401);
      await env.LADDERS.delete(`ladder:${ladderId}:match:${matchId}`);
      return json({ ok: true });
    }

    return bad("not found", 404);
  },
};
