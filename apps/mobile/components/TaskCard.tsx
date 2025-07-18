import { Pressable, Text, View } from 'react-native'

interface TaskCardProps {
  title: string
  status: 'todo' | 'in-progress' | 'complete' | 'appointment'
  onPress: () => void
}

export function TaskCard({ title, status, onPress }: TaskCardProps) {
  // Using shared design tokens from @mikan/design-tokens
  const statusColors = {
    todo: 'bg-task-todo-bg border-task-todo-border',
    'in-progress': 'bg-task-progress-bg border-task-progress-border',
    complete: 'bg-task-complete-bg border-task-complete-border',
    appointment: 'bg-task-appointment-bg border-task-appointment-border'
  }

  const statusTextColors = {
    todo: 'text-task-todo-text',
    'in-progress': 'text-task-progress-text',
    complete: 'text-task-complete-text',
    appointment: 'text-task-appointment-text'
  }

  const statusIndicatorColors = {
    todo: 'bg-gray-400',
    'in-progress': 'bg-blue-500',
    complete: 'bg-green-500',
    appointment: 'bg-yellow-500'
  }

  return (
    <Pressable
      className={`mb-3 rounded-lg border p-4 ${statusColors[status]} active:opacity-80`}
      onPress={onPress}
    >
      <Text className="text-base font-medium text-gray-900">{title}</Text>
      <View className="mt-2 flex-row items-center">
        <View className={`h-2 w-2 rounded-full ${statusIndicatorColors[status]}`} />
        <Text className={`ml-2 text-sm ${statusTextColors[status]}`}>
          {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
        </Text>
      </View>
    </Pressable>
  )
}
