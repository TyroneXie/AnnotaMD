import type { RouteRecordRaw } from 'vue-router'

// Editor and preferences share one renderer entry but never appear in the same
// window. Keep their code in separate chunks so each window only parses the
// route it actually renders. Preference categories are split for the same
// reason: opening General should not eagerly load Agent, Theme, or Image.
const App = () => import('@/pages/app.vue')
const Preference = () => import('@/pages/preference.vue')
const General = () => import('@/prefComponents/general/index.vue')
const Editing = () => import('@/prefComponents/editing/index.vue')
const Theme = () => import('@/prefComponents/theme/index.vue')
const Image = () => import('@/prefComponents/image/index.vue')
const Keybindings = () => import('@/prefComponents/keybindings/index.vue')
const Agent = () => import('@/prefComponents/agent/index.vue')

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
