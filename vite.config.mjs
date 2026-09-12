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
  /* Divisão de chunks (auditoria de performance 2026-09-11). O App.jsx já
     separa os ecrãs por React.lazy; isto separa as bibliotecas, para que o
     que muda com o código da app e o que só muda quando se atualiza uma
     dependência não partilhem o mesmo ficheiro com hash.

     Vite 8 usa rolldown: `manualChunks` (Rollup) não existe aqui, e
     `output.advancedChunks` está deprecado — a API atual é
     `output.codeSplitting.groups`, exatamente o que o próprio aviso do build
     ("Use build.rolldownOptions.output.codeSplitting") aponta.

     Os caminhos dos chunks continuam a sair relativos ao `base` acima (o
     Vite reescreve-os com BASE_URL), por isso isto funciona tanto no
     GitHub Pages em /ironcoach/ como no Netlify na raiz. */
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // A ordem importa pouco por si — o que decide é a `priority`.
            // O react tem de ser testado ANTES do vendor genérico, senão
            // caía lá dentro.
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            // Chart.js é o maior peso morto do arranque: só o Dashboard o
            // usa, e o Dashboard já só chega por import() dinâmico.
            { name: 'charts', test: /node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/, priority: 20 },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 20 },
            { name: 'date-fns', test: /node_modules[\\/]date-fns[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
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
