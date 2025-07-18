import { Text, View } from 'react-native'

/**
 * Demo component showcasing shared design tokens from @mikan/design-tokens
 * This component demonstrates that the v3 Tailwind config is working with shared colors
 */
export function DesignTokensDemo() {
  return (
    <View className="space-y-3 p-4">
      <Text className="mb-4 text-lg font-bold text-gray-900">Design Tokens Demo</Text>

      {/* Brand Colors */}
      <View className="space-y-2">
        <Text className="font-semibold text-gray-700">Brand Colors:</Text>
        <View className="bg-blue-1000 h-8 w-8 rounded" />
        <View className="bg-purple-1000 h-8 w-8 rounded" />
        <View className="bg-red-1000 h-8 w-8 rounded" />
      </View>

      {/* Task Status Colors */}
      <View className="space-y-2">
        <Text className="font-semibold text-gray-700">Task Status Colors:</Text>
        <View className="bg-task-todo-bg border-task-todo-border rounded-lg border p-3">
          <Text className="text-task-todo-text text-sm">Todo Status</Text>
        </View>
        <View className="bg-task-progress-bg border-task-progress-border rounded-lg border p-3">
          <Text className="text-task-progress-text text-sm">In Progress Status</Text>
        </View>
        <View className="bg-task-complete-bg border-task-complete-border rounded-lg border p-3">
          <Text className="text-task-complete-text text-sm">Complete Status</Text>
        </View>
        <View className="bg-task-appointment-bg border-task-appointment-border rounded-lg border p-3">
          <Text className="text-task-appointment-text text-sm">Appointment Status</Text>
        </View>
      </View>
    </View>
  )
}
