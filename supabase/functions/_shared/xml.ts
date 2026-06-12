// docx/pptx text lives inside XML; strip the markup, keeping paragraph breaks.
// Pure (no Deno/npm imports) so the sandbox unit tests exercise it directly.
export function extractXmlText(xml: string): string {
  return xml
    .replace(/<\/(?:w:p|a:p)>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}
