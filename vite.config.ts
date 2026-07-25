import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

// Virtuelles Modul `virtual:paas-image-library`: listet alle Bilder unter
// public/images/** auf. Neue Dateien einfach in den Ordner legen — beim
// nächsten Build bzw. Dev-Reload tauchen sie im Editor auf.
const imageLibraryPlugin = (): Plugin => {
  const VIRTUAL_ID = 'virtual:paas-image-library'
  const RESOLVED_ID = `\0${VIRTUAL_ID}`
  const publicDir = resolve(__dirname, 'public')
  const imagesDir = join(publicDir, 'images')

  const collect = (): string[] => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(jpe?g|png|webp|avif)$/i.test(name)) {
          files.push(relative(publicDir, full).replaceAll('\\', '/'))
        }
      }
    }
    try { walk(imagesDir) } catch { /* Ordner fehlt → leere Liste */ }
    return files.sort()
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
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
