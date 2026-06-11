import { describe, expect, test, vi } from 'vitest'
import { validateMaterialFile } from './materialService'

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

  test('rejects files over 20 MB', () => {
    expect(
      validateMaterialFile({ name: 'notes.pdf', size: 21 * 1024 * 1024 }),
    ).toMatch(/20 MB/i)
  })
})
