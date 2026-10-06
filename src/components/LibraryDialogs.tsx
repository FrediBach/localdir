import { useState, type FormEvent, type ReactNode } from 'react'
import { FolderOpen, Upload, Link2, FolderPlus, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { ImportInput, ItemKind, ItemMetadata, LibraryItem, LinkInput, MetadataPatch } from '@/lib/types'

export type DialogMode = 'upload' | 'link' | 'folder' | 'edit' | 'about' | null

interface LibraryDialogsProps {
  mode: DialogMode
  onClose: () => void
  folder: string
  folders: string[]
  item: LibraryItem | null
  busy: boolean
  isDemo: boolean
  onImport: (files: File[], input: ImportInput) => Promise<void>
  onLink: (input: LinkInput) => Promise<void>
  onFolder: (path: string) => Promise<void>
  onMetadata: (item: LibraryItem, patch: MetadataPatch) => Promise<void>
  onConnect: () => void
}

const kinds: { value: ItemKind; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'firmware', label: 'Firmware' },
  { value: 'document', label: 'Document' },
  { value: 'code', label: 'Code' },
  { value: 'image', label: 'Image' },
  { value: 'other', label: 'Other' },
]

const dialogCopy = {
  upload: ['Add files', 'Choose files and add details. Everything is saved in your local directory.'],
  link: ['Add a link', 'Keep a useful resource alongside your files.'],
  folder: ['New folder', 'Give everything a place. Nested folders are welcome.'],
  edit: ['Edit details', 'A little context makes things easier to find.'],
  about: ['A place for your things.', 'Local Dir · An intentionally simple proof of concept.'],
} satisfies Record<NonNullable<DialogMode>, [string, string]>

function Field({ label, children, help, className = '' }: { label: string; children: ReactNode; help?: string; className?: string }) {
  return (
    <label className={`form-field ${className}`}>
      <span>{label}</span>
      {children}
      {help && <small className="form-help">{help}</small>}
    </label>
  )
}

function cleanFolder(path: string) {
  const cleaned = path.trim().replace(/^\/+|\/+$/g, '')
  if (cleaned.split('/').some(part => part === '.' || part === '..') || cleaned.includes('\\')) {
    throw new Error('Use a folder path such as Equipment/Audio, without “.” or “..”.')
  }
  if (cleaned === '.localdir' || cleaned.startsWith('.localdir/')) {
    throw new Error('The .localdir folder is reserved for library metadata.')
  }
  return cleaned
}

export function LibraryDialogs(props: LibraryDialogsProps) {
  const { mode, onClose, busy } = props
  const [submitting, setSubmitting] = useState(false)
  const locked = busy || submitting

  return (
    <Dialog open={mode !== null} onOpenChange={open => { if (!open && !locked) onClose() }}>
      {mode && (
        <DialogContent onEscapeKeyDown={event => { if (locked) event.preventDefault() }} onPointerDownOutside={event => { if (locked) event.preventDefault() }}>
          <div className="dialog-header">
            <DialogTitle>{dialogCopy[mode][0]}</DialogTitle>
            <DialogDescription>{dialogCopy[mode][1]}</DialogDescription>
          </div>
          <DialogBody key={`${mode}:${props.item?.id ?? ''}:${props.folder}`} {...props} mode={mode} locked={locked} setSubmitting={setSubmitting} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function DialogBody({ mode, onClose, folder, folders, item, isDemo, onImport, onLink, onFolder, onMetadata, onConnect, locked, setSubmitting }: LibraryDialogsProps & { mode: NonNullable<DialogMode>; locked: boolean; setSubmitting: (value: boolean) => void }) {
  const editing = mode === 'edit'
  const editingLink = editing && item?.kind === 'link'
  const hasLinkFields = mode === 'link' || editingLink
  const [files, setFiles] = useState<File[]>([])
  const [targetFolder, setTargetFolder] = useState(mode === 'folder' && folder ? `${folder}/` : folder)
  const [title, setTitle] = useState(editing ? item?.title ?? '' : '')
  const [description, setDescription] = useState(editing ? item?.description ?? '' : '')
  const [manufacturer, setManufacturer] = useState(editing ? item?.manufacturer ?? '' : '')
  const [model, setModel] = useState(editing ? item?.model ?? '' : '')
  const [tags, setTags] = useState(editing ? item?.tags?.join(', ') ?? '' : '')
  const [kind, setKind] = useState<ItemKind | ''>(editing ? item?.kind ?? '' : '')
  const [url, setUrl] = useState(editingLink ? item.url ?? '' : '')
  const [error, setError] = useState('')

  if (mode === 'about') {
    return (
      <div className="about-content">
        <div className="about-mark"><FolderOpen size={32} strokeWidth={1.4} /></div>
        <p>Your directory is the single source of truth. Files stay where you put them, and titles, tags, links, and the scan cache live in <code>.localdir/index.json</code> inside that directory.</p>
        <p>Add files here or through your file manager. Local Dir checks for changes every 30 seconds while the app is visible. You can also rescan at any time.</p>
        <p>Choose a directory already synced by Dropbox to let Dropbox handle syncing. Local Dir reads and writes your local copy; it does not connect to Dropbox.</p>
        <p>This prototype uses the File System Access API. Open it in Chrome or Edge on HTTPS or localhost and grant access to your directory.</p>
        {isDemo && <p className="form-help">You are viewing an example library. These sample files are not on your disk. Connect a directory to start your own library.</p>}
        <div className="dialog-footer">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {isDemo && <Button onClick={() => { onClose(); onConnect() }}><FolderOpen size={16} /> Connect directory</Button>}
        </div>
      </div>
    )
  }

  if (isDemo && (mode === 'upload' || mode === 'link' || mode === 'folder')) {
    return (
      <div className="connect-prompt">
        <FolderOpen size={32} strokeWidth={1.4} />
        <h3>Start with your directory</h3>
        <p>This is an example library. Connect a local directory to add your own files, folders, and links. Local Dir will save metadata alongside your files.</p>
        <div className="dialog-footer">
          <Button variant="outline" onClick={onClose} disabled={locked}>Cancel</Button>
          <Button onClick={() => { onClose(); onConnect() }} disabled={locked}><FolderOpen size={16} /> Connect directory</Button>
        </div>
      </div>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return
    setError('')
    setSubmitting(true)
    try {
      let linkUrl = ''
      if (hasLinkFields) {
        if (!title.trim()) throw new Error('Give this link a title.')
        let parsed: URL
        try { parsed = new URL(url.trim()) } catch { throw new Error('Enter a complete URL, starting with https:// or http://.') }
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an https:// or http:// URL.')
        linkUrl = parsed.href
      }
      const metadata: ItemMetadata = {
        title: title.trim(),
        description: description.trim(),
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))],
        ...(kind ? { kind } : {}),
      }
      if (mode === 'upload') {
        if (!files.length) throw new Error('Choose at least one file to add.')
        await onImport(files, { ...metadata, title: files.length === 1 ? metadata.title : undefined, folder: cleanFolder(targetFolder) })
      } else if (mode === 'link') {
        await onLink({ ...metadata, title: title.trim(), url: linkUrl, folder: cleanFolder(targetFolder) })
      } else if (mode === 'folder') {
        const path = cleanFolder(targetFolder)
        if (!path) throw new Error('Enter a name for your folder.')
        await onFolder(path)
      } else if (mode === 'edit' && item) {
        await onMetadata(item, editingLink ? { ...metadata, url: linkUrl } : metadata)
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const showDetails = mode === 'upload' || mode === 'edit' || mode === 'link'
  return (
    <form onSubmit={submit} className="library-form">
      <fieldset disabled={locked} className="form-fields">
        {mode === 'edit' && isDemo && <p className="form-help demo-edit-note">You are editing an example. Changes stay in this session and are not saved to disk.</p>}
        {mode === 'edit' && item && <p className="form-help metadata-path">{item.path}</p>}
        {mode === 'upload' && (
          <label className="file-picker">
            <Upload size={24} strokeWidth={1.5} />
            <span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose files to add'}</span>
            <small>{files.length ? files.map(file => file.name).join(', ') : 'Manuals, firmware, documents, or anything else.'}</small>
            <input type="file" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} aria-label="Choose files to add" />
          </label>
        )}

        {showDetails && (mode !== 'upload' || files.length <= 1) && (
          <Field label={hasLinkFields ? 'Title' : 'Title (optional)'}>
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder={hasLinkFields ? 'Manufacturer support page' : item?.name ?? files[0]?.name ?? 'Use the filename'} required={hasLinkFields} autoFocus={mode === 'edit' || mode === 'link'} />
          </Field>
        )}
        {hasLinkFields && <Field label="URL"><input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></Field>}
        {mode !== 'edit' && (
          <Field label={mode === 'folder' ? 'Folder path' : 'Save in'} help={mode === 'folder' ? 'Use / to create nested folders, for example Audio/Synthesizers.' : 'Leave empty for the directory root. New folders are created automatically.'}>
            <input value={targetFolder} onChange={event => setTargetFolder(event.target.value)} placeholder={mode === 'folder' ? 'Equipment/Audio' : 'Directory root'} list="library-folder-options" required={mode === 'folder'} autoFocus={mode === 'folder'} />
          </Field>
        )}
        <datalist id="library-folder-options">{folders.filter(Boolean).map(path => <option key={path} value={path} />)}</datalist>

        {showDetails && (
          <>
            <div className="form-grid">
              <Field label="Manufacturer"><input value={manufacturer} onChange={event => setManufacturer(event.target.value)} placeholder="e.g. Teenage Engineering" /></Field>
              {mode !== 'link' && <Field label="Model"><input value={model} onChange={event => setModel(event.target.value)} placeholder="e.g. OP–1 field" /></Field>}
            </div>
            {mode !== 'link' && (
              <Field label="Type">
                <select value={kind} onChange={event => setKind(event.target.value as ItemKind | '')}>
                  {mode === 'upload' && <option value="">Detect automatically</option>}
                  {item?.kind === 'link' && mode === 'edit' ? <option value="link">Link</option> : kinds.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Tags" help="Separate tags with commas."><input value={tags} onChange={event => setTags(event.target.value)} placeholder="audio, studio, reference" /></Field>
            <Field label="Notes"><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Anything worth remembering…" /></Field>
            {mode === 'upload' && files.length > 1 && <p className="form-help">These details will apply to all {files.length} files. Each file keeps its own filename and detected version.</p>}
          </>
        )}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer">
        <Button type="button" variant="outline" onClick={onClose} disabled={locked}>Cancel</Button>
        <Button type="submit" disabled={locked || (mode === 'upload' && files.length === 0)}>
          {mode === 'upload' ? <Upload size={16} /> : mode === 'link' ? <Link2 size={16} /> : mode === 'folder' ? <FolderPlus size={16} /> : <ArrowUpRight size={16} />}
          {locked ? 'Saving…' : mode === 'upload' ? 'Add files' : mode === 'link' ? 'Add link' : mode === 'folder' ? 'Create folder' : 'Save details'}
        </Button>
      </div>
    </form>
  )
}
