# EvoSim

Evolution im Browser: Kleine Lebewesen mit vererbtem Körper (Größe, Tempo, Sicht, Ernährung, Farbe)
und vererbtem Gehirn (winziges neuronales Netz). Niemand programmiert ihr Verhalten – es entsteht durch
**Variation** (Mutation beim Teilen) und **Selektion**.

- **Natur:** Die Umwelt selektiert. Wer genug Energie sammelt, teilt sich; wer nicht, stirbt. Räuber entstehen von selbst.
- **Fähigkeiten, die Umwelt zu beeinflussen** (Nischenkonstruktion), für jede Art durch Mutation: 🦀 Graben (vergrabenes
  Futter), 🕳️ Bau, 🐿️ Vorrat, 🕸️ Netz, 🐺 Gruppe, 🪨 Werkzeug – jede kostet laufend Energie und muss sich lohnen.
- **Kultur durch einen glücklichen „Kick“** (Harari): seltene Zufallsmutation, nur bei ≥ 3 vererbten Fähigkeiten.
  Ob sie sich durchsetzt, hängt davon ab, ob genug Artgenossen zum Lernen da sind (Henrichs „kollektives Gehirn“).
  Kulturträger entdecken, lernen und vererben Wissen: 🔥 Feuer, 🧥 Kleidung, ⚔️ Waffen, 🛖 Hütte, 🌾 Landwirtschaft,
  ⚕️ Medizin, 📜 Schrift, danach endlos weitere Erfindungen. Regler „Kultur-Anschwung“ = wie viel Glück.
- **Epochen:** Steinzeit → Sesshaftigkeit (ab 50 Kulturträgern) → Hochkultur (150) → Neuzeit (300), jede schwerer
  zu entdecken. Schrumpft die Kultur, vergisst sie die Fähigkeiten dieser Epoche (Tasmanien-Effekt).
- **Grenzen der Kultur:** Komplexitätskosten (Tainter), Ackerland × Bodenfruchtbarkeit begrenzt die Ernte,
  Landwirtschaft laugt den Boden aus (Raubbau), überschüssige Energie verfällt (Vorrat verdreifacht den Speicher).
- **Krisen:** ❄️ Eiszeit, ☀️ Dürre, 🌋 Vulkanwinter, 🦠 Seuche (Ansteckung über Nähe, Medizin halbiert die
  Sterblichkeit) – per Button oder zufällig. Nach einem Massenaussterben besiedeln Überlebende aus Refugien die Welt neu.
- **Bilanz & Messlatte:** Nach jeder Krise Überleben nach Zahl der Fähigkeiten (gemessen, nicht vorausgesetzt);
  Fähigkeiten je Art über die Zeit (logarithmisch), 🏆 Spitzenreiter, Erkennung des Kultur-Kipppunkts.
- **Schiedsrichter:** Ein festgelegtes Kriterium entscheidet nach jeder Generation, wer sich fortpflanzt –
  z. B. „wer am rötesten ist“. Die Population wird rot, obwohl Röte fürs Überleben nichts bringt.

Begleitet die Blog-Artikel „Die Kambrische Explosion der Software“ und
„Die Evolution braucht keine Vorbilder – aber einen Schiedsrichter“.

## Entwickeln

```sh
npm install
npm run dev        # Entwicklungs-Server
npm test           # Tests (Vitest)
npm run build      # Typprüfung + Build nach dist/
node scripts/headless.ts 16000 42 50 0 eiszeit@6000,vulkan@13000   # ohne Oberfläche: Ticks, Seed, Anschwung, Augen für alle ab (0 = nie), Krisen
```

URL-Parameter: `?seed=42`, `?vorlauf=4000` (Schritte vorrechnen), `?augen=2000` (Augen für alle ab Schritt …; sonst entstehen sie als Fähigkeit von selbst), `?eiszeit=6000` / `?duerre=…` / `?vulkan=…` (bei Schritt …), `?anschwung=0..100`, `?embed` (ohne Kopfzeile).

## Aufbau

- `src/core/` – Simulation ohne Browser-Abhängigkeit (deterministisch per Seed, testbar)
- `src/ui/` – Canvas-Darstellung und Bedienung
- `test/` – Tests

Live: https://burger73.github.io/pbs_evosim/

Lizenz: MIT
