# Code Language Picker Design

## Goal

Make the code-block language picker fast for common use while keeping Prism's full syntax catalogue available without presenting hundreds of unfamiliar languages at once.

## Confirmed behavior

- The first option is localized `Plain Text`; selecting it clears the fenced language.
- The default list contains the 20 common languages already prioritized by AnnotaMD.
- A localized `More Languages` row expands the remaining Prism languages in the same menu.
- Search always covers the full Prism catalogue, including uncommon languages and aliases.
- XML, YAML, JSON, SQL, XQuery, and other real syntax grammars remain independent choices; they are not collapsed into plain text.
- A language uses the existing file icon when available. Otherwise it receives a compact generic icon based on one of four categories: code, markup, query, or configuration. Plain text uses a neutral text icon. No row is left visually blank.
- The current uncommon language remains visible when reopening the picker.

## Visual direction

Feishu-inspired compact menu: restrained white surface, subtle border and shadow, 28px rows, one blue accent, no decorative badges, and aligned icons/labels. The `More Languages` row is a quiet navigation row rather than a language choice.

