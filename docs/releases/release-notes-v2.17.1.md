# AnnotaMD v2.17.1

## 修复

- “删除本章节”现在单击即可删除当前标题及其所属内容，无需再次确认；误删可通过撤销一次恢复完整章节。
- 修正 Windows 标题栏按钮顺序，从左到右依次为最小化、最大化或还原、关闭。
- 修复 Windows 关闭按钮右侧留白，点击区域和红色悬停背景贴齐窗口右边缘，普通窗口与最大化状态均保持一致。

## macOS 安装提示

当前 macOS 安装包使用 ad-hoc 签名。拖入“应用程序”后，如系统阻止启动，可在“系统设置 → 隐私与安全性”中选择“仍要打开”，或执行：

```bash
xattr -cr /Applications/AnnotaMD.app
```

## 下载校验

安装包校验值见 Release 中的 `SHA256SUMS.txt`，可在下载目录执行：

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

## 完整变更

[查看 v2.17.0 到 v2.17.1 的完整提交差异](https://github.com/TyroneXie/AnnotaMD/compare/v2.17.0...v2.17.1)
