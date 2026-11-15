import { Fragment, ReactNode } from "react";

/**
 * Minimal, safe renderer for mission text: paragraphs (blank line), fenced code blocks
 * (```lang ... ```), inline `code` and **bold**. Everything else is plain text — no HTML injection.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code className="rt-code" key={`${keyPrefix}-${index++}`}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<strong key={`${keyPrefix}-${index++}`}>{token.slice(2, -2)}</strong>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderLines(text: string, keyPrefix: string) {
  return text.split("\n").map((line, i, all) => (
    <Fragment key={`${keyPrefix}-l${i}`}>
      {renderInline(line, `${keyPrefix}-l${i}`)}
      {i < all.length - 1 && <br />}
    </Fragment>
  ));
}

export function RichText({ text, block = false }: { text: string; block?: boolean }) {
  const parts = text.split(/(```[\w-]*\n[\s\S]*?```)/g).filter((part) => part !== "");
  const children: ReactNode[] = [];

  parts.forEach((part, partIndex) => {
    const fence = part.match(/^```([\w-]*)\n([\s\S]*?)```$/);
    if (fence) {
      children.push(
        <pre className="rt-pre" data-lang={fence[1] || undefined} key={`p${partIndex}`}>
          <code>{fence[2].replace(/\n$/, "")}</code>
        </pre>
      );
      return;
    }
    if (block) {
      part
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .forEach((paragraph, i) => {
          children.push(<p className="rt-p" key={`p${partIndex}-${i}`}>{renderLines(paragraph, `p${partIndex}-${i}`)}</p>);
        });
    } else {
      const trimmed = part.replace(/^\n+|\n+$/g, "");
      if (trimmed) children.push(<span key={`s${partIndex}`}>{renderLines(trimmed, `s${partIndex}`)}</span>);
    }
  });

  return <div className={block ? "rt rt-block" : "rt"}>{children}</div>;
}
