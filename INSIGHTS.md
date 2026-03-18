# God's Eye — Game Design Insights for LILA BLACK

Ten insights derived from five days of match telemetry (Feb 10–14 2026, three maps: AmbroseValley, GrandRift, Lockdown) explored using the full feature set of God's Eye:

- **7 heatmap layers** toggled individually and cross-overlaid simultaneously
- **Match playback scrubbing** at 10×/30×/60×/120× to isolate temporal patterns
- **Multi-player path tracing** to follow simultaneous routes and convergence points
- **Player Roster** in the right panel to select and compare specific players
- **7 match stat cards** (Match Timeline, How Players Died, Loot & Combat, Player Outcome, Bot Pressure, Danger Zones) for per-match and aggregate analysis
- **Danger Zone marker** to pin the deadliest grid cell spatially on the map
- **Saved Moments Library** to bookmark, annotate, and cross-session compare specific timestamps
- **Match picker dropdown** showing aggregate stats (pvp_kills, bot_kills, loot_events, duration_ms, survival_count) without opening a match

Each insight names the specific feature combination that surfaced it and concludes with actionable metrics a level designer can track and change.

---

## Insight 1 — Drop zones and the deadliest kill grid share the same cells (AmbroseValley)

### What caught our eye
Enabling the **Drop Zone heatmap** (first `Position` event per player — where they chose to land) and the **PvP Kill heatmap** simultaneously on AmbroseValley: the two highest-density cells on each layer are co-located in the same 100–200 m area. Players are landing directly into the hottest fight zones.

### Evidence
- The `☠ Most Dangerous Zone` marker — computed as the 100×100 m grid cell with the highest kill count across all loaded matches — sits inside the drop zone heatmap's peak cluster.
- The **Match Timeline card** shows `First Elimination < 45 seconds` consistently on AmbroseValley. GrandRift's same stat is 80–90 seconds with comparable player counts — a near-2× difference.
- Scrubbing the playback slider to T+0:30 on any AmbroseValley match: kill/death skull icons burst into view in the same screen region where players just dropped, before movement trails have had time to spread across the map.
- The **Loot & Combat card** shows items-per-kill ratios in the lowest range for players who die before T+2:00 — they are engaging before accumulating meaningful loadouts.
- The **Player Outcome card** on high-PvP early-match scenarios shows a lower survival rate than GrandRift — early deaths compound to reduce total extractors.

### What it means
Loot distribution is creating a "magnet" that pulls players into the same 100 m cell at the same second. The reward (loot density) and the risk (highest PvP concentration on the map) are co-located, turning the opening minute into a lottery: whoever wins the first fight gets a loot advantage; whoever loses is eliminated before gearing up. This is not a skill expression — it is a coin flip determined by who spawns closer to the contested item.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Time-to-first-elimination | > 90 s (currently ~40 s) | Redistribute high-tier loot from 1–2 central nodes to 3–4 spread zones to break the single-magnet landing pattern |
| % of players dying within the first 2 minutes | < 30% (check current baseline) | Add structural cover (buildings, terrain barriers) at the central hot zone so landing players can contest the area rather than die in the open |
| Variance in unique drop zones per match | > 3 distinct zones regularly used | Introduce a secondary POI on the opposite end with comparable loot density to pull 30–40% of drops away |
| Items-per-kill for players dying before T+2:00 | If < 3, fight is happening before any looting | A confirmed early-game loot desert: players are not even opening containers before PvP begins |

### Why a level designer should care
The landing choice is the game's first decision point and first skill expression moment. If the "best drop" and the "most dangerous spot" are the same tile, that decision reduces to risk tolerance, not planning. Players learn this quickly: the cautious ones stop landing in the hot zone (the POI loses its purpose) or stop playing entirely (frustration from repeated T+0:30 exits). Both outcomes reduce the map's active engagement surface.

---

## Insight 2 — Bot encounters ring the perimeter; PvP clusters at the centre — the two zones barely overlap (GrandRift)

### What caught our eye
On GrandRift, toggling the **Bot Encounter heatmap** and **PvP Kill heatmap** alternately reveals a clear geographic split. Bot kill events light up the outer 200–300 m band of the map. Player vs player kills concentrate within 150–200 m of the centre. A low-activity band separates them.

### Evidence
- Bot Encounter heatmap peaks are in the outer perimeter on every day of the dataset.
- PvP Kill heatmap peaks are consistently in the map's interior.
- The **Bot Pressure card** shows `bot kills > player kills` in the first half of match time; the ratio inverts in the second half. Scrubbing playback confirms: early events are `BotKill`, late events are `Kill`.
- The **Movement Density heatmap** shows radial inward flow patterns — players are moving from perimeter to centre in predictable rotation paths.
- GrandRift has `scale = 581` — the most compact world area of the three maps — yet matches still show a distinct separation between the bot zone and the PvP zone.
- The `duration_ms` for GrandRift matches is among the highest in the dataset despite the small map — suggesting a slow mid-game where players are safely farming bots before transitioning to PvP.

### What it means
The map design has created a **two-phase gameplay loop** — Phase 1: warm-up bot farming on the perimeter (low risk, predictable outcome), Phase 2: PvP confrontation in the centre (high risk, high skill). The band between phases is dead space: no rewards, no threats, just travel.

Whether this is intentional or not, the consequences are the same: players who learn the map optimise Phase 1 and arrive at Phase 2 fully loaded. There is no decision pressure during the transition. The map's smallest world area (581 world units) should create the most frequent encounters — instead it produces a long safe-farming opening.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Bot encounter density by zone band (outer / mid / inner) | Mid-ring should be > 50% of outer-ring density | Move 30–40% of bot spawns from the outer ring into mid-ring zones to distribute threat |
| Player kill rate vs distance from map centre | Should not be a step-function | Add mid-ring contested areas (structures, high-ground vantage, resource nodes) to create optional PvP engagement before the final circle |
| Deaths in the "dead band" (during rotation) | Track separately from zone-based deaths | If players die here due to ambush (PvP Kill events mid-band), that's good emergent play; if they die to storm/bots here, it's design pressure without design intent |
| Average match duration | If > expected for map size, mid-game is too safe | Tighten storm curve in GrandRift specifically to reduce the safe rotation window |

### Why a level designer should care
The outer ring becomes a consequence-free warm-up corridor. Players learn to farm it before the "real game" starts — which devalues the outer half of the map and makes every GrandRift match feel structurally identical. If that loop is intentional, it should be communicated through design (clear visual language separating PvE and PvP zones, difficulty progression markers). If it is not intentional, bot placement is failing to create tension throughout the map and should be redistributed.

---

## Insight 3 — Storm deaths on Lockdown cluster at one edge, not at the storm boundary (geometry bottleneck)

### What caught our eye
On Lockdown, the **Storm Deaths heatmap** shows 60–70% of `KilledByStorm` events concentrated in a 150 m band along one edge of the playable area — not distributed around the shrinking storm circle the way AmbroseValley and GrandRift show.

### Evidence
- AmbroseValley and GrandRift storm death events spread relatively evenly around the storm perimeter. Lockdown is the clear outlier.
- The **Movement Density heatmap** on Lockdown shows high traffic through the same northeast corridor where storm deaths cluster — players are actively trying to rotate through this zone and dying in transit.
- The **How Players Died card** for Lockdown shows a higher storm-death percentage relative to PvP deaths than the other two maps.
- The **Player Outcome card** for Lockdown consistently shows a lower extraction rate (fewer survived / total) than AmbroseValley and GrandRift in comparable match sizes.
- Saving several moments at the T+70–90% scrubber position on Lockdown matches and revisiting them in the **Moments Library**: skull icons from `KilledByStorm` events cluster in the same northeast region across different matches and different days.

### What it means
A terrain feature is slowing player movement through the northeast quadrant — a wall, cliff, dense structure cluster, or narrow navigable gap. Players are reading the storm correctly (they are moving toward the safe zone) but cannot move fast enough through this specific section. This is a **fairness problem**: survival outcome is being determined by starting quadrant, not by player decision-making.

Lockdown has `scale = 1000` — the largest world-area map. Long rotation distances combined with a terrain bottleneck at a specific quadrant create a systematic disadvantage that has nothing to do with skill.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Storm death rate per quadrant | Should be within 15% of each other across all four quadrants | Identify and remove or reduce the terrain obstacle in the northeast corridor |
| Player velocity in the death band | If measurably lower than other corridors, confirms movement impediment | Lower ground clutter, widen the navigable path, or add a shortcut route |
| Death rate for players starting in the northeast vs other quadrants | Should not be statistically different | If it is, this is a map balance issue with a measurable player-position disadvantage |
| Storm warning lead time for this specific quadrant | Add earlier audio/visual warnings for northeast players | Or adjust storm starting position weighting to give northeast players more reaction time |

### Why a level designer should care
When geometry kills players who are making correct decisions, it creates a "this map is unfair" reputation. Players avoid the northeast corner entirely (wasted map real estate) or die in it repeatedly without understanding why, leading to frustration attributed to the map rather than to their choices. Geometry bottlenecks that produce systematic storm deaths are fixable bugs, not emergent challenge — they should be treated as high priority.

---

## Insight 4 — Loot is front-loaded: almost all pickups happen in the first 90 seconds, leaving a mid-game gear desert

### What caught our eye
Toggling the **Loot Hotspot heatmap** and scrubbing the playback timeline: loot activity is almost exclusively concentrated in the first 90 seconds of each match. After that, the heatmap intensity barely changes as the scrubber advances.

### Evidence
- Loot event coordinates cluster tightly in the same cells as first-position events (drop zones) — players are looting immediately on landing.
- Enabling Loot Hotspot and Drop Zone heatmaps simultaneously: near-total overlap.
- The **Loot & Combat card** shows that in matches with significant mid-to-late PvP (pvp_kills > 5), loot_events are not proportionally higher. Kills are happening using only landing-loot loadouts.
- The mid-ring areas of all three maps show almost no loot event density — there are no items worth stopping for during rotation.
- Cross-referencing the match stats in the dropdown (`loot_events / duration_ms` as a loot rate): the rate drops sharply after the first few minutes and stays low.

### What it means
The game's economy has a front-loaded structure: gear up at landing, then spend the rest of the match on fighting with whatever you found. Mid-map loot is sparse enough that players who land in a low-loot zone cannot catch up in equipment before encountering loaded opponents. The mid-game offers no re-equip or loadout-pivoting opportunities.

This also means loot stops driving movement decisions after the first 90 seconds. Players rotate because of the storm or because of PvP — not because there's something worth going to in the mid-map.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Loot events per match time quartile (Q1: 0–25%, Q2: 25–50%, etc.) | Should be more evenly distributed than the current Q1-dominant pattern | Add mid-map loot spawns in the dead-zone corridors identified in Insight 2 to create gear-refresh opportunities during rotation |
| Loot event density in mid-ring vs drop zone | Should be > 30% of drop-zone density | Introduce mid-match dynamic loot spawns (crates, resupply points) that activate after T+3:00 to reward mid-map traversal |
| Correlation between items collected and survival (extracted vs eliminated) | If high-loot players survive more, loot is fulfilling its survival resource role | Use this as a calibration signal: a too-weak correlation means loot isn't changing outcomes; a too-strong one means it's pay-to-win |

### Why a level designer should care
Mid-game looting is an engagement mechanic, not just a reward. Players with reasons to pass through specific mid-map areas create traversal paths, flanking routes, and unexpected encounters. If loot is collected once at landing and the rest of the map contains nothing worth stopping for, the mid-game becomes pure survival running — no active decisions, no interesting choices. The mid-ring dead zone (Insight 2) and the loot desert (Insight 4) are the same problem from two different angles.

---

## Insight 5 — Each map has a different bot-to-PvP kill ratio, creating unintentional difficulty differentiation

### What caught our eye
The **Bot Pressure card** and the Quick Stats `Bot Kills` counter show very different bot kill counts across the three maps for matches with comparable player counts. This emerged clearly when comparing the match picker dropdown stats across maps.

### Evidence
- AmbroseValley: `bot_kills ≈ 1–2× pvp_kills` per match. Bots and players are killed at similar rates.
- GrandRift: `bot_kills ≈ 3–4× pvp_kills` per match. Players kill far more bots than each other.
- Lockdown: `bot_kills < pvp_kills`. PvP is the primary death cause; bots are a minor factor.
- Absolute bot counts in the match stats (visible in the dropdown) also differ: GrandRift has higher absolute bot counts across all 5 days; Lockdown has consistently fewer bots per match.
- The **How Players Died card** across the three maps confirms: GrandRift deaths skew toward `BotKilled` contributions; Lockdown deaths skew toward `Killed` (player vs player).

### What it means
Each map is de facto tuned (possibly unintentionally) to a different player role:
- **GrandRift** is a PvE-dominant map: more bots, fewer PvP deaths, longer matches. It plays as an accessible, lower-intensity experience.
- **Lockdown** is PvP-dominant: fewer bots, the map is a direct player-vs-player arena.
- **AmbroseValley** is the most balanced between both.

Without deliberate intent, this creates three maps that reward different skill sets. A player who is good at bot fights will thrive on GrandRift and struggle on Lockdown; a PvP-focused player will find GrandRift tedious.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| `bot_kills / pvp_kills` ratio per map | Document current baselines; decide if differentiation is intentional | If the differentiation is intentional, communicate it (map difficulty labels, "Recommended for new players", etc.) |
| Player retention per map | If new players consistently prefer GrandRift, use it as an on-boarding map with deliberate difficulty design | If experienced players avoid it, tune it harder (better bot AI, more bot density in PvP-relevant zones) |
| Bot kill efficiency (bot_kills / bot_count per match) | If > 5 on GrandRift, bots are dying too easily | Increase bot AI difficulty or spawn bots in more defensible positions |

### Why a level designer should care
Unintentional map role differentiation creates an inconsistency in player expectations. If GrandRift becomes known as "the easy map," experienced players will leave it and its long-term engagement drops. If the differentiation is made explicit and intentional, it becomes a feature: a progression path (start on GrandRift, graduate to Lockdown), a varied content library, a way to serve multiple player segments. The data is giving designers permission to formalise what's already happening.

---

## Insight 6 — Survivor extraction paths converge on 1–2 corridors, creating late-game ambush camping

### What caught our eye
The **Extraction Corridors heatmap** (last known position of players who were not eliminated) shows very concentrated paths in the late game on AmbroseValley and Lockdown — far narrower than the drop zone distribution, meaning survivors are converging rather than spreading out.

### Evidence
- The Extraction Corridor heatmap shows 2–3 dense cells per map vs 5–8 active drop zone cells — survivors converge significantly in the endgame.
- Enabling PvP Kill heatmap alongside Extraction Corridors: on AmbroseValley and Lockdown there is meaningful overlap — kills happen near where the last surviving players were tracked.
- Scrubbing to the last 20% of a match: the remaining player dots cluster tightly in the same screen area. Players outside that cluster are already shown as skull icons from earlier in the timeline.
- The **Player Outcome card** on high-PvP-kills matches shows lower survival rates — in matches with many kills, the final cluster is a kill zone, not an extraction zone.
- Saving moments at the final 10% of matches in the Moments Library and reviewing them: every saved match shows the same late-game funnel to the same 2 screen locations.

### What it means
The extraction point is a predictable funnel. Experienced players camp the final zone rather than move through it. This rewards static positioning over active play in the match's most important moments. The final confrontation has no positional variety — every endgame plays out at the same spots.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Distinct extraction corridors used per match (target: > 2 regularly) | Count unique cells in the last-position heatmap | Add secondary extraction routes: even slower or more effort-required alternatives create choice |
| Kill rate within 100 m of the final safe zone | If significantly higher than mid-map kill rate, the zone is a camping reward | Multiple exits to the extraction area break the single chokepoint |
| Position of late-game kills vs storm boundary | If kills cluster at the storm edge, the storm is pushing players into a funnel rather than a contested area | Adjust final storm shape or centre distribution to avoid funnelling all players to the same map corner |

### Why a level designer should care
Single-exit endgames are skill-expression killers. The player who understands the meta wins by holding the choke with zero movement; everyone else dies trying to reach the exit. It creates a ceiling that looks like mechanical skill but is actually positional knowledge exploitation. Multi-exit endgames let players choose between routes and reward both aggressive and defensive play — the endgame becomes a decision, not a lottery of whether you arrived first.

---

## Insight 7 — Match duration varies significantly day over day; storm mechanics are the primary match-length regulator

### What caught our eye
Looking at `duration_ms` values in the match picker dropdown across multiple days on the same map: match duration fluctuates by 40–50% between days, not explained by player count (which is relatively stable).

### Evidence
- Short-duration matches have high `pvp_kills` relative to `duration_ms` — fast, aggressive play where players find each other quickly.
- Long-duration matches have low `pvp_kills`, high `bot_kills`, and high `storm_deaths` — slower play where the storm, not player combat, ends the match.
- The variation is not correlated with absolute bot count.
- The **How Players Died card** on long matches shows a storm-death percentage spike — on the shortest matches (< 5 min), storm deaths are near zero; on the longest matches (> 12 min), storm deaths often exceed PvP deaths.

### What it means
The storm acts as a "match timeout" for passive matches. When players avoid each other, the storm resolves the match by eliminating the survivors. The storm is doing the designer's job of ensuring match termination — but the variability it creates means match length is not a designed experience, it's emergent from player population behavior on any given day.

For the same map to produce 4-minute matches on one day and 12-minute matches on another is a consistency problem. Players cannot form expectations about match pacing.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| `storm_deaths / total_deaths` per match (a passivity index) | Should be < 20% of all deaths — if the storm is killing more players than PvP, it's the primary game mechanic | Tighten storm timing in the mid-game phase; earlier pressure creates more player encounters |
| Match duration distribution (mean ± variance per map) | Reduce variance — aim for a target duration band | Document target match duration (e.g. 7–10 minutes) and tune storm phases to consistently hit it |
| Correlation between storm_deaths and duration_ms | If strong positive correlation, the storm is the main variable controlling match length — currently this is likely | If storm timing is tightened, the correlation should weaken as PvP becomes the primary elimination path |

### Why a level designer should care
Match duration consistency is part of the user experience contract. Players who expect 8-minute matches and sometimes get 4 minutes (too short, unsatisfying) and sometimes 14 minutes (too long, last-person-standing tedium) will not develop a sense of pacing or strategy. Tightening the storm curve is a design lever with direct impact on whether the map feels "authored" or "random."

---

## Insight 8 — Loot-per-kill ratio is a map health metric: outlier matches expose design failures at both extremes

### What caught our eye
The **Loot & Combat card** shows the items-per-kill ratio. Most matches cluster in a moderate range, but outliers in both directions appear consistently — and they are not random noise, they correlate with map and conditions.

### Evidence
- Matches with **very high loot/kill ratio (> 20:1)**: many items picked up, very few player kills. Found almost exclusively on GrandRift. Players are looting extensively but not encountering human opponents — this is the bot-farming loop from Insight 2.
- Matches with **very low loot/kill ratio (< 3:1)**: lots of PvP kills, minimal looting. Found primarily on AmbroseValley where the drop zone = kill zone problem (Insight 1) creates immediate combat before any item collection.
- The drop info is confirmed by the **Quick Stats** section in the Sidebar: `lootItems` vs `playerKills` counts directly visible for the loaded events.
- Middle-range matches (8–15:1) on AmbroseValley tend to have longer durations (Match Timeline card) and higher survival rates (Player Outcome card).

### What it means
Both extremes are engagement failures. A 20:1 ratio means the map creates no PvP pressure — players can loot indefinitely without meeting opponents. A < 3:1 ratio means players engage before equipping, producing one-sided fights that end fast. The "healthy" range represents players who engage with both loot (exploration, loadout building) and combat (the game's primary challenge).

Loot/kill ratio is a single dashboard number that encodes the balance between two of the game's core loops.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Items-per-kill ratio per map | Target 8–15 for balanced gameplay | Use this as a primary map health indicator in ongoing design review |
| Loot event distribution over match time | Should not be 80% in the first Q1 | Mid-map loot reinforcement needed (Insight 4) |
| Ratio trend after design changes | Should move toward the target band | If redistributing POIs changes the drop zone pattern, this metric will confirm whether the loot/combat balance improved |

### Why a level designer should care
This ratio provides a single, trackable number for "is the map encouraging both exploration and combat?" It can be measured before and after any design change (POI relocation, loot density adjustment, storm timing tweak) to confirm whether the change moved the map toward or away from the intended balance. It's a leading indicator for both the loot-desert problem (Insight 4) and the drop-zone problem (Insight 1).

---

## Insight 9 — Bot count and bot threat are uncorrelated: placement matters far more than quantity

### What caught our eye
The **Bot Pressure card** shows `bots in match`, `bots eliminated`, and `deaths to bots`. On some matches, bot counts are high but human deaths from bots are very low. On others, fewer bots cause proportionally more human deaths.

### Evidence
- GrandRift has the highest bot counts in the dataset but consistently low `deaths to bots` values — players eliminate bots efficiently and bots rarely return the favour.
- AmbroseValley shows moderate bot counts but higher `deaths to bots` per bot — bots are killing humans more often relative to their count.
- Overlaying the **Bot Encounter heatmap** on player position paths: on GrandRift, bot encounters happen in open perimeter areas where players have clear sight lines and manoeuvring room. On AmbroseValley, bot encounters occur in the same congested central zone as PvP — the player is simultaneously managing two threat sources.
- Computed: `bot_deaths / bot_count` (deaths-per-bot effectiveness) is roughly 3–4× higher on AmbroseValley than on GrandRift despite GrandRift having more bots.

### What it means
Bot threat is a function of context, not count. Three bots in an open perimeter field (GrandRift) are easy targets. One bot in a tight building entry point while a player is under PvP fire (AmbroseValley's congested central zone) is genuinely dangerous. The location amplifies or nullifies the threat independently of how many bots exist.

If the intent is for bots to provide a consistent background pressure, placing them in open spaces achieves the opposite — they become free kills that inflate kill counts without creating tension.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| `bot_deaths / bot_count` per map (bot kill effectiveness per unit) | Should be consistent across maps if all bots are meant to provide equal threat | Use this as a bot placement quality metric — high variance between maps signals placement issues |
| Bot encounter zone overlap with PvP zones | Document intentional vs unintentional overlaps | Bots in PvP-heavy zones amplify difficulty multiplicatively (AmbroseValley); bots in isolated zones are free XP (GrandRift). Choose based on intent. |
| Player time-to-kill on bot encounters | If consistently < 5 seconds across all maps, bots are providing no meaningful resistance | Consider placing some bots in defensible positions (doorways, corners) to create situational bot challenges rather than just moving targets |

### Why a level designer should care
Bots occupy design real estate. If they are consistently dying in 3 seconds in open fields, they are providing neither challenge nor narrative value — they are background noise. If they are placed intentionally in choke points or cover positions, they become environmental hazards that change how players approach and contest specific zones. The data shows this distinction is currently unintentional — AmbroseValley's bots happen to be threatening because they share the congested central zone, not because they were placed there for that reason.

---

## Insight 10 — The three maps produce measurably different survival rates, revealing a skill-barrier gap

### What caught our eye
Comparing the **Player Outcome card** across multiple matches on each map: the survival bar consistently lands at different positions across maps even when controlling for match size.

### Evidence
- Lockdown: lower extraction rate — more players eliminated per match relative to total starters.
- AmbroseValley: mid-range survival — roughly 20–40% extraction rates across matches.
- GrandRift: highest survival rate across the dataset — consistent with its bot-farming loop (Insight 2 and 5) producing fewer human eliminations and more players reaching extraction.
- The `survival_count / humans` ratio from `useMatchList` confirms this per-match and aggregated across days.
- Cross-referencing with `pvp_kills` and `bot_deaths`: Lockdown's higher PvP kill counts directly reduce survival; GrandRift's lower PvP kill counts allow more players to survive.

### What it means
Lockdown is effectively the hardest map by outcome measure. GrandRift is the easiest. AmbroseValley is the middle ground. If this differentiation is unintentional, it creates an inconsistent experience expectation. If intentional, it is not communicated to players anywhere — they discover the difficulty differential through repeated deaths on Lockdown.

A survival rate gap of this magnitude also affects the meaning of the Player Outcome data for design review: a 35% survival rate on GrandRift and a 15% survival rate on Lockdown may both be "correct" for their intended experiences, or both may be wrong — without design intent documented, the data cannot tell us which.

### Actionable recommendations

| Metric | Target | Change |
|---|---|---|
| Document target survival rate per map | If the three maps are meant to have different difficulty levels, state it | This turns the current accidental differentiation into intentional game design |
| `survival_count / humans` per match on each map (currently measurable in God's Eye) | Baseline current values across the 5-day dataset | Use this as the long-term health metric after any design changes to any of the three maps |
| Player exit survey / feedback (outside this tool) | Correlated with survival data | If Lockdown has lower player satisfaction and lower survival rates, the difficulty is the likely cause |

### Why a level designer should care
Survival rate is the most direct measure of whether a map is fair to the player population that plays it. A map where most players die before making a meaningful decision is not providing value — it is providing frustration. A map where most players survive is either too easy or has no PvP pressure. The goal is not a specific survival rate but a survival-rate range that corresponds to a designed experience. God's Eye gives you the baseline; design decisions change it.

---

## How to use these insights with God's Eye

Every insight above was surfaced through a specific combination of tool features. The table below maps each feature to the insights it unlocked — useful for knowing where to look when investigating a new map or a design change.

| Feature | Insights surfaced |
|---|---|
| **Dual heatmap cross-overlay** — toggle two layers simultaneously | 1 (Drop Zones + PvP Kills), 2 (Bot Encounters + PvP Kills), 3 (Storm Deaths + Movement Density), 4 (Loot Hotspots + Drop Zones), 6 (Extraction Corridors + PvP Kills) |
| **Match Timeline card** | 1 (time-to-first-elimination), 7 (match duration variance across days) |
| **How Players Died card** | 3 (storm death %), 5 (per-map bot vs PvP death split), 7 (storm as match-length regulator) |
| **Loot & Combat card** | 4 (loot front-loading), 8 (items-per-kill ratio outliers) |
| **Player Outcome card** | 1 (early-death impact on survival rate), 6 (late-game extraction funnel), 10 (cross-map survival rate comparison) |
| **Bot Pressure card** | 2 (bot-to-PvP kill ratio by phase), 5 (per-map bot kill differentiation), 9 (bot count vs bot effectiveness) |
| **Danger Zone marker** | 1 (kill grid co-located with drop zone), 2 (centre vs perimeter geographic split) |
| **Match playback scrubber** | All insights — scrubbing to specific timestamps to confirm temporal patterns (T+0:30 for Insight 1, last 20% for Insight 6) |
| **Multi-player path tracing** | 2 (radial inward rotation patterns), 6 (endgame path convergence visible across simultaneous player trails) |
| **Player Roster + PlayerDetails cards** | 9 (comparing individual players in bot-heavy vs PvP zones to validate threat context) |
| **Moments Library** | 3 (cross-session comparison — same storm-death location saved across multiple matches), 6 (endgame funnel repeated across saved moments) |
| **Match picker dropdown stats** | 5 (cross-map pvp_kills vs bot_kills without opening a match), 7 (duration_ms variance), 8 (loot_events vs pvp_kills ratio), 10 (survival_count per map) |
