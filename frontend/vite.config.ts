import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Dev: semua request /api diteruskan ke backend Express, jadi browser hanya
// melihat satu origin. Cookie auth (`__Host-`, SameSite=Strict) butuh itu.
// Produksi (Vercel) melakukan hal yang sama lewat rewrite di vercel.json.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    build: {
      // Font kecil jangan dijadikan data: URI. CSP produksi hanya mengizinkan
      // font-src 'self', jadi font harus berupa file terpisah.
      assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['tests/unit/**/*.test.ts'],
    },
  };
});
