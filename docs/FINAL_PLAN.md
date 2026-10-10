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

STAGE 1-3D: Command Centre, a real 3D city (hard cap 100 min). REPLACES the old Stage 1.
User verdict on the SVG map: "weird boxes and small squares, pipes don't reach the blocks, looks like a broken
simulation, numbers unreadable." Commit after each part. STOP after 1a for a screenshot check; then 1b–1d and STOP.

PART 0: readable numbers (everywhere, 10 min)
- Pixelify Sans ONLY for the logo and headings that contain no digits. Every id, number, score, clock and
  money/litre value uses JetBrains Mono with font-variant-numeric: tabular-nums (C3 was read as "03",
  538.6 as "838.6"). Map/overlay labels ≥ 13 px, panels ≥ 14 px, contrast ≥ 4.5:1.

PART 1a: City3D scene (react-three-fiber, as in world-3d.md, with these changes)
- Check three / @react-three/fiber (v9 for React 19) / @react-three/drei are installed; pin exact versions. City3D is
  React.lazy-loaded (citizen bundle unaffected), shown with a TankGauge boot loader. If WebGL is missing or City3D throws
  (error boundary), or ?view=2d is in the URL, render the existing SVG CityView. Same props/callbacks as CityView, so
  CommandCentre logic doesn't change.
- Orthographic iso camera; drei MapControls: drag/one-finger pan, wheel/pinch zoom, both clamped to the city; rotation in
  90° steps (Q/E + two HUD buttons, 300 ms). Fit city resets. Click/hover via r3f pointer events.
- Light by sim time: hemisphere light + directional sun (colour, angle, intensity follow the clock: dawn warm and low,
  day white and high, dusk orange, night dim blue moonlight). The CSS sky gradient sits behind a transparent canvas; drei
  <Stars> at night. Soft shadows from the sun on screens ≥ 1024 px with > 4 CPU cores; off on phones.
- Ground: a floating diorama slab (grass top, earth sides). Zone ground tints subtle (A ochre, B terracotta, C slate,
  D indigo) so zones still read.
- Roads: asphalt with dashed white lane lines (instanced), raised light-grey footpaths, zebra crossings at junctions,
  the main avenue wider.
- Buildings, all from @leakspot/core/world positions (seeded, deterministic), with Indian-city variety:
  independent houses 2–3 floors in pastel limewash colours with parapet, small balcony and a black rooftop water tank;
  apartment towers 6–8 floors with window grids, rooftop tank and lift room; one-floor shop rows with coloured awnings;
  windows as instanced panes that glow warm yellow (~40%, seeded) at dawn/dusk/night.
  Landmarks: hospital (white, red cross on roof and wall, ambulance parked), school (yellow, flag, playground field),
  a park/garden with trees, benches and a pond, the reservoir as an elevated water tower on 4 legs whose water level
  moves, the depot/pump house with the crew truck parked.
- Trees: instanced low-poly (trunk + 2–3 stacked canopies) along streets and in the park.
- Labels with drei <Html>, mono font, chip background: only for non-Normal sectors, the hovered/selected sector, incident
  markers and report pins. Hover a sector → emissive highlight + the water-balance tooltip. Click → the existing sector panel.
STOP: list what to look at on localhost.

PART 1b: water, crew and effects
- Pipes as real tubes that CONNECT: reservoir → trunk main → zone mains → a service pipe to each sector inlet meter (a
  small meter box with a dial) → a lateral to EVERY building. Normal view: thin cyan utility lines on the ground along
  the roads and laterals. X-ray (key X): ground, roads and buildings fade to 12% over 400 ms; pipes glow, with flow shown
  by an animated stripe texture (texture.offset in useFrame), speed ∝ the sector's inflow, still in dry hours.
- Suspected sector: pulsing amber ground ring + amber drip particles along its service pipe (never a precise point).
- Visible leak (visibleLeaks): fountain of ~40 instanced cyan cubes with simple ballistic motion + a puddle disc that
  grows per slot and drains after repair. Confirmed incident: bouncing red "!" marker.
- Crew truck (cab + blue tank body + blinking amber beacon): shortest path over the road graph from the depot during
  the ETA, facing its direction, wrench-spark particles while on site, drives back after repair.
- Verified: expanding green ring + Html text "+1.8 lakh L/day" rising and fading.
- Report pins: a post with a camera/tap chip ("Phone photo · small drip 90%"; scripted ones grey "Simulated report").
  When a phone report arrives, a person appears at the spot with a white camera flash.

PART 1c: life (drop this first if late)
- 10–12 instanced cars and yellow-green auto-rickshaws looping on the roads; traffic lights at the main junctions
  cycling red/amber/green every 6 s; cars wait at red if simple, otherwise just slow down near junctions.
- 20 instanced citizens walking footpath loops with a small bob. Street lamps glow at dawn/dusk/night.
- Reduced motion: no traffic, people or particles.

PART 1d: landing hero
- The landing hero uses City3D in spectator mode (no labels, slow quarter-turn every 20 s, sky cycling through a day
  every 60 s). Headline + both buttons visible above the fold at 390×844 and 1440×900 (stacked on phones).
  [Note: the original prompt text was cut off at "above the fold at"; completed per the global responsive rule.]
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
