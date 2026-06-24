import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { FlatList, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { getDb } from '../../src/db'

/**
 * Feed screen — reads recent captures from the local Turso embedded-replica.
 *
 * Data path: @tursodatabase/sync-react-native (offline-first) → Turso cloud DB.
 * Reads from the local replica instantly; db.sync() pulls cloud writes on refresh.
 * Same items table as the desktop libSQL DB — no shape impedance, no projection needed.
 */

type FeedRow = {
  id: string
  source_name: string
  content_type: string
  text: string | null
  created_at: number
}

function parseRow(row: unknown[]): FeedRow {
  return {
    id: String(row[0]),
    source_name: String(row[1]),
    content_type: String(row[2]),
    text: row[3] != null ? String(row[3]) : null,
    created_at: Number(row[4]),
  }
}

export default function FeedScreen(): ReactElement {
  const [items, setItems] = useState<FeedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const db = getDb()
      if (isRefresh) await db.sync()
      const result = await db.execute(
        'SELECT id, source_name, content_type, text, created_at FROM items ORDER BY created_at DESC LIMIT 50'
      )
      setItems(result.rows.map(parseRow))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('not open') ? 'Log in to see your captures.' : msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      contentContainerStyle={items.length === 0 ? styles.center : styles.list}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {error ?? 'No captures yet. Add one from the Capture tab.'}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.text?.slice(0, 120) ?? item.source_name}
          </Text>
          <Text style={styles.cardMeta}>
            {item.content_type} · {new Date(item.created_at * 1000).toLocaleDateString()}
          </Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  empty: { color: '#888', textAlign: 'center', fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  cardTitle: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#888' }
})
