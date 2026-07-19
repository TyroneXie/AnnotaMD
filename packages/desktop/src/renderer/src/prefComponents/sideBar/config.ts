import {
  Setting as GeneralIcon,
  Edit as EditorIcon,
  Brush as ThemeIcon,
  Picture as ImageIcon,
  Operation as KeyBindingIcon,
  Connection as AgentIcon
} from '@element-plus/icons-vue'

import preferences from '../../../../main/preferences/schema.json'
import { t } from '../../i18n'

interface PrefCategory {
  name: string
  label: string
  icon: unknown
  path: string
}

interface PreferenceSchemaEntry {
  description: string
  enum?: unknown[]
  [key: string]: unknown
}

interface TranslatedSearchEntry {
  key: string
  category: string
  categoryEn: string
  preference: string
  preferenceEn: string
  routeCategory: string
  description: string
  enum: unknown[] | undefined
}

const preferencesSchema = preferences as unknown as Record<string, PreferenceSchemaEntry>

export const getCategory = (): PrefCategory[] => [
  {
    name: t('preferences.categories.general'),
    label: 'general',
    icon: GeneralIcon,
    path: '/preference/general'
  },
  {
    name: t('preferences.categories.editor'),
    label: 'editor',
    icon: EditorIcon,
    path: '/preference/editor'
  },
  {
    name: t('preferences.categories.theme'),
    label: 'theme',
    icon: ThemeIcon,
    path: '/preference/theme'
  },
  {
    name: t('preferences.categories.image'),
    label: 'image',
    icon: ImageIcon,
    path: '/preference/image'
  },
  {
    name: t('preferences.categories.agent'),
    label: 'agent',
    icon: AgentIcon,
    path: '/preference/agent'
  },
  {
    name: t('preferences.categories.keybindings'),
    label: 'keybindings',
    icon: KeyBindingIcon,
    path: '/preference/keybindings'
  }
]

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export const getTranslatedSearchContent = (): TranslatedSearchEntry[] => {
  // Generate keys by iterating through each language
  const result: TranslatedSearchEntry[] = []
  Object.keys(preferencesSchema).forEach((k) => {
    const entry = preferencesSchema[k]
    if (!entry) return
    const { description, enum: emums } = entry

    if (description.endsWith('--internal')) return

    const [category] = description.split('--')
    const categoryName = category ?? ''

    // Map category names
    let mappedCategory = categoryName.toLowerCase()
    if (categoryName === 'General') mappedCategory = 'general'
    else if (categoryName === 'Editor') mappedCategory = 'editor'
    else if (categoryName === 'Markdown') mappedCategory = 'editor'
    else if (categoryName === 'Theme') mappedCategory = 'theme'
    else if (categoryName === 'Image') mappedCategory = 'image'
    else if (categoryName === 'View') mappedCategory = 'view'
    else if (categoryName === 'Searcher') mappedCategory = 'searcher'
    else if (categoryName === 'Watcher') mappedCategory = 'watcher'
    else if (categoryName === 'Spelling') mappedCategory = 'editor'
    else if (categoryName === 'Custom CSS') mappedCategory = 'custom css'
    else {
      // Handle special category names
      mappedCategory = categoryName.toLowerCase().replace(/\s+/g, '-')
    }

    // Compute the category for route navigation (only allow existing routes, otherwise fall back to general)
    let routeCategory = mappedCategory
    const validRoutes = [
      'general',
      'editor',
      'theme',
      'image',
      'keybindings',
      'agent'
    ]
    if (!validRoutes.includes(routeCategory)) routeCategory = 'general'

    // Try to translate the category and item
    const categoryKey = `preferences.search.categories.${mappedCategory}`
    const itemKey = `preferences.search.items.${k}`

    // Translate the category name
    let translatedCategory = categoryName
    const englishCategory = categoryName
    try {
      translatedCategory = t(categoryKey)
    } catch (e) {
      console.warn(`   ⚠️ Search category translation failed: ${errMessage(e)}`)
      // Try fallback to preferences.categories
      try {
        const fallbackKey = `preferences.categories.${mappedCategory}`
        translatedCategory = t(fallbackKey)
      } catch (e2) {
        console.warn(`   ❌ Search category fallback also failed: ${errMessage(e2)}`)
        translatedCategory = categoryName
      }
    }

    // Translate preference description
    let translatedPreference = description.split('--')[1] || description
    const englishPreference = description.split('--')[1] || description
    try {
      translatedPreference = t(itemKey)
    } catch (e) {
      console.warn(`   ⚠️ Search item translation failed: ${errMessage(e)}`)
      // Try fallback to preferences.items
      try {
        const fallbackKey = `preferences.items.${k}`
        translatedPreference = t(fallbackKey)
      } catch (e2) {
        console.warn(`   ❌ Search item fallback also failed: ${errMessage(e2)}`)
        translatedPreference = description.split('--')[1] || description
      }
    }

    result.push({
      key: k,
      category: translatedCategory,
      categoryEn: englishCategory,
      preference: translatedPreference,
      preferenceEn: englishPreference,
      routeCategory,
      description,
      enum: emums
    })
  })
  return result
}
