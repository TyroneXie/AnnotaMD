import {
  SEPARATOR,
  getNewFile,
  getNewDirectory,
  getCOPY,
  getCUT,
  getPASTE,
  getRENAME,
  getDELETE,
  getCopyName,
  getCopyPath,
  getShowInFolder
} from './menuItems'
import { popupContextMenu, type ContextMenuItem } from '../popupMenu'
import { t } from '../../i18n'

export const showContextMenu = (
  event: { clientX: number; clientY: number },
  hasPathCache: boolean
): void => {
  const contextItems: ContextMenuItem[] = [
    getNewFile(),
    getNewDirectory(),
    SEPARATOR,
    getCOPY(),
    getCUT(),
    getPASTE(),
    SEPARATOR,
    getRENAME(),
    getDELETE(),
    SEPARATOR,
    getCopyName(),
    getCopyPath(),
    getShowInFolder()
  ]

  // PASTE entry (index 5) toggles based on the cached source path.
  contextItems[5].enabled = hasPathCache

  const items: ContextMenuItem[] = contextItems.map((item) => {
    if (!item || item.type === 'separator') return item
    const click = item.click
    return {
      ...item,
      click: click ? () => click(null, null) : undefined
    }
  })

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}

export const showRootContextMenu = (
  event: { clientX: number; clientY: number },
  onRemove: () => void
): void => {
  const contextItems: ContextMenuItem[] = [
    getNewFile(),
    getNewDirectory(),
    SEPARATOR,
    getCopyName(),
    getCopyPath(),
    getShowInFolder(),
    SEPARATOR,
    {
      label: t('sideBar.tree.removeFolderFromWorkspace'),
      id: 'removeFolderFromWorkspaceMenuItem',
      click: onRemove
    }
  ]

  popupContextMenu(contextItems, { x: event.clientX, y: event.clientY })
}
