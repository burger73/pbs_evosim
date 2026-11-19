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
900 begrenzt (siehe Grenzen). Sinkt sie unter 15, wird die Welt aus einem **Refugium** neu besiedelt,
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
🔥 Feuer, 🧥 Kleidung, ⚔️ Waffen (1) · 🛖 Hütte, 🌾 Landwirtschaft (2) · ⚕️ Medizin, 📜 Schrift, ⛏️ Metall (3) ·
🔬 Wissenschaft, ⚙️ Maschinen (4). Nach der Neuzeit folgen beliebig viele weitere Erfindungen mit
sättigendem Ertragsbonus.

## Kultur (`culture.ts`)

- **Kick** (nach Harari, „kognitive Revolution“): ein seltener Glücksfall pro Lebewesen und Schritt. Die
  Wahrscheinlichkeit ist 10⁻⁶ · 10^(Anschwung/25), der Anschwung reicht von 0 bis 100. Der Kick trifft nur
  Lebewesen mit mindestens 3 vererbten Fähigkeiten. Kulturfähigkeit wird vererbt.
- **Durchsetzen braucht Artgenossen** (Henrich, „kollektives Gehirn“): Gelernt wird nur von Nachbarn mit
  ähnlicher Farbe (Farbabstand ≤ 40), die mehr können. Die Reichweite ist 60, mit 📜 Schrift 180. Ein einzelner
  Kulturträger nimmt sein Wissen mit ins Grab.
- **Entdecken** wird mit jeder Epoche schwerer. 🔬 Wissenschaft verdoppelt die Rate.
- **Weitergabe an Kinder** geht mit Verlusten: Pro Fähigkeit bleibt sie mit 85 % erhalten, mit Schrift vollständig.
- **Epochen brauchen Köpfe:** Sesshaftigkeit ab 50, Hochkultur ab 150, Neuzeit ab 300 Kulturträgern. Reicht
  die Zahl nicht mehr, gehen Fähigkeiten dieser Epochen nach und nach verloren. Das ist der
  **Tasmanien-Effekt** (Henrich). Achtung: Die Zahl der Kulturträger wird zurzeit **weltweit** gezählt.
- **Landwirtschaft** baut Futter an. Begrenzt ist das durch das Ackerland, also landCapacity ×
  Bodenfruchtbarkeit. Jeder Bauer senkt die Fruchtbarkeit (**Raubbau**), die sich nur langsam erholt.
  ⚙️ Maschinen verdoppeln Ernte und Raubbau.
- **Komplexitätskosten** (nach Tainter): Jede erlernte Fähigkeit ab der fünften kostet Energie, weitere
  Erfindungen kosten logarithmisch mehr. Komplexe Kulturen sind deshalb in Krisen verwundbar.
- **Kultur-Kipppunkt:** Er ist erreicht, wenn mindestens 10 % Kulturträger mit im Schnitt mindestens 5
  Fähigkeiten 5 Messungen in Folge da sind. Er wird einmal gesetzt und bleibt stehen.

## Krisen (`crisis.ts`)

| Krise | Dauer | Futter | Wirkung |
|---|---|---|---|
| ❄️ Eiszeit | 1500 | ×0,4 | Kälte. Gemildert durch Bau, Feuer, Kleidung und Hütte |
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

- **Kleine Welt:** höchstens 900 Lebewesen, damit es im Browser flüssig läuft. Zufallsdrift und Aussterben
  wirken dadurch stark. Das ist teils gewollt, aber für Einzeller unrealistisch.
- **Eine Weltkultur:** Nach dem Kipppunkt bleibt in Versuchen immer genau eine Kulturlinie übrig. Alles ohne
  Kultur stirbt innerhalb von etwa 1000 Schritten aus, weil Waffen alles jagen. Die 10–20 „Arten mit Kultur“
  in der Tabelle sind Völker einer Linie. Kultur gegen Kultur (Konflikt, Handel) gibt es nicht.
- **Keine Geografie:** Die Welt ist ein offener Ring ohne Barrieren.
- Geplant ist ein großer Umbau: größere Welt, Kontinente mit Wasser und Gebirge, Kulturlinien mit eigenen
  Epochen und 🛶 Boot. Siehe die Etappen im Projektplan.

## Qualitätssicherung

- `npm test`: Regeltests (`test/core.test.ts`) und **Golden Master** (`test/golden.test.ts`). Feste Szenarien
  liefern einen bitgenauen Fingerabdruck. Reines Umstrukturieren darf ihn nicht ändern. Bei absichtlicher
  Verhaltensänderung wird er mit `npx vitest run -u test/golden.test.ts` erneuert und im Commit begründet.
- `npm run test:szenarien`: Gesamtverhalten über 5 Seeds (etwa 2,5 Minuten). Geprüft wird: Das Leben stirbt
  nicht aus, es entsteht Vielfalt, Kultur kippt in mindestens 3 von 5 Läufen und nie sofort, die Welt bricht
  danach nicht zusammen, Fähigkeiten helfen in der Eiszeit.
- `node scripts/leistung.ts [max] [breite] [höhe]`: Millisekunden pro Schritt bei voller Population.
- `node scripts/headless.ts …`: Verlauf ohne Oberfläche, zum Abstimmen von Parametern.

## Quellen und Anregungen

Joseph Henrich, *The Secret of Our Success* (kollektives Gehirn, Tasmanien-Effekt) · Yuval Noah Harari,
*Eine kurze Geschichte der Menschheit* (kognitive Revolution) · Joseph Tainter, *The Collapse of Complex
Societies* (Komplexitätskosten) · Jared Diamond, *Arm und Reich* (Geografie, geplant) · Andrew Parker,
*In the Blink of an Eye* (Augen und Wettrüsten) · Nischenkonstruktion (Odling-Smee, Laland, Feldman).
