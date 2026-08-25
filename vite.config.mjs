import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/* O mesmo código serve em dois sítios com raízes diferentes:
   - GitHub Pages (produção, ramo master) num subcaminho: /ironcoach/
   - Netlify (ambiente do antigravity, ramo dev) na raiz do domínio: /
   O workflow do Pages define VITE_BASE=/ironcoach/; o Netlify não define
   nada e fica com "/". Sem isto, os caminhos absolutos dos assets dão 404 no
   subcaminho — foi o que quebrou a produção a 2026-08-04. */
const base = process.env.VITE_BASE || '/';

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      // Biblioteca de fórmulas partilhada com as Edge Functions — vive em
      // supabase/functions/_shared/formulas/ (não em src/utils/) porque só
      // esse caminho dispara o deploy-edge-functions.yml. Ver
      // specs/formulas-centralizacao.md §3.1.
      '@formulas': fileURLToPath(new URL('./supabase/functions/_shared/formulas', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    // Estende-se a supabase/functions/_shared/** para que os testes de
    // paridade da biblioteca de fórmulas (vetores dourados) corram também
    // a partir do Vitest, não só do Deno test das Edge Functions. Só
    // *.spec.ts nesse caminho — *.test.ts ali é reservado aos testes
    // Deno-nativos (Deno.test + jsr:@std/assert, ver
    // supabase/functions/deno.json), que não compilam sob Vitest.
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'supabase/functions/_shared/**/*.spec.{js,jsx,ts,tsx}',
    ],
  },
  server: {
    port: 3000,
  }
});
