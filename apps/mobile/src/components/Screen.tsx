import type { ReactElement, ReactNode } from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../theme/useTheme'

// Themed page wrapper: brand `bg` ground + safe-area insets. `padded` (default)
// applies the standard screen gutter; pass false for full-bleed lists that
// manage their own padding.
export function Screen({
  children,
  style,
  padded = true
}: {
  children: ReactNode
  style?: ViewStyle
  padded?: boolean
}): ReactElement {
  const t = useTheme()
  return (
    <SafeAreaView
      style={[
        styles.root,
        { backgroundColor: t.color.bg },
        padded && { padding: t.space.lg },
        style
      ]}
    >
      {children}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 }
})
