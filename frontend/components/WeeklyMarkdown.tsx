import React from 'react'

// Lightweight inline markdown renderer that supports **bold** and `code`.
// Intentionally tiny — we control the JSON content so we don't need a full
// markdown parser. Splits text into segments and wraps in spans.
export function Inline({ text }: { text: string }) {
  // tokenize: **bold**, `code`, plain
  const tokens: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      tokens.push(text.slice(lastIdx, m.index))
    }
    const tok = m[0]
    if (tok.startsWith('**')) {
      tokens.push(
        <strong key={key++} className="font-semibold text-black">
          {tok.slice(2, -2)}
        </strong>
      )
    } else if (tok.startsWith('`')) {
      tokens.push(
        <code
          key={key++}
          className="text-xs bg-gray-100 px-1 py-0.5 rounded text-black"
        >
          {tok.slice(1, -1)}
        </code>
      )
    }
    lastIdx = m.index + tok.length
  }
  if (lastIdx < text.length) tokens.push(text.slice(lastIdx))
  return <>{tokens}</>
}
