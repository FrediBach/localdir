import { lazy, Suspense, useEffect, useState } from 'react'
import { Code2, ExternalLink, File as FileIcon, FileText, Link2, Loader2, Package } from 'lucide-react'
import type { LibraryItem } from '../lib/types'
import './file-preview.css'

const MarkdownContent = lazy(() => import('./MarkdownContent'))

interface FilePreviewProps {
  item: LibraryItem
  file?: File | null
  loading?: boolean
}

const MAX_TEXT_BYTES = 1024 * 1024
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'mdx', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'xml', 'csv', 'tsv', 'log', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'scss', 'html', 'htm', 'py', 'rb', 'rs', 'go', 'sh', 'bash', 'zsh', 'c', 'h', 'cpp', 'hpp', 'java', 'sql', 'swift', 'kt', 'vue', 'svelte', 'dockerfile'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'])
const CODE_LANGUAGES: Record<string, string> = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', rs: 'rust', yml: 'yaml', sh: 'bash', zsh: 'bash', h: 'c', hpp: 'cpp', htm: 'html', jsonc: 'json' }

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

function SampleManual({ item }: { item: LibraryItem }) {
  const isBraun = item.manufacturer === 'Braun'
  return (
    <div className="sample-document" aria-label="Illustrative sample PDF preview">
      <div className="sample-document-top"><span>{item.manufacturer ?? 'LOCAL DIR'}</span><span>{item.model ?? 'REFERENCE'}</span></div>
      <div className="sample-document-heading"><h3>{isBraun ? 'Sound, simplified.' : item.model ?? 'A useful reference.'}</h3><p>{item.title?.includes('guide') ? 'A guide to getting started.' : 'Designed for everyday life.'}</p></div>
      {isBraun ? (
        <div className="sample-speaker-stage" aria-hidden="true">
          <div className="sample-speaker"><div className="sample-speaker-controls"><i /><i /><i /></div><span className="sample-speaker-brand">BRAUN</span></div>
          <div className="sample-speaker-foot sample-speaker-foot-left" /><div className="sample-speaker-foot sample-speaker-foot-right" />
        </div>
      ) : (
        <div className="sample-document-graphic" aria-hidden="true"><div /><div /><div /><span>{item.model?.split(' ').at(-1) ?? '01'}</span></div>
      )}
      <div className="sample-document-bottom"><span>User manual<br /><b>English · {item.version ? `v${item.version}` : 'Reference'}</b></span><span className="sample-document-mark">{item.model ?? '01'}</span></div>
      <div className="sample-document-notice">ILLUSTRATIVE SAMPLE · NOT AN ACTUAL PRODUCT MANUAL</div>
    </div>
  )
}

export function FilePreview({ item, file = null, loading = false }: FilePreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string>()
  const [textContent, setTextContent] = useState<string>()
  const [error, setError] = useState<string>()
  const [reading, setReading] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const extension = item.extension.toLowerCase()
  const isPdf = extension === 'pdf' || file?.type === 'application/pdf'
  const isImage = IMAGE_EXTENSIONS.has(extension)
  const isMarkdown = ['md', 'markdown'].includes(extension)
  const isText = TEXT_EXTENSIONS.has(extension) || (file?.type.startsWith('text/') ?? false)
  const isDemo = item.id.startsWith('demo:')

  useEffect(() => {
    let active = true
    let nextObjectUrl: string | undefined
    setError(undefined)
    setImageFailed(false)
    setObjectUrl(undefined)
    setTextContent(undefined)
    setReading(false)

    if (file && (isPdf || isImage)) {
      nextObjectUrl = URL.createObjectURL(file)
      setObjectUrl(nextObjectUrl)
    } else if (file && isText) {
      setReading(true)
      file.slice(0, MAX_TEXT_BYTES).text()
        .then((content) => { if (active) setTextContent(content) })
        .catch(() => { if (active) setError('This file could not be read. Try scanning your directory again.') })
        .finally(() => { if (active) setReading(false) })
    } else if (isDemo && item.demoContent && !isPdf) {
      setTextContent(item.demoContent)
    }

    return () => {
      active = false
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [file, isPdf, isImage, isText, isDemo, item.id, item.demoContent])

  if (loading || reading) {
    return <div className="file-preview file-preview-empty" role="status"><Loader2 className="preview-loader" size={24} /><p>Opening preview…</p></div>
  }

  if (error) {
    return <div className="file-preview file-preview-empty"><FileText size={28} strokeWidth={1.2} /><p>Preview unavailable</p><span>{error}</span></div>
  }

  if (item.kind === 'link') {
    const url = item.url ? safeUrl(item.url) : undefined
    const hostname = url ? new URL(url).hostname.replace(/^www\./, '') : 'Saved link'
    return (
      <div className="file-preview file-preview-link">
        <div className="preview-link-icon"><Link2 size={26} strokeWidth={1.4} /></div>
        <span className="preview-eyebrow">A useful connection</span>
        <h3>{item.title || item.name}</h3>
        <p>{item.description || 'A saved resource, kept with the things it belongs to.'}</p>
        {url ? <a className="preview-visit-link" href={url} target="_blank" rel="noopener noreferrer">{hostname || url}<ExternalLink size={14} /></a> : <span className="preview-invalid-link">This link does not have a valid address.</span>}
      </div>
    )
  }

  if (isPdf && isDemo && !file) return <div className="file-preview file-preview-sample"><SampleManual item={item} /></div>

  if (isPdf && objectUrl) {
    return <div className="file-preview file-preview-pdf"><iframe src={`${objectUrl}#toolbar=0&navpanes=0&view=FitH`} title={`PDF preview: ${item.title || item.name}`} /></div>
  }

  if (isImage && objectUrl && !imageFailed) {
    return <div className="file-preview file-preview-image"><img src={objectUrl} alt={item.title || item.name} onError={() => setImageFailed(true)} /></div>
  }

  if (textContent !== undefined) {
    const longestFence = (textContent.match(/`+/g) ?? []).reduce((longest, match) => Math.max(longest, match.length + 1), 3)
    const fence = '`'.repeat(longestFence)
    const language = CODE_LANGUAGES[extension] ?? extension
    return (
      <div className={`file-preview file-preview-text ${isMarkdown ? 'file-preview-markdown' : 'file-preview-code'}`}>
        {file && file.size > MAX_TEXT_BYTES && <div className="preview-truncation">Preview shows the first 1 MB of this file.</div>}
        <Suspense fallback={<p role="status">Opening preview…</p>}>
          {isMarkdown ? <MarkdownContent text={textContent} /> : <MarkdownContent text={`${fence}${language}\n${textContent}\n${fence}`} />}
        </Suspense>
      </div>
    )
  }

  const EmptyIcon = item.kind === 'firmware' ? Package : item.kind === 'code' ? Code2 : FileIcon
  return (
    <div className="file-preview file-preview-empty">
      <div className="preview-file-icon"><EmptyIcon size={30} strokeWidth={1.2} /></div>
      <span className="preview-eyebrow">{extension ? `${extension.toUpperCase()} FILE` : 'LOCAL FILE'}</span>
      <p>{item.kind === 'firmware' ? 'Ready when you need it.' : imageFailed ? 'This image could not be displayed.' : 'Safely kept in your directory.'}</p>
      <span>{isDemo ? 'An illustrative sample entry. Connect your directory to use your own files.' : file ? 'There is no visual preview for this file. Download it to open in another app.' : 'Select a file from your connected directory to open a preview.'}</span>
    </div>
  )
}
