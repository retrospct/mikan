// Spike validation screen — visible only in dev builds.
// Exercises: local write → offline read → sync to Turso → verify on desktop.
// Remove or gate behind __DEV__ before shipping to TestFlight.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getDb } from '../../src/db'

type LogLine = { ts: string; msg: string; ok: boolean }

function log(lines: LogLine[], msg: string, ok = true): LogLine[] {
  return [...lines, { ts: new Date().toISOString().slice(11, 23), msg, ok }]
}

export default function DbSpike() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [busy, setBusy] = useState(false)

  const append = useCallback((msg: string, ok = true) => {
    setLines(prev => log(prev, msg, ok))
  }, [])

  useEffect(() => {
    append('Screen mounted — DB should be open (see root layout)')
  }, [append])

  async function runSpike() {
    setBusy(true)
    try {
      const db = getDb()
      append('✓ getDb() succeeded')

      // Write a test item
      const id = `spike-${Date.now()}`
      await db.execute(
        'INSERT INTO items (id, source_name, content_type, text) VALUES (?, ?, ?, ?)',
        [id, 'spike-screen', 'text', `hello from mobile @ ${new Date().toLocaleTimeString()}`]
      )
      append(`✓ inserted item ${id}`)

      // Read it back (local, offline-capable)
      const { rows } = await db.execute('SELECT id, text FROM items ORDER BY created_at DESC LIMIT 5')
      append(`✓ local read — ${rows.length} row(s) returned`)
      for (const row of rows) {
        append(`  › ${String(row[0]).slice(0, 20)}… | ${String(row[1]).slice(0, 40)}`)
      }

      // Sync to Turso cloud
      append('syncing to Turso…')
      await db.sync()
      append('✓ sync complete — check desktop feed for this item')
    } catch (e) {
      append(`✗ ${e instanceof Error ? e.message : String(e)}`, false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>DB Spike</Text>
      <Text style={s.sub}>local libSQL + Turso embedded-replica sync</Text>
      <Button title={busy ? 'Running…' : 'Run Spike'} onPress={runSpike} disabled={busy} />
      {busy && <ActivityIndicator style={{ marginTop: 12 }} />}
      <ScrollView style={s.log}>
        {lines.map((l, i) => (
          <Text key={i} style={[s.line, !l.ok && s.err]}>
            <Text style={s.ts}>{l.ts} </Text>
            {l.msg}
          </Text>
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  sub: { fontSize: 13, color: '#666', marginBottom: 16 },
  log: { marginTop: 16, flex: 1 },
  line: { fontFamily: 'monospace', fontSize: 11, color: '#222', marginBottom: 2 },
  err: { color: '#c00' },
  ts: { color: '#999' },
})
