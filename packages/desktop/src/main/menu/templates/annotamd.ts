import { app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { showAboutDialog } from '../actions/help'
import * as actions from '../actions/annotamd'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'

// macOS only menu.

export default function(keybindings: Keybindings): MenuItemConstructorOptions {
  return {
    label: t('menu.annotamd.title'),
    submenu: [
      {
        label: t('menu.annotamd.about'),
        click(_menuItem, focusedWindow) {
          showAboutDialog(focusedWindow as BrowserWindow | undefined)
        }
      },
      {
        label: t('menu.annotamd.checkUpdates'),
        click(_menuItem, focusedWindow) {
          actions.checkUpdates((focusedWindow as BrowserWindow | undefined) ?? null)
        }
      },
      {
        label: t('menu.annotamd.preferences'),
        accelerator: keybindings.getAccelerator('file.preferences') ?? undefined,
        click() {
          actions.userSetting()
        }
      },
      {
        type: 'separator'
      },
      {
        label: t('menu.annotamd.services'),
        role: 'services',
        submenu: []
      },
      {
        type: 'separator'
      },
      {
        label: t('menu.annotamd.hide'),
        accelerator: keybindings.getAccelerator('annotamd.hide') ?? undefined,
        click() {
          actions.osxHide()
        }
      },
      {
        label: t('menu.annotamd.hideOthers'),
        accelerator: keybindings.getAccelerator('annotamd.hide-others') ?? undefined,
        click() {
          actions.osxHideAll()
        }
      },
      {
        label: t('menu.annotamd.showAll'),
        click() {
          actions.osxShowAll()
        }
      },
      {
        type: 'separator'
      },
      {
        label: t('menu.annotamd.quit'),
        accelerator: keybindings.getAccelerator('file.quit') ?? undefined,
        click: app.quit
      }
    ]
  }
}
