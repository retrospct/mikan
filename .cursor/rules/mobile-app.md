---
description: React Native mobile app - Expo patterns, NativeWind styling, platform handling
globs: apps/mobile/**/*.ts, apps/mobile/**/*.tsx, apps/mobile/**/*.js, apps/mobile/app.json
---

# React Native Mobile App Rules

## Expo & React Native Architecture

### Project Setup

- **Expo SDK**: Use managed workflow for easier development
- **Expo Router**: File-based routing for React Native
- **TypeScript**: Required for all components and utilities
- **NativeWind**: Tailwind CSS for React Native styling

### Component Structure

```tsx
// components/TaskCard.tsx
import { View, Text, Pressable } from 'react-native'
import { styled } from 'nativewind'

const StyledView = styled(View)
const StyledText = styled(Text)
const StyledPressable = styled(Pressable)

interface TaskCardProps {
  task: Task
  onPress: () => void
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <StyledPressable className="mb-2 rounded-lg bg-white p-4 shadow-sm active:opacity-90" onPress={onPress}>
      <StyledText className="text-lg font-semibold text-gray-900">{task.title}</StyledText>
    </StyledPressable>
  )
}
```

## NativeWind Styling Patterns

### Setup Requirements

- Always use `styled()` wrapper for React Native components
- Import from 'nativewind' for styled components
- Use Tailwind classes via className prop

### Component Styling

```tsx
import { View, Text, ScrollView } from 'react-native'
import { styled } from 'nativewind'

// Create styled versions
const StyledView = styled(View)
const StyledText = styled(Text)
const StyledScrollView = styled(ScrollView)

// Use with className
<StyledView className="flex-1 bg-gray-50 px-4 py-6">
  <StyledText className="text-2xl font-bold text-gray-900">
    Tasks
  </StyledText>
</StyledView>
```

### Platform-Specific Styling

```tsx
import { Platform } from 'react-native'

<StyledView
  className={`
    p-4
    ${Platform.OS === 'ios' ? 'pt-12' : 'pt-8'}
    ${Platform.select({
      ios: 'shadow-lg',
      android: 'elevation-4'
    })}
  `}
>
```

## Navigation with Expo Router

### File-Based Routing

```
app/
├── _layout.tsx          # Root layout
├── (tabs)/             # Tab navigator
│   ├── _layout.tsx     # Tab layout
│   ├── index.tsx       # Home tab
│   └── settings.tsx    # Settings tab
├── task/
│   └── [id].tsx        # Dynamic route
└── modal.tsx           # Modal screen
```

### Layout Pattern

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router'
import { styled } from 'nativewind'

const StyledStack = styled(Stack)

export default function RootLayout() {
  return (
    <StyledStack>
      <StyledStack.Screen name="(tabs)" options={{ headerShown: false }} />
      <StyledStack.Screen name="modal" options={{ presentation: 'modal' }} />
    </StyledStack>
  )
}
```

## Shared Components Integration

### Using @mikan/ui Components

When using shared components, adapt them for React Native:

```tsx
// Adapt shared types and logic, but create native versions
import type { Task, TaskStatus } from '@mikan/ui/task-types'
import { View, Text } from 'react-native'
import { styled } from 'nativewind'

// Native implementation of shared component concepts
export function TaskIcon({ status }: { status: TaskStatus }) {
  // React Native specific implementation
}
```

## Safe Area Handling

```tsx
import { SafeAreaView } from 'react-native-safe-area-context'
import { styled } from 'nativewind'

const StyledSafeAreaView = styled(SafeAreaView)

export default function Screen() {
  return <StyledSafeAreaView className="flex-1 bg-white">{/* Content */}</StyledSafeAreaView>
}
```

## Gesture Handling

```tsx
import { Pressable, TouchableOpacity } from 'react-native'
import { styled } from 'nativewind'

const StyledPressable = styled(Pressable)

// Pressable with active state
<StyledPressable
  className="bg-blue-500 px-4 py-2 rounded-lg active:bg-blue-600"
  onPress={handlePress}
>
  <StyledText className="text-white font-medium">
    Press Me
  </StyledText>
</StyledPressable>
```

## Performance Optimization

### List Rendering

```tsx
import { FlatList } from 'react-native'
import { styled } from 'nativewind'

const StyledFlatList = styled(FlatList)

<StyledFlatList
  data={tasks}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <TaskCard task={item} />}
  className="flex-1"
  contentContainerClassName="pb-20"
  // Performance props
  removeClippedSubviews
  maxToRenderPerBatch={10}
  windowSize={10}
/>
```

### Image Handling

```tsx
import { Image } from 'expo-image' // Better performance than React Native Image
import { styled } from 'nativewind'

const StyledImage = styled(Image)

<StyledImage
  source={{ uri: imageUrl }}
  className="w-full h-48 rounded-lg"
  contentFit="cover"
  transition={200}
  placeholder={blurhash}
/>
```

## State Management

- Use React hooks for local state
- Share state with Context when needed
- Consider Zustand for complex global state
- Leverage React Query/tRPC for server state

## Expo-Specific Features

### Expo SDK Usage

```tsx
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'

// Haptic feedback
const handlePress = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  // Action logic
}

// Local notifications
await Notifications.scheduleNotificationAsync({
  content: {
    title: 'Task Reminder',
    body: task.title
  },
  trigger: { seconds: 60 * 60 } // 1 hour
})
```

## Testing Patterns

- Use Jest with React Native Testing Library
- Test component behavior, not implementation
- Mock native modules appropriately
- Test platform-specific code paths

## Build & Deployment

### EAS Build Configuration

```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

### Environment Variables

```tsx
// Use Expo constants
import Constants from 'expo-constants'

const API_URL = Constants.expoConfig?.extra?.apiUrl
```

## Accessibility

```tsx
<StyledPressable
  accessible={true}
  accessibilityLabel="Complete task"
  accessibilityRole="button"
  accessibilityState={{ checked: task.completed }}
  className="p-4"
>
  {/* Content */}
</StyledPressable>
```

## Error Handling

- Use Error Boundaries for component errors
- Handle promise rejections in async operations
- Provide offline support with proper error states
- Show user-friendly error messages

## Common Pitfalls to Avoid

- Don't use web-only CSS properties
- Always test on both iOS and Android
- Be mindful of keyboard handling
- Handle deep linking properly
- Test performance on lower-end devices
