import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}']
  },
  server: {
    port: 3000,
  }
});
