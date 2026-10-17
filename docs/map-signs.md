# Traffic signs for construction sites on the map

Proposal · not decided yet · 17 Oct 2026

Today every site on the map is a red pin (current) or a yellow pin (planned), so the map shows where something is happening but not what it does to traffic. This page proposes German traffic signs (StVO) for the map, one per kind of restriction. The site counts come from a keyword match on the titles of the 212 sites in the two city feeds on 17 Oct 2026; [issue #12](https://github.com/xitij27/domove/issues/12)'s closure parser will count a little differently.

## The proposal

The signs come in two shapes, and German drivers already read them this way:

- **Red-ringed circles** (prohibition signs, *Vorschriftzeichen*) mean **you can't get through**.
- **Red-bordered triangles** (warning signs, *Gefahrzeichen*) mean **you get through, but slower**.

That matches the "blocked" and "slowed" impacts that #12's route planner works with. It also helps colour-blind users, because the shape carries the meaning, not just red against yellow.

| Sign | StVO sign and its meaning in Germany | We'd show it for | Sites | Example title from the feed |
|:---:|---|---|---:|---|
| <img src="images/signs/250-closed-to-vehicles.svg" width="56" alt="Zeichen 250"> | **250** *Verbot für Fahrzeuge aller Art*: no vehicles, bikes included; people on foot may pass | full closure (*Vollsperrung*, *VSP*) | 92 | Langenacker - Straßenbau // Vollsperrung |
| <img src="images/signs/267-no-entry.svg" width="56" alt="Zeichen 267"> | **267** *Verbot der Einfahrt*: no entry from this end, as at the wrong end of a one-way street | one-way rule (*Einbahnstraße*) | 11 | Poststraße - Neubau // Einbahnstraße |
| <img src="images/signs/254-no-bikes.svg" width="56" alt="Zeichen 254"> | **254** *Verbot für Radverkehr*: no cycling | cycle path closed | 4 | Emscherradweg zw. "Bergparte" und "Schürener Vorstadt" - Ausbau Radweg /// Vollsperrung |
| <img src="images/signs/259-no-pedestrians.svg" width="56" alt="Zeichen 259"> | **259** *Verbot für Fußgänger*: no walking | sidewalk or footpath closed | 6 | Preinstraße 74 - Neubau Wohnhaus // Gehwegsperrung |
| <img src="images/signs/131-traffic-lights.svg" width="56" alt="Zeichen 131"> | **131** *Lichtzeichenanlage*: traffic lights ahead | temporary traffic lights (*LSA*, *Ampel*) | 13 | Kurze Hecke - Wasserrohrbruch // halbseitige Sperrung mit Ampel |
| <img src="images/signs/121-narrows-one-side.svg" width="56" alt="Zeichen 121"> | **121** *Einseitig verengte Fahrbahn*: the road narrows on one side | half closure (*halbseitige Sperrung*, *halbs. Sp.*) | 41 | Feldstraße 81 - Kranstellung für Neubau // Halbseitige Sperrung |
| <img src="images/signs/120-narrows.svg" width="56" alt="Zeichen 120"> | **120** *Verengte Fahrbahn*: the road narrows | narrowing or lane reduction (*Fahrbahneinengung*, *Spureinzug*) | 23 | Linnigmannstr. 26 - Hausanschluss /// Fahrbahneinengung |
| <img src="images/signs/123-roadworks.svg" width="56" alt="Zeichen 123"> | **123** *Arbeitsstelle*: roadworks | everything else: the title names no restriction, or only closed parking | 22 | Leostraße - Fahrbahnerneuerung |

A site shows one sign. When a title names several restrictions, the most restrictive one for road traffic wins, in this order: full closure, one-way, traffic lights, half closure, narrowing. So "Halbseitige Sperrung + LSA" shows the traffic light, and "Vollsperrung u. Halbs. Sperrung" the full closure. The bike and pedestrian signs show where only the cycle path or the sidewalk is closed, as in "Ausbau Radweg /// Vollsperrung" or "Vollsperrung Fußweg", so a closed cycle path doesn't get the sign for cars.

## Why not the stop sign

<img src="images/signs/206-stop.svg" width="56" alt="Zeichen 206">

In Germany the stop sign (**206** *Halt! Vorfahrt gewähren!*) means "stop at the line, give way, then drive on". It stands at junctions, never at closures, so on the map it would read as a junction or as "stop here", not as "closed". A closed street in Germany shows **250** together with the red and white barrier (**600**, below).

250 also says exactly what we decided for full closures in [route planning question 4](route-planning-open-questions.md#4-does-a-full-road-closure-block-people-on-foot-and-on-bikes): bikes can't ride through, but people on foot can, and you may push a bike.

## Alternatives worth a look

| Sign | Instead of | For | Against |
|:---:|---|---|---|
| <img src="images/signs/267-no-entry.svg" width="56" alt="Zeichen 267"> | 250 for full closures | The solid red disc is the most eye-catching sign, and it looks like the closure icon in Google Maps | In Germany it means "no entry from this end", a one-way rule. One-way streets would then need the blue arrow (220), and only 1 of the 11 one-way titles names the direction |
| <img src="images/signs/600-barrier.svg" width="120" alt="Zeichen 600"> | 250 for full closures | **600** *Absperrschranke* is the barrier people actually see at a closure, and it reads as "closed" at once | Eight times wider than high, so it makes a clumsy marker and covers the street; it would need a shorter, cut-down version |
| <img src="images/signs/208-oncoming-priority.svg" width="56" alt="Zeichen 208"> | 121 for half closures | **208** *Vorrang des Gegenverkehrs* (give way to oncoming traffic) stands at many half closures without lights, and at small sizes it's easier to tell apart from 120 than 121 is | It's round, which breaks "circle means you can't get through" |

## Left out

| Sign | Why not |
|:---:|---|
| <img src="images/signs/220-one-way.svg" width="80" alt="Zeichen 220"> | **220** *Einbahnstraße*: its arrow would point in a direction we don't know for 10 of the 11 one-way sites |
| <img src="images/signs/283-no-stopping.svg" width="56" alt="Zeichen 283"> | **283** *Absolutes Haltverbot*: only 2 sites close parking ("Haltverbote für Neubau", "Sperrung Parkstreifen"), and that doesn't slow anyone driving through; they show 123 |
| <img src="images/signs/454-detour.svg" width="80" alt="Zeichen 454"> | **454** *Umleitung*: a detour sign marks the way around, not the site. It may suit the detour line that #12 draws later |

## To decide along with the signs

1. **Current and planned.** Today the colour says whether a site is current (red) or planned (yellow). Each sign already has its own colours. Suggestion: current sites show the sign as it is; planned sites show it faded, with a small clock badge. An alternative German drivers know: a white plate under the sign (*Zusatzzeichen*) reading "ab 26.10.", shown from street zoom on.
2. **Size and zoom.** At marker size the three triangles 120, 121 and 123 are hard to tell apart, and 212 signs at city zoom are a lot. Here is the row at 24 px:

   <img src="images/signs/250-closed-to-vehicles.svg" width="24" alt="250"> <img src="images/signs/267-no-entry.svg" width="24" alt="267"> <img src="images/signs/254-no-bikes.svg" width="24" alt="254"> <img src="images/signs/259-no-pedestrians.svg" width="24" alt="259"> <img src="images/signs/131-traffic-lights.svg" width="24" alt="131"> <img src="images/signs/121-narrows-one-side.svg" width="24" alt="121"> <img src="images/signs/120-narrows.svg" width="24" alt="120"> <img src="images/signs/123-roadworks.svg" width="24" alt="123">

   Suggestion: keep plain dots at city zoom and switch to signs from street zoom. If 120 and 121 still look the same, half closures and narrowings could share 121.
3. **The sign is a guess from the title.** The feed's restriction field (`einschrankung`) is empty, so the kind comes from abbreviations in the title text such as "VSP", "halbs. Sp." and "LSA". The site card keeps showing the city's title, so people can check it.

## What it would take

- **Backend:** #12's closure parser stores each site's closure kind. Nothing parses titles yet.
- **App:** the signs as PNGs at 2× and 3×, rendered once from the SVGs here. The Google map passes them as the `Marker` image instead of `pinColor`. The Mapbox map swaps its `CircleLayer` for a `SymbolLayer` whose `iconImage` matches on the closure kind.

## Sources

- **Sign images:** Wikimedia Commons, public domain, since German traffic signs are official works (§ 5 UrhG). In this repo under [images/signs/](images/signs/); the only change is a `viewBox` added to 267 so it scales. Originals: [120](https://commons.wikimedia.org/wiki/File%3AZeichen_120_-_Verengte_Fahrbahn%2C_StVO_1970.svg), [121](https://commons.wikimedia.org/wiki/File%3AZeichen_121-10_-_einseitig_%28rechts%29_verengte_Fahrbahn%2C_StVO_1992.svg), [123](https://commons.wikimedia.org/wiki/File%3AZeichen_123_-_Arbeitsstelle%2C_StVO_2013.svg), [131](https://commons.wikimedia.org/wiki/File%3AZeichen_131_-_Lichtzeichenanlage%2C_StVO_1970.svg), [206](https://commons.wikimedia.org/wiki/File%3AZeichen_206_-_Halt%21_Vorfahrt_gew%C3%A4hren%21_StVO_2017.svg), [208](https://commons.wikimedia.org/wiki/File%3AZeichen_208_-_Dem_Gegenverkehr_Vorrang_gew%C3%A4hren%21_600x600%2C_StVO_1992.svg), [220](https://commons.wikimedia.org/wiki/File%3AZeichen_220-20_-_Einbahnstra%C3%9Fe%2C_rechtsweisend%2C_StVO_2017.svg), [250](https://commons.wikimedia.org/wiki/File%3AZeichen_250_-_Verbot_f%C3%BCr_Fahrzeuge_aller_Art%2C_StVO_1992.svg), [254](https://commons.wikimedia.org/wiki/File%3AZeichen_254_-_Verbot_f%C3%BCr_Radfahrer%2C_StVO_1992.svg), [259](https://commons.wikimedia.org/wiki/File%3AZeichen_259_-_Verbot_f%C3%BCr_Fu%C3%9Fg%C3%A4nger%2C_StVO_1992.svg), [267](https://commons.wikimedia.org/wiki/File%3AZeichen_267_-_Verbot_der_Einfahrt%2C_StVO_1970.svg), [283](https://commons.wikimedia.org/wiki/File%3AZeichen_283_-_Absolutes_Haltverbot%2C_StVO_2017.svg), [454](https://commons.wikimedia.org/wiki/File%3AZeichen_454-20_%E2%80%93_Umleitungswegweiser_%28rechtsweisend%29%2C_StVO_1992.svg), [600](https://commons.wikimedia.org/wiki/File%3AZeichen_600-30_-_Absperrschranke_%28100x800%29%3B_StVO_1992.svg).
- **Meanings:** StVO Anlage 1 (warning signs: 120, 121, 123, 131), Anlage 2 (prohibition signs: 206, 208, 250, 254, 259, 267, 283), Anlage 3 (guide signs: 220, 454) and Anlage 4 (traffic devices: 600).
- **Counts:** titles (`art_der_baumassnahme`) of the 158 current and 54 planned sites in `fb66-baustellen-tagesaktuell-flachen` and `fb66-baustellen-geplant-flachen`, 17 Oct 2026.
