# 本地 Markdown 评论系统设计

> 状态：已确认，进入实现
> 日期：2026-07-18
> 取代：HTML 注释内联存储草案

## 1. 产品边界

AnnotaMD 的评论不得修改 Markdown，也不得在文档附近创建 `.annotamd` 或其他旁车文件。
评论统一保存在应用本机 SQLite 数据库中：

```text
<AnnotaMD 应用数据目录>/annotations.sqlite
```

由此确定以下产品语义：

- Typora、GitHub、飞书及普通文件读取只获得干净 Markdown。
- 复制、另存为产生的新文件不继承评论。
- 能确认是同一文件的重命名和移动保留评论。
- 删除文件后记录隐藏保留 7 天，随后自动删除。
- 被评论的可见文字发生变化时评论消失；只修改上下文或其他位置时评论保留。
- 无法可靠判断锚点时删除评论，不把评论绑定到可能错误的位置。

## 2. 数据流

```text
Muya JSON OT 编辑事务 ──> 实时变换评论锚点 ──> 内存评论状态
        │                                      │
        └──> Markdown 自动保存                 └──> SQLite 事务

外部文件变化 ──> 最近快照 diff ──> 锚点映射与严格校验

Agent ──> MCP Comment Service ──> 同一编辑事务/SQLite 服务
```

SQLite 是唯一持久化数据源。渲染进程、MCP 和 Agent 均不得直接拼接 SQL，统一调用
主进程 Comment Service。

## 3. 重复文字与实时锚点

评论不通过全文搜索引文定位，而是绑定到某个文档版本中的具体文本范围：

```json
{
  "path": [3, "text"],
  "start": 12,
  "end": 20,
  "exactText": "被评论文字",
  "revision": 42
}
```

Muya 每次编辑都会发出 `json-change`，其中包含 `ot-json1` 操作。评论端点使用
`ot-json1.transformPosition` 穿过同一操作，因此列表插入、块移动及文字编辑都会更新
准确位置，与文档中是否存在相同文字无关。

### 3.1 编辑规则

| 操作                     | 结果                    |
| ------------------------ | ----------------------- |
| 评论前插入或删除         | 变换起止位置，评论保留  |
| 评论后修改               | 评论保留                |
| 修改其他相同文字         | 评论保留                |
| 修改或删除评论选区       | 评论删除                |
| 块在 AnnotaMD 内移动     | 锚点随 OT move 操作移动 |
| 仅改变格式且可见文字未变 | 评论保留                |

实时变换发生在内存中，SQLite 写入可随自动保存合并提交，避免每次按键写数据库。

### 3.2 外部修改

SQLite 为存在评论的文档保存一份最新压缩正文快照，不保存完整历史。外部工具写入文件时：

1. 比较旧快照和新正文，生成位置映射。
2. 映射评论起止范围。
3. 校验映射后的可见文字与 `exactText` 相同。
4. 校验失败或存在不可判定歧义时删除评论。

## 4. 文件身份

文档以内部 `document_id` 为评论归属，绝对路径仅是当前地址。SQLite 同时记录：

- 当前路径及路径历史；
- 系统 file ID（macOS/Linux 使用 device + inode）；
- 最近内容哈希和快照；
- 文档 revision；
- `missing_since`。

行为：

- AnnotaMD 内重命名/移动：显式更新原 `document_id`。
- 同磁盘外部移动：通过 file ID 恢复。
- 新 file ID：视为干净新文档，不按内容哈希继承评论。
- 应用关闭期间跨磁盘复制并删除原件：无法证明是移动时仍视为新文档。
- 文件缺失：设置 `missing_since`，不显示评论；7 天后级联删除。

## 5. SQLite 模型

最小数据表：

- `documents`：身份、路径、file ID、revision、快照、缺失时间。
- `comments`：范围、引文、正文、状态、revision、创建及更新时间。
- `messages`：人或 Agent 的线程回复。

写操作使用事务与 revision 乐观锁。每次评论或正文变更都增加 revision，旧版本写入返回
`STALE_DOCUMENT` 或 `STALE_COMMENT`，不得覆盖新数据。

## 6. MCP 接口

### 6.1 Resources

- `annotamd://inbox`
- `annotamd://documents/{documentId}`
- `annotamd://documents/{documentId}/comments`

### 6.2 第一阶段 Tools

- `annotamd_read_document`
- `annotamd_list_comments`
- `annotamd_get_comment`
- `annotamd_reply_comment`
- `annotamd_apply_comment_edit`
- `annotamd_resolve_comment`

所有写操作必须提交 `expectedRevision`。

`annotamd_apply_comment_edit` 根据 comment ID 获取真实锚点并通过 AnnotaMD 编辑事务替换，
Agent 不提供文本出现次数，也不自己搜索重复文字。替换成功后保留处理回复，并将评论标记为已解决；
用户仍可查看这条处理记录或重新打开评论。普通手动编辑直接改变被评论文字时，评论仍按产品规则删除。

第二阶段再提供 `annotamd_apply_document_patch`，用于在评论选区之外插入示例或重写章节。

## 7. 数据迁移

升级时读取一次旧的 `annotamd.comments.v2` localStorage：

1. 为仍存在的文件建立 SQLite 文档身份。
2. 迁移评论、回复和当前 Muya 路径。
3. 成功提交 SQLite 后删除旧键。
4. 不把任何内容写入 Markdown。

## 8. 验收标准

1. 新增、回复、解决和删除评论时 Markdown 字节不变。
2. 文档中存在大量重复文字时，修改其他重复项不影响目标评论。
3. 评论前后编辑、章节移动后评论仍准确跟随。
4. 被评论可见文字任意增删改后评论消失。
5. 复制、另存为不继承评论；同文件重命名和移动保留评论。
6. 删除文件后评论隐藏，7 天后自动清理。
7. MCP 能读取、回复、精确修改和解决评论，并拒绝过期 revision。
8. Electron 中打开真实长文档验证高亮、评论栏、撤销和自动保存。
