import { describe, it, expect } from 'vitest'
import { chunkText } from '../../src/main/pipeline/chunk'

describe('chunkText', () => {
  it('returns [] for empty string', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns [] for whitespace-only string', () => {
    expect(chunkText('   \n\t  ')).toEqual([])
  })

  it('returns the trimmed text as a single chunk when shorter than maxChars', () => {
    const text = 'hello world'
    const result = chunkText(text, 800)
    expect(result).toEqual(['hello world'])
  })

  it('returns a single chunk when text equals maxChars exactly', () => {
    const text = 'a'.repeat(800)
    const result = chunkText(text, 800)
    expect(result).toEqual([text])
  })

  it('splits long text into overlapping windows', () => {
    const text = 'a'.repeat(1000)
    const result = chunkText(text, 800, 100)
    // First chunk: 0..800, second: 700..1000
    expect(result.length).toBe(2)
    expect(result[0]).toHaveLength(800)
    expect(result[1]).toHaveLength(300)
  })

  it('every character is covered by at least one chunk', () => {
    const text = 'abcdefghij'.repeat(100) // 1000 chars
    const chunks = chunkText(text, 300, 50)
    const covered = new Set<number>()
    let pos = 0
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        covered.add(pos + i)
      }
      pos += 300 - 50 // advance by (maxChars - overlap) each step
    }
    for (let i = 0; i < text.trim().length; i++) {
      expect(covered.has(i)).toBe(true)
    }
  })

  it('consecutive chunks overlap by exactly the overlap amount', () => {
    const text = 'x'.repeat(2000)
    const maxChars = 500
    const overlap = 100
    const chunks = chunkText(text, maxChars, overlap)
    for (let i = 1; i < chunks.length; i++) {
      // The tail of chunk[i-1] should equal the head of chunk[i]
      const tail = chunks[i - 1]!.slice(-overlap)
      const head = chunks[i]!.slice(0, overlap)
      expect(head).toBe(tail)
    }
  })

  it('trims leading/trailing whitespace before chunking', () => {
    const [chunk] = chunkText('  hello  ')
    expect(chunk).toBe('hello')
  })

  it('throws when overlap >= maxChars', () => {
    expect(() => chunkText('x'.repeat(1000), 100, 100)).toThrow('overlap must be < maxChars')
    expect(() => chunkText('x'.repeat(1000), 100, 200)).toThrow('overlap must be < maxChars')
  })

  it('uses defaults (maxChars=800, overlap=100) when not specified', () => {
    const text = 'word '.repeat(200) // 1000 chars
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]).toHaveLength(800)
  })
})
