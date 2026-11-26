# Critic rubric

Score each line 1–5 with one concrete reason (what you saw, where). Pass = no line ≤ 2, no coded FAIL in `qa/report.json`, no hard stop. Judge full-size frames and slides, never thumbnails alone.

| # | Line | 5 looks like | 1 looks like |
|---|---|---|---|
| 1 | **Thumb-stop** | Frame 1 / slide 1 stops the scroll on its own: one striking object or number + ≤7 words, readable at phone size and in the 3:4 grid crop | A title card, a logo, small text, or a busy layout with no focal point |
| 2 | **Hook alignment** | Spoken hook, on-screen text and visual say the same thing in the first second | They say different things, or the topic arrives after a wind-up |
| 3 | **One idea, one device** | One promise and one visual metaphor carried through to the payoff | A list of unrelated visuals; the device changes halfway |
| 4 | **Pacing** | Something changes every 2–4 s, re-hooks every 5–8 s, nothing flashes > 3×/s; carousels alternate statement/evidence | Static holds > 4 s, dead air, or a slideshow of same-looking slides |
| 5 | **Typography and hierarchy** | Max 2 typefaces, 3 sizes per frame; clear order of reading; generous, intentional spacing; contrast ≥ 4.5:1 | Crowded text, weak hierarchy, collisions, cropped glyphs, text under Instagram's UI |
| 6 | **Craft / not-AI** | Reads as made by a skilled human designer: specific, textured, considered details; brand colours used with restraint | Generic gradients, glow, clip-art icons, waxy AI imagery, template look, purple/teal defaults |
| 7 | **Brand fit** | Client colours, fonts, logo/footer and compliance line exactly per kit and kit rules; feels like this client, not any broker | Wrong or missing logo/footer, another client's look, rule violated |
| 8 | **Originality** | Different from this client's recent pieces and from other clients' versions (variety + near-dup check clean); not a competitor copy | Same style/device as last time, near-duplicate of a sibling client's piece |
| 9 | **Truth and maths** | Every number matches script.json math and check.json; illustrative labels and dated rates where needed | A number differs between voice, screen and caption, or a claim has no source |
| 10 | **Compliance** | Ontario: brokerage name + licence visible; rate → APR + term; no banned words; composites labelled | Missing licence line on an ON piece, "best rate", fake testimonial |
| 11 | **Sound** (video) | Voice clear at −14 LUFS, music well under, SFX on reveals, energy rises to the payoff, captions match speech | Muddy or clipped voice, music fighting speech, silence mid-reel, caption errors |
| 12 | **Payoff and action** | Ends on the payoff, loops cleanly (reels), exactly one CTA that delivers; send-test is obvious | Recap/outro card, "follow for more", engagement bait, no clear action |

Calibration (added 21 Nov 2026 after the orchestrator found the critic lenient on craft):
- Every critique names **at least one concrete weakness** on line 6 (craft), even on a pass, with where it is (slide/time) and what a top designer would change.
- A **5 needs evidence**: quote the specific detail that makes it exceptional. "Looks premium" is not evidence. Default to 4 for solid work and 3 for competent-but-generic work.
- Score thumb-stop at **thumbnail size** (260 px wide) and in the 3:4 grid crop, not at full size.
- Placeholder-looking elements (generic letters or boxes standing in for an image, empty panels) cap line 6 at 3.
- If the user's notes on this or earlier pieces raised a visual issue, check for it explicitly and say whether it is fixed.

Hard stops (any one = fail): missing compliance line on an Ontario client piece that isn't marked PROOF · an advertised rate without APR/term · an invented client fact or testimonial · a placeholder or TODO visible in a final not marked PROOF · another client's asset · text cut off.
