import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFolder, importFiles, readItemFile, saveLink, scanDirectory, updateMetadata } from './filesystem'
import { inferFile } from './versioning'

class MemoryFile {
  kind = 'file' as const
  writes = 0
  modified = 100
  onRead?: () => void
  onOpen?: () => void
  constructor(public name: string, public content: Blob | string = '') {}
  async getFile() {
    this.onRead?.()
    return new File([this.content], this.name, { lastModified: this.modified })
  }
  async createWritable() {
    this.onOpen?.()
    let pending: Blob | string = this.content
    return {
      write: async (value: Blob | string) => { pending = value },
      close: async () => { this.content = pending; this.modified++; this.writes++ },
      abort: async () => undefined,
    }
  }
}

class MemoryDirectory {
  kind = 'directory' as const
  children = new Map<string, MemoryDirectory | MemoryFile>()
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectory> {
    let child = this.children.get(name)
    if (!child && options.create) { child = new MemoryDirectory(name); this.children.set(name, child) }
    if (!child) throw new DOMException('Missing', 'NotFoundError')
    if (child.kind !== 'directory') throw new DOMException('Not a directory', 'TypeMismatchError')
    return child
  }
  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFile> {
    let child = this.children.get(name)
    if (!child && options.create) { child = new MemoryFile(name); this.children.set(name, child) }
    if (!child) throw new DOMException('Missing', 'NotFoundError')
    if (child.kind !== 'file') throw new DOMException('Not a file', 'TypeMismatchError')
    return child
  }
  async *entries() { yield* this.children.entries() }
  async put(path: string, content: string): Promise<MemoryFile> {
    const parts = path.split('/')
    const name = parts.pop()!
    let directory: MemoryDirectory = this
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true })
    const file = await directory.getFileHandle(name, { create: true })
    file.content = content
    return file
  }
  asHandle() { return this as unknown as FileSystemDirectoryHandle }
  async indexFile() { return (await this.getDirectoryHandle('.localdir')).getFileHandle('index.json') }
  async index() { return JSON.parse(await (await (await this.indexFile()).getFile()).text()) }
}

describe('directory-backed library', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('recursively discovers deep and empty folders while excluding its own index', async () => {
    const root = new MemoryDirectory('Dropbox manuals')
    await root.put('Audio/Synths/Elektron/Digitakt/manual_v1.5.pdf', 'PDF bytes')
    await createFolder(root.asHandle(), 'Audio/Empty')
    const first = await scanDirectory(root.asHandle())
    expect(first.name).toBe('Dropbox manuals')
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({ path: 'Audio/Synths/Elektron/Digitakt/manual_v1.5.pdf', kind: 'manual', version: '1.5' })
    expect(first.folders).toContain('Audio/Empty')
    expect(first.folders).toContain('Audio/Synths/Elektron/Digitakt')
    expect((await scanDirectory(root.asHandle())).items).toHaveLength(1)
    expect(await (await readItemFile(root.asHandle(), first.items[0])).text()).toBe('PDF bytes')
  })

  it('only rewrites the cache when facts change and leaves original files untouched', async () => {
    const root = new MemoryDirectory('Library')
    const original = await root.put('firmware_v1.1.bin', 'original')
    await scanDirectory(root.asHandle())
    const index = await root.indexFile()
    expect(index.writes).toBe(1)
    await scanDirectory(root.asHandle())
    expect(index.writes).toBe(1)
    original.content = 'new external content'
    original.modified++
    const next = await scanDirectory(root.asHandle())
    expect(index.writes).toBe(2)
    expect(next.items[0].size).toBe(20)
    expect(original.writes).toBe(0)
  })

  it('merges metadata and preserves unknown fields and temporarily missing files', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('manual.pdf', 'data')
    await root.put('.localdir/index.json', JSON.stringify({ schemaVersion: 1, custom: { retained: true }, files: {
      'manual.pdf': { metadata: { title: 'My guide', tags: ['audio'], vendorExtension: 'keep me' }, customRecord: 42 },
      'missing.pdf': { metadata: { title: 'Keep this metadata' } },
    }, links: {} }))
    const snapshot = await scanDirectory(root.asHandle())
    expect(snapshot.items[0].title).toBe('My guide')
    await updateMetadata(root.asHandle(), snapshot.items[0], { favorite: true, manufacturer: 'Elektron' })
    const stored = await root.index()
    expect(stored.custom).toEqual({ retained: true })
    expect(stored.files['manual.pdf'].customRecord).toBe(42)
    expect(stored.files['manual.pdf'].metadata).toMatchObject({ title: 'My guide', tags: ['audio'], favorite: true, vendorExtension: 'keep me' })
    expect(stored.files['missing.pdf'].metadata.title).toBe('Keep this metadata')
    expect((await scanDirectory(root.asHandle())).items[0].manufacturer).toBe('Elektron')
    await updateMetadata(root.asHandle(), snapshot.items[0], { title: '' })
    expect((await scanDirectory(root.asHandle())).items[0].title).toBe('manual')
  })

  it.each(['{broken json', JSON.stringify({ schemaVersion: 2, files: {}, links: {} }), JSON.stringify({ schemaVersion: 1, files: { 'x.pdf': { metadata: { tags: 1 } } }, links: {} }), JSON.stringify({ schemaVersion: 1, files: { 'x.pdf': { metadata: { kind: 'link' } } }, links: {} })])('refuses malformed metadata before scanning or importing: %s', async (content) => {
    const root = new MemoryDirectory('Library')
    const index = await root.put('.localdir/index.json', content)
    await expect(scanDirectory(root.asHandle())).rejects.toThrow('metadata was left untouched')
    await expect(importFiles(root.asHandle(), [new File(['data'], 'new.pdf')], { folder: '' })).rejects.toThrow()
    expect(index.content).toBe(content)
    expect(index.writes).toBe(0)
    expect(root.children.has('new.pdf')).toBe(false)
  })

  it('imports into nested folders without overwriting colliding files or folders', async () => {
    const root = new MemoryDirectory('Library')
    const original = await root.put('Audio/Device/manual.pdf', 'original')
    await createFolder(root.asHandle(), 'Audio/Device/manual (2).pdf')
    await importFiles(root.asHandle(), [new File(['upload'], 'manual.pdf'), new File(['second'], 'manual.pdf')], { folder: 'Audio/Device', manufacturer: 'Moog', tags: ['manual'] })
    const snapshot = await scanDirectory(root.asHandle())
    expect(snapshot.items.map(item => item.name)).toEqual(['manual (3).pdf', 'manual (4).pdf', 'manual.pdf'])
    expect(snapshot.items.find(item => item.name === 'manual (3).pdf')).toMatchObject({ manufacturer: 'Moog', tags: ['manual'] })
    expect(await (await original.getFile()).text()).toBe('original')
    expect(original.writes).toBe(0)
  })

  it('persists links in JSON and applies edits while preserving their identity', async () => {
    const root = new MemoryDirectory('Library')
    await saveLink(root.asHandle(), { title: 'Manufacturer', url: 'https://example.com/support', folder: 'Audio/Device', description: 'Downloads' })
    const first = (await scanDirectory(root.asHandle())).items[0]
    expect(first).toMatchObject({ kind: 'link', title: 'Manufacturer', url: 'https://example.com/support', folder: 'Audio/Device' })
    await updateMetadata(root.asHandle(), first, { title: 'Support', favorite: true })
    expect((await scanDirectory(root.asHandle())).items[0]).toMatchObject({ id: first.id, title: 'Support', favorite: true })
    expect(Object.keys((await root.index()).links)).toHaveLength(1)
    await expect(updateMetadata(root.asHandle(), first, { title: '' })).rejects.toThrow('Give the link a title')
  })

  it('updates link destinations without losing metadata and rejects invalid edits without writing', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('.localdir/index.json', JSON.stringify({ schemaVersion: 1, files: {}, links: {
      support: { title: 'Support', url: 'https://example.com/old', folder: '', kind: 'link', tags: ['reference'], createdAt: 1, modifiedAt: 1 },
    } }))
    const original = (await scanDirectory(root.asHandle())).items[0]
    await updateMetadata(root.asHandle(), original, { url: 'https://EXAMPLE.com/new?device=1' })
    const updated = (await scanDirectory(root.asHandle())).items[0]
    expect(updated).toMatchObject({ id: original.id, url: 'https://example.com/new?device=1', title: 'Support', tags: ['reference'] })
    expect(updated.modified).toBeGreaterThan(original.modified)
    expect((await root.index()).links.support.createdAt).toBe(1)

    await updateMetadata(root.asHandle(), updated, { favorite: true })
    const savedIndex = await root.index()
    expect(savedIndex.links.support.url).toBe('https://example.com/new?device=1')
    const indexFile = await root.indexFile()
    const writes = indexFile.writes
    for (const url of ['javascript:alert(1)', 'file:///private/manual.pdf', 'not a URL', '']) {
      await expect(updateMetadata(root.asHandle(), updated, { title: 'Invalid edit', url })).rejects.toThrow('http://')
      expect(await root.index()).toEqual(savedIndex)
    }
    expect(indexFile.writes).toBe(writes)
  })

  it('rejects traversal, reserved metadata folders, and executable URL schemes', async () => {
    const root = new MemoryDirectory('Library')
    for (const path of ['../escape', '/absolute', 'Audio/../escape', 'Audio\\escape', '.localdir/private', '.LOCALDIR/index.json']) {
      await expect(createFolder(root.asHandle(), path)).rejects.toThrow()
      await expect(importFiles(root.asHandle(), [], { folder: path })).rejects.toThrow()
    }
    await expect(readItemFile(root.asHandle(), inferFile('../escape.pdf', 0, 0))).rejects.toThrow()
    await expect(saveLink(root.asHandle(), { title: 'Bad', url: 'javascript:alert(1)', folder: '' })).rejects.toThrow('http://')
    expect(root.children.size).toBe(0)
  })

  it('preserves metadata changed externally while a scan is in progress', async () => {
    const root = new MemoryDirectory('Library')
    const document = await root.put('manual.pdf', 'data')
    await scanDirectory(root.asHandle())
    const index = await root.indexFile()
    const externalIndex = await root.index()
    externalIndex.files['manual.pdf'].metadata.title = 'External edit'
    document.modified++
    document.onRead = () => { index.content = JSON.stringify(externalIndex); document.onRead = undefined }
    await expect(scanDirectory(root.asHandle())).rejects.toThrow('changed outside the app')
    expect((await root.index()).files['manual.pdf'].metadata.title).toBe('External edit')
    expect((await scanDirectory(root.asHandle())).items[0].title).toBe('External edit')
  })

  it('supports filenames that coincide with object prototype property names', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('__proto__', 'file')
    await root.put('constructor', 'another file')
    await root.put('.localdir/index.json', '{"schemaVersion":1,"files":{},"links":{}}')
    expect((await scanDirectory(root.asHandle())).items).toHaveLength(2)
    expect(Object.keys((await root.index()).files)).toEqual(['__proto__', 'constructor'])
  })

  it('rejects attempts to turn file records into links during edits or import', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('manual.pdf', 'data')
    const item = (await scanDirectory(root.asHandle())).items[0]
    const index = await root.indexFile()
    const originalMetadata = index.content
    await expect(updateMetadata(root.asHandle(), item, { kind: 'link' })).rejects.toThrow('Files cannot have the link type')
    await expect(importFiles(root.asHandle(), [new File(['data'], 'new.pdf')], { kind: 'link', folder: '' })).rejects.toThrow('Files cannot have the link type')
    expect(root.children.has('new.pdf')).toBe(false)
    expect(index.content).toBe(originalMetadata)
  })

  it('checks for external metadata changes again after opening a write stream', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('manual.pdf', 'data')
    const item = (await scanDirectory(root.asHandle())).items[0]
    const index = await root.indexFile()
    const externalIndex = await root.index()
    externalIndex.files['manual.pdf'].metadata.title = 'Changed while opening'
    index.onOpen = () => { index.content = JSON.stringify(externalIndex); index.onOpen = undefined }
    await expect(updateMetadata(root.asHandle(), item, { favorite: true })).rejects.toThrow('while opening it for writing')
    expect(index.writes).toBe(1)
    expect((await root.index()).files['manual.pdf'].metadata).toEqual({ title: 'Changed while opening' })
  })

  it('waits for a browser-wide lock before mutating the directory', async () => {
    const root = new MemoryDirectory('Library')
    await root.put('manual.pdf', 'data')
    let grant: (() => void) | undefined
    const request = vi.fn((_name: string, operation: () => Promise<unknown>) => new Promise(resolve => { grant = () => resolve(operation()) }))
    vi.stubGlobal('navigator', { locks: { request } })
    const scan = scanDirectory(root.asHandle())
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('local-dir-writes', expect.any(Function)))
    expect(root.children.has('.localdir')).toBe(false)
    grant!()
    await scan
    expect(root.children.has('.localdir')).toBe(true)
  })
})
