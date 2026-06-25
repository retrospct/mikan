import { useState, type ReactElement } from 'react'
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  View
} from 'react-native'
import { getDb, getCurrentKey, encrypt } from '../../src/db'

/**
 * Capture screen — quick text note → local Turso embedded-replica → db.push().
 *
 * Writes to the local DB first (works offline), then pushes so the desktop picks
 * it up. Same items table as the desktop schema; no shape impedance.
 *
 * Field encryption: items.text is encrypted with the shared AES-256-GCM key
 * (enc:<iv>:<tag>:<ct>) when a key is present — byte-identical to the desktop's
 * pipeline-service.ts output. Without a key, writes plaintext and shows a banner
 * reminding the user to add their recovery key in Settings.
 */
export default function CaptureScreen(): ReactElement {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const key = getCurrentKey()

  async function handleSave(): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const db = getDb()
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      await db.run(
        'INSERT INTO items (id, source_name, content_type, text, status) VALUES (?, ?, ?, ?, ?)',
        id, 'mobile', 'text', encrypt(trimmed, key), 'captured'
      )
      await db.push()
      setText('')
      Alert.alert('Saved', 'Note captured and synced.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      Alert.alert('Error', msg.includes('not open') ? 'Log in first to capture notes.' : msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {!key && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Add your recovery key in Settings to sync securely with desktop.
          </Text>
        </View>
      )}
      <Text style={styles.label}>Quick note</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="What's on your mind?"
        placeholderTextColor="#aaa"
        multiline
        autoFocus
        editable={!saving}
      />
      <Pressable
        style={[styles.button, (!text.trim() || saving) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!text.trim() || saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  banner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4
  },
  bannerText: { fontSize: 13, color: '#92400e' },
  label: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#18181b',
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: '#18181b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
