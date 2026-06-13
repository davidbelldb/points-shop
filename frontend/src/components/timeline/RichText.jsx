/**
 * RichText
 * --------
 * A tiny, dependency-free markup renderer for milestone titles & descriptions.
 *
 * Supported syntax (per line / inline):
 *   # Heading      -> <h1>   (also ##, ###, #### , ##### for h2-h5)
 *   **bold text**   -> <strong>
 *   *italic text*   -> <em>
 *   ++underline++   -> <u>
 *
 * Lines are grouped into paragraphs (blank line = new paragraph), with
 * single newlines rendered as <br />. Headings are always their own block.
 *
 * Usage:
 *   <RichText text={milestone.description} />
 *   <RichText text={milestone.title} as="span" className="text-2xl" />
 */

const HEADING_CLASSES = {
  1: 'text-3xl sm:text-4xl font-extrabold tracking-tight',
  2: 'text-2xl sm:text-3xl font-bold tracking-tight',
  3: 'text-xl sm:text-2xl font-bold',
  4: 'text-lg sm:text-xl font-semibold',
  5: 'text-sm sm:text-base font-semibold uppercase tracking-wider',
};

// Matches **bold**, *italic*, ++underline++ - longest tokens first so
// `**bold**` isn't mistaken for two `*italic*` markers.
const INLINE_PATTERN = /(\*\*([^*]+?)\*\*|\+\+([^+]+?)\+\+|\*([^*]+?)\*)/g;

function parseInline(text, keyPrefix) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const key = `${keyPrefix}-${i++}`;
    if (match[2] !== undefined) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<u key={key}>{match[3]}</u>);
    } else if (match[4] !== undefined) {
      nodes.push(<em key={key}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export default function RichText({ text, className = '', as: Wrapper = 'div' }) {
  if (!text) return null;

  const raw = String(text);
  const hasHeading = /^#{1,5}\s+/m.test(raw);
  const hasBlankLine = /\n\s*\n/.test(raw);

  // Simple case (e.g. card titles): no headings, single paragraph - render
  // inline content directly inside `Wrapper` so callers can safely use
  // semantic tags like `as="h3"` without nesting a <p> inside it.
  if (!hasHeading && !hasBlankLine) {
    const lines = raw.split('\n');
    return (
      <Wrapper className={className}>
        {lines.map((line, idx) => (
          <span key={idx}>
            {parseInline(line, `inline-${idx}`)}
            {idx < lines.length - 1 && <br />}
          </span>
        ))}
      </Wrapper>
    );
  }

  const lines = raw.split('\n');
  const blocks = [];
  let paragraphLines = [];

  const flushParagraph = (key) => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={`p-${key}`} className="leading-relaxed">
        {paragraphLines.map((line, idx) => (
          <span key={idx}>
            {parseInline(line, `p-${key}-${idx}`)}
            {idx < paragraphLines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
    paragraphLines = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const headingMatch = /^(#{1,5})\s+(.*)$/.exec(line);

    if (headingMatch) {
      flushParagraph(idx);
      const level = headingMatch[1].length;
      const HeadingTag = `h${level}`;
      blocks.push(
        <HeadingTag key={`h-${idx}`} className={HEADING_CLASSES[level]}>
          {parseInline(headingMatch[2], `h-${idx}`)}
        </HeadingTag>
      );
      return;
    }

    if (line.trim() === '') {
      flushParagraph(idx);
      return;
    }

    paragraphLines.push(line);
  });
  flushParagraph('end');

  return <Wrapper className={`space-y-2 ${className}`}>{blocks}</Wrapper>;
}
