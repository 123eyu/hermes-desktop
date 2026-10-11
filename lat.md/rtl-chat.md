---
lat:
  require-code-mention: true
---

# RTL chat and Persian locale

Message prose determines its own direction without changing code or bubble controls. Persian is selectable with a small translated shell and English fallback for untranslated keys.

## Bidirectional message rendering

The shared Markdown renderer isolates each semantic prose block, so Arabic, Persian, Hebrew and English can coexist in user and assistant messages under either interface direction.

### Independent prose blocks

Each paragraph detects its first strong character independently; an embedded RTL word in an English-first paragraph cannot switch a whole conversation or bubble to RTL.

### User and assistant messages preserve source

Both real message rows use independent prose direction and LTR inline code without changing message text. Their copy controls retain the exact original Markdown source.

### Structured mixed-language content

Headings, list items and table cells detect direction individually. Lists, quotations and tables also receive auto direction without overriding the document layout contract. Task lists, GFM alignment and LTR inline code remain intact.

### Footnotes retain link targets

Direction wrappers preserve Markdown DOM attributes while excluding the AST node, so footnote IDs, reference targets and return links survive.

### Opposite-direction list marker spacing

A list item with a different direction from its list receives logical marker space on its own starting edge. Uniform lists retain their existing indentation; RTL markers stay within the message at either interface direction.

### Code and toolbar isolation

Fenced code and its language, copy and expansion controls stay LTR even after RTL prose or when code starts with an Arabic comment. Copy preserves the exact source text.

### Plain diagrams and diffs

Plain tree diagrams and colored diff views keep the same LTR code ownership as highlighted fences, preserving glyph layout and added/removed line structure.

## Persian locale

The `fa` locale is registered in types, supported resources, native-name metadata and the RTL list. Common controls and navigation have Persian text; untranslated keys use the existing English fallback.

### Complete locale registration

Both shared translation entry points recognize Persian resources, retain interpolation placeholders and fall back to English for untranslated messages rather than showing raw keys.

### Language picker persistence and fallback

The real language picker selects فارسی, updates and persists the locale, applies `lang=fa` and RTL document direction, displays translated and fallback text, and restores LTR when English is chosen.

### Persisted Persian startup

The provider restores a saved Persian locale from the main process, applies the RTL document and language attributes, and keeps English fallback from overwriting the user's selection during startup.
