import { describe, it, expect } from 'vitest'
import { suffixOf, detectContentType, extract } from '../../src/main/pipeline/extract'

describe('suffixOf', () => {
  it('returns empty string for names without an extension', () => {
    expect(suffixOf('README')).toBe('')
    expect(suffixOf('')).toBe('')
  })

  it('returns the lowercase dot-prefixed extension', () => {
    expect(suffixOf('note.md')).toBe('.md')
    expect(suffixOf('doc.PDF')).toBe('.pdf')
    expect(suffixOf('photo.JPEG')).toBe('.jpeg')
  })

  it('handles multiple dots — returns the last extension only', () => {
    expect(suffixOf('archive.tar.gz')).toBe('.gz')
    expect(suffixOf('report.final.docx')).toBe('.docx')
  })

  it('handles a path with directory separators', () => {
    expect(suffixOf('/home/user/file.txt')).toBe('.txt')
  })
})

describe('detectContentType', () => {
  it('maps text extensions', () => {
    expect(detectContentType('note.md')).toBe('text')
    expect(detectContentType('readme.txt')).toBe('text')
    expect(detectContentType('data.csv')).toBe('text')
    expect(detectContentType('log.log')).toBe('text')
    expect(detectContentType('config.json')).toBe('text')
  })

  it('maps pdf extension', () => {
    expect(detectContentType('report.pdf')).toBe('pdf')
  })

  it('maps image extensions', () => {
    expect(detectContentType('photo.png')).toBe('image')
    expect(detectContentType('photo.jpg')).toBe('image')
    expect(detectContentType('anim.gif')).toBe('image')
  })

  it('maps audio extensions', () => {
    expect(detectContentType('voice.m4a')).toBe('audio')
    expect(detectContentType('clip.mp3')).toBe('audio')
    expect(detectContentType('rec.wav')).toBe('audio')
  })

  it('falls back to MIME when extension is unknown', () => {
    expect(detectContentType('file.unknown', 'image/png')).toBe('image')
    expect(detectContentType('file.unknown', 'audio/mpeg')).toBe('audio')
    expect(detectContentType('file.unknown', 'application/pdf')).toBe('pdf')
    expect(detectContentType('file.unknown', 'text/plain')).toBe('text')
    expect(detectContentType('file.unknown', 'application/json')).toBe('text')
  })

  it("returns 'other' when neither extension nor MIME matches", () => {
    expect(detectContentType('file.xyz')).toBe('other')
    expect(detectContentType('file.xyz', 'application/octet-stream')).toBe('other')
  })

  it('extension wins over MIME when both are present', () => {
    // .md is 'text' even if MIME says something else
    expect(detectContentType('note.md', 'application/octet-stream')).toBe('text')
  })
})

describe('extract', () => {
  it('decodes UTF-8 text bytes and returns extracted status', async () => {
    const text = 'Hello world from mikan'
    const bytes = new TextEncoder().encode(text)
    const result = await extract('text', bytes)
    expect(result.text).toBe(text)
    expect(result.status).toBe('extracted')
  })

  it('returns pending + empty text for empty bytes (text type)', async () => {
    const result = await extract('text', new Uint8Array(0))
    expect(result.text).toBe('')
    expect(result.status).toBe('pending')
  })

  it('returns pending + empty text for whitespace-only content (text type)', async () => {
    const bytes = new TextEncoder().encode('   \n\t  ')
    const result = await extract('text', bytes)
    expect(result.text).toBe('')
    expect(result.status).toBe('pending')
  })

  it('returns pending for image type (no extractor yet)', async () => {
    const result = await extract('image', new Uint8Array([1, 2, 3]))
    expect(result.text).toBe('')
    expect(result.status).toBe('pending')
  })

  it('returns pending for audio type (no extractor yet)', async () => {
    const result = await extract('audio', new Uint8Array([1, 2, 3]))
    expect(result.text).toBe('')
    expect(result.status).toBe('pending')
  })

  it('returns pending for other type', async () => {
    const result = await extract('other', new Uint8Array([1, 2, 3]))
    expect(result.text).toBe('')
    expect(result.status).toBe('pending')
  })
})
