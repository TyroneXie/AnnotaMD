import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] ?? 'quick'
const pack = process.argv[3] ?? 'smoke'

if (!['quick', 'feature'].includes(mode)) {
  console.error('Usage: node scripts/verifyAnnotaMD.mjs <quick|feature> [smoke|menu|table|comments]')
  process.exit(2)
}

const testPacks = {
  menu: {
    cwd: path.join(root, 'packages/muya'),
    command: path.join(root, 'packages/muya/node_modules/.bin/vitest'),
    files: [
      'src/ui/paragraphFrontButton/__tests__/positioning.spec.ts',
      'src/ui/paragraphFrontMenu/__tests__/canTurnIntoMenu.spec.ts',
      'src/ui/paragraphFrontMenu/__tests__/annotamdFrontMenu.spec.ts',
      'src/ui/inlineFormatToolbar/__tests__/strikethroughStyle.spec.ts',
      'src/ui/headingNumberMenu/__tests__/headingNumberMenu.spec.ts',
      'src/ui/__tests__/sharedActionIcons.spec.ts',
      'src/inlineRenderer/__tests__/wysiwygBlockMarkers.spec.ts',
      'src/utils/__tests__/headingNumber.spec.ts',
      'src/__tests__/formatClickEvents.spec.ts',
      'src/editor/__tests__/clickableAutolink.spec.ts',
      'src/editor/__tests__/linkCursorStyle.spec.ts',
      'src/ui/linkTools/__tests__/linkTools.spec.ts',
      'src/ui/emojiSelector/__tests__/emojiSelector.spec.ts',
      'src/block/base/__tests__/formatEmojiInsertion.spec.ts',
      'src/block/content/paragraphContent/__tests__/enterHandler.spec.ts',
      'src/block/commonMark/html/__tests__/htmlPreviewEmptyGuard.spec.ts',
      'src/editor/__tests__/initialPreviewFocus.spec.ts',
      'src/state/__tests__/markdownToState.spec.ts',
      'src/ui/imageResizeBar/__tests__/imageResizeBarStyle.spec.ts',
      'src/ui/imageResizeBar/__tests__/imageResizeSnap.spec.ts',
      'src/selection/__tests__/imageHoverResize.spec.ts',
      'src/block/base/__tests__/imageSelfClose.spec.ts',
      'src/block/extra/highlightBlock/__tests__/highlightBlock.spec.ts'
    ]
  },
  table: {
    cwd: path.join(root, 'packages/muya'),
    command: path.join(root, 'packages/muya/node_modules/.bin/vitest'),
    files: [
      'src/block/gfm/table/__tests__/tableLayoutCss.spec.ts',
      'src/ui/tableDragBar/__tests__/insertionSide.spec.ts',
      'src/ui/tableRowColumMenu/__tests__/axisSelection.spec.ts',
      'src/ui/tableRowColumMenu/__tests__/axisSelectionStyle.spec.ts',
      'src/ui/tableRowColumMenu/__tests__/toolbarConfig.spec.ts',
      'src/ui/tableColumnToolbar/__tests__/hoverGuard.spec.ts'
    ]
  },
  comments: {
    cwd: path.join(root, 'packages/desktop'),
    command: path.join(root, 'packages/desktop/node_modules/.bin/vitest'),
    files: [
      'test/unit/specs/annotamd-comment-highlights.spec.ts',
      'test/unit/specs/annotamd-comment-navigation.spec.ts',
      'test/unit/specs/annotamd-comment-anchor-lifecycle.spec.ts',
      'test/unit/specs/annotamd-comment-storage.spec.ts',
      'test/unit/specs/user-data-branding.spec.ts',
      'test/unit/specs/comment-bubble-layout.spec.ts',
      'test/unit/specs/comment-message-actions.spec.ts',
      'test/unit/specs/comment-pane-resize.spec.ts',
      'test/unit/specs/auto-hide-scrollbar.spec.ts',
      'test/unit/specs/annotamd-mcp-clients.spec.ts',
      'test/unit/specs/mcp-client-initial-render.spec.ts'
    ]
  },
  editor: {
    cwd: path.join(root, 'packages/desktop'),
    command: path.join(root, 'packages/desktop/node_modules/.bin/vitest'),
    files: [
      'test/unit/specs/annotamd-code-block-controls.spec.ts',
      'test/unit/specs/appearance-preferences.spec.ts',
      'test/unit/specs/app-updater.spec.ts',
      'test/unit/specs/annotamd-preference-style.spec.ts',
      'test/unit/specs/auto-save-default.spec.ts',
      'test/unit/specs/empty-state-open-file.spec.ts',
      'test/unit/specs/file-change-content-check.spec.ts',
      'test/unit/specs/macos-installer-volumes.spec.ts',
      'test/unit/specs/native-dialog-localization.spec.ts',
      'test/unit/specs/multi-root-sidebar.spec.ts',
      'test/unit/specs/side-bar-search-ui.spec.ts'
    ]
  }
}

const selectedPacks = pack === 'smoke' ? Object.keys(testPacks) : [pack]
if (selectedPacks.some((name) => !(name in testPacks))) {
  console.error(`Unknown verification pack: ${pack}`)
  process.exit(2)
}

const checks = [
  {
    label: 'working-tree whitespace',
    command: 'git',
    args: ['diff', '--check']
  },
  {
    label: 'staged whitespace',
    command: 'git',
    args: ['diff', '--cached', '--check']
  }
]

for (const name of selectedPacks) {
  const testPack = testPacks[name]
  checks.push({
    label: `${name} tests`,
    command: testPack.command,
    args: ['run', ...testPack.files],
    cwd: testPack.cwd,
    env: { ...process.env, CI: '1' }
  })
}

if (selectedPacks.includes('comments')) {
  checks.push({
    label: 'MCP comment intent workflow tests',
    command: 'npm',
    args: ['test'],
    cwd: path.join(root, 'tools/annotamd-mcp'),
    env: { ...process.env, CI: '1' }
  })
  checks.push({
    label: 'comment anchor OT tests',
    command: path.join(root, 'packages/muya/node_modules/.bin/vitest'),
    args: [
      'run',
      'src/annotations/__tests__/transformAnchor.spec.ts',
      'src/__tests__/replaceTextRangeExact.spec.ts',
      'src/ui/inlineFormatToolbar/__tests__/selectionSync.spec.ts'
    ],
    cwd: path.join(root, 'packages/muya'),
    env: { ...process.env, CI: '1' }
  })
}

if (mode === 'feature') {
  checks.push({
    label: 'AnnotaMD desktop typecheck',
    command: path.join(root, 'packages/desktop/node_modules/.bin/vue-tsc'),
    args: ['--noEmit', '-p', 'tsconfig.annotamd.json'],
    cwd: path.join(root, 'packages/desktop')
  })
}

const startedAt = performance.now()

for (const check of checks) {
  const checkStartedAt = performance.now()
  console.log(`\n[verify:${mode}:${pack}] ${check.label}`)
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd ?? root,
    env: check.env ?? process.env,
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  console.log(`[verify:${mode}:${pack}] passed in ${Math.round(performance.now() - checkStartedAt)} ms`)
}

console.log(`\n[verify:${mode}:${pack}] all checks passed in ${Math.round(performance.now() - startedAt)} ms`)
