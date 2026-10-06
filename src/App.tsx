import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, File, FileCode2, FileText, Folder, FolderOpen, FolderPlus, HardDrive, Image as ImageIcon, LayoutGrid, Link2, List, Loader2, Maximize2, Menu, MoreHorizontal, Plus, RefreshCw, Search, Settings2, ShieldCheck, Star, Upload, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LibraryDialogs, type DialogMode } from '@/components/LibraryDialogs'
import { FilePreview } from '@/components/FilePreview'
import { useLibrary } from '@/hooks/useLibrary'
import { readItemFile } from '@/lib/filesystem'
import { compareVersions } from '@/lib/versioning'
import { cn, formatBytes, formatDate } from '@/lib/utils'
import type { ItemKind, LibraryItem } from '@/lib/types'

type View = 'all' | 'favorites' | 'recent' | 'links' | 'folder'
type Filter = 'all' | 'manual' | 'firmware' | 'document' | 'link'
const kindLabel: Record<ItemKind, string> = { manual: 'Manual', firmware: 'Firmware', document: 'Document', code: 'Code', image: 'Image', link: 'Link', other: 'File' }
const kindIcon = { manual: BookOpen, firmware: Zap, document: FileText, code: FileCode2, image: ImageIcon, link: Link2, other: File }
const noOpCatch = () => {}

function FileGlyph({ kind, small = false }: { kind: ItemKind; small?: boolean }) {
  const Icon = kindIcon[kind]
  return <span className={cn('file-glyph', `glyph-${kind}`, small && 'glyph-small')}><Icon size={small ? 16 : 19} strokeWidth={1.55} /></span>
}

function FolderTree({ folders, items, active, onSelect, parent = '', depth = 0 }: { folders: string[]; items: LibraryItem[]; active: string; onSelect: (path: string) => void; parent?: string; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const direct = folders.filter(path => path && path.split('/').slice(0, -1).join('/') === parent)
  return <>{direct.map(path => {
    const children = folders.some(candidate => candidate.startsWith(`${path}/`))
    const count = items.filter(item => item.folder === path || item.folder.startsWith(`${path}/`)).length
    return <div key={path}>
      <div className={cn('tree-row', active === path && 'active')} style={{ paddingLeft: 9 + depth * 15 }}>
        <button className="tree-expand" aria-label={`${expanded.has(path) ? 'Collapse' : 'Expand'} ${path}`} disabled={!children} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })}>{children ? expanded.has(path) ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span />}</button>
        <button className="tree-label" onClick={() => onSelect(path)}><Folder size={15} strokeWidth={1.6} /><span>{path.split('/').at(-1)}</span><small>{count}</small></button>
      </div>
      {expanded.has(path) && <FolderTree folders={folders} items={items} active={active} onSelect={onSelect} parent={path} depth={depth + 1} />}
    </div>
  })}</>
}

export default function App() {
  const library = useLibrary()
  const { snapshot, handle, isDemo, busy } = library
  const [view, setView] = useState<View>('all')
  const [folder, setFolder] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [grid, setGrid] = useState(false)
  const [sort, setSort] = useState('name')
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.items[0]?.id ?? null)
  const [modal, setModal] = useState<DialogMode>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'versions'>('overview')
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [directoryMenu, setDirectoryMenu] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = snapshot.items.find(item => item.id === selectedId) ?? null
  const groups = useMemo(() => {
    const result = new Map<string, LibraryItem[]>()
    for (const item of snapshot.items) result.set(item.groupKey, [...(result.get(item.groupKey) ?? []), item])
    for (const versions of result.values()) versions.sort((a, b) => compareVersions(b.version, a.version) || b.modified - a.modified)
    return result
  }, [snapshot.items])
  const groupedItems = [...groups.values()].map(items => items[0])
  const files = snapshot.items.filter(item => item.kind !== 'link')
  const links = snapshot.items.filter(item => item.kind === 'link')
  const favorites = snapshot.items.filter(item => item.favorite)
  const versionCount = [...groups.values()].reduce((sum, items) => sum + Math.max(0, items.length - 1), 0)
  const versions = selected ? groups.get(selected.groupKey) ?? [selected] : []
  const activeFolder = view === 'folder' ? folder : ''
  const visibleItems = groupedItems.filter(item => {
    if (view === 'favorites' && !(groups.get(item.groupKey) ?? []).some(version => version.favorite)) return false
    if (view === 'links' && item.kind !== 'link') return false
    if (view === 'folder' && item.folder !== folder && !item.folder.startsWith(`${folder}/`)) return false
    if (filter !== 'all' && item.kind !== filter && !(filter === 'document' && ['document', 'code', 'image', 'other'].includes(item.kind))) return false
    if (query) {
      const searchable = (groups.get(item.groupKey) ?? [item]).map(version => [version.title, version.name, version.path, version.manufacturer, version.model, version.description, version.version, ...(version.tags ?? [])].join(' ')).join(' ')
      if (!searchable.toLowerCase().includes(query.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => view === 'recent' || sort === 'modified' ? b.modified - a.modified : sort === 'type' ? a.kind.localeCompare(b.kind) : (a.title ?? a.name).localeCompare(b.title ?? b.name))
  const childFolders = snapshot.folders.filter(path => path && path.split('/').slice(0, -1).join('/') === activeFolder)
  const viewTitle = view === 'folder' ? folder.split('/').at(-1) : view === 'favorites' ? 'Favorites' : view === 'recent' ? 'Recently added' : view === 'links' ? 'Useful links' : 'Library'

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus() }
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    if (selectedId && !snapshot.items.some(item => item.id === selectedId)) setSelectedId(groupedItems[0]?.id ?? null)
  }, [snapshot.items, selectedId])

  useEffect(() => {
    let active = true
    setSelectedFile(null)
    setPreviewError('')
    if (!selected || !handle || selected.kind === 'link') { setFileLoading(false); return }
    setFileLoading(true)
    void readItemFile(handle, selected).then(file => { if (active) setSelectedFile(file) }).catch(error => {
      if (active) setPreviewError(error instanceof Error ? error.message : 'Unable to read this file. Try rescanning the directory.')
    }).finally(() => { if (active) setFileLoading(false) })
    return () => { active = false }
  }, [handle, selected?.id, selected?.modified])

  function navigate(next: View, path = '') { setView(next); setFolder(path); setQuery(''); setFilter('all'); setSidebarOpen(false) }
  function select(item: LibraryItem) { setSelectedId(item.id); setDetailTab('overview') }
  async function download() {
    if (!selected || selected.kind === 'link') return
    try {
      const file = selectedFile ?? (handle ? await readItemFile(handle, selected) : selected.demoContent && selected.extension !== 'pdf' ? new Blob([selected.demoContent], { type: 'text/plain' }) : null)
      if (!file) { library.setError('This is an example file. Connect your directory to open and download your own files.'); return }
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = selected.name; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) { library.setError(error instanceof Error ? error.message : 'Could not download file.') }
  }

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={cn('sidebar', sidebarOpen && 'sidebar-open')}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('all') }} aria-label="Local Dir home"><span className="brand-mark"><span /><i /></span><span>Local Dir<span className="brand-period">.</span></span></a>
      <div className="sidebar-section-label">WORKSPACE <span>01</span></div>
      <nav className="main-navigation" aria-label="Library navigation">
        <button className={cn('nav-item', view === 'all' && 'active')} onClick={() => navigate('all')}><LayoutGrid size={17} /><span>All files</span><small>{groupedItems.length}</small></button>
        <button className={cn('nav-item', view === 'favorites' && 'active')} onClick={() => navigate('favorites')}><Star size={17} /><span>Favorites</span><small>{favorites.length || '—'}</small></button>
        <button className={cn('nav-item', view === 'recent' && 'active')} onClick={() => navigate('recent')}><Clock3 size={17} /><span>Recently added</span></button>
        <button className={cn('nav-item', view === 'links' && 'active')} onClick={() => navigate('links')}><Link2 size={17} /><span>Useful links</span><small>{links.length}</small></button>
      </nav>
      <div className="sidebar-section-label folder-section-label">DIRECTORY <button title="Create folder" aria-label="Create folder" onClick={() => setModal('folder')}><Plus size={15} /></button></div>
      <div className="folder-tree"><FolderTree folders={snapshot.folders} items={groupedItems} active={activeFolder} onSelect={path => navigate('folder', path)} />{!snapshot.folders.length && <p className="tree-empty">Your folders appear here.</p>}</div>
      <div className="sidebar-bottom">
        <div className="directory-card"><div className="directory-card-top"><HardDrive size={19} strokeWidth={1.5} /><span className={cn('status-dot', isDemo && 'sample-dot')} /><span>{isDemo ? 'Example directory' : 'Directory connected'}</span></div><strong>{snapshot.name}</strong><p>{isDemo ? 'A little order. A lot of possibility.' : 'Your files. Right where they belong.'}</p><Button variant="outline" size="sm" onClick={() => void library.connect(!isDemo).catch(noOpCatch)} disabled={busy}>{isDemo ? library.remembered ? `Reconnect ${library.remembered.name}` : 'Connect your directory' : 'Switch directory'}<ArrowUpRight size={14} /></Button></div>
        <button className="about-button" onClick={() => setModal('about')}><CircleHelp size={16} /><span>About Local Dir</span><span className="mono">POC / 0.1</span></button>
      </div>
    </aside>

    <div className="app-body">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
        <div className="breadcrumbs"><FolderOpen size={16} /><button onClick={() => navigate('all')}>{snapshot.name}</button><ChevronRight size={12} /><span>{viewTitle}</span></div>
        <div className="topbar-right"><span className="privacy-label"><span className="status-dot" />LOCAL BY DESIGN</span><button className="icon-button settings-button" aria-label="Directory options" onClick={() => setDirectoryMenu(!directoryMenu)}><Settings2 size={17} /></button>
          {directoryMenu && <div className="directory-menu"><button onClick={() => { setDirectoryMenu(false); setModal('about') }}>How your library works</button><button disabled={busy} onClick={() => { setDirectoryMenu(false); void library.connect(true).catch(noOpCatch) }}>Choose another directory</button>{!isDemo && <button disabled={busy} onClick={() => { setDirectoryMenu(false); void library.disconnect() }}>Disconnect directory</button>}</div>}
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">A PLACE FOR EVERYTHING</div><h1>{viewTitle}<span>.</span></h1><p>{view === 'all' ? 'The things you keep. Thoughtfully organized.' : view === 'favorites' ? 'The essentials, always within reach.' : view === 'recent' ? 'The latest additions to your directory.' : view === 'links' ? 'Good references deserve a place, too.' : folder}</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setModal('link')}><Plus size={16} />Add link</Button><Button onClick={() => setModal('upload')}><Upload size={16} />Add files</Button></div></div>

        <div className="library-stats"><div><span className="stat-number">{String(files.length).padStart(2, '0')}</span><span>files in your library</span><FileText size={17} /></div><div><span className="stat-number">{String(snapshot.folders.length).padStart(2, '0')}</span><span>folders, your way</span><Folder size={17} /></div><div><span className="stat-number">{String(versionCount).padStart(2, '0')}</span><span>earlier versions kept</span><Clock3 size={17} /></div><div><span className="stat-number stat-size">{formatBytes(files.reduce((total, file) => total + file.size, 0))}</span><span>stored locally</span><HardDrive size={17} /></div></div>

        {isDemo && <div className="demo-banner"><span className="demo-tag">EXAMPLE LIBRARY</span><span>Make yourself at home. Connect a folder to make it yours.</span><button disabled={busy} onClick={() => void library.connect().catch(noOpCatch)}>{library.remembered ? 'Reconnect directory' : 'Connect directory'}<ArrowUpRight size={14} /></button></div>}
        {library.error && <div className="error-banner" role="alert"><span>{library.error}</span><button aria-label="Dismiss error" onClick={() => library.setError('')}><X size={16} /></button></div>}
        {snapshot.warnings.length > 0 && <div className="warning-banner" role="status">{snapshot.warnings.join(' · ')}</div>}

        <div className={cn('library-workspace', !selected && 'no-selection')}>
          <section className="browser-panel" aria-label="File library">
            <div className="search-toolbar"><div className="search-field"><Search size={17} /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a file, product, or tag…" aria-label="Search library" /><kbd>⌘ K</kbd>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</div><Button variant="ghost" size="icon" disabled={busy || isDemo} aria-label="Rescan directory" title={isDemo ? 'Connect a directory to rescan' : 'Rescan directory'} onClick={() => void library.rescan().catch(noOpCatch)}><RefreshCw size={17} className={busy ? 'spin' : ''} /></Button></div>
            <div className="filter-toolbar"><div className="filter-tabs" aria-label="File type">{([['all', 'All files'], ['manual', 'Manuals'], ['firmware', 'Firmware'], ['document', 'Documents'], ['link', 'Links']] as [Filter, string][]).map(([key, label]) => <button key={key} aria-pressed={filter === key} className={cn(filter === key && 'active')} onClick={() => setFilter(key)}>{label}</button>)}</div><div className="view-toggle"><button className={cn(!grid && 'active')} aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)}><List size={16} /></button><button className={cn(grid && 'active')} aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)}><LayoutGrid size={15} /></button></div></div>

            {!query && filter === 'all' && (view === 'all' || view === 'folder') && childFolders.length > 0 && <div className="folder-overview"><div className="section-caption"><span>FOLDERS</span><button aria-label="New folder" onClick={() => setModal('folder')}><FolderPlus size={14} /></button></div><div className="folder-cards">{childFolders.map(path => <button className="folder-card" key={path} onClick={() => navigate('folder', path)}><Folder size={21} strokeWidth={1.35} /><strong>{path.split('/').at(-1)}</strong><span>{groupedItems.filter(item => item.folder === path || item.folder.startsWith(`${path}/`)).length} items</span><ArrowUpRight size={13} /></button>)}</div></div>}
            <div className="files-section-heading"><span className="section-caption">{query ? 'SEARCH RESULTS' : view === 'folder' ? 'IN THIS FOLDER' : 'YOUR COLLECTION'} <span className="caption-count">{visibleItems.length}</span></span><label className="sort-control">Sort by <select aria-label="Sort files" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="modified">Modified</option><option value="type">Type</option></select><ArrowDown size={12} /></label></div>
            {visibleItems.length === 0 ? <div className="empty-state"><FolderOpen size={35} strokeWidth={1.2} /><h3>{query ? 'Nothing here by that name.' : 'Room for something useful.'}</h3><p>{query ? 'Try another name, manufacturer, or tag.' : 'Add a file or a link, or choose another view.'}</p><Button variant="outline" onClick={() => { if (query || filter !== 'all') { setQuery(''); setFilter('all') } else setModal('upload') }}>{query || filter !== 'all' ? 'Clear filters' : 'Add your first files'}</Button></div> : grid ? <div className="file-grid">{visibleItems.map(item => <button className={cn('file-card', selected?.groupKey === item.groupKey && 'selected')} key={item.id} onClick={() => select(item)}><FileGlyph kind={item.kind} /><strong>{item.title || item.name}</strong><span>{item.model || item.folder.split('/').at(-1) || 'Root directory'}</span><div><span>{kindLabel[item.kind]}</span>{item.version && <span className="version-badge">v{item.version}</span>}</div></button>)}</div> : <div className="file-table"><div className="table-header"><span>Name</span><span>Version</span><span>Size</span><span /></div>{visibleItems.map(item => <div className={cn('file-row', selected?.groupKey === item.groupKey && 'selected')} key={item.id}><button className="file-row-main" onClick={() => select(item)} aria-label={`View ${item.title || item.name}`}><FileGlyph kind={item.kind} /><span className="file-name"><strong>{item.title || item.name}</strong><span>{item.model || item.folder.split('/').at(-1) || 'Root directory'}<i>·</i>{item.kind === 'link' ? 'WEB LINK' : item.extension.toUpperCase()}</span></span></button><button className="file-version" onClick={() => { select(item); setDetailTab('versions') }} aria-label={`Versions of ${item.title || item.name}`}>{item.version ? <span className="version-badge">v{item.version}</span> : <span className="muted">—</span>}{(groups.get(item.groupKey)?.length ?? 0) > 1 && <small>+{(groups.get(item.groupKey)?.length ?? 1) - 1}</small>}</button><span className="file-size mono">{formatBytes(item.size)}</span><button className={cn('row-favorite', item.favorite && 'is-favorite')} aria-label={`${item.favorite ? 'Unfavorite' : 'Favorite'} ${item.title || item.name}`} disabled={busy} onClick={() => void library.updateMetadata(item, { favorite: !item.favorite }).catch(noOpCatch)}><Star size={14} fill={item.favorite ? 'currentColor' : 'none'} /></button></div>)}</div>}
            <div className="table-footer"><span>{visibleItems.length} items{versionCount > 0 && ' · Versions grouped automatically'}</span><span className="mono">{isDemo ? 'EXAMPLE DATA' : 'ON YOUR DEVICE'}</span></div>
          </section>

          {selected && <aside className="detail-panel" aria-label="File details"><div className="detail-top"><span className="section-caption">FILE DETAILS</span><button className="icon-button" aria-label="Close file details" onClick={() => setSelectedId(null)}><X size={16} /></button></div><div className="detail-title"><FileGlyph kind={selected.kind} /><div><h2>{selected.title || selected.name}</h2><p>{selected.model || selected.folder.split('/').at(-1) || 'Root directory'}</p></div><button className={cn('icon-button', selected.favorite && 'is-favorite')} aria-label={selected.favorite ? 'Remove from favorites' : 'Add to favorites'} disabled={busy} onClick={() => void library.updateMetadata(selected, { favorite: !selected.favorite }).catch(noOpCatch)}><Star size={17} fill={selected.favorite ? 'currentColor' : 'none'} /></button></div>
            <div className="detail-tabs"><button className={cn(detailTab === 'overview' && 'active')} onClick={() => setDetailTab('overview')}>Overview</button><button className={cn(detailTab === 'versions' && 'active')} onClick={() => setDetailTab('versions')}>Versions <span>{versions.length}</span></button></div>
            {detailTab === 'overview' ? <div className="detail-content"><div className="preview-container">{previewError ? <div className="preview-error">{previewError}</div> : <FilePreview item={selected} file={selectedFile} loading={fileLoading} />}<button className="expand-preview" aria-label="Expand preview" onClick={() => setPreviewExpanded(true)}><Maximize2 size={14} /></button></div><div className="metadata-heading"><span className="section-caption">INFORMATION</span><button onClick={() => setModal('edit')}>Edit<MoreHorizontal size={14} /></button></div><dl className="metadata-list"><div><dt>Type</dt><dd>{kindLabel[selected.kind]}{selected.kind !== 'link' && ` / ${selected.extension.toUpperCase()}`}</dd></div><div><dt>Manufacturer</dt><dd>{selected.manufacturer || '—'}</dd></div>{selected.model && <div><dt>Product</dt><dd>{selected.model}</dd></div>}<div><dt>Version</dt><dd>{selected.version ? <><span className="mono">{selected.version}</span>{versions[0]?.id === selected.id && <span className="latest-label">Latest</span>}</> : '—'}</dd></div><div><dt>Updated</dt><dd>{formatDate(selected.modified)}</dd></div><div><dt>Location</dt><dd className="path-value" title={selected.path}><Folder size={12} />{selected.folder || '/'}</dd></div>{selected.kind !== 'link' && <div><dt>File size</dt><dd>{formatBytes(selected.size)}</dd></div>}</dl>{selected.description && <p className="file-description">{selected.description}</p>}<div className="file-tags">{selected.tags?.map(tag => <button key={tag} onClick={() => { setQuery(tag); setView('all'); setFilter('all') }}>{tag}</button>)}</div></div> : <div className="versions-content"><p>Every version, in one place. Original files stay in your directory.</p>{versions.map((version, index) => <button className={cn('version-item', version.id === selected.id && 'current')} key={version.id} onClick={() => setSelectedId(version.id)}><span className="version-timeline-dot" /><span><strong>{version.version ? `Version ${version.version}` : 'Original file'}{index === 0 && <span className="latest-label">Latest</span>}</strong><small>{formatDate(version.modified)} · {formatBytes(version.size)}</small><span className="version-filename">{version.name}</span></span>{selected.id === version.id && <Check size={15} />}</button>)}<div className="version-tip"><Code2 size={16} /><span>Names like <code>manual_v1.2.pdf</code> are recognized automatically.</span></div></div>}
            <div className="detail-footer">{selected.kind === 'link' && selected.url ? <Button asChild><a href={selected.url} target="_blank" rel="noopener noreferrer">Visit website<ArrowUpRight size={15} /></a></Button> : <Button variant="outline" disabled={fileLoading || (isDemo && (!selected.demoContent || selected.extension === 'pdf'))} onClick={() => void download()}><ArrowDownToLine size={15} />{isDemo && (!selected.demoContent || selected.extension === 'pdf') ? 'Illustrative sample' : 'Download file'}</Button>}<span><ShieldCheck size={12} />{isDemo ? 'Example file' : 'Stored in your directory'}</span></div>
          </aside>}
        </div>
        <footer className="workspace-footer"><span><span className={cn('status-dot', isDemo && 'sample-dot')} />{isDemo ? 'Exploring the example library' : busy ? 'Updating your directory…' : `Scanned at ${new Date(snapshot.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} {!isDemo && <button onClick={() => void library.rescan().catch(noOpCatch)} disabled={busy}>Rescan</button>}</span><span>Less, but better organized.</span></footer>
      </main>
    </div>
    {library.notice && <div className="toast" role="status"><Check size={16} />{library.notice}</div>}
    {busy && <div className="activity-indicator" role="status"><Loader2 size={14} className="spin" />Working in your directory</div>}
    <LibraryDialogs mode={modal} onClose={() => setModal(null)} folder={activeFolder} folders={snapshot.folders} item={selected} busy={busy} isDemo={isDemo} onImport={library.importFiles} onLink={library.saveLink} onFolder={library.createFolder} onMetadata={library.updateMetadata} onConnect={() => { setModal(null); void library.connect().catch(noOpCatch) }} />
    <Dialog open={previewExpanded && !!selected} onOpenChange={setPreviewExpanded}><DialogContent className="expanded-preview-dialog"><DialogTitle>{selected?.title || selected?.name}</DialogTitle><DialogDescription>File preview · {selected?.name}</DialogDescription>{selected && <FilePreview item={selected} file={selectedFile} loading={fileLoading} />}</DialogContent></Dialog>
  </div>
}
