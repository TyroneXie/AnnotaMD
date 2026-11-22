import { access } from 'node:fs/promises'
import { join } from 'node:path'

export default async function verifyPackedPiRuntime ({ packager, appOutDir }) {
  const resources = packager.getResourcesDir(appOutDir)
  const requiredFiles = [
    'pi/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
    'pi/node_modules/jiti/package.json',
    'pi-adapter/adapter.mjs'
  ]
  await Promise.all(requiredFiles.map(async file => {
    try {
      await access(join(resources, file))
    } catch (error) {
      throw new Error(`Missing bundled Pi runtime file: ${file}`, { cause: error })
    }
  }))
}
