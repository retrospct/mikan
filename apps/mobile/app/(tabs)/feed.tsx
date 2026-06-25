import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { FlatList, View, Text, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import type { Row } from '@tursodatabase/sync-react-native'
import { getDb, getCurrentKey, decrypt } from '../../src/db'
import { reopenDbIfNeeded } from '../../src/db/bootstrap'

/**
 * Feed screen — reads recent captures from the local Turso embedded-replica.
 *
 * Data path: @tursodatabase/sync-react-native (offline-first) → Turso cloud DB.
 * Reads from the local replica instantly; db.pull() fetches cloud writes on refresh.
 * Same items table as the desktop libSQL DB — no shape impedance, no projection needed.
 *
 * Field encryption: items.text may hold an enc:<iv>:<tag>:<ct> value written by
 * the desktop (or by this device after a recovery key is set). decrypt() unwraps it
 * when a key is present; non-enc: values pass through (desktop parity).
 */

type FeedRow = {
  id: string
  source_name: string
  content_type: string
  text: string | null
  created_at: number
}

// db.all() returns column-keyed rows (Row = Record<string, SQLiteValue>).
function parseRow(row: Row, key: string | null): FeedRow {
  const rawText = row.text != null ? String(row.text) : null
  return {
    id: String(row.id),
    source_name: String(row.source_name),
    content_type: String(row.content_type),
    text: rawText !== null ? decrypt(rawText, key) : null,
    created_at: Number(row.created_at),
  }
}

export default function FeedScreen(): ReactElement {
  const router = useRouter()
  const [items, setItems] = useState<FeedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // key is module state, not React state — re-read it every time the tab gains
  // focus so the banner and decrypt() reflect a key saved in the Settings tab.
  const [key, setKey] = useState<string | null>(() => getCurrentKey())
  useFocusEffect(
    useCallback(() => {
      // Re-read the key (may have been updated in Settings) and reopen the DB
      // if module state was reset by a hot reload or app re-foreground.
      void reopenDbIfNeeded().then(() => {
        setKey(getCurrentKey())
      })
    }, [])
  )

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const db = getDb()
      if (isRefresh) await db.pull()
      const rows = await db.all(
        'SELECT id, source_name, content_type, text, created_at FROM items ORDER BY created_at DESC LIMIT 50'
      )
      setItems(rows.map((r) => parseRow(r, key)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('not open') ? 'not-open' : msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [key])

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
      ListHeaderComponent={
        !key ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Add your recovery key in Settings to decrypt desktop notes.
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        error === 'not-open' ? (
          <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.loginPrompt}>
            <Text style={styles.loginPromptText}>Sign in to see your captures →</Text>
          </Pressable>
        ) : (
          <Text style={styles.empty}>
            {error ?? 'No captures yet. Add one from the Capture tab.'}
          </Text>
        )
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
  banner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    marginHorizontal: 0
  },
  bannerText: { fontSize: 13, color: '#92400e' },
  empty: { color: '#888', textAlign: 'center', fontSize: 15 },
  loginPrompt: { paddingVertical: 12, alignItems: 'center' },
  loginPromptText: { color: '#18181b', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
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
