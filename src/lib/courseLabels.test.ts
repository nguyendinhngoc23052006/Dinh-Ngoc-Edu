import { describe, expect, test } from 'vitest'
import { statusLabel, visibilityLabel } from './courseLabels'

describe('statusLabel', () => {
  test('maps each status to a human label', () => {
    expect(statusLabel('pending')).toBe('Not generated')
    expect(statusLabel('processing')).toBe('Generating…')
    expect(statusLabel('ready')).toBe('Ready')
    expect(statusLabel('failed')).toBe('Generation failed')
  })
})

describe('visibilityLabel', () => {
  test('labels public and private', () => {
    expect(visibilityLabel('public')).toBe('Public')
    expect(visibilityLabel('private')).toBe('Private')
  })
})
