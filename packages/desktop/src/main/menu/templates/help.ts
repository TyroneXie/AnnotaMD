import { shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import * as actions from '../actions/help'
import { checkForUpdates, isAppUpdateSupported } from '../../updater'
import { t } from '../../i18n'

export default function(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      label: t('menu.help.changelog'),
      click() {
        shell.openExternal('https://github.com/TyroneXie/AnnotaMD/releases')
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.help.reportBug'),
      click() {
        shell.openExternal('https://github.com/TyroneXie/AnnotaMD/issues')
      }
    },
    {
      label: t('menu.help.viewSource'),
      click() {
        shell.openExternal('https://github.com/TyroneXie/AnnotaMD')
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.help.license'),
      click() {
        shell.openExternal('https://github.com/TyroneXie/AnnotaMD/blob/main/LICENSE')
      }
    }
  ]

  const helpMenu: MenuItemConstructorOptions = {
    label: t('menu.help.help'),
    role: 'help',
    submenu
  }

  if (isAppUpdateSupported()) {
    submenu.push(
      {
        type: 'separator'
      },
      {
        label: t('menu.help.checkUpdates'),
        click(_menuItem, browserWindow) {
          void checkForUpdates((browserWindow as BrowserWindow | undefined) ?? null)
        }
      }
    )
  }

  if (process.platform !== 'darwin') {
    submenu.push(
      {
        type: 'separator'
      },
      {
        label: t('menu.help.about'),
        click(_menuItem, browserWindow) {
          actions.showAboutDialog(browserWindow as BrowserWindow | undefined)
        }
      }
    )
  }
  return helpMenu
}
