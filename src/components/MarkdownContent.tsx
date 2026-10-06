import { ImageOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export default function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
      urlTransform={(url) => safeUrl(url) ?? ''}
      components={{
        a: ({ href, children }) => {
          const url = href ? safeUrl(href) : undefined
          return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>
        },
        img: ({ alt }) => <span className="preview-image-placeholder"><ImageOff size={14} aria-hidden="true" />{alt || 'Image'}<small>Image loading disabled</small></span>,
      }}
    >{text}</ReactMarkdown>
  )
}
