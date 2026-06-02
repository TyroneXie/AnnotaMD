# Codex 语法配色移植可行性分析

> 调查日期：2026-06-02
> 数据来源：`/Users/david/Desktop/codex-app-themes-2026-05-26-235145`（69 套 Codex App 主题）

## 一、两套系统数据模型对比

| 维度 | Codex App 主题 | MarkdownReader 当前 |
|------|---------------|-------------------|
| 主题数量 | 69 套 | 23 套 |
| 数据格式 | VS Code 标准主题 JSON | 5 色基 + 对比度 → 派生 |
| UI 配色 | `colors` 字段，100+ 槽位 | `ThemeColors` 15 个派生令牌 |
| 语法 Token | `tokenColors` 30-50 个 scope | `SyntaxColors` 13 个 Markdown 槽位 |
| 语义 Token | `semanticTokenColors` ~15 类 | 无 |
| Markdown 专用 | `markup.*` scope 精确定义 | 从基色派生（硬编码混合比例） |
| 代码高亮 | 完整的按语言 scope 着色 | 无（代码块单色） |

## 二、关键发现

### 2.1 Codex Markdown 配色 vs MarkdownReader 派生配色

Codex 的 Markdown 配色有独立的语义色彩体系（红/橙/紫/绿/灰各司其职），而 MarkdownReader 的 SyntaxColors 全部从 5 个基色数学派生，丢失了大量色彩个性。

| Codex scope | 颜色 (codex-dark) | MarkdownReader 当前 |
|---|---|---|
| `markup.heading` | `#F67576` (红) | heading → 从 accent 派生 |
| `markup.bold` | `#FA994C` (橙) | bold → ink+accent 混合 |
| `markup.italic` | `#F67576` (红) | italic → ink+success 混合 |
| `markup.inline.raw` | `#85df7b` (绿) | codeSpan → 硬编码暖黄 |
| `markup.quote` | `#999999` (灰) | blockquote → ink 透明度 |
| `punctuation.definition.list` | `#F67576` (红) | listMarker → accent |

### 2.2 现有系统缺陷

1. **`codeBlockBackground` 是死字段** — 定义但从未消费，Raw 视图代码块没有背景色
2. **`codeSpan` 和 `codeBlock` 硬编码 RGB** — 不跟随主题色派生
3. **5 个字段直接等于 `accent`** — heading、link、listMarker、image 近似，丢失主题个性
4. **`danger` 参数传入但未使用** — 设计遗留
5. **Rendered 视图硬编码 `.gitHub` 样式** — 完全独立于 SyntaxColors，主题切换无效

### 2.3 58% 的 Codex 主题缺少 semanticTokenColors

- 29/69 套有 `semanticTokenColors`
- 40/69 套为 null（包括 Dracula、GitHub Dark/Light、Nord、Catppuccin 全系列、Gruvbox 等）
- 所有 69 套都有 `tokenColors`，可从中提取关键 scope 作为回退

## 三、Textual 渲染管线分析

MarkdownReader 已集成 Textual v0.3.1。Textual 提供了完整的样式扩展点：

### 3.1 StructuredText.Style 协议

```swift
public protocol Style {
    var inlineStyle: InlineStyle { get }           // 行内格式
    var headingStyle: HeadingStyle { get }          // 标题
    var paragraphStyle: ParagraphStyle { get }      // 段落
    var blockQuoteStyle: BlockQuoteStyle { get }    // 引用
    var codeBlockStyle: CodeBlockStyle { get }      // 代码块
    var listItemStyle: ListItemStyle { get }        // 列表
    var tableStyle: TableStyle { get }              // 表格
    var tableCellStyle: TableCellStyle { get }      // 表格单元格
    var thematicBreakStyle: ThematicBreakStyle { get } // 分隔线
}
```

### 3.2 InlineStyle — 行内格式颜色

```swift
InlineStyle()
    .code(.monospaced, .fontScale(0.85), .backgroundColor(...))
    .strong(.fontWeight(.semibold))
    .link(.foregroundColor(...))
    .emphasis(.italic)
    .strikethrough(.strikethroughStyle(.single))
```

### 3.3 HighlighterTheme — 代码高亮主题

```swift
HighlighterTheme(
    foregroundColor: DynamicColor,
    backgroundColor: DynamicColor,
    tokenProperties: [TokenType: AnyTextProperty]
)
```

TokenType 有 30+ 种预定义类型，与 Codex 的 semanticTokenColors 几乎一一对应：

| Codex semanticToken | Textual TokenType |
|---|---|
| keyword | `.keyword` |
| string | `.string` |
| number | `.number` |
| comment | `.comment` |
| variable | `.variable` |
| function | `.functionName` |
| type/class | `.className` |
| property | `.property` |
| constant | `.constant` |
| namespace | `.namespace` |
| regexp | `.regex` |

### 3.4 DynamicColor — 自适应颜色

Textual 的 `DynamicColor` 支持 light/dark/highContrast 变体，接受 SwiftUI Color 作为参数：

```swift
DynamicColor(light: Color(...), dark: Color(...))
```

## 四、可行性结论

### ✅ 完全可行：Markdown 渲染配色（Raw + Rendered 视图同步）

**方案**：创建 `MarkdownSyntaxOverrides` 数据结构 + `ThemeAwareStyle` 实现 `StructuredText.Style`

### ✅ 完全可行：代码高亮配色注入 Rendered 视图

**方案**：从 Codex 数据生成 `HighlighterTheme`，通过 `.textual.highlighterTheme()` 注入

### ✅ 完全可行：代码高亮配色注入 Raw 视图

**方案**：扩展 `MarkdownSyntaxHighlighter` 的代码块着色，从单色改为按 token 着色

## 五、MarkdownSyntaxOverrides 字段设计

```swift
struct MarkdownSyntaxOverrides: Codable, Equatable {
    // Markdown 结构配色（用于 Raw + Rendered 视图）
    var heading: String?              // markup.heading
    var bold: String?                 // markup.bold
    var italic: String?               // markup.italic
    var strikethrough: String?        // markup.strikethrough
    var codeSpan: String?             // markup.inline.raw
    var codeBlockBackground: String?  // 代码块背景
    var link: String?                 // markup.underline.link
    var blockquote: String?           // markup.quote
    var listMarker: String?           // punctuation.definition.list
    var tableBorder: String?          // 表格边框
    var tableHeader: String?          // 表头
    var horizontalRule: String?       // 分隔线

    // 代码语法配色（用于 Rendered 视图的 HighlighterTheme）
    var codeKeyword: String?          // keyword
    var codeString: String?           // string
    var codeComment: String?          // comment
    var codeNumber: String?           // number
    var codeFunction: String?         // function
    var codeVariable: String?         // variable
    var codeClass: String?            // class/type
    var codeProperty: String?         // property
    var codeConstant: String?         // constant
    var codeOperator: String?         // operator
}
```

## 六、Codex 配色数据提取策略

### 双源回退（覆盖全部 69 套主题）

1. **优先 `semanticTokenColors`**（29 套有数据）
2. **回退到 `tokenColors` scope 提取**（69 套全覆盖）

从 `tokenColors` 提取的映射规则：

```
keyword   ← scope 含 "keyword" 的第一条
string    ← scope 含 "string" 且不含 "markup"
comment   ← scope 含 "comment"
variable  ← scope 含 "variable" 且不含 "parameter"
function  ← scope 含 "function" 或 "entity.name.function"
number    ← scope 含 "constant.numeric"
type      ← scope 含 "entity.name.type" 或 "support.class"
parameter ← scope 含 "parameter"
property  ← scope 含 "property"
```

## 七、实施路径

| 优先级 | 内容 | 工作量 | 说明 |
|:---:|---|:---:|---|
| **P0** | `MarkdownSyntaxOverrides` 数据结构 + 双源提取脚本 | 1 天 | 69 套主题全覆盖 |
| **P0** | `SyntaxColors.from()` 支持 override 回退 | 0.5 天 | 向后兼容 |
| **P0** | 修复 `codeBlockBackground`/`codeSpan`/`codeBlock` 硬编码 | 0.5 天 | 修复死字段 |
| **P0** | `ThemeAwareStyle` 实现 `StructuredText.Style` | 2 天 | Rendered 视图主题桥接 |
| **P0** | `ThemeAwareHighlighterTheme` 从 Codex 数据生成 | 1 天 | Rendered 视图代码高亮 |
| **P1** | Raw 视图代码语法高亮（正则方案） | 3 天 | 中期 |
| **P2** | 扩充主题库 ~30 套 | 2 天 | 长期 |

**总工作量**：P0 约 5 天，P1 + P2 约 5 天。

## 八、风险与注意事项

1. **Codex 主题哈希文件名** — 更新后哈希可能变化，但 `id` 和 `name` 字段稳定
2. **浅色/深色对应** — 69 套中约 45 套深色、24 套浅色，需确保浅色主题可读性
3. **Textual DynamicColor 桥接** — 从 SwiftUI Color 转换为 Textual DynamicColor 是直接的
4. **两套视图同步** — Raw 视图用 SyntaxColors（NSColor），Rendered 视图用 ThemeAwareStyle（DynamicColor），需确保颜色值一致
