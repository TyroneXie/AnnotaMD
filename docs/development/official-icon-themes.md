# 官方图标主题维护

AnnotaMD 的菜单图标通过 Iconify 的官方 JSON 包在开发期生成。应用运行时只加载
`packages/muya/src/ui/generatedOfficialIconThemes.ts` 中实际使用到的图标，不会携带完整图标库。

## 已接入的官方图标库

| 主题 | 本地包 | 许可证 |
| --- | --- | --- |
| Tabler Icons | `@iconify-json/tabler` | MIT |
| Lucide | `@iconify-json/lucide` | ISC |
| Phosphor Icons | `@iconify-json/ph` | MIT |
| Remix Icon | `@iconify-json/ri` | Apache-2.0 |
| Material Symbols | `@iconify-json/material-symbols` | Apache-2.0 |
| Hugeicons | `@iconify-json/hugeicons` | MIT |
| Material Design Icons | `@iconify-json/mdi` | Apache-2.0 |
| Bootstrap Icons | `@iconify-json/bi` | MIT |

包版本由根目录的 `package.json` 和 `pnpm-lock.yaml` 锁定，安装项目依赖后即可离线检索。

## 查找和添加图标

按英文关键词搜索全部本地图标库：

```bash
npm run icons:search -- heading
npm run icons:search -- quote
```

在 `scripts/generateOfficialIconThemes.mjs` 的语义映射中选定图标后，重新生成精简资源：

```bash
npm run icons:generate
```

生成后运行菜单回归检查，并在 Electron 中检查实际大小、粗细和对齐：

```bash
npm run verify:menu
```

不要直接编辑 `generatedOfficialIconThemes.ts`，否则下次生成会覆盖手工修改。
