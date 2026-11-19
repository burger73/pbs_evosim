# EvoSim – Modellbeschreibung

Was die Simulation rechnet, warum, und wo sie bewusst vereinfacht. Zahlen in Klammern sind die
Standardwerte aus `src/core/config.ts`. Bei jeder Regeländerung bitte hier mitpflegen.

## Grundidee

Niemand programmiert, was sich durchsetzt. Lebewesen haben vererbte Merkmale, ein kleines Gehirn und
vielleicht Fähigkeiten. Mutation erzeugt Varianten, und die Umwelt sortiert aus, ganz ohne Bewertung von außen.
Der **Schiedsrichter-Modus** ist das Gegenstück dazu: Dort entscheidet ein willkürliches Kriterium, wer sich fortpflanzt.

Der Kern (`src/core`) ist **deterministisch**: Gleicher Seed ergibt exakt denselben Verlauf. Alle Zufallszahlen
kommen aus einem einzigen Zufallsgenerator (`rng.ts`). Deshalb ist die *Reihenfolge* der Aufrufe Teil des
Verhaltens.

## Ablauf eines Zeitschritts (`world.ts → step`)

1. Nachbarschaftsgitter neu aufbauen, Gruppen zählen (für die Fähigkeit „Gruppe“)
2. Krise Dürre/Vulkan: Oberflächenfutter verdirbt
3. Jedes Lebewesen (`behavior.ts`): wahrnehmen → Gehirn → bewegen → Energie verbrauchen → Seuche → fressen
4. Energie über der Speichergrenze verfällt
5. Natur-Modus: Kultur (`culture.ts`), danach Tod und Fortpflanzung (`selection.ts`)
6. Gefressenes Futter entfernen, neues wachsen lassen
7. Krise beenden oder zufällig beginnen (`crisis.ts`), im Schiedsrichter-Modus Generationswechsel
8. Alle 50 Schritte Artenzählung (`census.ts`), alle 10 Schritte Statistik

## Welt und Gelände (`terrain.ts`)

Die Welt ist 2000 × 1340 groß, mit höchstens 2000 Lebewesen. Ränder gibt es nicht: Wer rechts hinausläuft,
kommt links wieder herein. Für jeden Seed entsteht eine Karte mit eigenem Zufallsgenerator, sodass sie den
Verlauf der Simulation nicht verändert:
- **3–4 Kontinente** (Voronoi-Gebiete um zufällige Zentren, mit verwirbelten Koordinaten für natürliche
  Küsten), getrennt durch **Meerengen** (Breite 50, raue Küsten). Tests prüfen für 8 Seeds, dass die
  Kontinente wirklich getrennt sind und dass jeder mindestens 10 % des Landes umfasst.
- **Wasser:** Lebewesen prallen am Ufer ab wie eine Billardkugel. Einfaches Umdrehen war fatal, weil die
  Lebewesen dann auf ihrer eigenen, abgegrasten Spur zurückliefen und verhungerten. Sehr selten (1e-4 pro
  Anstoßen) treibt eines übers Wasser zum nächsten Ufer (**Treibgut**, ein Gründerereignis wie bei Darwins
  Finken). Mit 🛶 Boot geht es übers Wasser.
- **Gebirge** (etwa 12 % des Landes, als Grate): Es ist karg, dort wächst kein Futter. In Kältekrisen ist es
  doppelt so kalt. Eine Verlangsamung gibt es als Parameter (`mountainSlow`), sie ist aber aus: Schon 0,5–0,8
  erstickte in Versuchen die frühe Evolution (Durchbruch in 1–4 statt 6 von 8 Seeds).
- Futter wächst nur auf fruchtbarem Land. Kinder landen nie im Wasser.
- `LEGACY_WORLD` ist die frühere Welt (1200 × 800, max. 900, ohne Gelände). Sie dient Vergleichen und dem
  Golden Master.

## Lebewesen

**Erbgut** (`genome.ts`): Größe (0,5–3), Tempo (0,1–2), Sicht (0–1), Ernährung (0 = Pflanzen, 1 = Fleisch),
genetische Fähigkeiten (Bitmaske), Kulturfähigkeit, Farbe und die Gehirngewichte. Die Farbe ist
**neutral**: Sie driftet zufällig und macht dadurch Abstammungslinien sichtbar.

**Gehirn** (`brain.ts`): 8 Eingänge → 6 versteckte Neuronen → 2 Ausgänge (Drehung, Schub). Eingänge sind
Richtung und Nähe von Futter, Beute und Gefahr sowie die eigene Energie. Die Gewichte werden mitvererbt und mutieren.

**Wahrnehmung:** Ohne Augen reicht nur der Tastsinn (14). Mit der Fähigkeit 👁️ Augen (oder `?augen=T` für alle)
wirkt das Sicht-Gen bis 140. Sehen kostet Energie proportional zur Reichweite.

**Energie pro Schritt:** Grundumsatz ∝ Fläche (Größe²), Bewegung ∝ Fläche × Tempo², Sicht, Unterhalt
genetischer Fähigkeiten, Kulturfähigkeit (großes Gehirn) und Komplexitätskosten (siehe Kultur).
Die Speichergrenze liegt beim Doppelten der Teilungsschwelle, mit 🐿️ Vorrat beim Dreifachen. Ohne diese
Grenze würden Lebewesen an der Populationsgrenze unbegrenzt Energie horten.

**Fressen:** Pflanzenfresser ernten Futter in Reichweite (🕸️ Netz verdoppelt sie). Räuber (Ernährung > 0,3)
fressen kleinere Lebewesen: Sie müssen 1,2-mal so groß sein. Dabei gilt: 🐺 Rudeljagd senkt das auf 0,9,
🕳️ Bau beim Opfer erhöht es um den Faktor 1,5, die Herde um den Faktor 1,4. ⚔️ Waffen schützen vor allen
ohne Waffen und erlauben die Jagd auf alles bis zur doppelten Größe (mit ⛏️ Metall bis zur dreifachen),
außer auf andere Kulturträger.

**Fortpflanzung und Tod:** Teilung ab Energie > 70 × Fläche. Eltern und Kind bekommen je 45 %, 10 % gehen verloren.
Tod durch Hunger, Alter (2500, 🧥 Kleidung ×1,2, ⚕️ Medizin ×1,5) oder Gefressenwerden. Die Population ist auf
2000 begrenzt (siehe Grenzen). Sinkt sie unter 15, wird die Welt aus einem **Refugium** neu besiedelt,
einer Erbgut-Stichprobe der letzten Zählungen.

## Fähigkeiten (`skills.ts`)

*Vererbte* Fähigkeiten entstehen durch Mutation und kosten laufend Energie, sie müssen sich also lohnen.
Gemeint ist Nischenkonstruktion: Lebewesen verändern ihre Umwelt.

| | Fähigkeit | Wirkung |
|---|---|---|
| 🦀 | Graben | erreicht vergrabenes Futter (35 % des Futters) und übersteht damit Dürren |
| 🕳️ | Bau/Höhle | schwer zu fangen, halbe Kälte |
| 🐿️ | Vorrat | in Krisen 40 % weniger Grundumsatz, größerer Energiespeicher |
| 🕸️ | Netz/Falle | doppelte Fressreichweite |
| 🐺 | Gruppe | Rudeljagd bzw. Schutz in der Herde |
| 🪨 | Werkzeug | +40 % Pflanzenertrag |
| 👁️ | Augen | volle Sichtweite statt Tastsinn |

*Kulturelle* Fähigkeiten entstehen nur durch Kultur und kosten keinen Unterhalt. Sie sind auf 4 Epochen verteilt:
🔥 Feuer, 🧥 Kleidung, ⚔️ Waffen (1) · 🛖 Hütte, 🌾 Landwirtschaft (2) · 🛶 Boot (braucht Schrift),
⚕️ Medizin, 📜 Schrift, ⛏️ Metall (3) ·
🔬 Wissenschaft, ⚙️ Maschinen (4). Nach der Neuzeit folgen beliebig viele weitere Erfindungen mit
sättigendem Ertragsbonus.

## Kultur (`culture.ts`)

- **Kick** (nach Harari, „kognitive Revolution“): ein seltener Glücksfall pro Lebewesen und Schritt. Die
  Wahrscheinlichkeit ist 10⁻⁶ · 10^(Anschwung/25), der Anschwung reicht von 0 bis 100, Standard ist 65. Der
  Kick trifft nur Lebewesen mit mindestens 3 vererbten Fähigkeiten. Kulturfähigkeit wird vererbt.
- **Kulturlinien:** Jeder Kick gründet eine **Linie**, und Kinder erben deren Nummer zusammen mit der
  Kulturfähigkeit. Verliert ein Kind die Kulturfähigkeit durch Mutation (1 %), verliert es auch Linie und
  Wissen. **Gelernt wird nur innerhalb der eigenen Linie.** Epochen, Vergessen, weitere Erfindungen und
  Kipppunkt zählen **pro Linie**. Getrennte Kulturen können deshalb verschieden weit kommen
  (Diamond, „Arm und Reich“).
- **Durchsetzen braucht Artgenossen** (Henrich, „kollektives Gehirn“): Gelernt wird nur von Nachbarn der
  eigenen Linie, die mehr können. Die Reichweite ist 60, mit 📜 Schrift 180. Ein einzelner
  Kulturträger nimmt sein Wissen mit ins Grab.
- **Entdecken** wird mit jeder Epoche schwerer. 🔬 Wissenschaft verdoppelt die Rate.
- **Weitergabe an Kinder** geht mit Verlusten: Pro Fähigkeit bleibt sie mit 85 % erhalten, mit Schrift vollständig.
- **Epochen brauchen Köpfe:** Sesshaftigkeit ab 50, Hochkultur ab 150, Neuzeit ab 300 Kulturträgern **der
  eigenen Linie**. Reicht die Zahl nicht mehr, gehen Fähigkeiten dieser Epochen nach und nach verloren. Das ist
  der **Tasmanien-Effekt** (Henrich). Die Bodenfruchtbarkeit (Raubbau) gilt dagegen noch weltweit.
- **Landwirtschaft** baut Futter an. Begrenzt ist das durch das Ackerland, also landCapacity ×
  Bodenfruchtbarkeit. Jeder Bauer senkt die Fruchtbarkeit (**Raubbau**), die sich nur langsam erholt.
  ⚙️ Maschinen verdoppeln Ernte und Raubbau.
- **Komplexitätskosten** (nach Tainter): Jede erlernte Fähigkeit ab der fünften kostet Energie, weitere
  Erfindungen kosten logarithmisch mehr. Komplexe Kulturen sind deshalb in Krisen verwundbar.
- **Kultur-Kipppunkt** je Linie: Die Träger der Linie stellen mindestens 10 % der Population und haben im
  Schnitt mindestens 5 Fähigkeiten, und das 5 Messungen in Folge. Gemeldet wird „⚡ Kultur kippt (Linie n)“.
  „📉 Kultur erloschen“ kommt erst, wenn kein Träger mehr lebt.
- **Ergebnis der Abstimmung** (8 Seeds, 16.000 Schritte): Mit Boot in Epoche 3 und Anschwung 65 gibt es in
  3 von 8 Läufen zeitweise mindestens 2 gleichzeitig gekippte Kulturen auf verschiedenen Kontinenten (vorher
  0 von 8). Am Ende setzt sich aber meist eine Linie durch. Wer zuerst Boote hat, besiedelt die anderen
  Kontinente und gewinnt die Konkurrenz ums Futter.

## Krisen (`crisis.ts`)

| Krise | Dauer | Futter | Wirkung |
|---|---|---|---|
| ❄️ Eiszeit | 1500 | ×0,4 | Kälte, im Gebirge doppelt. Gemildert durch Bau, Feuer, Kleidung und Hütte |
| ☀️ Dürre | 1000 | ×0,15 | Oberflächenfutter verdirbt, vergrabenes bleibt |
| 🌋 Vulkanwinter | 800 | ×0,1 | 30 % sterben sofort, starke Kälte |
| 🦠 Seuche | 900 | ×1 | Ansteckung bei Nähe (über Artgrenzen ×0,1), Medizin halbiert die Sterblichkeit |

Am Ende einer Krise steht eine **Bilanz**: Überleben nach Zahl der Fähigkeiten und ausgestorbene Arten.

## Arten (`census.ts`, `species.ts`)

Gruppen ähnlicher Genome gelten als Art (Merkmalsabstand < 0,3, Farbe eingerechnet). Biologisch ist das unsauber,
als Maß für Vielfalt aber brauchbar. Arten werden über die Zeit wiedererkannt. Die Individuenzahl ist ab
400 Lebewesen hochgerechnet. Der **Spitzenreiter** ist die Art mit den meisten Fähigkeiten im Schnitt
(ab 10 Individuen). Ein Wechsel braucht 15 % Vorsprung über 3 Zählungen. Als **bemerkenswerte Ausgestorbene**
gelten Arten, die einmal mindestens 30 Individuen hatten oder Spitzenreiter waren.

## Bekannte Grenzen und Vereinfachungen

- **Kleine Welt:** höchstens 2000 Lebewesen, damit es im Browser flüssig läuft. Ein Schritt braucht dann
  etwa 6–11 ms. Zufallsdrift und Aussterben wirken dadurch stark. Das ist teils gewollt, aber für Einzeller
  unrealistisch.
- **Parallelkulturen sind eine Phase:** Wer zuerst Boote hat, setzt sich meist durch. Alles ohne Kultur stirbt
  nach dem Kipppunkt aus, weil Waffen alles jagen. Was beim **Kontakt zweier Kulturen** passiert (Handel,
  Konflikt, Übernahme von Wissen), ist bewusst noch nicht modelliert. Heute konkurrieren sie nur ums Futter.

## Qualitätssicherung

- `npm test`: Regeltests (`test/core.test.ts`), Worker-Schicht (`test/host.test.ts`: rechnet bitgenau wie die Welt direkt, Listen lückenlos) und **Golden Master** (`test/golden.test.ts`). Feste Szenarien
  liefern einen bitgenauen Fingerabdruck, auch für die frühere Welt ohne Gelände. Reines Umstrukturieren
  darf ihn nicht ändern. Bei absichtlicher
  Verhaltensänderung wird er mit `npx vitest run -u test/golden.test.ts` erneuert und im Commit begründet.
- `npm run test:szenarien`: Gesamtverhalten über 5 Seeds (etwa 2,5 Minuten). Geprüft wird: Das Leben stirbt
  nicht aus, es entsteht Vielfalt, Kultur kippt in mindestens 3 von 5 Läufen und nie sofort, Parallelkulturen
  auf getrennten Kontinenten kommen vor, die Welt bricht danach nicht zusammen, Fähigkeiten helfen in der
  Eiszeit.
- `node scripts/leistung.ts [max] [breite] [höhe]`: Millisekunden pro Schritt bei voller Population.
- `node scripts/headless.ts …`: Verlauf ohne Oberfläche, zum Abstimmen von Parametern.

## Quellen und Anregungen

Joseph Henrich, *The Secret of Our Success* (kollektives Gehirn, Tasmanien-Effekt) · Yuval Noah Harari,
*Eine kurze Geschichte der Menschheit* (kognitive Revolution) · Joseph Tainter, *The Collapse of Complex
Societies* (Komplexitätskosten) · Jared Diamond, *Arm und Reich* (Geografie, Kulturen verschieden weit) · Andrew Parker,
*In the Blink of an Eye* (Augen und Wettrüsten) · Nischenkonstruktion (Odling-Smee, Laland, Feldman).
