import type { ItemKind, LibraryItem } from './types'

const codeExtensions = new Set(['js', 'jsx', 'ts', 'tsx', 'json', 'py', 'c', 'cpp', 'h', 'css', 'html', 'xml', 'yaml', 'yml', 'sh', 'toml', 'ini', 'conf', 'txt', 'log'])
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'])
const firmwareExtensions = new Set(['bin', 'hex', 'dfu', 'fw', 'uf2', 'img', 'rom'])

function inferKind(name: string, extension: string): ItemKind {
  if (firmwareExtensions.has(extension) || /\bfirmware\b/i.test(name)) return 'firmware'
  if (extension === 'pdf' || /\b(manual|guide|handbook|instructions)\b/i.test(name)) return 'manual'
  if (extension === 'md' || extension === 'markdown' || ['doc', 'docx', 'rtf', 'odt'].includes(extension)) return 'document'
  if (imageExtensions.has(extension)) return 'image'
  if (codeExtensions.has(extension)) return 'code'
  return 'other'
}

/** Only explicit v/version markers or multi-part numbers count as versions; model numbers are preserved. */
export function inferFile(path: string, size: number, modified: number): LibraryItem {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const filenameStem = dot > 0 ? name.slice(0, dot) : name
  const tarArchive = ['gz', 'bz2', 'xz', 'zst'].includes(extension) && filenameStem.toLowerCase().endsWith('.tar')
  const stem = tarArchive ? filenameStem.slice(0, -4) : filenameStem
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  // Requiring a boundary before the marker keeps names such as CV1200 intact.
  const explicit = [...stem.matchAll(/(?:^|[\s_\-(])(?:version[\s_\-]*|v)(\d+(?:[._]\d+)*(?:-(?:alpha|beta|rc)[.\d]*)?)(?=$|[\s_\-)])/gi)]
    .filter(candidate => {
      if (!/(?:^|[\s_\-(])V\d+$/.test(candidate[0])) return true
      // "Dyson V15" is a model; "firmware_V2" is an explicit trailing release marker.
      return /^[_-]V\d+$/.test(candidate[0]) && candidate.index + candidate[0].length === stem.length
    })
    .at(-1)
  const implicit = /(?:^|[\s_\-(])(\d+(?:\.\d+){1,3}(?:-(?:alpha|beta|rc)[.\d]*)?)(?=$|[\s_\-)])/i.exec(stem)
  const match = explicit ?? implicit
  const version = match?.[1].replaceAll('_', '.')
  const base = match ? `${stem.slice(0, match.index)} ${stem.slice(match.index + match[0].length)}` : stem
  const normalized = base.replace(/[_]+/g, ' ').replace(/^[\s\-()]+|[\s\-()]+$/g, '').replace(/\s+/g, ' ') || stem
  return {
    id: `file:${path}`,
    name,
    path,
    folder,
    title: normalized,
    kind: inferKind(stem.replaceAll('_', ' '), extension),
    extension,
    size,
    modified,
    version,
    groupKey: version
      ? `${folder}/${normalized.toLowerCase().replace(/[\s_\-()]+/g, ' ')}.${tarArchive ? 'tar.' : ''}${extension}`
      : `file:${path}`,
  }
}

/** Standard ascending comparator. Reverse arguments to put the newest version first. */
export function compareVersions(a?: string, b?: string): number {
  if (a === b) return 0
  if (!a) return -1
  if (!b) return 1
  const [aRelease, ...aPrerelease] = a.replace(/^v/i, '').split('-')
  const [bRelease, ...bPrerelease] = b.replace(/^v/i, '').split('-')
  const aParts = aRelease.split(/[._]/).map(Number)
  const bParts = bRelease.split(/[._]/).map(Number)
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const delta = (aParts[i] ?? 0) - (bParts[i] ?? 0)
    if (Number.isFinite(delta) && delta !== 0) return delta
  }
  if (!aPrerelease.length && bPrerelease.length) return 1
  if (aPrerelease.length && !bPrerelease.length) return -1
  return aPrerelease.join('-').localeCompare(bPrerelease.join('-'), undefined, { numeric: true })
}
