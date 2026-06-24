import type { ReactElement, ReactNode } from 'react'
import { View, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/useTheme'

// Hairline-bordered rounded surface with a soft shadow — the mobile analog of the
// desktop `.task` / `.card` surface.
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }): ReactElement {
  const t = useTheme()
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.color.surface,
          borderColor: t.color.border,
          borderRadius: t.radius.lg,
          padding: t.space.lg
        },
        style
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  }
})
