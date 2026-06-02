import { useEffect, useState, type ReactElement } from 'react'
import { FlatList, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { getRecent, unwrap } from '@nimi/contract/api'
import type { ItemSummary } from '@nimi/contract/api'

/**
 * Feed screen — reads recent captures from the neeme FastAPI.
 *
 * Data path: @nimi/contract/api (plain-fetch hey-api client) → neeme FastAPI.
 * This is the mobile companion's remote-only path; no local libSQL.
 * A real multi-user feed requires #10 sync + user_id scoping to be deployed.
 */
export default function FeedScreen(): ReactElement {
  const [items, setItems] = useState<ItemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(isRefresh = false): Promise<void> {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await unwrap(getRecent())
      setItems(res.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load after mount.
    void load()
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={items.length === 0 ? styles.center : styles.list}
      ListHeaderComponent={
        error && items.length > 0 ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {error ?? 'No captures yet. Add one from the Capture tab.'}
        </Text>
      }
      renderItem={({ item }: { item: ItemSummary }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.source_filename ?? item.excerpt ?? item.id}
          </Text>
          <Text style={styles.cardMeta}>{item.content_type}</Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  empty: { color: '#888', textAlign: 'center', fontSize: 15 },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    marginBottom: 12,
    padding: 12
  },
  errorText: { color: '#991b1b', fontSize: 14 },
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
