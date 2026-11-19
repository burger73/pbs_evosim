import { defineConfig } from 'vitest/config';

// base './' → läuft unter beliebigem Pfad (z. B. /evosim/ oder eingebettet im Blog)
export default defineConfig({
  base: './',
  server: { port: 5173, allowedHosts: ['pbsnuk.tail96d364.ts.net'] },
  test: {
    // Szenario-Tests (lange Läufe über mehrere Seeds) nur mit SZENARIEN=1, siehe npm run test:szenarien
    include: process.env.SZENARIEN ? ['test/szenarien/**/*.test.ts'] : ['test/*.test.ts'],
  },
});
