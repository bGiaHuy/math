import React, { useMemo } from 'react';
import katex from 'katex';

/**
 * MathRenderer component for LaTeX rendering via KaTeX.
 * Ensures responsive wrapping with horizontal scroll (overflow-x-auto)
 * on mobile screens (390px - 768px) and robust error handling.
 */
export default function MathRenderer({ text, content, inline = true, className = '' }) {
  const actualText = text || content || '';
  const renderedContent = useMemo(() => {
    if (!actualText) return null;

    // Imported exam figures are served only from the reviewed local asset folder.
    const figurePattern = /!\[([^\]]*)\]\((\/math-import-assets\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp))\)/g;
    if (figurePattern.test(actualText)) {
      figurePattern.lastIndex = 0;
      const parts = [];
      let cursor = 0;
      let match;
      while ((match = figurePattern.exec(actualText))) {
        if (match.index > cursor) parts.push(<MathRenderer key={`figure-text-${cursor}`} content={actualText.slice(cursor, match.index)} inline={inline} />);
        parts.push(<img key={`figure-${match.index}`} src={match[2]} alt={match[1] || 'Hình minh họa của câu hỏi'} style={{ display: 'block', maxWidth: '100%', maxHeight: '340px', objectFit: 'contain', margin: '12px auto' }} />);
        cursor = match.index + match[0].length;
      }
      if (cursor < actualText.length) parts.push(<MathRenderer key={`figure-text-${cursor}`} content={actualText.slice(cursor)} inline={inline} />);
      return parts;
    }

    // 1. Check for display math blocks ($$...$$)
    if (actualText.includes('$$')) {
      const parts = actualText.split('$$');
      return parts.map((part, idx) => {
        if (idx % 2 === 1) {
          // Block math expression
          try {
            const html = katex.renderToString(part.trim(), {
              throwOnError: false,
              displayMode: true
            });
            return (
              <span
                key={`block-${idx}`}
                className="math-block-container block w-full overflow-x-auto py-1 my-1 text-center"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch (err) {
            return (
              <span key={`block-err-${idx}`} className="text-amber-800 bg-amber-50 px-1 rounded font-mono text-sm">
                {part}
              </span>
            );
          }
        } else {
          // Sub-parse inline math in surrounding text
          return <SubInlineMath key={`text-${idx}`} content={part} />;
        }
      });
    }

    // 2. Normal text with or without inline math ($...$)
    return <SubInlineMath content={actualText} defaultInline={inline} />;
  }, [actualText, inline]);

  return (
    <span className={`math-render-wrapper max-w-full inline-block align-middle ${className}`}>
      {renderedContent}
    </span>
  );
}

const VIETNAMESE_CHAR_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const LATEX_MACRO_REGEX = /(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}|\\(?:sqrt|frac|text|mathbf|mathrm|vec|overline)(?:\[[^\]]*\])?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})+|\\[a-zA-Z]+(?:\^[0-9]+)?(?:\s+[A-Za-z0-9]+|\s*\{[^}]*\}|\s*\([^)]*\))?)/g;

// Helper to parse inline $...$ or raw TeX macros
function SubInlineMath({ content, defaultInline = true }) {
  if (!content) return null;

  // 1. Has explicit inline $...$
  if (content.includes('$')) {
    const parts = content.split('$');
    return (
      <>
        {parts.map((part, idx) => {
          if (idx % 2 === 1) {
            try {
              const html = katex.renderToString(part.trim(), {
                throwOnError: false,
                displayMode: false
              });
              return (
                <span
                  key={idx}
                  className="math-inline-container inline-block max-w-full overflow-x-auto align-baseline px-0.5"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch {
              return <span key={idx} className="font-mono text-sm">{part}</span>;
            }
          }
          return <span key={idx}>{part}</span>;
        })}
      </>
    );
  }

  // 2. Mixed Vietnamese text with raw LaTeX macros (e.g. "Biểu thức \sqrt{2x - 6} có nghĩa khi...")
  if (VIETNAMESE_CHAR_REGEX.test(content)) {
    if (content.includes('\\')) {
      const parts = [];
      let lastIndex = 0;
      let match;
      LATEX_MACRO_REGEX.lastIndex = 0;
      while ((match = LATEX_MACRO_REGEX.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'math', value: match[0] });
        lastIndex = LATEX_MACRO_REGEX.lastIndex;
      }
      if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) });
      }

      return (
        <>
          {parts.map((item, idx) => {
            if (item.type === 'math') {
              try {
                const html = katex.renderToString(item.value.trim(), {
                  throwOnError: false,
                  displayMode: false
                });
                return (
                  <span
                    key={`m-${idx}`}
                    className="math-inline-container inline-block max-w-full overflow-x-auto align-baseline px-0.5"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              } catch {
                return <span key={`m-${idx}`}>{item.value}</span>;
              }
            }
            return <span key={`t-${idx}`}>{item.value}</span>;
          })}
        </>
      );
    }
    // Pure Vietnamese text (e.g. "Vô số nghiệm", "30 viên")
    return <span>{content}</span>;
  }

  // 3. Pure math expression without $ delimiter (e.g. "x \ge 3", "x > 3", "7\sqrt{5}", "-9")
  try {
    const html = katex.renderToString(content.trim(), {
      throwOnError: false,
      displayMode: !defaultInline
    });
    return (
      <span
        className="math-inline-container inline-block max-w-full overflow-x-auto align-baseline px-0.5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <span>{content}</span>;
  }
}
