import { useState, useCallback, useEffect, type ReactElement } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native'
import { getSyncKey, setSyncKey, clearSyncKey } from '../../src/db/key-store'
import { setCurrentKey } from '../../src/db/client'

/**
 * Settings tab — manage the shared content-encryption recovery key.
 *
 * Flow: user copies the 64-hex key from the desktop's "Reveal recovery key"
 * button (Settings → Cloud sync → Show recovery key), pastes it here, and taps
 * Save. The key is stored in expo-secure-store (OS keychain) and injected into
 * the DB module state so subsequent captures are encrypted and existing enc:
 * rows from the desktop are decrypted correctly.
 */
export default function SettingsScreen(): ReactElement {
  const [keyInput, setKeyInput] = useState('')
  const [storedKey, setStoredKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(true)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const k = await getSyncKey()
    setStoredKey(k)
    setRefreshing(false)
  }, [])

  // Load current key status on mount
  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSave(): Promise<void> {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await setSyncKey(trimmed)
      setCurrentKey(trimmed.toLowerCase())
      setKeyInput('')
      await refresh()
      Alert.alert('Saved', 'Recovery key saved. Captures will now be encrypted.')
    } catch (e) {
      Alert.alert('Invalid key', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleClear(): Promise<void> {
    Alert.alert(
      'Remove key?',
      'Notes written after clearing will be unencrypted. Notes already encrypted will show as enc:… until you re-add the key.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearSyncKey()
            setCurrentKey(null)
            setStoredKey(null)
          }
        }
      ]
    )
  }

  const isKeySet = storedKey !== null

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Cloud sync key</Text>
      <Text style={styles.body}>
        To sync securely across devices, both desktop and mobile must share the
        same AES-256-GCM content encryption key. Reveal it on desktop via{' '}
        <Text style={styles.mono}>Settings → Cloud sync → Show recovery key</Text>,
        then paste the 64-character hex string below.
      </Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, isKeySet ? styles.dotGreen : styles.dotGray]} />
        <Text style={styles.statusText}>
          {refreshing ? 'Checking…' : isKeySet ? 'Key set' : 'No key set — writes are plaintext'}
        </Text>
      </View>

      {isKeySet && storedKey && (
        <Text style={styles.keyPreview} numberOfLines={1}>
          {storedKey.slice(0, 8)}…{storedKey.slice(-8)}
        </Text>
      )}

      <Text style={styles.inputLabel}>Paste recovery key (64 hex chars)</Text>
      <TextInput
        style={styles.input}
        value={keyInput}
        onChangeText={setKeyInput}
        placeholder="e.g. 0a1b2c3d…"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!loading}
      />

      <Pressable
        style={[styles.button, (!keyInput.trim() || loading) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!keyInput.trim() || loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Save key</Text>
        }
      </Pressable>

      {isKeySet && (
        <Pressable style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Remove key</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f9f9f9' },
  container: { padding: 24, gap: 12 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  body: { fontSize: 14, color: '#444', lineHeight: 20 },
  mono: { fontFamily: 'Courier New', fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: '#22c55e' },
  dotGray: { backgroundColor: '#d1d5db' },
  statusText: { fontSize: 14, color: '#555' },
  keyPreview: {
    fontFamily: 'Courier New',
    fontSize: 12,
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#333', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Courier New',
    backgroundColor: '#fff',
    color: '#18181b'
  },
  button: {
    backgroundColor: '#18181b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  clearButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5'
  },
  clearButtonText: { color: '#dc2626', fontSize: 15, fontWeight: '500' }
})
