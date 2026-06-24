import type { ReactElement } from 'react'
import { Pressable, Text, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/useTheme'

// Primary action button: brand `primary` fill, `onPrimary` text, `primaryActive`
// on press (the RN analog of the desktop :hover/:active). Disabled/loading dim it.
export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  style
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}): ReactElement {
  const t = useTheme()
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? t.color.primaryActive : t.color.primary,
          borderRadius: t.radius.md,
          paddingVertical: t.space.md,
          paddingHorizontal: t.space.xl,
          opacity: inactive ? 0.4 : 1
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.color.onPrimary} />
      ) : (
        <Text
          style={{
            color: t.color.onPrimary,
            fontFamily: t.fonts.sans.semibold,
            fontSize: t.fontSize.md
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' }
})
