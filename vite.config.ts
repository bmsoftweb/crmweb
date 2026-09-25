import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Porta de HMR distinta da usada pelo portal do cliente (24678),
      // para que os dois projetos possam rodar ao mesmo tempo.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { port: 24679 },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
