import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

// Virtuelles Modul `virtual:paas-image-library`: listet alle Bilder unter
// public/images/** auf. Neue Dateien einfach in den Ordner legen — beim
// nächsten Build bzw. Dev-Reload tauchen sie im Editor auf.
const imageLibraryPlugin = (): Plugin => {
  const VIRTUAL_ID = 'virtual:paas-image-library'
  const RESOLVED_ID = `\0${VIRTUAL_ID}`
  const publicDir = resolve(__dirname, 'public')
  const imagesDir = join(publicDir, 'images')

  const collect = (): Array<{ path: string; sha256: string }> => {
    const files: Array<{ path: string; sha256: string }> = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(jpe?g|png|webp|avif)$/i.test(name)) {
          files.push({
            path: relative(publicDir, full).replaceAll('\\', '/'),
            sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
          })
        }
      }
    }
    try { walk(imagesDir) } catch { /* Ordner fehlt → leere Liste */ }
    return files.sort((a, b) => a.path.localeCompare(b.path))
  }

  return {
    name: 'paas-image-library',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      return `export default ${JSON.stringify(collect())};`
    },
    configureServer(server: ViteDevServer) {
      server.watcher.add(imagesDir)
      const invalidate = (file: string) => {
        if (!file.startsWith(imagesDir)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', invalidate)
      server.watcher.on('unlink', invalidate)
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [imageLibraryPlugin()],
  build: {
    // Ohne dieses Ziel schreibt der CSS-Minifier `@media (max-width: 640px)`
    // in die Range-Syntax `@media (width <= 640px)` um. Die versteht Safari
    // erst ab 16.4 — auf älteren iPhones wurde der komplette Block still
    // übersprungen, wodurch die Mobile-Anpassungen dort nie griffen.
    cssTarget: ['safari13', 'chrome87', 'firefox78', 'edge88'],
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
