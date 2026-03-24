# FrameReady

Film pre-production is broken. Directors spend weeks explaining shots to everyone on the team, and what gets built on set rarely matches what was in their head. The usual fix is storyboards — but storyboards are either expensive (hire an artist) or fake (AI makes stuff up).

FrameReady is different. You upload your actual assets — real actors, real wardrobe, real props, real sets — and composite them into storyboard frames. The AI edits your photos, not its imagination.

## What it does

You drag assets onto an infinite canvas. You lasso the ones you want. You right-click and add a Generate node. You describe the shot. It generates a photorealistic frame using your real assets.

The output looks like a photo from set because it is a photo from set — just one that hasn't been taken yet.

## How to use it

**Upload your assets** into the sidebar. Four categories: Actor, Wardrobe, Prop, Set.

**Drag them onto the canvas.** Assets become nodes.

**Lasso the nodes you want to combine.** Right-click → Add Generate Node.

**Type a prompt** describing what you want. Hit Generate.

**Chain generations.** Right-click any generated image → Add Generate Node. Each generation can feed the next — put the jacket on her, then put her in the office, then add the plant.

## Setup

```bash
git clone <repo>
cd frameready
npm install
```

Create `.env.local`:

```
OPENAI_API_KEY=sk-...
REMOVE_BG_API_KEY=...   # optional but recommended — get free at remove.bg
```

```bash
npm run dev
```

Open `localhost:3000`.

## How it works

Three modes, auto-detected from your assets:

**Wardrobe mode** — if you connect a wardrobe asset, it strips the background from your actor photo and dresses them in the exact garment. Good for costume approvals.

**Props/Sets mode** — composites props onto the set at whatever position you drag them to on the spatial canvas, then blends them in. Good for set dressing and blocking.

**Chain mode** — uses a previous generation as the base and applies a new prompt on top. Good for building complex shots step by step.

## Stack

- Next.js (App Router)
- OpenAI `gpt-image-1` via `/v1/images/edits`
- `remove.bg` for background removal
- No database, no auth, no backend state — everything lives in the browser

## What it's not

It's not a general-purpose image generator. It won't invent scenes. It won't cast actors. The whole point is that the output is grounded in your actual production assets.

The better your inputs, the better your outputs. Clean actor photos, isolated wardrobe items, high-res set photography.

## Deploying

```bash
vercel
```

Add `OPENAI_API_KEY` in the Vercel dashboard. The `remove.bg` key is optional — without it, background removal falls back to a basic canvas-based approach that works for simple backgrounds.
