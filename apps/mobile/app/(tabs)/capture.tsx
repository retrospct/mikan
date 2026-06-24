import { useState, type ReactElement } from 'react'
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native'
import { getDb } from '../../src/db'

/**
 * Capture screen — quick text note → local Turso embedded-replica → db.sync().
 *
 * Writes to the local DB first (works offline), then syncs so the desktop picks
 * it up. Same items table as the desktop schema; no shape impedance.
 */
export default function CaptureScreen(): ReactElement {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const db = getDb()
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      await db.execute(
        'INSERT INTO items (id, source_name, content_type, text, status) VALUES (?, ?, ?, ?, ?)',
        [id, 'mobile', 'text', trimmed, 'captured']
      )
      await db.sync()
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
