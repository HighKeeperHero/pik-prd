// ============================================================
// LandmarkService — Sprint 25
// Landmarks + Lore Discovery system
//
// Endpoints wired in landmark.controller.ts:
//   GET  /api/landmarks/nearby?lat=&lon=&root_id=
//   POST /api/landmarks/discover          { root_id, landmark_id }
//   POST /api/landmarks/bootstrap         (creates tables)
//   POST /api/landmarks/seed              (inserts 20 records)
//
// Fragment storage: hardcoded canonical v4 lookup (LANDMARK_FRAGMENTS).
// Keeps fragment text out of DB — matches pik.ts narrative array pattern.
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NearbyLandmark {
  landmark_id: string;
  name: string;
  region: string;
  tier: number;
  type: string;           // 'hv_venue' | 'public' | 'operator'
  lat: number;
  lon: number;
  distance_meters: number;
  radius_meters: number;
  visits: number;         // 0 | 1 | 2 | 3 (how many fragments the hero has)
  fragment_index: number | null;  // next fragment to earn (1–3), null if complete
}

export interface DiscoverResult {
  landmark_id: string;
  landmark_name: string;
  fragment_index: number;
  fragment_text: string;
  visits_total: number;   // total fragments earned including this one
  complete: boolean;      // true when visits_total === 3
}

// ── Haversine distance (meters) ───────────────────────────────────────────────

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Canonical fragment library (v4 approved) ─────────────────────────────────
// Key = landmark_id (slug). Value = [fragment_1, fragment_2, fragment_3].

const LANDMARK_FRAGMENTS: Record<string, [string, string, string]> = {
  'wellspring-meadows': [
    `The Druids do not worship the Great Tree. They are of it. This distinction matters. Worship implies distance — a supplicant below something above. The Dryad Druids have no such separation. According to their oldest teaching, the first of their kind did not walk to the Great Tree; they grew from its roots. Their legs were once roots. Their arms, branches. The Great Tree called them forth the same way it calls forth any sapling — out of darkness, toward the sun.`,
    `The Wellspring Meadows exist at the base of the Great Tree and are used exclusively for anointing rituals. On nights of the full moon, when the Great Tree's magic is most potent, initiates drink of its sap and enter the Inner Trunk — a place of powerful illusion where the Tree itself decides whether they are ready. Those who fail are expelled, often unconscious. Those who succeed receive a token from the Tree's roots and return changed. The ritual has no fixed outcome. The Tree determines the role.`,
    `The Conclave Druids have maintained unbroken presence at the Wellspring Meadows for as long as any record exists. The oldest record describes a ritual indistinguishable from the current one — the same sap, the same Inner Trunk, the same full moon, the same silence before the testing begins. What changes is the initiates. What does not change is the Tree. The Druids speak of this continuity without sentimentality: the Great Tree does not require their gratitude, only their attention. The attention is the protection. The protection is the attention. Whether this is philosophy or theology depends on who is asked. The Great Oak Shaman considers the question unanswerable and therefore unimportant.`,
  ],
  'hollow-root': [
    `In the Wylder Woods, structures do not stand long. The land absorbs them — roots find foundations, moss claims walls, wind dismantles anything that does not flex. The Hollow Root is one of the few locations in the Wylds that has been used continuously across multiple generations, precisely because it was never built. It is a natural formation: a root system so large it created a chamber beneath a hill, open on one side, carved by nothing but time.`,
    `The Druids use the Hollow Root as a waystation for those who travel through the deep Wylds — a place to shelter, rest, and take stock. What makes it significant is what it contains: a marking system carved into the root walls over centuries that functions as a map, a history, and a warning system simultaneously. Anyone who knows the Druidic symbology can read the last three hundred years of Veil activity in this region by examining the walls. Anyone who does not know the symbology will see only abstract patterns. This was intentional.`,
    `During Verdantine, when the Anima Nova festival marks the spring equinox and life flourishes across the Wylds, the Hollow Root fills with the scent of flowering root-growth from the Great Tree's network. Druids make a practice of opening the Root's southern facing during this month to let the fragrance travel. It is said that the scent carries a trace of the Great Tree's magic — that it has, on documented occasions, caused Veil Tears in the immediate vicinity to narrow without any hero present to seal them. The Druids have not explained this. They have noted it.`,
  ],
  'grimnirs-gateway': [
    `Eighty years ago, Mt. Akthum in the Desolate Peaks erupted without warning. Fire rained into the Wylds. The northern settlement of Karaphet was consumed before any word could reach it. When the Conclave Druids understood the scope of what was happening, they sent riders to Kingvale and Lochmaw simultaneously — the first time in living memory that the Wylds had requested aid from both. The alliance that formed in response still shapes the politics of the continent.`,
    `The Druids needed a mason to turn stone into a totem capable of creating an essence barrier across the mountain passes — something to contain the volcanic toxins before they killed the continent. The mason they needed was Grinmir of Lochmaw, who had retreated from the world after the Mad King's reign cost him his family. He was found at the Flintlock and Saber tavern in Lochmaw's dock district, working his way through his remaining years one pint at a time. It took a Corsair, a Kingvale envoy, and two Dryad acolytes to change his mind. The record suggests the Corsair was most persuasive.`,
    `Grinmir said no twice. On the third request — delivered not by the Kingvale envoy or the Druid acolytes but by the Corsair, who understood that a man drinking himself to death needs to be given a reason to be useful, not a reason to be noble — he put down his pint and stood up. He arrived at the Conclave with nothing but his tools, which he had kept in working order despite everything. The barrier he built required turning the Desolate Peaks' own stone against the mountain — enormous totems carved directly from the rockface, imbued by Druidic essence, anchored to the land itself. The work took nine days. The volcanic toxins are still contained. Grinmir did not stay to see the result confirmed. He returned to Lochmaw the same way he arrived: through a Great Tree portal, through the lifestream, stepping out under the ash tree a few hundred yards from port, already walking toward the tavern before the portal closed behind him. The Wylds named this arrival point in his honor. He has not returned to see it.`,
  ],
  'cosantoir-keep': [
    `The Cosantoir name is not old. It was chosen — by Gideon, the first king, a former street urchin who had served the Mad King Eu'ryloch as a lieutenant before turning against him. Gideon took the throne not by birthright but by action: he led the coup, struck down the tyrant's regime, and then spent the rest of his life trying to deserve what he had done. He chose Cosantoir because it meant, roughly, protector. He wanted his dynasty to be defined by what it was for, not what it had overcome.`,
    `Gideon ruled for twenty-three years. His son Aldric has ruled for fifteen. Between them was Eu'ryloch, the Mad King, who enslaved the continent across twelve brutal years and was eventually overthrown by the man who had once enforced his will. The Keep holds all three reigns in its structure — you can see where Eu'ryloch reinforced the walls for occupation, where Gideon tore down the holding cells, where Aldric opened the lower floors to the public. The building is an argument about what power is for. It is not finished.`,
    `Kingvale's current threats are not exclusively from the Veil. Dragon raids on the kingdom's northern territories have occurred with increasing regularity over the past several decades — livestock taken, watchtowers struck, outlying farms abandoned. The working assumption is that the attacks originate from the Desolate Peaks. No one has confirmed this. No one who has traveled far enough north to look has returned with evidence one way or the other, which is its own kind of answer. King Aldric has not ordered a formal expedition. Queen Izetta, who has no patience for threats that go unaddressed, has not publicly agreed with this restraint. What they have agreed on is that sending soldiers into the ash and fire of the Peaks to find the source of attacks that may or may not originate there is a way to lose soldiers.`,
  ],
  'civic-record': [
    `Kingvale began keeping records under Gideon for the same reason Gideon kept records of anything: he did not trust memory. Memory adjusts. Memory finds the version of events that fits what you already believe. The Civic Record was established as a corrective — a place where what actually happened was written down before the story that made sense of it could replace the facts. The first entry is Gideon's own, dated the day after the overthrow of Eu'ryloch. It is not triumphant. It is a list of the names of people who died in the coup. He started with the dead.`,
    `The Record tracks two categories of threat to Kingvale, and has done so for over two hundred years. The first is Veil events: four hundred and twelve documented, four hundred and eight sealed, four still open and growing. The second — added to the Record's scope forty-three years ago, after the raids became too frequent to treat as anomalies — is dragon attacks. There are one hundred and nine documented raids. None have been sealed. The Record does not use that word for them; the sealing methodology that applies to Veil events has no equivalent for a creature that leaves, returns, and leaves again. The Record notes, without comment, that the raid intervals are shortening and the affected territory is expanding northward toward Kingvale's interior.`,
    `Kingvale celebrates Stormbreak in the month of the same name — a month dedicated to order triumphing over chaos, named for a legendary group of sailors who set aside their differences to hold back a Sea Serpent. The festival resonates differently here since Aldric's coronation: the king himself defeated a Sea Serpent at sea before taking the throne, earning the Arch Lord Pirate's respect and, eventually, his daughter's hand. The Record contains the only contemporary account of that event — a sailor's log, three lines long, donated to the archives by a crew member who considered it worth preserving. The lines read: "Prince. Serpent. He didn't hesitate."`,
  ],
  'sentinel-post': [
    `The Sentinel Posts were established to watch for Veil incursions approaching from Kingvale's borders. That was their original purpose. Within two generations, the Posts were tracking something else as well: the approach patterns of dragons from the north. The Sentinels did not redesign their methodology — they simply added a second column to their logs. The dragon column is now longer than the Veil column. This was not anticipated when the Posts were built, and the implications have not been officially addressed. The Posts continue to report both threats. The reports go to the same authority. The response protocols remain separate.`,
    `This Sentinel Post has been staffed by a single family across six generations. The current keeper is the last — no children, no named successor. She registered the Post with the Codex the year she turned sixty-one without announcement. She has noted, in the Post's log, something that the official dragon raid reports do not capture: the attacks do not come from random directions. They originate consistently from the same bearing, adjusted slightly each season, as if whatever is sending them is moving incrementally — or adjusting its position. She has mapped this over thirty-one years of personal observation. The map is in the Post's log, not in the official reports. She did not consider the official reports the right place for a finding she cannot explain.`,
    `The Post's log contains one entry per day for six generations. The vast majority of entries read some variation of: "Nothing today." The cumulative weight of this — thousands of days on which catastrophe did not arrive — is considered by Kingvale's historians to be one of the most significant documents in the realm's archive. Not because of what it records, but because of what it required: someone to be present every day, watching, for six generations, for a thing that mostly did not come. The tradition of showing up anyway is what Stormbreak is named for. This Post is where that tradition has its roots.`,
  ],
  'drowned-archive': [
    `Lochmaw was built from ships. Not metaphorically — the buildings are constructed from the hulls of vessels too damaged to sail, flipped and reinforced with salvaged timber, connected by rope bridges strung between decks that were once masts. The city grows the way a reef grows: organically, around whatever is fixed enough to anchor new growth. The Drowned Archive is built this way: three ship hulls merged into a single structure, the joins sealed with pitch and time, the interior arranged in the way that made sense to a city that keeps everything it cannot bear to throw away.`,
    `Knowledge in Lochmaw is held differently than in Kingvale. Kingvale writes things down and displays them publicly. Lochmaw writes things down and hides them below the waterline. The Archive's most sensitive records — the Veil encounter logs, the intelligence on competing Pirate Lord movements, the maps of underwater terrain that no one else has — are stored in sealed chambers accessible only by descent. This is not paranoia. During the years of the Mad King Eu'ryloch, when Wolfsmane held the title of Arch Lord Pirate under Eu'ryloch's patronage, the waterline prevented four separate attempts to seize the Archive by force. The water has been rising for thirty years. The Archivist has not moved the documents.`,
    `The Seven Pirate Lords have collectively maintained a form of independence from every monarch who has ruled WestHaven. When Eu'ryloch appointed Wolfsmane as Arch Lord Pirate, it was read by the lords as co-optation; after Eu'ryloch fell and Gideon took power, the Lords maintained their distance from the new king as well, viewing him as no different from a leashed dog that bit its master. The sole exception has been Aldric, whose act of sailing into a sea serpent attack to defend Wolfsmane's ship was not forgotten. The Archive holds the official Lochmaw record of that event. It is seventeen pages long. The Kingvale record is three lines. Both are accurate.`,
  ],
  'mirewatch-tower': [
    `The channels of Lochmaw are not stable geography. They shift with tides, with weather, and — since the Veil disturbances intensified — with forces no sailor has been able to name precisely. The Mirewatch Towers were built along the channel edges to observe these shifts: not to prevent them, but to document them, because in Lochmaw the assumption has always been that if you cannot stop something you should at least know when it is happening. The Tower at this Landmark has been struck by Veil energy four times. Each strike left a mark on the stone that has not faded.`,
    `The Serpent Hunters Guild, whose hall sits two channels east of this Tower, maintains a tradition of treating Veil incursions through water differently from those on land. Their position: water carries the Veil's energy further and faster than solid terrain, meaning that a tear opening in the outer channels can affect the inner city before any standard detection method would register it. The Guild developed a sensor network of submerged markers — carved bone, mostly, some copper from An'Haretti salvage traded through Light's Rest Bazaar — that responds to Veil pressure changes faster than anything Kingvale's scholars have produced. The Guild has not shared the methodology. They have, however, never allowed a waterborne incursion to reach the Archive.`,
    `During Shadem — the month when the veil between the living and the dead is thinnest — the Mirewatch Towers take on a second function. The channels of Lochmaw are believed to carry the voices of sailors lost at sea toward the Archive, where they are recorded. This is a tradition, not a documented fact. The current Tower keeper, who has no religious affiliation and three engineering degrees from Kingvale's academy, keeps the recording window open during Shadem anyway. She says: the sounds she captures during that month are not wind, not tide, and not any mechanical frequency she can identify. She has been recording them for eleven years.`,
  ],
  'flintlock-and-saber': [
    `The Flintlock and Saber is the oldest continuously operating tavern in Lochmaw, which in this city means it has survived three fires, two occupations, one collapse, and the Mad King's revenue enforcers. The barkeep who runs it was a sea captain before an encounter with a deep-water creature cost her an eye, a rib, and a leg. She keeps the creature's tooth displayed behind the bar. She does not explain what kind it was. She does not need to. Anyone who asks is shown the tooth and told: "You see the size of it. Do the math."`,
    `Grinmir was found at this tavern. The stone mason who created the essence barrier that saved the continent from Mt. Akthum's eruption eighty years ago spent the years after his family's deaths in this exact corner, working through his grief one pint at a time, under the dim lantern light that the Flintlock is known for. The Corsair who helped recruit him was a regular. The barkeep knew them both. The version of events she keeps is not the heroic one — it is the one where a broken man was asked to do an impossible thing and said no twice before he said yes.`,
    `Valor and Veil falls in Baelif, the month of remembered sacrifice, when the Veil thins and the spirits of fallen heroes are said to walk among the living. The Flintlock observes it differently from the official ceremonies: the barkeep opens the tab for the first round in the names of those lost at sea, the names posted on the wall behind the bar in chalk, updated annually. There are currently one hundred and forty-seven names. The tradition started because the barkeep's father was one of them. It continues because everyone in Lochmaw has a name they would add. The tavern holds more of the Valor and Veil's original spirit than any official parade.`,
  ],
  'anharetti-ruins': [
    `The An'Haretti were not born with magic. This point is essential and widely misunderstood. They were ordinary in their origins — artisans, farmers, builders — who decided that the absence of innate power was a problem to be solved rather than a condition to be accepted. Their solution was Verathel Binding: a process of fusing elemental magic directly into the blood through alchemical treatment and arcane metallurgy. It worked. Their cities glowed with infused constructs. Their crops did not wither. Their artificial suns burned at night. And then they decided this was not enough.`,
    `Project Solstice Vein was the An'Haretti's attempt to fuse human consciousness with the planetary leyline core — to make themselves not just wielders of elemental magic but continuous with it. The theoretical framework was sound by their own standards. The execution was catastrophic. What became known as The Dimming — also called the Sundering of Stone and Flame, or the Solstice Collapse — began the moment the Solstice Vein was activated. The land turned to salt. Constructs went rogue. Elemental storms tore through cities that had taken generations to build. The An'Haretti vanished, but the Solstice Vein still pulses beneath the sands. The Sands are called a graveyard of genius — the warning written in the land itself of what happens when the desire to be more than you are outruns the wisdom to understand what you already are.`,
    `The An'Haretti Ruins are the largest remaining structure of the old empire's capital — a complex of stone and copper-gold conduit work that predates anything else standing in Elysendar. The copper oxidizes green against the desert sandstone. The conduit channels are still intact in places, still faintly warm to the touch, still oriented toward solar angles that no current building code would mandate. The Order of the Endless Sun maintains a presence here, studying the Verathel Binding methodology with the stated goal of restoration. The Technomadics maintain a different presence here, studying the same methodology with the stated goal of not making the same mistakes twice. Both groups are convinced the other will cause The Dimming to happen again.`,
  ],
  'lights-rest-bazaar': [
    `Light's Rest exists because the desert creates need and the lawless fill it. Located in the Central Sands near the ruins of the An'Haretti capital, the Bazaar emerged as a trading point for relic hunters, Technomadic scrappers, and Sand Shield Militia escorts who needed a place to exchange goods, information, and currency that didn't require the inconvenience of legitimate governance. The arrangement has been stable for over a century. Everyone who passes through understands the rules: no violence inside the market perimeter, no price disputes settled by force, no questions about provenance. Everything else is negotiable.`,
    `The most valuable trade at Light's Rest is not relics — it is maps. Maps of sub-surface An'Haretti conduit networks. Maps of Veil Tear clusters in the deep Sands. Maps of the approaches to the Sandveil Observatory, which has been intermittently occupied by different factions for two hundred years. The An'Haretti Fangs, the empire's surviving bloodline assassins, maintain a stall in the Bazaar not for commerce but for intelligence. They buy maps as often as they sell them. They have never been observed using violence inside the perimeter. Three people who attempted to rob them were found outside the perimeter, alive, with the maps returned and a message that the Bazaar's rules applied to everyone.`,
    `The Technomadics who pass through Light's Rest are the ones who understand the Sands best — not because they are the most educated or the most powerful, but because they are the most honest about what they do not know. Their creed is explicit: the An'Haretti fell because they believed their understanding was complete. The Technomadics do not believe their understanding is complete. This makes them methodical where the Order of the Endless Sun is zealous and careful where the An'Haretti Fangs are precise. It also makes them poor at self-promotion. Heroes who encounter Technomadics in the deep Sands will find them reticent, thorough, and — if their trust is earned — more useful than anyone else in the region.`,
  ],
  'relic-approach': [
    `The Sands have safe paths. This is not common knowledge and is not meant to be. The safe paths exist because the residue of An'Haretti Veil events, accumulated over millennia, has settled into patterns — concentrations of energy that make certain routes more stable and others unpredictable. The Relic Approach is one of the oldest documented safe paths, used continuously since before the An'Haretti's fall by people who noticed that travelers who followed this exact line through the Sands arrived intact more often than those who did not.`,
    `The Sand Shield Militia maintains the Relic Approach because maintaining it serves their purpose: protecting travelers who cannot protect themselves. The Militia are not idealists. They are pragmatists who have concluded that a viable trade route through the Sands benefits everyone, including the Militia, and that the cost of keeping the path marked and cleared is lower than the cost of the alternative. Their maintenance record goes back ninety years. In that time, no traveler on the marked Approach has been taken by an ambient Veil event. Twelve travelers who left the Approach for reasons the Militia considers unwise have not been recovered.`,
    `The Approach exists during Aurora Nova in a state that has no scientific explanation. In Emberstok, the month of the Solar Solstice when the Aurora Nova festival burns its healing fires and citizens release their past into flame, the path's ambient Veil residue is measurably lower than at any other point in the year. The reduction is consistent and has been recorded by Sandveil Observatory researchers for two hundred years. The An'Haretti calendar had a name for this phenomenon — something that translates approximately as "the sun remembers what the ground forgets." The Technomadics use this window to conduct deeper Sands surveys than would be safe at other times. They do not know why it works. They use it anyway.`,
  ],
  'mt-akthum-reach': [
    `Mt. Akthum was not always this. The Desolate Peaks, before the calamity eighty years ago, had winters of clean snow and springs that gave way to forest meadows and wildflower plains. The people of Karaphet, the settlement nearest the northern pass, knew both seasons. They were working through an ordinary morning when the ground began to shake and fire began to fall from the sky. No one in Karaphet survived. The Druids dispatched riders when they saw the smoke. The riders arrived after the silence. That is all that is known about Karaphet from primary sources.`,
    `Mt. Akthum now produces ash rather than seasons. The lava flows that emerged eighty years ago carved new geography through what were once lush plains, and the volcanic toxins that poured through the mountain passes would have killed the continent if the Druids, with the help of Kingvale and Lochmaw, had not succeeded in creating an essence barrier. The barrier still holds. Grinmir's work has not failed. The area within the barrier is not recovering in any conventional sense — the land is transforming, settling into a form that has no precedent in the geological record. Researchers who have approached the barrier's edge describe a landscape that looks less like a natural disaster and more like the beginning of something else entirely. What that something is has not been named.`,
    `The Peaks' remaining inhabitants have used the Rimecalm Hollow for decisions since before the volcanic calamity. The elders who were asked about the Hollow's use said the same thing every generation has said: the Hollow is for decisions that require clarity. What no outsider has pressed them on — and what the elders have not volunteered — is that the decisions made in the Hollow for the past eighty years have been the same decision, revisited annually, never fully resolved. Not a similar decision. The same one. Whatever is being weighed has been in the balance since the year Mt. Akthum erupted and the dragons began moving south. The elders do not consider this a coincidence. They consider it the problem they have been given to hold.`,
  ],
  'frostcarve': [
    `The Frostcarve was classified as a geological formation in the first formal survey of the Peaks. This was incorrect. Geological formations do not maintain consistent angular measurements. They do not orient toward the same celestial point from multiple approach directions. They do not produce, as this one does, a low harmonic resonance on the third day of Volcrun, the month named for the volcanic transformation of the Peaks, when the mountain temperature drops sharply enough to cause the carved stone to contract and sing. The Frostcarve was made. By what, over what period, and with what intention: unanswered.`,
    `The celestial point toward which the Frostcarve is oriented is not a current star. It is the calculated position of a star as it existed several thousand years ago, before it moved or died. The calculation required to identify this was made by the Sandveil Observatory team. Their paper was rejected by two journals before a third accepted it with the note: "We do not know what to do with this." What no published paper has addressed — because no published paper has connected the datasets — is that the bearing from which dragon raids approach Kingvale, charted over decades of Sentinel Post records, points back to the same region of the Peaks that the Frostcarve faces. This may be coincidence. The Peaks' inhabitants, when presented with this observation, did not call it coincidence. They did not call it anything. They changed the subject.`,
    `The Peaks' inhabitants have a practice around the Frostcarve that they do not explain to outsiders and do not invite outsiders to participate in. They are aware of the scholarly interest in the structure and find it irrelevant. When a researcher asked what the carving was for, an elder responded: "It is older than the question you are asking, and the answer it was built to give is not the answer you are looking for." The researcher, who was asking about stellar mechanics, published this exchange. The elder, who was speaking about something else entirely, did not read the publication.`,
  ],
  'rimecalm-hollow': [
    `The Desolate Peaks are defined by wind, by cold that finds every gap, by the understanding that nothing built here stays warm long. The Rimecalm Hollow stays still. Wind does not enter it. The temperature does not vary by season. The harmonic resonance that fills the rest of the Peaks — the low, continuous vibration that those who live here describe as the mountain thinking — is absent inside the Hollow. Whatever the mountain is thinking, it does not think it here.`,
    `The Hollow was used for decisions long before the volcanic calamity. The Peaks' oldest inhabitants kept no written record of its use — they considered the decisions made there to belong to the people who made them, not to history. What is known is this: when the Druids, Kingvale, and Lochmaw convened to discuss the crisis caused by Mt. Akthum, three of the Peaks' Conclave elders traveled through the ash to reach the Hollow before participating in any conversation. They arrived two days late. They did not explain the delay. Their contributions to the subsequent deliberations were, by all accounts, the most precisely framed of any party present.`,
    `Researchers who have studied the Hollow have confirmed what was discovered during a Veil incursion in the adjacent mountain range: the ambient Veil pressure that is measurable at every other point in the Peaks is absent here. The Hollow appears to exist outside the normal influence of the Veil entirely. The Peaks' inhabitants, informed of this, noted that they had always known the Hollow was a place where clarity was possible. They did not consider this surprising. The Codex registered the Hollow as a Landmark because of the incursion-era data. The elders have not acknowledged the registration. They continue to use the Hollow as they always have.`,
  ],
  'prisming-gate': [
    `Before Elysendar existed, the six realms — Life, Death, Light, Dark, Order, Chaos — maintained a fragile balance under their Firstborn stewards. This held for almost five hundred years. Then something broke it. Scholars call the event The Prisming: the moment the veils between realms fractured simultaneously, when Veil Tears began opening without warning, when creatures crossed boundaries that had never been crossed before. What caused it depends on who you ask. Every region in Elysendar has an answer, and no two answers are the same.`,
    `Elytheron, who had withdrawn into meditative sleep and left the Firstborns in charge, returned to prevent complete annihilation. What Elytheron created in response was Elysendar: a realm woven from the essence of all six pillars simultaneously, designed to stabilize the cosmic imbalance by existing at the intersection of all realms. Elysendar was not discovered. It was built. Its purpose was — and remains — to serve as the crucible in which the fractures of The Prisming are slowly healed. Elytheron then withdrew again, into what the religious call Elytheron's Lament and scholars call the Celestial Meditation. The distinction matters: one mourns, the other trusts. Both are accurate.`,
    `The Prisming Gate is named for the event, not for any physical structure. It marks the place in Elysendar where the Veil is thinnest — where the boundary between this realm and what lies beyond it is closest to transparent. It has been called holy, it has been called dangerous, and both designations have caused people to do things here that they later regretted. The Gate does not open. This is important: it is a threshold, not a passage. Whatever patience emanates from the other side has been there since The Prisming and shows no sign of diminishing. It is waiting. For what is the question that the Codex was built to help answer.`,
  ],
  'echo-point': [
    `Sound returns from the Echo Point with a delay of 3.7 seconds. This has been measured seventeen times by independent researchers across eighty years. The delay does not vary with atmospheric conditions, volume, frequency, Veil activity level, or any other measurable factor. No physical surface at any measurable distance would produce this reflection. The echo returns from the direction of the Prisming Gate. No instrument has detected a reflective surface in that direction. The echo happens anyway.`,
    `The 3.7-second delay is consistent with one theoretical model: the sound is traveling to the Veil boundary and returning. If this model is correct, it implies the boundary is approximately two and a half kilometers from the Echo Point — far closer than any other measurement of the Veil margin in this region. The implication is that the Prisming Gate, which appears in Elysendar as a location in physical space, is not at the surface of the Veil. It is inside it. This model has been published. The academic response has been, in one reviewer's words, "deeply unhelpful silence."`,
    `During the month of Midnightveil, when the Festival of Reflection is celebrated across Elysendar — when mirrors are said to reveal truths and prisms catch the last light of the year — the Echo Point behaves differently. The delay shortens. Not dramatically, not consistently across the whole month, but on specific nights when Veil activity in the surrounding region is elevated: the delay shortens to under two seconds, the echo becomes louder than the original sound, and on three documented occasions it has returned with frequencies that were not present in the original sound. The three observers who documented these frequencies have not agreed on what the additional frequencies sound like. All three have used the word "language."`,
  ],
  'veil-margin': [
    `The Veil Margin is not a fixed location. It is the measured edge of Veil influence — the outermost boundary at which instruments register the Veil's presence. This boundary has been moving outward for two hundred years. The rate is slow enough to be invisible within a single human lifetime. Across several lifetimes, it is the most significant ongoing change in the geography of Elysendar. The Margin is currently nineteen kilometers beyond its documented position when measurement began. Several settlements that were outside the Veil's influence when they were founded are now inside it.`,
    `The people in those settlements were not warned. The first indication in most cases was the behavior of animals: birds and small mammals began responding to something the human inhabitants could not perceive. By the time instruments confirmed the Margin had shifted, the behavioral changes had been ongoing for between eight and twelve years. This pattern has repeated across four documented boundary expansions. The animals know first. The scholars have not been able to explain why animals detect Veil pressure before human instruments do. The Peaks' elders, when informed of this finding, noted that humans have been working hard for a long time to be less sensitive than animals, and appear to be succeeding.`,
    `The Codex landmark registration for the Veil Margin has no fixed coordinates. The Margin moves; the Landmark moves with it. Twice a year the Codex updates the registered location. The log of these updates is one of the few places in the Codex system where the record itself is the evidence of change — where looking at the data over time reveals something that no single entry contains. Heroes who discover this Landmark find it wherever it currently is. The current location is not where it was when first registered. The gap between where it was and where it is now is the most honest summary available of what The Prisming set in motion and has not yet stopped.`,
  ],
  'prisming-site': [
    `The oldest Veil event in the geological record occurred here — thousands of years before any other documented site in Elysendar. The Codex treats the cause of The Prisming as a question without a single answer: Druidic tradition holds that it began when the Great Tree's protection was first weakened by those who did not understand its purpose. The An'Haretti believed it was a consequence of an earlier civilization's attempt at power, which they intended to succeed where their predecessors failed. The scholars of Kingvale argue it originated from outside Elysendar entirely, from forces that had nothing to do with this realm. All three positions have evidence. None has proof.`,
    `What has been recovered from the deepest excavation of the Prisming Site is a layer predating the An'Haretti by eight hundred years containing material consistent with successful Veil sealing. Someone was sealing rifts at this exact location long before the An'Haretti arrived, long before the Verathel Binding was developed, before any currently surviving culture had any framework for understanding what a Veil Tear was. They were doing it anyway. The method has not been recovered. The fact that they were doing it — without the Codex, without systematic record-keeping, without any of the institutional apparatus that now surrounds hero activity — is the most important finding at the Site.`,
    `Eleven excavations have been conducted here. Each team found something the previous teams missed. The most recent team, completing their work two years ago, found the pre-An'Haretti sealing material and declined to publish their full findings. The team leader submitted a partial report to the Codex Foundation in Kingvale with a cover note that read: "We know what we found. We do not know what it means. We are not prepared to speculate on paper about something this old and this significant. We are asking to be believed when we say it matters." The Codex Foundation acknowledged receipt. The full findings are in the sealed record.`,
  ],
  'codex-foundation': [
    `The Codex was not a new idea. Every region in Elysendar had, by the time it was formally established, developed some informal version of the same thing: a way of recognizing individuals who had demonstrated an unusual capacity to respond to Veil incursions, tracking their movements and outcomes, and ensuring they were deployed effectively. Kingvale's contribution was the insistence that this should be written down, centralized, and made persistent — that the knowledge accumulated by one generation should not have to be rediscovered by the next. This was Gideon's instinct applied to hero activity: write it down before memory changes it.`,
    `The founding principle of the Codex — the line that appears in the oldest surviving planning document — reads: "If the Veil cannot be reasoned with, it can be counted." This is not optimism. It is a position on epistemology: that the pattern of Veil behavior, invisible from any individual vantage point, becomes visible when enough data points are accumulated over enough time. The Codex was built in part because its founders recognized that knowledge about Veil events had begun to fragment — different regions keeping different records, different factions protecting what they knew from one another, the instinct to hoard information winning out over the instinct to share it. The system was designed to correct for this. Whether it has succeeded is a question the founders left open.`,
    `The Codex's original architects built something into the system that was only discovered after the founding members died: an automated landmark registration that activates when certain threshold conditions are met. The Prisming Gate was registered the day the first hero was enrolled — not after, not as a subsequent administrative act, but at that exact moment, as if the system recognized the connection between individual hero enrollment and that specific location. The engineers who reviewed this have produced three reports, each concluding the mechanism cannot be explained. The fourth report was not written. Every hero enrolled continues what the Paragons — those chosen by Elytheron after death, granted immortality and relics forged in the Veil Forge — began long before the Codex had a name for it.`,
  ],
};

// ── Landmark seed definitions (20 landmarks, placeholder GPS coords) ──────────
// Coordinates clustered around Sacramento demo area (38.6773, -121.235).
// REPLACE with real venue coordinates before production launch.

const LANDMARK_SEED_DATA = [
  { id: 'wellspring-meadows',  name: 'The Wellspring Meadows', region: 'Wylds',          tier: 1, type: 'hv_venue',  lat: 38.6820, lon: -121.2380, radius_meters: 150, is_auto_registered: false },
  { id: 'hollow-root',         name: 'The Hollow Root',         region: 'Wylds',          tier: 2, type: 'public',    lat: 38.6810, lon: -121.2420, radius_meters: 200, is_auto_registered: false },
  { id: 'grimnirs-gateway',    name: "Grinmir's Gateway",       region: 'Wylds',          tier: 3, type: 'operator',  lat: 38.6840, lon: -121.2300, radius_meters: 100, is_auto_registered: false },
  { id: 'cosantoir-keep',      name: 'The Cosantoir Keep',      region: 'Kingvale',       tier: 1, type: 'hv_venue',  lat: 38.6760, lon: -121.2310, radius_meters: 150, is_auto_registered: false },
  { id: 'civic-record',        name: 'The Civic Record',        region: 'Kingvale',       tier: 2, type: 'public',    lat: 38.6740, lon: -121.2360, radius_meters: 200, is_auto_registered: false },
  { id: 'sentinel-post',       name: 'The Sentinel Post',       region: 'Kingvale',       tier: 3, type: 'operator',  lat: 38.6750, lon: -121.2450, radius_meters: 100, is_auto_registered: false },
  { id: 'drowned-archive',     name: 'The Drowned Archive',     region: 'Lochmaw',        tier: 1, type: 'hv_venue',  lat: 38.6780, lon: -121.2480, radius_meters: 150, is_auto_registered: false },
  { id: 'mirewatch-tower',     name: 'The Mirewatch Tower',     region: 'Lochmaw',        tier: 2, type: 'public',    lat: 38.6800, lon: -121.2460, radius_meters: 200, is_auto_registered: false },
  { id: 'flintlock-and-saber', name: 'The Flintlock and Saber', region: 'Lochmaw',        tier: 3, type: 'operator',  lat: 38.6820, lon: -121.2500, radius_meters: 100, is_auto_registered: false },
  { id: 'anharetti-ruins',     name: "The An'Haretti Ruins",    region: 'Origin Sands',   tier: 1, type: 'hv_venue',  lat: 38.6730, lon: -121.2400, radius_meters: 150, is_auto_registered: false },
  { id: 'lights-rest-bazaar',  name: "Light's Rest Bazaar",     region: 'Origin Sands',   tier: 2, type: 'public',    lat: 38.6720, lon: -121.2450, radius_meters: 200, is_auto_registered: false },
  { id: 'relic-approach',      name: 'The Relic Approach',      region: 'Origin Sands',   tier: 3, type: 'operator',  lat: 38.6710, lon: -121.2390, radius_meters: 100, is_auto_registered: false },
  { id: 'mt-akthum-reach',     name: 'Mt. Akthum Reach',        region: 'Desolate Peaks', tier: 1, type: 'hv_venue',  lat: 38.6700, lon: -121.2330, radius_meters: 150, is_auto_registered: false },
  { id: 'frostcarve',          name: 'The Frostcarve',          region: 'Desolate Peaks', tier: 2, type: 'public',    lat: 38.6690, lon: -121.2280, radius_meters: 200, is_auto_registered: false },
  { id: 'rimecalm-hollow',     name: 'The Rimecalm Hollow',     region: 'Desolate Peaks', tier: 3, type: 'operator',  lat: 38.6710, lon: -121.2260, radius_meters: 100, is_auto_registered: false },
  { id: 'prisming-gate',       name: 'The Prisming Gate',       region: 'Veil',           tier: 1, type: 'hv_venue',  lat: 38.6760, lon: -121.2350, radius_meters: 150, is_auto_registered: true  },
  { id: 'echo-point',          name: 'The Echo Point',          region: 'Veil',           tier: 2, type: 'public',    lat: 38.6780, lon: -121.2350, radius_meters: 200, is_auto_registered: false },
  { id: 'veil-margin',         name: 'The Veil Margin',         region: 'Veil',           tier: 3, type: 'operator',  lat: 38.6800, lon: -121.2390, radius_meters: 100, is_auto_registered: false },
  { id: 'prisming-site',       name: 'The Prisming Site',       region: 'Origin Sands',   tier: 1, type: 'hv_venue',  lat: 38.6740, lon: -121.2410, radius_meters: 150, is_auto_registered: false },
  { id: 'codex-foundation',    name: 'The Codex Foundation',    region: 'Kingvale',       tier: 1, type: 'hv_venue',  lat: 38.6760, lon: -121.2410, radius_meters: 150, is_auto_registered: false },
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class LandmarkService {
  constructor(private readonly prisma: PrismaService) {}

  // ── GET /api/landmarks/nearby ──────────────────────────────────────────────
  // Returns all landmarks within their individual radius of (lat, lon).
  // Includes per-hero visit count and next fragment index.
  // Does NOT return fragment text — that is the reward from /discover.

  async findNearby(lat: number, lon: number, rootId: string): Promise<NearbyLandmark[]> {
    // Pull all landmarks + this hero's discovery records in one pass
    const [landmarks, discoveries] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT * FROM landmarks`,
      this.prisma.$queryRaw<any[]>`
        SELECT landmark_id, COUNT(*)::int AS visit_count
        FROM landmark_discoveries
        WHERE hero_id = ${rootId}
        GROUP BY landmark_id
      `,
    ]);

    const visitMap = new Map<string, number>(
      discoveries.map((d) => [d.landmark_id, d.visit_count]),
    );

    const results: NearbyLandmark[] = [];

    for (const lm of landmarks) {
      const distanceMeters = haversineMeters(lat, lon, lm.lat, lm.lon);
      if (distanceMeters > lm.radius_meters) continue;

      const visits = visitMap.get(lm.landmark_id) ?? 0;
      const fragmentIndex = visits < 3 ? visits + 1 : null;

      results.push({
        landmark_id:    lm.landmark_id,
        name:           lm.name,
        region:         lm.region,
        tier:           lm.tier,
        type:           lm.type,
        lat:            lm.lat,
        lon:            lm.lon,
        distance_meters: Math.round(distanceMeters),
        radius_meters:  lm.radius_meters,
        visits,
        fragment_index: fragmentIndex,
      });
    }

    // Sort: closest first
    results.sort((a, b) => a.distance_meters - b.distance_meters);
    return results;
  }

  // ── POST /api/landmarks/discover ──────────────────────────────────────────
  // Awards the next fragment for hero at landmark.
  // Idempotent: if fragment already awarded, returns existing text.

  async discoverFragment(rootId: string, landmarkId: string): Promise<DiscoverResult> {
    // Count existing discoveries for this hero × landmark
    const existing = await this.prisma.$queryRaw<any[]>`
      SELECT fragment_index FROM landmark_discoveries
      WHERE hero_id = ${rootId} AND landmark_id = ${landmarkId}
      ORDER BY fragment_index ASC
    `;

    const earnedIndices = existing.map((e) => e.fragment_index as number);
    const nextIndex = earnedIndices.length + 1;

    // Landmark name for the response
    const lmRows = await this.prisma.$queryRaw<any[]>`
      SELECT name FROM landmarks WHERE landmark_id = ${landmarkId}
    `;
    if (!lmRows.length) {
      throw new Error(`Landmark not found: ${landmarkId}`);
    }
    const landmarkName: string = lmRows[0].name;

    // Already at 3 visits — return last fragment
    if (nextIndex > 3) {
      const fragments = LANDMARK_FRAGMENTS[landmarkId];
      return {
        landmark_id:    landmarkId,
        landmark_name:  landmarkName,
        fragment_index: 3,
        fragment_text:  fragments ? fragments[2] : '',
        visits_total:   3,
        complete:       true,
      };
    }

    // Insert the new discovery record
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO landmark_discoveries (discovery_id, hero_id, landmark_id, fragment_index, discovered_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
       ON CONFLICT (hero_id, landmark_id, fragment_index) DO NOTHING`,
      rootId,
      landmarkId,
      nextIndex,
    );

    // Log identity event
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO identity_events (event_id, root_id, event_type, payload, created_at)
         VALUES (gen_random_uuid(), $1, 'LANDMARK_FRAGMENT_DISCOVERED', $2::jsonb, NOW())`,
        rootId,
        JSON.stringify({ landmark_id: landmarkId, landmark_name: landmarkName, fragment_index: nextIndex }),
      );
    } catch {
      // Non-critical — event logging failure should not block discovery
    }

    const fragments = LANDMARK_FRAGMENTS[landmarkId];
    const fragmentText = fragments ? fragments[nextIndex - 1] : '';

    return {
      landmark_id:    landmarkId,
      landmark_name:  landmarkName,
      fragment_index: nextIndex,
      fragment_text:  fragmentText,
      visits_total:   nextIndex,
      complete:       nextIndex === 3,
    };
  }

  // ── Auto-registration: fires on first hero enrollment ─────────────────────
  // Called from identity.service.ts after new hero is created.
  // Grants Fragment 1 of The Prisming Gate — makes it immediately visible.

  async autoRegisterPrismingGate(rootId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO landmark_discoveries (discovery_id, hero_id, landmark_id, fragment_index, discovered_at)
         VALUES (gen_random_uuid()::text, $1, 'prisming-gate', 1, NOW())
         ON CONFLICT (hero_id, landmark_id, fragment_index) DO NOTHING`,
        rootId,
      );
    } catch {
      // Landmark table may not exist in dev/test. Non-critical — continue.
    }
  }

  // ── Bootstrap: creates tables via raw SQL (no prisma migrate execute) ──────

  async bootstrapTables(): Promise<{ message: string }> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS landmarks (
        landmark_id  TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        region       TEXT NOT NULL,
        tier         INTEGER NOT NULL DEFAULT 1,
        type         TEXT NOT NULL DEFAULT 'public',
        lat          DOUBLE PRECISION NOT NULL,
        lon          DOUBLE PRECISION NOT NULL,
        radius_meters INTEGER NOT NULL DEFAULT 100,
        is_auto_registered BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS landmark_discoveries (
        discovery_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        hero_id        TEXT NOT NULL REFERENCES root_identities(root_id) ON DELETE CASCADE,
        landmark_id    TEXT NOT NULL REFERENCES landmarks(landmark_id) ON DELETE CASCADE,
        fragment_index INTEGER NOT NULL,
        discovered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(hero_id, landmark_id, fragment_index)
      )
    `);

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_landmark_discoveries_hero ON landmark_discoveries(hero_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_landmark_discoveries_landmark ON landmark_discoveries(landmark_id)`,
    );

    return { message: 'Landmark tables ready' };
  }

  // ── Seed: inserts 20 landmark records (idempotent via ON CONFLICT DO NOTHING) ─

  async seedLandmarks(): Promise<{ seeded: number; skipped: number }> {
    let seeded = 0;
    let skipped = 0;

    for (const lm of LANDMARK_SEED_DATA) {
      const result = await this.prisma.$executeRawUnsafe(
        `INSERT INTO landmarks (landmark_id, name, region, tier, type, lat, lon, radius_meters, is_auto_registered)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (landmark_id) DO NOTHING`,
        lm.id,
        lm.name,
        lm.region,
        lm.tier,
        lm.type,
        lm.lat,
        lm.lon,
        lm.radius_meters,
        lm.is_auto_registered,
      );
      if (result > 0) seeded++;
      else skipped++;
    }

    return { seeded, skipped };
  }

  // ── Debug: confirm tables exist and row counts ─────────────────────────────

  async debugTables(): Promise<object> {
    const landmarkCount = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM landmarks
    `;
    const discoveryCount = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM landmark_discoveries
    `;
    return {
      landmarks:             landmarkCount[0]?.count ?? 0,
      landmark_discoveries:  discoveryCount[0]?.count ?? 0,
    };
  }
}
