import { del, get, set } from 'idb-keyval'
import type { ImportInput, ItemMetadata, LibraryItem, LibrarySnapshot, LinkInput, MetadataPatch } from './types'
import { inferFile } from './versioning'

const INDEX_DIRECTORY = '.localdir'
const INDEX_FILE = 'index.json'
const HANDLE_KEY = 'local-dir:directory-handle'
const metadataKeys = ['title', 'description', 'manufacturer', 'model', 'tags', 'favorite', 'kind'] as const
const kinds = new Set(['manual', 'firmware', 'document', 'code', 'image', 'link', 'other'])
type JsonObject = Record<string, unknown>
interface FileRecord extends JsonObject { metadata: ItemMetadata & JsonObject; cached?: JsonObject }
interface LinkRecord extends ItemMetadata, JsonObject { title: string; url: string; folder: string; createdAt: number; modifiedAt: number }
interface Index extends JsonObject { schemaVersion: 1; files: Record<string, FileRecord>; links: Record<string, LinkRecord> }
interface LoadedIndex { index: Index; serialized: string | null }

// Serialize writes in this tab and, where supported, across other tabs on the same origin.
let operations: Promise<unknown> = Promise.resolve()
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) return await navigator.locks.request('local-dir-writes', operation)
    return operation()
  }
  const result = operations.then(run, run)
  operations = result.catch(() => undefined)
  return result
}

function isMissing(error: unknown): boolean { return error instanceof Error && error.name === 'NotFoundError' }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) }

function relativePath(path: string, allowRoot = false): string {
  if (path === '' && allowRoot) return ''
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) throw new Error('Use a relative folder path, such as Synthesizers/Elektron.')
  const segments = path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Folder paths cannot contain empty segments, . or ...')
  if (segments[0].toLowerCase() === INDEX_DIRECTORY) throw new Error('The .localdir folder is reserved for library metadata.')
  return path
}

function validateMetadata(value: unknown): asserts value is ItemMetadata & JsonObject {
  if (!isObject(value)) throw new Error('Invalid metadata record.')
  for (const key of ['title', 'description', 'manufacturer', 'model']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`Invalid metadata field: ${key}.`)
  }
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string'))) throw new Error('Invalid metadata tags.')
  if (value.favorite !== undefined && typeof value.favorite !== 'boolean') throw new Error('Invalid favorite value.')
  if (value.kind !== undefined && (typeof value.kind !== 'string' || !kinds.has(value.kind))) throw new Error('Invalid item kind.')
}

function validateFileMetadata(value: unknown): asserts value is ItemMetadata & JsonObject {
  validateMetadata(value)
  if (value.kind === 'link') throw new Error('Files cannot have the link type. Save links as separate library links.')
}

function metadataOnly(input: ItemMetadata): ItemMetadata & JsonObject {
  validateMetadata(input)
  const result: JsonObject = {}
  for (const key of metadataKeys) if (input[key] !== undefined) result[key] = input[key]
  return result as ItemMetadata & JsonObject
}

function httpUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Enter a complete http:// or https:// URL.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Links must use http:// or https://.')
  return url.href
}

function validateIndex(value: unknown): asserts value is Index {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.files) || !isObject(value.links)) {
    throw new Error('The library index has an unsupported or invalid format.')
  }
  for (const [path, record] of Object.entries(value.files)) {
    relativePath(path)
    if (!isObject(record)) throw new Error(`Invalid file metadata for ${path}.`)
    validateFileMetadata(record.metadata)
    if (record.cached !== undefined && !isObject(record.cached)) throw new Error(`Invalid cache for ${path}.`)
  }
  for (const [id, record] of Object.entries(value.links)) {
    if (!id || !isObject(record) || typeof record.title !== 'string' || typeof record.url !== 'string' || typeof record.folder !== 'string' || typeof record.createdAt !== 'number' || typeof record.modifiedAt !== 'number') throw new Error('Invalid saved link metadata.')
    validateMetadata(record)
    relativePath(record.folder, true)
    httpUrl(record.url)
  }
}

async function loadIndex(root: FileSystemDirectoryHandle): Promise<LoadedIndex> {
  let serialized: string
  try {
    const directory = await root.getDirectoryHandle(INDEX_DIRECTORY)
    const handle = await directory.getFileHandle(INDEX_FILE)
    serialized = await (await handle.getFile()).text()
  } catch (error) {
    if (isMissing(error)) return { index: { schemaVersion: 1, files: Object.create(null), links: Object.create(null) }, serialized: null }
    throw error
  }
  try {
    const index: unknown = JSON.parse(serialized)
    validateIndex(index)
    // Paths such as "__proto__" are valid filenames, never object prototype setters.
    index.files = Object.assign(Object.create(null), index.files)
    index.links = Object.assign(Object.create(null), index.links)
    return { index, serialized }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    throw new Error(`Cannot read .localdir/index.json. Your metadata was left untouched. ${message}`)
  }
}

async function writeIndex(root: FileSystemDirectoryHandle, loaded: LoadedIndex): Promise<void> {
  const serialized = `${JSON.stringify(loaded.index, null, 2)}\n`
  // Compare parsed content as well as whitespace: a rescan must not rewrite unchanged metadata.
  if (loaded.serialized !== null && JSON.stringify(JSON.parse(loaded.serialized)) === JSON.stringify(loaded.index)) return
  const latest = await loadIndex(root)
  const baseline = loaded.serialized === null ? null : JSON.stringify(JSON.parse(loaded.serialized))
  const current = latest.serialized === null ? null : JSON.stringify(JSON.parse(latest.serialized))
  if (baseline !== current) throw new Error('Library metadata changed outside the app during this operation. Rescan and try again; the external changes were preserved.')
  const directory = await root.getDirectoryHandle(INDEX_DIRECTORY, { create: true })
  const handle = await directory.getFileHandle(INDEX_FILE, { create: true })
  const writable = await handle.createWritable()
  try {
    // Opening the stream can take time; check again before replacing its destination.
    const openedContent = await (await handle.getFile()).text()
    let openedBaseline: string | null
    try { openedBaseline = openedContent === '' && baseline === null ? null : JSON.stringify(JSON.parse(openedContent)) }
    catch { throw new Error('Library metadata changed outside the app while opening it for writing. Rescan and try again; the external changes were preserved.') }
    if (openedBaseline !== baseline) throw new Error('Library metadata changed outside the app while opening it for writing. Rescan and try again; the external changes were preserved.')
    await writable.write(serialized)
    await writable.close()
    loaded.serialized = serialized
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

async function directoryAt(root: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemDirectoryHandle> {
  relativePath(path, true)
  let directory = root
  for (const segment of path.split('/').filter(Boolean)) directory = await directory.getDirectoryHandle(segment, { create })
  return directory
}

function linkItem(id: string, link: LinkRecord): LibraryItem {
  return {
    ...metadataOnly(link),
    id: `link:${id}`,
    name: link.title,
    title: link.title,
    path: link.folder ? `${link.folder}/${link.title}` : link.title,
    folder: link.folder,
    kind: 'link',
    extension: 'url',
    size: 0,
    modified: link.modifiedAt,
    groupKey: `link:${id}`,
    url: link.url,
  }
}

export function isFileSystemSupported(): boolean { return typeof window !== 'undefined' && 'showDirectoryPicker' in window }
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemSupported()) throw new Error('Directory access requires a supported Chromium browser, such as Chrome or Edge.')
  return window.showDirectoryPicker({ id: 'local-dir-library', mode: 'readwrite' })
}
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  return await handle.requestPermission({ mode: 'readwrite' }) === 'granted'
}
export async function rememberDirectory(handle: FileSystemDirectoryHandle): Promise<void> { await set(HANDLE_KEY, handle) }
export async function restoreDirectory(): Promise<FileSystemDirectoryHandle | null> { return (await get<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null }
export async function forgetDirectory(): Promise<void> { await del(HANDLE_KEY) }

export async function scanDirectory(root: FileSystemDirectoryHandle): Promise<LibrarySnapshot> {
  return exclusive(async () => {
    const loaded = await loadIndex(root)
    const items: LibraryItem[] = []
    const folders = new Set<string>()
    const warnings: string[] = []
    async function walk(directory: FileSystemDirectoryHandle, parent: string): Promise<void> {
      for await (const [name, entry] of directory.entries()) {
        if (parent === '' && name.toLowerCase() === INDEX_DIRECTORY) continue
        const path = parent ? `${parent}/${name}` : name
        if (entry.kind === 'directory') {
          folders.add(path)
          try { await walk(entry, path) } catch (error) { warnings.push(`Could not scan ${path}: ${error instanceof Error ? error.message : 'Access failed.'}`) }
        } else {
          try {
            const file = await entry.getFile()
            const inferred = inferFile(path, file.size, file.lastModified)
            const prior = Object.hasOwn(loaded.index.files, path) ? loaded.index.files[path] : undefined
            const metadata = prior?.metadata ?? {}
            const cached: JsonObject = { ...prior?.cached, name: inferred.name, kind: inferred.kind, extension: inferred.extension, size: file.size, modified: file.lastModified, groupKey: inferred.groupKey }
            if (inferred.version) cached.version = inferred.version
            else delete cached.version
            loaded.index.files[path] = { ...prior, metadata, cached }
            items.push({ ...inferred, ...metadataOnly(metadata), title: metadata.title?.trim() || inferred.title })
          } catch (error) {
            warnings.push(`Could not read ${path}: ${error instanceof Error ? error.message : 'Access failed.'}`)
          }
        }
      }
    }
    await walk(root, '')
    for (const [id, link] of Object.entries(loaded.index.links)) {
      items.push(linkItem(id, link))
      let folder = link.folder
      while (folder) {
        folders.add(folder)
        folder = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''
      }
    }
    await writeIndex(root, loaded)
    return { name: root.name, items: items.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })), folders: [...folders].sort(), scannedAt: Date.now(), warnings }
  })
}

export async function updateMetadata(root: FileSystemDirectoryHandle, item: LibraryItem, patch: MetadataPatch): Promise<void> {
  return exclusive(async () => {
    const clean = metadataOnly(patch)
    const loaded = await loadIndex(root)
    if (item.kind === 'link' && item.id.startsWith('link:')) {
      const id = item.id.slice(5)
      const existing = Object.hasOwn(loaded.index.links, id) ? loaded.index.links[id] : undefined
      if (!existing) throw new Error('This link no longer exists. Rescan the library.')
      if (clean.title !== undefined && !clean.title.trim()) throw new Error('Give the link a title.')
      const url = patch.url === undefined ? existing.url : httpUrl(patch.url)
      loaded.index.links[id] = { ...existing, ...clean, url, modifiedAt: Date.now() }
    } else {
      validateFileMetadata(clean)
      relativePath(item.path)
      const existing = Object.hasOwn(loaded.index.files, item.path) ? loaded.index.files[item.path] : undefined
      loaded.index.files[item.path] = { ...existing, metadata: { ...existing?.metadata, ...clean } }
    }
    await writeIndex(root, loaded)
  })
}

export async function createFolder(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  return exclusive(async () => {
    relativePath(path)
    await directoryAt(root, path, true)
  })
}

async function availableName(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  relativePath(name)
  if (name.includes('/')) throw new Error('A filename cannot contain a folder path.')
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let count = 1; count < 10000; count++) {
    const candidate = count === 1 ? name : `${stem} (${count})${extension}`
    try { await directory.getFileHandle(candidate) } catch (error) {
      if (isMissing(error)) return candidate
      if (!(error instanceof Error && error.name === 'TypeMismatchError')) throw error
    }
  }
  throw new Error('Too many files share that filename. Rename the file and try again.')
}

export async function importFiles(root: FileSystemDirectoryHandle, files: File[], input: ImportInput): Promise<void> {
  return exclusive(async () => {
    relativePath(input.folder, true)
    validateFileMetadata(input)
    const metadata = metadataOnly(input)
    const loaded = await loadIndex(root)
    const directory = await directoryAt(root, input.folder, true)
    for (const file of files) {
      const name = await availableName(directory, file.name)
      const handle = await directory.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()
      try {
        await writable.write(file)
        await writable.close()
      } catch (error) {
        await writable.abort().catch(() => undefined)
        throw error
      }
      const path = input.folder ? `${input.folder}/${name}` : name
      const prior = Object.hasOwn(loaded.index.files, path) ? loaded.index.files[path] : undefined
      loaded.index.files[path] = { ...prior, metadata: { ...prior?.metadata, ...metadata } }
      // Persist each successful import so a later failed file does not lose its metadata.
      await writeIndex(root, loaded)
    }
  })
}

export async function saveLink(root: FileSystemDirectoryHandle, input: LinkInput): Promise<void> {
  return exclusive(async () => {
    const folder = relativePath(input.folder, true)
    const title = input.title.trim()
    if (!title) throw new Error('Give the link a title.')
    const url = httpUrl(input.url)
    const loaded = await loadIndex(root)
    const timestamp = Date.now()
    loaded.index.links[crypto.randomUUID()] = { ...metadataOnly(input), title, url, folder, kind: 'link', createdAt: timestamp, modifiedAt: timestamp }
    if (folder) await directoryAt(root, folder, true)
    await writeIndex(root, loaded)
  })
}

export async function readItemFile(root: FileSystemDirectoryHandle, item: LibraryItem): Promise<File> {
  relativePath(item.path)
  if (item.kind === 'link') throw new Error('Links do not have a local preview file.')
  const segments = item.path.split('/')
  const name = segments.pop()!
  const directory = await directoryAt(root, segments.join('/'))
  return (await directory.getFileHandle(name)).getFile()
}
