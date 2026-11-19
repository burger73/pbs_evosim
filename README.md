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
- **Krisen:** ❄️ Eiszeit, ☀️ Dürre, 🌋 Vulkanwinter (oder zufällig). Nach jeder Krise eine Bilanz: Überleben nach Zahl
  der Fähigkeiten – Widerstandskraft wird gemessen, nicht vorausgesetzt.
- **Messlatte:** Fähigkeiten je Art über die Zeit (logarithmisch); Kipppunkt-Erkennung der Kultur.
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
node scripts/headless.ts 16000 42 50 2000 eiszeit@6000,vulkan@13000   # ohne Oberfläche: Ticks, Seed, Anschwung, Augen ab, Krisen
```

URL-Parameter: `?seed=42`, `?vorlauf=4000` (Schritte vorrechnen), `?augen=2000`, `?eiszeit=6000` / `?duerre=…` / `?vulkan=…` (bei Schritt …), `?anschwung=0..100`, `?embed` (ohne Kopfzeile).

## Aufbau

- `src/core/` – Simulation ohne Browser-Abhängigkeit (deterministisch per Seed, testbar)
- `src/ui/` – Canvas-Darstellung und Bedienung
- `test/` – Tests

Live: https://burger73.github.io/pbs_evosim/

Lizenz: MIT
