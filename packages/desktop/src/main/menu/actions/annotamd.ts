import { Menu, ipcMain } from 'electron'
import { COMMANDS } from '../../commands'
import type { CommandManager } from '../../commands'
import { isOsx } from '../../config'
export { checkForUpdates as checkUpdates } from '../../updater'

// --------------------------------------------------------

export const userSetting = (): void => {
  ipcMain.emit('app-create-settings-window')
}

export const osxHide = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('hide:')
  }
}

export const osxHideAll = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('hideOtherApplications:')
  }
}

export const osxShowAll = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('unhideAllApplications:')
  }
}

// --- Commands -------------------------------------------------------------

export const loadAnnotaMDCommands = (commandManager: CommandManager): void => {
  commandManager.add(COMMANDS.ANNOTAMD_HIDE, osxHide)
  commandManager.add(COMMANDS.ANNOTAMD_HIDE_OTHERS, osxHideAll)
}
