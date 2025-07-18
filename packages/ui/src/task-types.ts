export type TaskStatus = 'todo' | 'in-progress' | 'complete' | 'delegated' | 'appointment'

export interface Task {
  id: string
  text: string
  status: TaskStatus
  time?: string
  aiSuggestion?: string
}

export interface TaskStatusOption {
  value: TaskStatus
  label: string
  description: string
}

export const taskStatusOptions: TaskStatusOption[] = [
  { value: 'todo', label: 'To Do', description: 'Not started yet' },
  { value: 'in-progress', label: 'In Progress', description: 'Currently working on' },
  { value: 'complete', label: 'Complete', description: 'Finished task' },
  { value: 'delegated', label: 'Delegated', description: 'Assigned to someone else' },
  { value: 'appointment', label: 'Appointment', description: 'Scheduled event' }
]
