import type { ReactNode } from 'react'
import { Text, StyleSheet, type TextStyle } from 'react-native'
import { useTheme } from '../theme/useTheme'

// The desktop's pervasive mono-uppercase tracked caption (`.ovr` / `.today-cap`):
// JetBrains Mono, letter-spaced, uppercased. `accent` tints it with the brand
// primary; default is muted.
export function Label({
  children,
  tone = 'muted',
  style
}: {
  children: ReactNode
  tone?: 'muted' | 'accent'
  style?: TextStyle
}): ReactNode {
  const t = useTheme()
  return (
    <Text
      style={[
        styles.label,
        {
          fontFamily: t.fonts.mono.regular,
          color: tone === 'accent' ? t.color.primary : t.color.textMuted
        },
        style
      ]}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }
})
