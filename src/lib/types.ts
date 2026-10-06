export type ItemKind = 'manual' | 'firmware' | 'document' | 'code' | 'image' | 'link' | 'other'

export interface ItemMetadata {
  title?: string
  description?: string
  manufacturer?: string
  model?: string
  tags?: string[]
  favorite?: boolean
  kind?: ItemKind
}

export type MetadataPatch = ItemMetadata & { url?: string }

export interface LibraryItem extends ItemMetadata {
  id: string
  name: string
  path: string
  folder: string
  kind: ItemKind
  extension: string
  size: number
  modified: number
  version?: string
  groupKey: string
  url?: string
  demoContent?: string
}

export interface LibrarySnapshot {
  name: string
  items: LibraryItem[]
  folders: string[]
  scannedAt: number
  warnings: string[]
}

export interface LinkInput extends ItemMetadata {
  title: string
  url: string
  folder: string
}

export interface ImportInput extends ItemMetadata {
  folder: string
}
