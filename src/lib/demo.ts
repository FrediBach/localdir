import type { LibraryItem, LibrarySnapshot } from './types'

const sampleDate = (day: number, month = 9) => new Date(2026, month - 1, day, 11, 30).getTime()

function sample(
  path: string,
  kind: LibraryItem['kind'],
  options: Partial<LibraryItem> = {},
): LibraryItem {
  const name = path.split('/').at(-1) ?? path
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const extension = name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : ''
  return {
    id: `demo:${path}`,
    name,
    path,
    folder,
    kind,
    extension,
    size: 0,
    modified: sampleDate(24),
    groupKey: `${folder}/${name.replace(/[-_ ]v?\d+(?:\.\d+)+/i, '').toLowerCase()}`,
    ...options,
  }
}

/** Fictional sample files. No product specifications or firmware are supplied. */
export const demoSnapshot: LibrarySnapshot = {
  name: 'My local directory',
  scannedAt: sampleDate(6, 10),
  warnings: [],
  folders: [
    'Audio',
    'Audio/Braun LE 01',
    'Audio/Teenage Engineering OP-1',
    'Photography',
    'Photography/Fujifilm X100VI',
    'Home',
    'Home/Dyson',
    'Computing',
    'Computing/Raspberry Pi',
    'Computing/Raspberry Pi/Projects',
  ],
  items: [
    sample('Audio/Braun LE 01/User manual v1.2.pdf', 'manual', {
      title: 'LE 01 — User manual',
      description: 'Everything in its right place. Setup, everyday listening, and care for your LE 01. An illustrative sample manual.',
      manufacturer: 'Braun', model: 'LE 01', version: '1.2', size: 2_450_176,
      tags: ['English', 'Audio'], favorite: true,
      groupKey: 'Audio/Braun LE 01/user-manual', demoContent: 'sample-pdf',
    }),
    sample('Audio/Braun LE 01/User manual v1.1.pdf', 'manual', {
      title: 'LE 01 — User manual',
      description: 'Previous edition of the illustrative sample manual.',
      manufacturer: 'Braun', model: 'LE 01', version: '1.1', size: 2_184_192,
      modified: sampleDate(12, 6), tags: ['English', 'Audio'],
      groupKey: 'Audio/Braun LE 01/user-manual', demoContent: 'sample-pdf',
    }),
    sample('Audio/Braun LE 01/LE01 firmware v2.4.0.bin', 'firmware', {
      title: 'LE 01 — Firmware', manufacturer: 'Braun', model: 'LE 01',
      description: 'Sample firmware entry for exploring automatic version grouping. No installable firmware is included.',
      version: '2.4.0', size: 18_440_192, tags: ['Audio', 'Update'],
      groupKey: 'Audio/Braun LE 01/firmware',
    }),
    sample('Audio/Braun LE 01/LE01 firmware v2.3.1.bin', 'firmware', {
      title: 'LE 01 — Firmware', manufacturer: 'Braun', model: 'LE 01',
      description: 'An older, fictional firmware version. Included to demonstrate version history.',
      version: '2.3.1', size: 17_682_432, modified: sampleDate(3, 5), tags: ['Audio'],
      groupKey: 'Audio/Braun LE 01/firmware',
    }),
    sample('Audio/Braun LE 01/Listening notes.md', 'document', {
      title: 'Listening notes', manufacturer: 'Braun', model: 'LE 01', size: 684,
      tags: ['Notes', 'Audio'],
      demoContent: '# A space for listening\n\nA few notes about the living room setup.\n\n## Placement\n\n- Keep the shelf free of small objects.\n- Leave a little breathing room around the speaker.\n- Keep the cable tucked behind the cabinet.\n\n## First listen\n\n1. Nils Frahm — *Spaces*\n2. Brian Eno — *Music for Airports*\n3. Ryuichi Sakamoto — *async*\n\n> Less, but better.\n\n---\n\n*Sample personal notes. This is not manufacturer documentation.*',
    }),
    sample('Audio/Braun LE 01/Braun Audio.link.json', 'link', {
      title: 'Braun Audio', description: 'Manufacturer website and product support.',
      manufacturer: 'Braun', model: 'LE 01', url: 'https://www.braun-audio.com/', tags: ['Manufacturer', 'Support'],
    }),
    sample('Audio/Teenage Engineering OP-1/OP-1 field guide v1.0.pdf', 'manual', {
      title: 'OP-1 — Field guide', manufacturer: 'Teenage Engineering', model: 'OP-1',
      description: 'A sample quick reference for the studio collection.',
      version: '1.0', size: 4_624_384, tags: ['English', 'Audio'], favorite: true, demoContent: 'sample-pdf',
    }),
    sample('Audio/Teenage Engineering OP-1/OP-1 firmware v1.5.0.op1', 'firmware', {
      title: 'OP-1 — Firmware', manufacturer: 'Teenage Engineering', model: 'OP-1',
      description: 'Fictional firmware listing used to demonstrate a local collection.',
      version: '1.5.0', size: 12_582_912, tags: ['Audio', 'Update'],
    }),
    sample('Audio/Teenage Engineering OP-1/Studio notes.md', 'document', {
      title: 'Studio notes', manufacturer: 'Teenage Engineering', model: 'OP-1', size: 412, tags: ['Notes'],
      demoContent: '# Small studio, big ideas\n\n## Before a session\n\n- [x] Make space on the desk\n- [x] Connect headphones\n- [ ] Record a new field sample\n- [ ] Back up the latest sketches\n\n## Sketchbook\n\n| Idea | Mood | Status |\n| --- | --- | --- |\n| Sunday morning | Warm, slow | In progress |\n| Night bus | Textural | Saved |\n| Almost home | Quiet | New |\n\n*Illustrative sample notes.*',
    }),
    sample('Audio/Teenage Engineering OP-1/Teenage Engineering.link.json', 'link', {
      title: 'Teenage Engineering', description: 'Instruments, guides, and support.',
      manufacturer: 'Teenage Engineering', url: 'https://teenage.engineering/', tags: ['Manufacturer'],
    }),
    sample('Photography/Fujifilm X100VI/X100VI user manual v1.0.pdf', 'manual', {
      title: 'X100VI — User manual', manufacturer: 'Fujifilm', model: 'X100VI',
      description: 'Sample document for the camera collection.', version: '1.0', size: 8_163_328,
      tags: ['English', 'Photography'], demoContent: 'sample-pdf',
    }),
    sample('Photography/Fujifilm X100VI/X100VI firmware v1.2.0.dat', 'firmware', {
      title: 'X100VI — Firmware', manufacturer: 'Fujifilm', model: 'X100VI',
      description: 'An illustrative firmware entry. Version and file are fictional.',
      version: '1.2.0', size: 68_157_440, tags: ['Photography', 'Update'],
      groupKey: 'Photography/Fujifilm X100VI/firmware',
    }),
    sample('Photography/Fujifilm X100VI/X100VI firmware v1.1.0.dat', 'firmware', {
      title: 'X100VI — Firmware', manufacturer: 'Fujifilm', model: 'X100VI',
      description: 'An older fictional firmware version.',
      version: '1.1.0', size: 65_536_000, modified: sampleDate(9, 4), tags: ['Photography'],
      groupKey: 'Photography/Fujifilm X100VI/firmware',
    }),
    sample('Photography/Fujifilm X100VI/Film recipes.md', 'document', {
      title: 'Film recipes', manufacturer: 'Fujifilm', model: 'X100VI', size: 524,
      tags: ['Notes', 'Photography'], favorite: true,
      demoContent: '# The everyday camera\n\nA small collection of visual ideas to revisit on a walk.\n\n## Overcast afternoons\n\nSoft contrast, gentle color, and a little room in the shadows. Look for muted reds against concrete.\n\n## After dark\n\nLet the highlights glow. Rain on a quiet street makes its own composition.\n\n## Remember\n\n- Photograph the ordinary.\n- Take one lens, one spare battery, and less stuff.\n- Print a favorite every month.\n\n*Illustrative personal notes, not camera settings or manufacturer guidance.*',
    }),
    sample('Photography/Fujifilm X100VI/Fujifilm support.link.json', 'link', {
      title: 'Fujifilm support', description: 'Official manufacturer website.',
      manufacturer: 'Fujifilm', url: 'https://fujifilm-x.com/', tags: ['Manufacturer', 'Support'],
    }),
    sample('Home/Dyson/V15 user manual v1.0.pdf', 'manual', {
      title: 'V15 — User manual', manufacturer: 'Dyson', model: 'V15',
      description: 'Sample manual for the home collection.', version: '1.0', size: 3_145_728,
      tags: ['English', 'Home'], demoContent: 'sample-pdf',
    }),
    sample('Home/Dyson/Care schedule.md', 'document', {
      title: 'Care schedule', manufacturer: 'Dyson', model: 'V15', size: 256, tags: ['Notes', 'Home'],
      demoContent: '# A little care\n\nKeep product care notes, purchase details, and reminders beside the manual.\n\n| Task | Last checked |\n| --- | --- |\n| Review manufacturer care instructions | September |\n| Check spare accessories | September |\n| File the receipt | Done |\n\n*This is a sample checklist. Follow the instructions supplied with your product.*',
    }),
    sample('Home/Dyson/Dyson support.link.json', 'link', {
      title: 'Dyson support', description: 'Official manufacturer website and support.',
      manufacturer: 'Dyson', url: 'https://www.dyson.com/', tags: ['Manufacturer', 'Support'],
    }),
    sample('Computing/Raspberry Pi/Getting started v1.0.pdf', 'manual', {
      title: 'Raspberry Pi — Getting started', manufacturer: 'Raspberry Pi', model: 'Pi 5',
      description: 'Sample getting-started document for a home project.', version: '1.0', size: 1_843_200,
      tags: ['English', 'Computing'], demoContent: 'sample-pdf',
    }),
    sample('Computing/Raspberry Pi/Projects/status.py', 'code', {
      title: 'A tiny status display', description: 'A simple example script. Everything lives beside the project.',
      manufacturer: 'Raspberry Pi', model: 'Pi 5', size: 372, tags: ['Python', 'Project'],
      demoContent: '# A tiny local status display\n# Illustrative sample — no hardware required.\n\nfrom datetime import datetime\n\n\ndef status_message(name: str) -> str:\n    """Make a quiet, useful status message."""\n    timestamp = datetime.now().strftime("%H:%M")\n    return f"{name} · All systems ready · {timestamp}"\n\n\nif __name__ == "__main__":\n    print(status_message("Studio Pi"))\n',
    }),
    sample('Computing/Raspberry Pi/Projects/config.json', 'code', {
      title: 'Project configuration', manufacturer: 'Raspberry Pi', model: 'Pi 5', size: 148,
      tags: ['JSON', 'Project'],
      demoContent: '{\n  "name": "Studio Pi",\n  "display": {\n    "brightness": 70,\n    "theme": "warm"\n  },\n  "refreshInterval": 60,\n  "timezone": "Europe/Zurich"\n}\n',
    }),
    sample('Computing/Raspberry Pi/Raspberry Pi documentation.link.json', 'link', {
      title: 'Raspberry Pi documentation', description: 'Official guides and project documentation.',
      manufacturer: 'Raspberry Pi', url: 'https://www.raspberrypi.com/documentation/', tags: ['Documentation', 'Support'],
    }),
    sample('README.md', 'document', {
      title: 'A home for the things you own', description: 'A small, local-first library. Yours to arrange.',
      size: 642, tags: ['Getting started'],
      demoContent: '# A home for the things you own\n\nManuals, firmware, useful links, and the notes you want to keep. Together in one ordinary folder.\n\n## Make it yours\n\n1. Connect a directory on your computer.\n2. Add files here, or drop them straight into that directory.\n3. Scan again whenever something changes.\n\nYour folder is the source of truth. Metadata lives in local JSON files, beside your collection.\n\n## This is a sample collection\n\nThe documents and firmware entries you see here are illustrative. Connect your own directory to work with real files.\n\n**Simple things, thoughtfully organized.**',
    }),
  ],
}
