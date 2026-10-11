import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  useEffect,
  memo,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy } from "lucide-react";
import { useI18n } from "./useI18n";
import { MediaImage, DownloadChip } from "./MediaImage";
import { describeImageSrc } from "../screens/Chat/mediaUtils";

// Lazy-load the heavy syntax highlighter — only imported when a code block renders
let _highlighterMod: typeof import("react-syntax-highlighter") | null = null;
let _oneDark: Record<string, React.CSSProperties> | null = null;
let _loadingPromise: Promise<void> | null = null;

// Box Drawing (U+2500\u2013U+257F) plus Block Elements (U+2580\u2013U+259F): tree
// connectors like \u251C\u2500\u2500 \u2514\u2500\u2500 \u2502 and the shading/progress-bar glyphs \u2588 \u2591 \u2592 \u2593.
const BOX_DRAWING_RE = /[\u2500-\u259F]/;

// A block is a "box diagram" (tree output, table borders, progress bars) only
// when box-drawing characters dominate it \u2014 at least half of its non-empty
// lines contain one. A single \u2502 in a string literal or comment must NOT
// demote a whole source file to plain text, but a tree diagram (box chars on
// nearly every line) should never go through Prism: it fragments each glyph
// into nested token spans, which Electron renderers with imperfect Unicode
// metrics can visually truncate or misalign.
function isBoxDiagram(code: string): boolean {
  const lines = code.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return false;
  const boxLines = lines.filter((line) => BOX_DRAWING_RE.test(line)).length;
  return boxLines * 2 >= lines.length;
}

const PLAIN_PRE_STYLE: React.CSSProperties = {
  margin: 0,
  borderRadius: 0,
  fontSize: "13px",
  lineHeight: 1.5,
  padding: "12px",
  background: "transparent",
  color: "inherit",
  overflowX: "auto",
  whiteSpace: "pre",
  fontVariantLigatures: "none",
  unicodeBidi: "isolate",
};
const PLAIN_CODE_STYLE: React.CSSProperties = {
  background: "transparent",
  padding: 0,
  whiteSpace: "pre",
};

function loadHighlighter(): Promise<void> {
  if (_highlighterMod && _oneDark) return Promise.resolve();
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism/one-dark"),
  ]).then(([mod, style]) => {
    _highlighterMod = mod;
    _oneDark = style.default;
  });
  return _loadingPromise;
}

// Diff viewer with colored +/- lines
function DiffView({ code }: { code: string }): React.JSX.Element {
  const lines = code.split("\n");
  return (
    <div className="chat-diff-content">
      {lines.map((line, i) => {
        let cls = "chat-diff-line";
        if (line.startsWith("+")) cls += " chat-diff-add";
        else if (line.startsWith("-")) cls += " chat-diff-remove";
        else if (line.startsWith("@@")) cls += " chat-diff-hunk";
        return (
          <div key={i} className={cls}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}

function PlainCodeView({ code }: { code: string }): React.JSX.Element {
  return (
    <pre className="chat-code-plain" style={PLAIN_PRE_STYLE}>
      <code style={PLAIN_CODE_STYLE}>{code}</code>
    </pre>
  );
}

// Source-position ids of code blocks the user has expanded. Kept at module
// scope so the choice survives the remounts react-markdown causes while a
// message is still streaming (index-based keys shift as the AST grows, which
// would otherwise reset a per-component useState back to collapsed).
const expandedCodeBlocks = new Set<string>();

// Code block with syntax highlighting and copy button (lazy-loaded highlighter)
function CodeBlock({
  className,
  children,
  blockId,
}: {
  className?: string;
  children?: React.ReactNode;
  blockId?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    blockId ? !expandedCodeBlocks.has(blockId) : true,
  );
  const [highlighterReady, setHighlighterReady] = useState(
    () => _highlighterMod !== null && _oneDark !== null,
  );
  const code = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const isDiff = language === "diff";
  // Diffs win over the box-diagram check: DiffView is already a plain per-line
  // renderer (no Prism), so it has no fragmentation risk, and a patch touching
  // a tree diagram must keep its colored +/- view.
  const boxDiagram = !isDiff && isBoxDiagram(code);

  const linesCount = code.split("\n").length;
  const isLong = linesCount > 15 || code.length > 800;

  // Trigger lazy load when code block mounts. Box diagrams and diffs never
  // use Prism, so don't pull in the highlighter for them (see isBoxDiagram).
  useEffect(() => {
    if (!boxDiagram && !isDiff && !highlighterReady) {
      loadHighlighter().then(() => setHighlighterReady(true));
    }
  }, [boxDiagram, highlighterReady, isDiff]);

  function handleCopy(): void {
    void window.hermesAPI.copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const codeContent = isDiff ? (
    <DiffView code={code} />
  ) : boxDiagram ? (
    <PlainCodeView code={code} />
  ) : highlighterReady && _highlighterMod && _oneDark ? (
    <_highlighterMod.Prism
      style={_oneDark}
      language={language || "text"}
      PreTag="div"
      customStyle={{
        margin: 0,
        borderRadius: 0,
        fontSize: "13px",
        padding: "12px",
        background: "transparent",
      }}
    >
      {code}
    </_highlighterMod.Prism>
  ) : (
    <PlainCodeView code={code} />
  );

  return (
    <div className="chat-code-block" dir="ltr">
      <div className="chat-code-header">
        <span className="chat-code-lang">
          {/* Keep the fence's declared language even when a box diagram
              renders plain — the header describes the fence, not the
              renderer. Only default to "text" when none was declared. */}
          {isDiff ? "diff" : language || (boxDiagram ? "text" : "code")}
        </span>
        <button className="chat-code-copy" onClick={handleCopy}>
          {copied ? t("common.copied") : <Copy size={13} />}
        </button>
      </div>
      <div className={isLong && isCollapsed ? "chat-code-collapsed" : ""}>
        {codeContent}
      </div>
      {isLong && (
        <button
          type="button"
          className="chat-code-expand-btn"
          onClick={() =>
            setIsCollapsed((prev) => {
              const next = !prev;
              if (blockId) {
                if (next) expandedCodeBlocks.delete(blockId);
                else expandedCodeBlocks.add(blockId);
              }
              return next;
            })
          }
        >
          {isCollapsed
            ? t("common.showMore") || "Show more"
            : t("common.showLess") || "Show less"}
        </button>
      )}
    </div>
  );
}

type DirectionProseProps = React.HTMLAttributes<HTMLElement> &
  ExtraProps & {
    inheritDirection?: boolean;
  };

function DirectionProse({
  as: Tag = "p",
  node: _node,
  inheritDirection = false,
  ...props
}: DirectionProseProps & {
  as?: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}): React.JSX.Element {
  return <Tag {...props} dir={inheritDirection ? undefined : "auto"} />;
}

// Native dir=auto ignores descendants with their own dir attribute. Expose
// the first prose block to its item's/quote's scan, while later blocks
// still choose independently. Code/media-only paragraphs cannot own a marker.
function hasProseText(node: NonNullable<ExtraProps["node"]>): boolean {
  if (
    node.tagName === "code" ||
    node.tagName === "pre" ||
    node.tagName === "img"
  ) {
    return false;
  }
  return node.children.some((child) =>
    child.type === "text"
      ? child.value.trim().length > 0
      : child.type === "element" && hasProseText(child),
  );
}

function exposeFirstProse(children: React.ReactNode): React.ReactNode {
  let exposed = false;
  return Children.map(children, (child) => {
    if (exposed || !isValidElement<DirectionProseProps>(child)) return child;
    const node = child.props.node;
    if (!node || !/^(p|h[1-6])$/.test(node.tagName) || !hasProseText(node))
      return child;
    exposed = true;
    return cloneElement(child, { inheritDirection: true });
  });
}

// A wrapper alone gives every block the first paragraph's direction. Each
// prose block must make its own choice; code is intentionally kept LTR.
const DIRECTION_COMPONENTS: Components = {
  p: DirectionProse,
  h1: (props) => <DirectionProse {...props} as="h1" />,
  h2: (props) => <DirectionProse {...props} as="h2" />,
  h3: (props) => <DirectionProse {...props} as="h3" />,
  h4: (props) => <DirectionProse {...props} as="h4" />,
  h5: (props) => <DirectionProse {...props} as="h5" />,
  h6: (props) => <DirectionProse {...props} as="h6" />,
  blockquote: ({ node: _node, children, ...props }) => (
    <blockquote {...props} dir="auto">
      {exposeFirstProse(children)}
    </blockquote>
  ),
  ul: ({ node: _node, ...props }) => <ul {...props} dir="auto" />,
  ol: ({ node: _node, ...props }) => <ol {...props} dir="auto" />,
  li: ({ node: _node, children, ...props }) => (
    <li {...props} dir="auto">
      {exposeFirstProse(children)}
    </li>
  ),
  table: ({ node: _node, ...props }) => <table {...props} dir="auto" />,
  th: ({ node: _node, ...props }) => <th {...props} dir="auto" />,
  td: ({ node: _node, ...props }) => <td {...props} dir="auto" />,
  pre: ({ node: _node, ...props }) => <pre {...props} dir="ltr" />,
};

// Shared Markdown renderer that opens links externally
const AgentMarkdown = memo(function AgentMarkdown({
  children,
}: {
  children: string;
}): React.JSX.Element {
  return (
    <div className="chat-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...DIRECTION_COMPONENTS,
          a: ({ href, children, node: _node, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (!href) return;
                try {
                  const url = new URL(href, "https://placeholder.invalid");
                  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
                    return;
                  }
                  if (url.protocol === "http:" || url.protocol === "https:") {
                    const event = new CustomEvent("web-preview:navigate", {
                      detail: href,
                    });
                    document.dispatchEvent(event);
                    return;
                  }
                } catch {
                  return;
                }
                window.hermesAPI.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
          img: ({ src }) => {
            if (typeof src !== "string" || src.length === 0) return null;
            // ![alt](file.pdf) parses as a markdown image but isn't an image —
            // route those to the download chip instead of letting MediaImage
            // try to load a non-image MIME and fail. (Follow-up from #303.)
            const token = describeImageSrc(src);
            return token.isImage ? (
              <MediaImage token={token} />
            ) : (
              <DownloadChip token={token} />
            );
          },
          code: ({ className, children, node, ...props }) => {
            const isInline =
              !className &&
              typeof children === "string" &&
              !children.includes("\n");
            if (isInline) {
              return (
                <code className={className} {...props} dir="ltr">
                  {children}
                </code>
              );
            }
            // Source offset of the opening fence is stable as the block streams,
            // so it survives react-markdown's streaming remounts (unlike index
            // keys) and uniquely identifies this block within the message.
            const start = node?.position?.start;
            const blockId =
              start != null
                ? `${start.offset ?? start.line}:${className ?? ""}`
                : undefined;
            return (
              <CodeBlock className={className} blockId={blockId}>
                {children}
              </CodeBlock>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
});

export { AgentMarkdown };
export default AgentMarkdown;
