import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native'
import { addNote, unwrap } from '@nimi/contract/api'

/**
 * Capture screen — quick text note → POST /notes (neeme FastAPI).
 * Companion scope: text only; file capture requires IPC to the desktop worker.
 */
export default function CaptureScreen() {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await unwrap(addNote({ body: { text: trimmed } }))
      setText('')
      Alert.alert('Saved', 'Note captured.')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save')
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
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
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
