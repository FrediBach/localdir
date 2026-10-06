import { describe, expect, it } from 'vitest'
import { compareVersions, inferFile } from './versioning'

describe('filename inference', () => {
  it('groups versions in the same folder without losing the device model', () => {
    const first = inferFile('Synths/OP-1_Field_manual_v1.2.pdf', 12, 1)
    const next = inferFile('Synths/OP-1_Field_manual_v1.10.pdf', 15, 2)
    expect(first.version).toBe('1.2')
    expect(first.title).toBe('OP-1 Field manual')
    expect(first.groupKey).toBe(next.groupKey)
    expect(first.kind).toBe('manual')
    expect(first.groupKey).not.toBe(inferFile('Other/OP-1_Field_manual_v1.2.pdf', 12, 1).groupKey)
    expect(first.groupKey).not.toBe(inferFile('Synths/OP-1_Field_manual_v1.2.md', 12, 1).groupKey)
  })

  it('does not confuse model numbers with versions', () => {
    for (const name of ['Digitakt_II_manual.pdf', 'TR-808_manual.pdf', 'CV1200.pdf', 'Model_12.bin', 'OP-1.pdf', 'V15 user manual.pdf', 'Dyson V15.pdf']) {
      expect(inferFile(name, 0, 0).version).toBeUndefined()
    }
    expect(inferFile('Model_12.bin', 0, 0).groupKey).not.toBe(inferFile('Model_24.bin', 0, 0).groupKey)
    expect(inferFile('V15 user manual v1.0.pdf', 0, 0)).toMatchObject({ version: '1.0', title: 'V15 user manual' })
  })

  it('recognizes explicit and dotted release versions plus firmware extensions', () => {
    expect(inferFile('device_version_2_4_1.bin', 100, 10)).toMatchObject({ kind: 'firmware', version: '2.4.1', title: 'device' })
    expect(inferFile('device_2.4.1.bin', 100, 10).version).toBe('2.4.1')
    expect(inferFile('device-v3.hex', 100, 10).version).toBe('3')
    expect(inferFile('device_v2.1-rc2.bin', 100, 10).version).toBe('2.1-rc2')
    expect(inferFile('README.md', 100, 10).kind).toBe('document')
    expect(inferFile('install.sh', 100, 10).kind).toBe('code')
    expect(inferFile('firmware_V2.bin', 100, 10)).toMatchObject({ version: '2', title: 'firmware' })
    expect(inferFile('firmware-V3.bin', 100, 10)).toMatchObject({ version: '3', title: 'firmware' })
    expect(inferFile('Dyson_V15_manual.pdf', 100, 10).version).toBeUndefined()
  })

  it('recognizes versions before multipart archive extensions', () => {
    const first = inferFile('firmware_v1.2.tar.gz', 100, 10)
    const next = inferFile('firmware_v1.3.tar.gz', 100, 10)
    expect(first).toMatchObject({ version: '1.2', title: 'firmware', extension: 'gz', kind: 'firmware' })
    expect(first.groupKey).toBe(next.groupKey)
    expect(first.groupKey).not.toBe(inferFile('firmware_v1.3.gz', 100, 10).groupKey)
    expect(inferFile('firmware_V2.tar.xz', 100, 10)).toMatchObject({ version: '2', extension: 'xz' })
  })

  it('keeps unversioned files distinct even when their normalized titles match', () => {
    const paths = ['guide-A.pdf', 'guide A.pdf', 'guide_A.pdf', 'GUIDE A.pdf', 'guide A_v1.pdf']
    expect(new Set(paths.map(path => inferFile(path, 0, 0).groupKey)).size).toBe(paths.length)
  })
})

describe('version comparison', () => {
  it('compares number components rather than strings', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0)
    expect(compareVersions('2', '10')).toBeLessThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })

  it('places stable releases after prereleases and missing versions before releases', () => {
    expect(compareVersions('2.0', '2.0-rc2')).toBeGreaterThan(0)
    expect(compareVersions('2.0-rc10', '2.0-rc2')).toBeGreaterThan(0)
    expect(compareVersions(undefined, '1')).toBeLessThan(0)
    expect(compareVersions(undefined, undefined)).toBe(0)
  })
})
