import { resolve, dirname } from 'path'
import type { PluginOption } from 'vite'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import postcssPresetEnv from 'postcss-preset-env'
import packageJson from './package.json' with { type: 'json' }
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  main: {
    // --> Bundled as CommonJS
    // externalizeDepsPlugin() basically externises all the dependencies from being bundled during build - treating them as runtime dependencies
    // electron-vite still builds the main and preload processes into commonJS
    // hence, we need to "exclude" (in order to NOT externalise) ESonly modules so that they can be converted to commonJS and can be required() afterwards correctly
    build: {
      externalizeDeps: {
        // Bundle electron-store + plist inline so they are available as a
        // CommonJS require() after electron-vite converts the main process
        // output. plist 5 ships ESM-only (no CJS `exports` entry), so leaving
        // it externalized makes the main process `require('plist')` throw
        // ERR_PACKAGE_PATH_NOT_EXPORTED at startup.
        exclude: ['electron-store', 'plist'],
        include: ['native-keymap']
      }
    },
    define: {
      ANNOTAMD_VERSION: JSON.stringify(packageJson.version),
      ANNOTAMD_VERSION_STRING: JSON.stringify(`v${packageJson.version}`)
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        '@shared': resolve(__dirname, 'src/shared')
      },
      extensions: ['.mjs', '.ts', '.js', '.json']
    }
  },
  preload: {
    // --> Bundled as CommonJS
    // With sandbox: true the renderer's preload can only `require('electron')`
    // (plus a few built-ins). Inline `pathe` (ESM-only) so the bundled preload
    // doesn't try to require it from node_modules at runtime.
    build: {
      externalizeDeps: {
        exclude: ['pathe']
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        '@shared': resolve(__dirname, 'src/shared')
      },
      extensions: ['.mjs', '.ts', '.js', '.json']
    }
  },
  renderer: {
    // --> Bundled as ES Modules
    // The renderer runs in a sandboxed Chromium context (contextIsolation: true,
    // nodeIntegration: false, sandbox: true). All Node access must go through
    // the preload → IPC bridge. Aliasing `path` → `pathe` lets the shared
    // `common/*` helpers and muya keep their `import path from 'path'`
    // statements without pulling in Node's path module. `pathe` always uses
    // `/` separators and handles Windows drive letters correctly.
    assetsInclude: ['**/*.md'],
    // Some bundled deps (e.g. `custom-event` via `dragula`) reference the
    // Node-only `global` at module load — undefined in a sandboxed renderer.
    // Substitute it with `globalThis` at build time so the imports don't
    // throw before Vue mounts.
    server: {
      host: '127.0.0.1',
      port: 5173
    },
    define: {
      global: 'globalThis'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@floating-ui/dom': resolve(__dirname, 'node_modules/@floating-ui/dom'),
        dompurify: resolve(__dirname, 'node_modules/dompurify'),
        execall: resolve(__dirname, 'node_modules/execall'),
        'fast-diff': resolve(__dirname, 'node_modules/fast-diff'),
        'flowchart.js': resolve(__dirname, 'node_modules/flowchart.js'),
        'fuse.js': resolve(__dirname, 'node_modules/fuse.js'),
        'github-markdown-css': resolve(__dirname, 'node_modules/github-markdown-css'),
        'html-tags': resolve(__dirname, 'node_modules/html-tags'),
        'joplin-turndown-plugin-gfm': resolve(__dirname, 'node_modules/joplin-turndown-plugin-gfm'),
        katex: resolve(__dirname, 'node_modules/katex'),
        marked: resolve(__dirname, 'node_modules/marked'),
        'marked-highlight': resolve(__dirname, 'node_modules/marked-highlight'),
        mermaid: resolve(__dirname, 'node_modules/mermaid'),
        'ot-json1': resolve(__dirname, 'node_modules/ot-json1'),
        'ot-text-unicode': resolve(__dirname, 'node_modules/ot-text-unicode'),
        prismjs: resolve(__dirname, 'node_modules/prismjs'),
        rxjs: resolve(__dirname, 'node_modules/rxjs'),
        snabbdom: resolve(__dirname, 'node_modules/snabbdom'),
        'snabbdom-to-html': resolve(__dirname, 'node_modules/snabbdom-to-html'),
        'snapsvg-cjs': resolve(__dirname, 'node_modules/snapsvg-cjs'),
        turndown: resolve(__dirname, 'node_modules/turndown'),
        underscore: resolve(__dirname, 'node_modules/underscore'),
        vega: resolve(__dirname, 'node_modules/vega'),
        'vega-embed': resolve(__dirname, 'node_modules/vega-embed'),
        'vega-lite': resolve(__dirname, 'node_modules/vega-lite'),
        webfontloader: resolve(__dirname, 'node_modules/webfontloader'),
        'plantuml-encoder': resolve(__dirname, 'node_modules/plantuml-encoder'),
        path: 'pathe'
      },
      extensions: ['.mjs', '.ts', '.js', '.json', '.vue']
    },
    optimizeDeps: {
      include: ['pako', 'pathe'],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        }
      }
    },
    plugins: [vue(), svgLoader()] as PluginOption[],
    css: {
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 0,
            features: {
              'nesting-rules': true,
              // Electron ships Chromium, which supports CSS logical properties
              // natively. Leave them untouched so `padding-inline-start` /
              // `inset-inline-start` mirror correctly under `dir="rtl"` instead
              // of being down-compiled to hard-coded LTR physical props (#4673).
              'logical-properties-and-values': false
            }
          })
        ]
      }
    }
  }
})
