import { Menu, MenuItem, nativeImage, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import {
  getCUT,
  getCOPY,
  getPASTE,
  getCopyAsRich,
  getCopyAsHtml,
  getPasteAsPlainText,
  SEPARATOR,
  getInsertBefore,
  getInsertAfter
} from './menuItems'
import spellcheckMenuBuilder from './spellcheck'
import { t } from '../../i18n'

// Electron's ContextMenuParams shape we rely on. Kept narrow — the renderer
// supplies the full surface so we only annotate the fields we use.
interface ContextMenuParams {
  mediaType?: 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin'
  srcURL?: string
  isEditable: boolean
  hasImageContents?: boolean
  selectionText: string
  inputFieldType?: string
  editFlags: {
    canCut: boolean
    canCopy: boolean
    canPaste: boolean
    canEditRichly: boolean
  }
  misspelledWord?: string
  dictionarySuggestions?: string[]
  // Coordinates of the context-menu request. Electron names them `x`/`y` on
  // the params (not the event); the renderer passes them through unchanged.
  x: number
  y: number
}

const createTemplateIcon = (paths: string[]) => {
  const body = paths.map((path) => `<path d="${path}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  icon.setTemplateImage(true)
  return icon
}

const copyImageIcon = createTemplateIcon(['M9 3h6v4H9z', 'M6 5h12v16H6z'])
const downloadImageIcon = createTemplateIcon(['M12 3v12', 'm7 10 5 5 5-5', 'M4 21h16'])

// Electron `webContents.on('context-menu', (event, params) => ...)` provides
// a simple event object with preventDefault — nothing on it is consumed by
// this function, so we keep the type minimal.
type ContextMenuEvent = {
  preventDefault?: () => void
  readonly defaultPrevented?: boolean
}

// Dynamically fetch menu items to ensure correct translation
const getContextItems = (): MenuItemConstructorOptions[] => [
  getInsertBefore(),
  getInsertAfter(),
  SEPARATOR,
  getCUT(),
  getCOPY(),
  getPASTE(),
  SEPARATOR,
  getCopyAsRich(),
  getCopyAsHtml(),
  getPasteAsPlainText()
]

const isInsideEditor = (params: ContextMenuParams): boolean => {
  const { isEditable, editFlags, inputFieldType } = params
  // WORKAROUND for Electron#32102: `params.spellcheckEnabled` is always false. Try to detect the editor container via other information.
  return isEditable && !inputFieldType && !!editFlags.canEditRichly
}

export const showEditorContextMenu = (
  win: BrowserWindow,
  event: ContextMenuEvent,
  params: ContextMenuParams,
  isSpellcheckerEnabled: boolean
): void => {
  const {
    mediaType,
    srcURL,
    isEditable,
    hasImageContents,
    selectionText,
    editFlags,
    misspelledWord,
    dictionarySuggestions
  } = params

  if (mediaType === 'image' && hasImageContents) {
    event.preventDefault?.()
    const menu = new Menu()
    menu.append(new MenuItem({
      id: 'copyImageMenuItem',
      label: t('contextMenu.copyImage'),
      icon: copyImageIcon,
      click: () => win.webContents.copyImageAt(params.x, params.y)
    }))
    menu.append(new MenuItem({
      id: 'downloadImageMenuItem',
      label: t('contextMenu.downloadImage'),
      icon: downloadImageIcon,
      enabled: !!srcURL,
      click: () => {
        if (srcURL) win.webContents.downloadURL(srcURL)
      }
    }))
    menu.popup({ window: win, x: params.x, y: params.y })
    return
  }

  // NOTE: We have to get the word suggestions from this event because `webFrame.getWordSuggestions` and
  //       `webFrame.isWordMisspelled` doesn't work on Windows (Electron#28684).

  // Make sure that the request comes from a contenteditable inside the editor container.
  if (isInsideEditor(params) && !hasImageContents) {
    const hasText = selectionText.trim().length > 0
    const canCopy = hasText && editFlags.canCut && editFlags.canCopy
    // const canPaste = hasText && editFlags.canPaste
    const isMisspelled = isEditable && !!selectionText && !!misspelledWord

    const menu = new Menu()
    if (isSpellcheckerEnabled) {
      const spellingSubmenu = spellcheckMenuBuilder(
        isMisspelled,
        misspelledWord,
        dictionarySuggestions
      )
      menu.append(
        new MenuItem({
          label: t('contextMenu.spelling'),
          submenu: spellingSubmenu as Electron.MenuItemConstructorOptions[]
        })
      )
      menu.append(new MenuItem(SEPARATOR))
    }

    const contextItems = getContextItems()
    const copyItems = [contextItems[3], contextItems[4], contextItems[8], contextItems[7]] // CUT, COPY, COPY_AS_HTML, COPY_AS_RICH
    copyItems.forEach((item) => {
      if (item) item.enabled = canCopy
    })
    contextItems.forEach((item) => {
      menu.append(new MenuItem(item))
    })
    // The original JS passes an array literal here, which Electron treats as
    // the options object. Cast to satisfy the typed overload.
    // The original JS passed an array literal — Electron tolerated it. The
    // typed overload wants an options object, so produce one explicitly.
    // `event` is intentionally unused (params carries x/y); the function
    // signature keeps it to mirror the webContents.on('context-menu', ...)
    // (event, params) shape.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    event
    menu.popup({ window: win, x: params.x, y: params.y })
  }
}
