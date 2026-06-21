import { memo } from 'react'
import katex from 'katex'

interface MathTextProps {
  text: string
}

function renderMath(src: string, displayMode: boolean): string {
  return katex.renderToString(src, { throwOnError: false, displayMode })
}

// Splits text on $$…$$ (display) then $…$ (inline) and renders each math
// segment with KaTeX. Plain-text segments are returned as-is.
const MathText = memo(function MathText({ text }: MathTextProps) {
  const parts: React.ReactNode[] = []
  const displayRe = /\$\$([\s\S]+?)\$\$/g
  const inlineRe = /\$([^$\n]+?)\$/g
  let last = 0
  let key = 0

  text.replace(displayRe, (match, src: string, offset: number) => {
    if (offset > last) parts.push(text.slice(last, offset))
    parts.push(
      <span
        key={key++}
        dangerouslySetInnerHTML={{ __html: renderMath(src, true) }}
      />,
    )
    last = offset + match.length
    return match
  })

  const remainder = text.slice(last)
  last = 0
  const inlineParts: React.ReactNode[] = []
  remainder.replace(inlineRe, (match, src: string, offset: number) => {
    if (offset > last) inlineParts.push(remainder.slice(last, offset))
    inlineParts.push(
      <span
        key={key++}
        dangerouslySetInnerHTML={{ __html: renderMath(src, false) }}
      />,
    )
    last = offset + match.length
    return match
  })
  if (last < remainder.length) inlineParts.push(remainder.slice(last))
  parts.push(...inlineParts)

  return <>{parts}</>
})

export default MathText
