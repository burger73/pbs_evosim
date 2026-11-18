# EvoSim

Evolution im Browser: Kleine Lebewesen mit vererbtem Körper (Größe, Tempo, Sicht, Ernährung, Farbe)
und vererbtem Gehirn (winziges neuronales Netz). Niemand programmiert ihr Verhalten – es entsteht durch
**Variation** (Mutation beim Teilen) und **Selektion**.

- **Natur:** Die Umwelt selektiert. Wer genug Energie sammelt, teilt sich; wer nicht, stirbt. Räuber entstehen von selbst.
- **Schiedsrichter:** Ein festgelegtes Kriterium entscheidet nach jeder Generation, wer sich fortpflanzt –
  z. B. „wer am rötesten ist“. Die Population wird rot, obwohl Röte fürs Überleben nichts bringt.
- **Experimente:** Augen freischalten, Sauerstoff (Futterwachstum) und Mutationsrate zur Laufzeit ändern.
- **Kultur:** Nach dem Freischalten können intelligente Lebewesen Fähigkeiten entdecken (Werkzeug, Feuer, Jagd,
  Sprache, Kleidung, Landwirtschaft, Waffen, Medizin, Schrift, danach endlos weitere Erfindungen), voneinander lernen
  und an Kinder weitergeben – aber nur oberhalb einer Intelligenzschwelle. Weil Wissen sich kombiniert, explodiert
  die Zahl der Fähigkeiten („Ratchet-Effekt“); die Kultur-Art verdrängt alle anderen. Die Messlatte zeigt es.

Begleitet die Blog-Artikel „Die Kambrische Explosion der Software“ und
„Die Evolution braucht keine Vorbilder – aber einen Schiedsrichter“.

## Entwickeln

```sh
npm install
npm run dev        # Entwicklungs-Server
npm test           # Tests (Vitest)
npm run build      # Typprüfung + Build nach dist/
node scripts/headless.ts 16000 2000 4000 42   # ohne Oberfläche: Ticks, Augen ab, Kultur ab, Seed
```

URL-Parameter: `?seed=42`, `?vorlauf=4000` (Schritte vorrechnen), `?augen=2000` / `?kultur=4000` (freischalten bei Schritt …), `?embed` (ohne Kopfzeile).

## Aufbau

- `src/core/` – Simulation ohne Browser-Abhängigkeit (deterministisch per Seed, testbar)
- `src/ui/` – Canvas-Darstellung und Bedienung
- `test/` – Tests

Live: https://burger73.github.io/pbs_evosim/

Lizenz: MIT
