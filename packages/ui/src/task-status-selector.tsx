import { TaskIcon } from './task-icon'
import type { TaskStatus } from './task-types'
import { taskStatusOptions } from './task-types'

export interface TaskStatusSelectorProps {
  currentStatus: TaskStatus
  onSelect: (status: TaskStatus) => void
  isVisible: boolean
  position: { x: number; y: number }
}

export const TaskStatusSelector = ({ currentStatus, onSelect, isVisible, position }: TaskStatusSelectorProps) => {
  if (!isVisible) return null

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateY(-50%)'
      }}
    >
      {taskStatusOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors ${
            currentStatus === option.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
          }`}
        >
          <TaskIcon
            status={option.value}
            onStatusChange={() => {}}
            onShowSelector={() => {}}
            onHideSelector={() => {}}
          />
          <div>
            <div className="font-medium text-sm">{option.label}</div>
            <div className="text-xs text-gray-500">{option.description}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
