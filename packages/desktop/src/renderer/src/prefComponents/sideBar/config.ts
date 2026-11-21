import {
  Setting as GeneralIcon,
  Edit as EditorIcon,
  Brush as ThemeIcon,
  Picture as ImageIcon,
  Operation as KeyBindingIcon,
  Connection as AgentIcon
} from '@element-plus/icons-vue'

import { t } from '../../i18n'

interface PrefCategory {
  name: string
  label: string
  icon: unknown
  path: string
}

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
