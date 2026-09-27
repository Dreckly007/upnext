# Locking the app behind an email login (Cloudflare Access)

By default, this app's live site (the GitHub Pages link, e.g.
`https://dreckly007.github.io/PBScheduler/`) is public — anyone with the link
can open and use it. This guide sets up a real login wall in front of it:
a visitor has to enter an email address you've approved and click a one-time
code sent to it, before the app loads at all.

It's optional, free for up to 50 approved people, and doesn't touch this
app's code at all — it's a setting on Cloudflare that sits in front of your
domain, invisible to the app itself. You do it once and it just runs.

## What this does and doesn't do

- **Does:** stop anyone whose email you haven't approved from ever seeing
  the app, even if they have the link.
- **Doesn't:** encrypt or hide data from someone you *have* approved, or
  stop them screenshotting/sharing what they see once they're in.
- **Limit:** the free tier covers up to 50 approved emails. Plenty for a
  club or a single event; if you ever need more, Cloudflare has paid tiers.

## What you'll need

- A domain name of your own (e.g. `yourclub.com`) — see Step 1 if you don't
  have one yet. A free `github.io` address can't be used for this; Cloudflare
  needs a domain it can manage the DNS for.
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
- About 20–30 minutes, mostly waiting on DNS to update.

## Steps

### 1. Get a domain (skip if you already have one)

Buy one from any registrar — Cloudflare's own
[domain registrar](https://www.cloudflare.com/products/registrar/) sells at
cost price (no markup) and keeps everything in one place, which is the
easiest option if you're starting from scratch. Namecheap, GoDaddy, Google
Domains and others work equally well. Expect roughly £8–15/year for a
`.com`/`.co.uk`.

You don't need a new domain if you already own one for something else — a
subdomain like `pickleball.yourclub.com` works fine and costs nothing extra.

### 2. Add the domain to Cloudflare

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)
   (free plan is all you need).
2. Click **Add a site** and enter your domain.
3. Choose the **Free** plan.
4. Cloudflare scans your existing DNS records and shows you a pair of
   nameservers (something like `bob.ns.cloudflare.com`).
5. Go to wherever you bought the domain (your registrar) and change the
   domain's nameservers to the two Cloudflare gave you. This is normally
   under a "DNS" or "Nameservers" setting on the registrar's site.
6. Wait for Cloudflare to show the domain as **Active** — this can take
   anywhere from a few minutes to a few hours.

*(If you're using a subdomain of a domain you don't want to move into
Cloudflare entirely, use Cloudflare's "CNAME setup" option instead of full
nameserver delegation — Cloudflare's own site walks you through this when
you add the domain and mention you only want to manage part of it.)*

### 3. Point the domain at this app

1. In Cloudflare, go to **DNS** → **Records** for your domain.
2. Add a record:
   - Type: `CNAME`
   - Name: `@` (or a subdomain like `pickleball` if you're using one)
   - Target: `dreckly007.github.io`
   - Proxy status: **Proxied** (orange cloud) — this needs to be on for
     Access to work.
3. In this repo, add a file called `CNAME` (no file extension) at the
   top level, containing just your domain, e.g.:
   ```
   pickleball.yourclub.com
   ```
   Commit and push it — GitHub Pages reads this file to know which custom
   domain to answer to.
4. In the GitHub repo's settings: **Settings → Pages → Custom domain**,
   enter the same domain and save. GitHub will show a green checkmark once
   it verifies (can take a little while after DNS updates).

At this point your domain loads the app directly, same as the `github.io`
link did — nothing's locked yet. That's the next step.

### 4. Turn on the email login wall

1. In Cloudflare, go to **Zero Trust** (in the left sidebar — free to
   enable, just click through the short setup if it's your first time).
2. Go to **Access → Applications → Add an application**.
3. Choose **Self-hosted**.
4. Set:
   - Application name: anything, e.g. "Pickleball Scheduler"
   - Session duration: how long a login lasts before re-checking, e.g.
     24 hours or 1 week
   - Application domain: your domain from Step 3
5. Under **Policies**, add a policy:
   - Action: **Allow**
   - Include rule: **Emails** — list the exact addresses allowed in, one
     per line. (Or use **Emails ending in** to allow a whole domain, e.g.
     everyone `@yourclub.com`.)
6. Save. Access is now live on that domain.

### 5. Test it

Open the domain in a private/incognito browser window:

- You should see a Cloudflare-branded page asking for an email address.
- Enter an address you allowed → you get a one-time code by email → enter
  it → the app loads normally.
- Enter an address you didn't allow → it should be rejected.

If it works, that's the whole setup — the app itself needs no changes and
you're done.

## Adding or removing people later

Go back to **Zero Trust → Access → Applications**, open the application,
and edit the policy's email list. Changes apply immediately — no redeploying
the app or touching this repo.

## Cost

Cloudflare Access is free for up to 50 unique users. DNS, the CNAME record,
and the proxy are all free regardless. The only recurring cost in this whole
setup is the domain name itself (paid to your registrar, not Cloudflare).
