# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the build brief (subagent run, no interview possible). Every line below is an inference from the brief unless marked confirmed.

## Platform

web

## Stack
delegated (brief-pinned): node:http server (`server.mjs`, Node 25, no framework), vanilla ES modules + CSS in `public/`, no build step, 127.0.0.1:4747.

## Users
The owner of a small content agency that makes Instagram content (reels, carousels, statics) for Canadian mortgage brokers. He does not read written reports; he wants to see what the bot is doing and decide at two gates. Used on a laptop at his desk, often alongside Claude Code in a terminal, and checked on a phone.

## Product Purpose
The Desk is the visual control room for Studio, the agency's creative bot. It shows each job moving through the pipeline as a live node graph, a wall of competitor posts (Radar), client brand kits, the library of past pieces, and the two approval gates (Gate 1: pick a concept; Gate 2: approve the finished piece). Success: the owner understands state at a glance and makes gate decisions in seconds.

## Positioning
Not a dashboard of numbers: images and the live flow of work are the content. Every decision made on the Desk is written back to the same files the agents read.

## Operating Context
Files on disk are the source of truth (`jobs/`, `kits/`, `library/`, `radar/`). Agents write them; the Desk watches and renders them live. Decisions go into `job.json` gates and `library/feedback.jsonl`.

## Capabilities and Constraints
Read-only towards client sources. No posting, no scraping social sites. Missing data shows as visible TODOs, never invented facts. Sample fixtures only when real data is absent, badged SAMPLE.

## Brand Commitments
Brief-pinned direction: film production board + broadcast control room; dark first with a real light theme. Avoid cream+serif+terracotta, neon-on-black single acid accent, purple/blue gradients, glassmorphism, emoji icons, everything-in-rounded-cards, centered layouts.

## Evidence on Hand
Real radar posts (`radar/posts.jsonl`), client assets (`assets/<slug>/photo|footer|logo`), past reels and carousels under `graphic reels/`.

## Product Principles
- Show, don't report: images and status, not prose.
- Every decision is one click plus optional notes.
- Live by default: the screen updates when files change.
- Never invent client facts.
