export const copyFileName = (pathname: string): void => {
  window.electron.clipboard.writeText(window.path.basename(pathname))
}

export const copyFilePath = (pathname: string): void => {
  window.electron.clipboard.writeText(pathname)
}
