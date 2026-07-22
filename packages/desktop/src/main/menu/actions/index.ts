import { loadEditCommands } from './edit'
import { loadFileCommands } from './file'
import { loadFormatCommands } from './format'
import { loadAnnotaMDCommands } from './annotamd'
import { loadParagraphCommands } from './paragraph'
import { loadViewCommands } from './view'
import { loadWindowCommands } from './window'
import type { CommandManager } from '../../commands'

export const loadMenuCommands = (commandManager: CommandManager): void => {
  loadEditCommands(commandManager)
  loadFileCommands(commandManager)
  loadFormatCommands(commandManager)
  loadAnnotaMDCommands(commandManager)
  loadParagraphCommands(commandManager)
  loadViewCommands(commandManager)
  loadWindowCommands(commandManager)
}
