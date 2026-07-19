import type { RouteRecordRaw } from 'vue-router'
// .vue extensions are explicit so TS resolves them through the *.vue module
// shim in src/types/renderer.d.ts. Vite handles extension-less imports at
// runtime, but vue-tsc needs the suffix.
import App from '@/pages/app.vue'
import Preference from '@/pages/preference.vue'
import General from '@/prefComponents/general/index.vue'
import Editing from '@/prefComponents/editing/index.vue'
import Theme from '@/prefComponents/theme/index.vue'
import Image from '@/prefComponents/image/index.vue'
import Keybindings from '@/prefComponents/keybindings/index.vue'
import Agent from '@/prefComponents/agent/index.vue'

const parseSettingsPage = (type: string | null | undefined): string => {
  let pageUrl = '/preference'
  const category = type?.match(/\/([^/]+)$/)?.[1]
  if (category) {
    pageUrl += `/${category}`
  }
  return pageUrl
}

const routes = (type: string | null | undefined): RouteRecordRaw[] => [
  {
    path: '/',
    redirect: type === 'editor' ? '/editor' : parseSettingsPage(type)
  },
  {
    path: '/editor',
    component: App
  },
  {
    path: '/preference',
    component: Preference,
    children: [
      {
        path: '',
        component: General
      },
      {
        path: 'general',
        component: General,
        name: 'general'
      },
      {
        path: 'editor',
        component: Editing,
        name: 'editor'
      },
      {
        path: 'markdown',
        redirect: '/preference/editor'
      },
      {
        path: 'spelling',
        redirect: '/preference/editor'
      },
      {
        path: 'theme',
        component: Theme,
        name: 'theme'
      },
      {
        path: 'image',
        component: Image,
        name: 'image'
      },
      {
        path: 'keybindings',
        component: Keybindings,
        name: 'keybindings'
      },
      {
        path: 'agent',
        component: Agent,
        name: 'agent'
      }
    ]
  }
]

export default routes
