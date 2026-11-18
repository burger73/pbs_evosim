import { defineConfig } from 'vitest/config';

// base './' → läuft unter beliebigem Pfad (z. B. /evosim/ oder eingebettet im Blog)
export default defineConfig({
  base: './',
  server: { port: 5173, allowedHosts: ['pbsnuk.tail96d364.ts.net'] },
  test: { include: ['test/**/*.test.ts'] },
});
