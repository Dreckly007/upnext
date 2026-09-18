# Deploying the ladder-sync Worker

This is a small Cloudflare Worker that lets ladder players submit their own
match results from a personal link, so they show up in the app automatically.
It's optional — Ladder mode works completely fine without it. You only need
this if you want the "players submit their own results" feature.

You do **not** need to know how to code to do this. It's about 10 minutes,
free on Cloudflare's free tier for any normal-sized club, and you only do it
once.

## What you'll need

- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
- [Node.js](https://nodejs.org) installed on your computer (needed to run the
  `wrangler` deploy tool — any recent version works).

## Steps

1. **Install the deploy tool.** Open a terminal and run:
   ```
   npm install -g wrangler
   ```

2. **Log in to Cloudflare:**
   ```
   wrangler login
   ```
   This opens a browser tab to approve access. Approve it and come back to the terminal.

3. **Create the storage bucket this Worker uses** (called "KV" — just a
   simple key-value store, nothing to configure):
   ```
   wrangler kv namespace create LADDERS
   ```
   This prints something like:
   ```
   { binding = "LADDERS", id = "abcd1234..." }
   ```
   Copy that `id` value.

4. **Edit `wrangler.toml`** in this folder (`worker/wrangler.toml`) — two changes:
   - Replace `REPLACE_WITH_KV_NAMESPACE_ID` with the `id` you just copied.
   - Replace `REPLACE-WITH-YOUR-SITE-ORIGIN` with the exact web address your
     copy of the app is hosted at — e.g. if your app is at
     `https://yourclub.github.io/PBScheduler/index.html`, the origin is
     `https://yourclub.github.io` (no trailing slash, nothing after it).

5. **Deploy it:**
   ```
   cd worker
   wrangler deploy
   ```
   This prints a URL that looks like:
   ```
   https://pbscheduler-sync.<your-subdomain>.workers.dev
   ```
   That's your Worker's address.

6. **Tell the app about it.** Open the app, go into Ladder mode, open a
   ladder, and paste that URL into the "Sync server URL" field in the
   "Online results" section. Do this once — every ladder you enable online
   results for on this device will use it.

That's it. No further setup, no secrets to manage — each ladder that turns on
"Online results" gets its own private access code automatically, generated
and stored by the app itself.

## Updating it later

If you ever change the Worker's code, just run `wrangler deploy` again from
inside the `worker` folder — it updates in place at the same URL, nothing
else needs to change.

## Cost

Cloudflare's free tier includes 100,000 requests/day and generous free KV
storage — a private club ladder will never come close to either limit.
