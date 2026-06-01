import { describe, it, expect } from 'vitest'
import { HashEmbedder } from '../../src/main/pipeline/embed'

/** Cosine similarity for two unit vectors (dot product suffices since L2 norm ≈ 1). */
function cosineSim(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)
}

describe('HashEmbedder', () => {
  const embedder = new HashEmbedder()

  it('produces vectors of length 384 (EMBED_DIM)', async () => {
    const [vec] = await embedder.embed(['hello world'])
    expect(vec).toHaveLength(384)
  })

  it('produces a unit vector (L2 norm ≈ 1)', async () => {
    const [vec] = await embedder.embed(['neural network learning'])
    const norm = Math.sqrt(vec!.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1.0, 5)
  })

  it('returns zero vector (norm ≈ 0) for empty string', async () => {
    const [vec] = await embedder.embed([''])
    const norm = Math.sqrt(vec!.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(0, 5)
  })

  it('is deterministic — same input produces same vector', async () => {
    const text = 'machine learning neural network'
    const [v1] = await embedder.embed([text])
    const [v2] = await embedder.embed([text])
    expect(v1).toEqual(v2)
  })

  it('handles a batch of texts in one call', async () => {
    const texts = ['apple', 'banana', 'cherry']
    const vecs = await embedder.embed(texts)
    expect(vecs).toHaveLength(3)
    for (const v of vecs) {
      expect(v).toHaveLength(384)
    }
  })

  it('texts sharing tokens are closer than disjoint texts', async () => {
    const [vML, vRecipe, vShared] = await embedder.embed([
      'machine learning neural network training data',
      'cooking pasta recipe ingredients dinner',
      'machine learning cooking'
    ])
    // vShared shares tokens with both, so intermediate — just check it's closer
    // to each individual doc than completely disjoint docs are to each other
    const simMLRecipe = cosineSim(vML!, vRecipe!)
    const simMLShared = cosineSim(vML!, vShared!)
    const simRecipeShared = cosineSim(vRecipe!, vShared!)
    // shared tokens → higher cosine similarity
    expect(simMLShared).toBeGreaterThan(simMLRecipe)
    expect(simRecipeShared).toBeGreaterThan(simMLRecipe)
  })

  it('identical texts produce cosine similarity ≈ 1', async () => {
    const [v1, v2] = await embedder.embed([
      'identical text for testing',
      'identical text for testing'
    ])
    expect(cosineSim(v1!, v2!)).toBeCloseTo(1.0, 5)
  })

  it('name is "hash-placeholder"', () => {
    expect(embedder.name).toBe('hash-placeholder')
  })

  it('dim is 384', () => {
    expect(embedder.dim).toBe(384)
  })

  it('respects a custom dim', async () => {
    const custom = new HashEmbedder(128)
    const [vec] = await custom.embed(['test'])
    expect(vec).toHaveLength(128)
  })
})
