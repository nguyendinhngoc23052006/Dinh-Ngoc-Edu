import { describe, expect, test, vi } from 'vitest'
import { toStorageName, validateMaterialFile } from './materialService'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

describe('validateMaterialFile', () => {
  test('accepts a normal pdf', () => {
    expect(validateMaterialFile({ name: 'notes.pdf', size: 1024 })).toBeNull()
  })

  test('rejects unsupported extensions', () => {
    expect(validateMaterialFile({ name: 'virus.exe', size: 1024 })).toMatch(
      /unsupported/i,
    )
  })

  test('rejects slashes in file names (storage path segments)', () => {
    expect(validateMaterialFile({ name: '../escape.pdf', size: 1024 })).toMatch(
      /slash/i,
    )
    expect(validateMaterialFile({ name: 'a\\b.pdf', size: 1024 })).toMatch(
      /slash/i,
    )
  })

  test('rejects empty files', () => {
    expect(validateMaterialFile({ name: 'notes.pdf', size: 0 })).toMatch(
      /empty/i,
    )
  })

  test('rejects files over 10 MB', () => {
    expect(
      validateMaterialFile({ name: 'notes.pdf', size: 11 * 1024 * 1024 }),
    ).toMatch(/10 MB/i)
  })

  test('accepts a file just under the 10 MB limit', () => {
    expect(
      validateMaterialFile({ name: 'notes.pdf', size: 10 * 1024 * 1024 }),
    ).toBeNull()
  })
})

describe('toStorageName', () => {
  test('leaves plain ASCII names readable', () => {
    expect(toStorageName('notes.pdf')).toMatch(/^[a-z0-9]+_notes\.pdf$/)
  })

  test('strips accents and spaces (storage rejects non-ASCII keys)', () => {
    const name = toStorageName('Ôn tập cuối kỳ.pdf')
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(name).toMatch(/\.pdf$/)
  })

  test('is deterministic so re-uploads stay idempotent', () => {
    expect(toStorageName('Ôn tập.pdf')).toBe(toStorageName('Ôn tập.pdf'))
  })

  test('different originals that sanitize alike get different keys', () => {
    expect(toStorageName('ôn tập.pdf')).not.toBe(toStorageName('ồn tắp.pdf'))
  })

  test('a fully non-ASCII name still produces a usable key', () => {
    const name = toStorageName('考试.pdf')
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(name).toMatch(/\.pdf$/)
  })
})
