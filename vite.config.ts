import { defineConfig } from 'vite'
export default defineConfig({
  // Relative, so the build runs from a subdirectory as well as from a root.
  // itch.io serves an uploaded zip from a path like
  // html-classic.itch.zone/html/<id>/<name>/, where the default absolute
  // /assets/... resolves to the zone root and 404s. Harmless on Vercel, which
  // serves from the root either way.
  base: './',
  server: { port: 5230, strictPort: true },
  build: { target: 'es2022' },
})
