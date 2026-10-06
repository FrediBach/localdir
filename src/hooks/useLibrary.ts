import { useCallback, useEffect, useRef, useState } from 'react'
import { demoSnapshot } from '@/lib/demo'
import * as fs from '@/lib/filesystem'
import type { ImportInput, LibraryItem, LinkInput, MetadataPatch } from '@/lib/types'

export function useLibrary() {
  const [snapshot, setSnapshot] = useState(demoSnapshot)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [remembered, setRemembered] = useState<FileSystemDirectoryHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const isDemo = !handle

  useEffect(() => { void fs.restoreDirectory().then(setRemembered).catch(() => {}) }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice])

  const run = useCallback(async (operation: () => Promise<void>, silent = false) => {
    if (lock.current) throw new Error('A folder operation is already running. Please try again in a moment.')
    lock.current = true
    setBusy(true)
    if (!silent) setError('')
    try { await operation() }
    catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'The folder could not be accessed. Please reconnect it.'
      setError(message)
      throw err
    } finally { lock.current = false; setBusy(false) }
  }, [])

  const connect = useCallback(async (chooseNew = false) => {
    await run(async () => {
      if (!fs.isFileSystemSupported()) throw new Error('Folder access needs a desktop browser with the File System Access API, such as Chrome or Edge, on localhost or HTTPS. You can still explore the example library here.')
      const next = !chooseNew && remembered ? remembered : await fs.pickDirectory()
      if (!await fs.ensurePermission(next)) throw new Error('Read and write access is needed to keep metadata in your folder. Please reconnect and allow access.')
      const result = await fs.scanDirectory(next)
      setHandle(next)
      setRemembered(next)
      setSnapshot(result)
      await fs.rememberDirectory(next).catch(() => {})
      setNotice(`Connected to ${next.name}`)
    })
  }, [remembered, run])

  const rescan = useCallback(async (silent = false) => {
    if (!handle || lock.current) return
    await run(async () => {
      setSnapshot(await fs.scanDirectory(handle))
      if (!silent) setNotice('Directory rescanned. Your library is up to date.')
    }, silent)
  }, [handle, run])

  useEffect(() => {
    if (!handle) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && !lock.current) void rescan(true).catch(() => {})
    }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [handle, rescan])

  const mutate = useCallback(async (operation: (directory: FileSystemDirectoryHandle) => Promise<void>, message: string) => {
    if (!handle) throw new Error('Connect a local folder first.')
    await run(async () => {
      await operation(handle)
      setSnapshot(await fs.scanDirectory(handle))
      setNotice(message)
    })
  }, [handle, run])

  const updateMetadata = useCallback(async (item: LibraryItem, patch: MetadataPatch) => {
    if (!handle) {
      setSnapshot(current => ({ ...current, items: current.items.map(row => row.id === item.id ? { ...row, ...patch } : row) }))
      setNotice('Example updated for this session. Connect a folder to save your own library.')
      return
    }
    await mutate(directory => fs.updateMetadata(directory, item, patch), 'Metadata saved to your directory.')
  }, [handle, mutate])

  const disconnect = useCallback(async () => {
    if (lock.current) return
    await fs.forgetDirectory().catch(() => {})
    setHandle(null)
    setRemembered(null)
    setSnapshot(demoSnapshot)
    setError('')
    setNotice('Directory disconnected. Your files remain in place.')
  }, [])

  return {
    snapshot, handle, remembered, isDemo, busy, error, notice,
    setError, connect, rescan, disconnect, updateMetadata,
    importFiles: (files: File[], input: ImportInput) => mutate(directory => fs.importFiles(directory, files, input), `${files.length} ${files.length === 1 ? 'file' : 'files'} added to your directory.`),
    saveLink: (input: LinkInput) => mutate(directory => fs.saveLink(directory, input), 'Link saved to your directory.'),
    createFolder: (path: string) => mutate(directory => fs.createFolder(directory, path), 'Folder created.'),
  }
}
