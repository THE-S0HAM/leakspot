LEAKSPOT FINAL PLAN (deadline extended). First save this message verbatim as docs/FINAL_PLAN.md and commit it.
If you ever lose context: re-read docs/FINAL_PLAN.md, run `git log --oneline -20`, and continue with the first stage
whose commit is missing. Work one stage at a time. After each stage: verify green, build, commit, then STOP and list
exactly what I should check. I deploy and reply "go". Never deploy yourself; never start the next stage without "go".

GLOBAL RULES (every stage)
- Keep everything that works: engine, score vectors (C3 96, B2 39, A1 31, D4 25), scenario timeline, stateless API,
  web import boundary (web imports only @leakspot/core/world and /counterfactual), access-code flow, no secrets.
- Original art only: pixel-block isometric Indian city. No look-alikes of any existing game, brand or character.
- SVG + CSS only, no new libraries. Static layers memoised; moving things (truck, citizens, particles) use CSS
  keyframes or ONE requestAnimationFrame loop writing transforms to refs. Never re-render the whole city per frame.
  60 fps on a mid laptop (check once in the Performance panel).
- Motion: UI 120–250 ms ease-out; buttons press down in 80 ms (translateY 2px, side face shrinks); panels slide;
  numbers count up. prefers-reduced-motion → static fallbacks.
- Responsive at 360, 390, 768, 1024, 1280, 1440, 1920 px: no horizontal scroll, nothing cut off, tap targets ≥ 44 px.
  One Playwright test opens /, /command (gate passed with the e2e test code), /report and a ticket at 390×844,
  768×1024 and 1440×900, and asserts: no horizontal overflow, no console errors, the main button is in the viewport.
- Feels instant: every action gives feedback within 100 ms (pressed state, optimistic "Crew en route…", then
  reconcile with the server). No spinners; static block skeletons only.
- Copy: sentence case, human words, never ids like #3 or S15-5-10, never "undefined". Citizen screens in en/hi/mr.
- Time boxes are hard. If a stage runs over, finish the current item, drop the stage's remaining items in the
  listed drop order completely (no half-built UI), note it in DEVLOG, commit, stop.

STAGE 0: finish Stage A (30 min)
1. `git status`: keep the uncommitted Group 5 work. Keep the health-bar span fix; keep the Playwright health-bar test
   if it passes (Chromium is installed).
2. Rate limiter: CloudFront-Viewer-Address is "ip:port", so key on the IP only. Test. Commit Group 5.
3. Group 6: translate every PipelineLog stage and value, every AI label (small drip, major leak, burst, not a leak,
   self-reported) and "Repair logged" in en/hi/mr. After "done", a Result card: photo thumbnail (local preview),
   "AI: small drip · 90% sure", "Added to the D2 leak (4 reports)" or "New report in D2", priority "31 / 100",
   ticket code, [See my ticket].
4. An error boundary per route: "Something broke on this screen" + [Reload] that keeps the run id. A 404 page in the
   same style. A <title> per route, meta description, theme-color, favicon.
STOP.

STAGE 1: Command Centre, a living city (75 min). Drop order if late: h, c (lamps/zebra), i (pinch).
a. Diorama: the city on a floating ground slab: grass top, earth side faces ~18 px deep, dark soft shadow below.
b. Sky behind it follows sim time: 05:45 night navy with twinkling stars → 06:00–07:00 dawn amber → day blue →
   18:00–19:30 dusk violet → night. Three pixel clouds drift (60–90 s loops).
c. Roads: asphalt strips with white dashed centre lines, the main avenue wider, zebra crossings at junctions,
   street lamps that glow at dawn/dusk/night. Cube trees (two green blocks + trunk) swaying gently.
d. Buildings by type, iso blocks with light top / mid left / dark right faces:
   homes 2–3 floors with a black rooftop water tank whose level rises during supply; apartments 5–7 floors with
   window grids; shops 1 floor with striped awnings; landmarks: hospital (white, red cross on the roof), school
   (yellow + flag), reservoir as an elevated water tower on legs with a visible level, depot with a roll-up door.
   ~40% of windows (seeded) glow warm yellow at dawn/dusk/night.
e. Pipes: 4 px cyan core + dark outline with moving water dashes; speed follows each sector's inflow.
   X-ray: everything above ground fades to ghost outlines, ground darkens, pipes glow (wide low-opacity stroke,
   no blur filters). A suspected sector's service pipe pulses amber with drips.
f. Crew truck: iso block truck (white cab, blue tank body, dark wheels, blinking amber beacon). Drives along the
   road graph (shortest path over road nodes, never through buildings) from the depot during the ETA, parks at the
   incident with looping wrench sparks while on site, drives back after the repair.
g. Effects: burst = fountain of ~10 cyan pixel squares + a puddle growing each slot until repaired; suspected = amber
   ripple rings; confirmed = bouncing red "!"; verified = green ring burst + droplet confetti + "+1.8 lakh L/day"
   rising and fading.
h. People: 12 tiny two-block citizens walking sidewalk loops. When a phone report arrives, one appears at the spot
   with a camera-flash bubble as the pin pops in.
i. Map: drag to pan, wheel/pinch to zoom (clamped), double-click zooms in, Fit city resets, hover tooltips on desktop,
   tap selects on touch. The selected sector gets a pulsing outline.
j. Top bar: clock with a thin bar filling until the next tick; health bar coloured by value; recovered litres
   counting up; Phone button.
k. Quest cards lift on hover, score bars animate in, state changes animate (dispatch → truck icon slides in).
   Toasts slide in top right, max 3.
l. Phones (< 768 px): the map fills the screen; bottom tab bar Map · Incidents · Impact · Feed; the Next-move bar stays
   over the map; dock = Play/Pause, Step, speed cycle, and a "More" sheet. Tablet: map top 60%, rail below.
STOP.

STAGE 2: Citizen app as a game (50 min). Neel Limewash, pixel-block style. Drop order if late: f, b's animation.
a. Shell: top bar (pixel logo + language globe menu) + bottom tab bar Report · My tickets · Live city. Real routes,
   Back works, state survives a reload. On desktop: a 480 px phone-like column centred on a limewash wall with a
   faint city illustration.
b. Home: small animated iso view of the run's city (CityView art, spectator mode), "Water going to waste? Report it in
   30 seconds.", two chunky block buttons with pixel icons.
c. Report quest: step bar ① Photo ② What you see ③ Where ④ Send, Back on every step, slide transitions between
   steps. Choice cards with pixel illustrations (gushing pipe, dripping tap, weak tap, dry tap). Where: map with a
   bouncing pin and "C3, near the hospital".
d. Send: SegmentBar upload → PipelineLog as a retro terminal card → stamp animation "Report received" (or a kind
   "Not a leak") → the Result card from Stage 0.
e. Ticket: 5 nodes on a pixel road (inbox, magnifier, truck, wrench, meter). A small truck sits on the current node and
   drives forward when it advances. On "Confirmed by meters": droplet confetti + "Your report helped recover
   1.8 lakh L/day" (only when true).
f. Live city tab: the run's 16 sectors as a coloured iso grid with status words, refreshed every 5 s.
g. No points, badges or leaderboards for citizens (they would reward fake reports). The game feel comes from steps,
   motion and feedback. Write an ADR. Pixelify Sans for Latin headings; Noto Sans Devanagari 700 for Hindi/Marathi.
STOP.

STAGE 3: Landing + live platform stats (40 min). Drop order if late: e's diagram (keep the text list), b's patrol.
a. STATS#GLOBAL item updated with atomic ADD inside the API as things happen: runs started, phone reports, AI photo
   checks, incidents detected, incidents verified, litres/day recovered (added at verification), days completed.
   GET /api/stats (public, 10 s Lambda memory cache). Tests.
b. Landing: sticky nav LeakSpot · How it works · Live stats · Built on AWS · [Report a leak] [Command centre]
   (menu on phones). The hero fits the first viewport at 390×844 and 1440×900: headline + both buttons visible, the
   living city beside it (stacked on phones), its sky cycling through a day every 60 s, the truck patrolling,
   citizens walking.
c. Live stats tiles count up and refresh every 10 s, "updated 5 s ago", and the note "Runs use a simulated city.
   Phone reports and AI checks are real."
d. How it works: 4 illustrated steps: meters notice → citizens confirm → fixed score ranks → crew fixes, meters verify.
e. Built on AWS: diagram phone/browser → CloudFront → S3 site | Lambda URL → DynamoDB, S3 photos, Amazon Bedrock
   (Nova 2 Lite); one line per service; "Infrastructure as code with AWS CDK". Footer "Simulated city · real reports".
STOP.

STAGE 4: "Test the detector" + final check (30 min, only when I say go)
a. Impact tab: sector + size (small/medium/large) + hidden/visible → [Inject leak]. Stored in RunState (injectedLeaks);
   the simulation adds its flow from the next tick; repair works by pin proximity as usual. The detector reads only
   meter readings and reports, never injectedLeaks (add a test that fails if it does). Feed: "Test leak injected in
   A3 (hidden). Watch the meters." Panel note: medium/large are flagged within ~3 slots; small may stay below meter
   resolution.
b. Final pass: the full scenario at 4× on the dev server, the phone flow with a real photo, the Playwright viewport
   test, npm run verify, smoke PASS. Update DEVLOG and DECISIONS.
STOP.
