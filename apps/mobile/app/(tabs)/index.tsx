import { TaskCard } from '@/components/TaskCard'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

export default function TabOneScreen() {
  const [tasks] = useState([
    { id: '1', title: 'Finalize reward tiers', status: 'in-progress' as const },
    { id: '2', title: 'Design new packaging', status: 'todo' as const },
    { id: '3', title: 'Email Zach - audio mix', status: 'todo' as const },
    { id: '4', title: '10:30am - call w/ Jack', status: 'appointment' as const },
    { id: '5', title: 'Shoot photos of new tees', status: 'complete' as const }
  ])

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-12 pb-4">
        <Text className="text-3xl font-bold text-gray-900">Today</Text>
        <Text className="mt-1 text-gray-600">
          You have {tasks.filter((t) => t.status !== 'complete').length} tasks remaining
        </Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            title={task.title}
            status={task.status}
            onPress={() => console.log(`Pressed task: ${task.title}`)}
          />
        ))}
      </ScrollView>
    </View>
  )
}
