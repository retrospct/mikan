import { useEffect, useRef, useState } from 'react'
import type { TaskStatus } from './task-types'
import { taskStatusOptions } from './task-types'

export interface TaskIconProps {
  status: TaskStatus
  onStatusChange: (status: TaskStatus) => void
  onShowSelector: () => void
  onHideSelector: () => void
}

export const TaskIcon = ({ status, onStatusChange, onShowSelector, onHideSelector }: TaskIconProps) => {
  const baseClasses = 'w-6 h-6 border-2 border-gray-800 cursor-pointer transition-all hover:scale-110 relative'
  const longPressTimer = useRef<NodeJS.Timeout | undefined>(undefined)
  const [isPressed, setIsPressed] = useState(false)

  const handleMouseDown = () => {
    setIsPressed(true)
    longPressTimer.current = setTimeout(() => {
      onShowSelector()
    }, 500) // 500ms for long press
  }

  const handleMouseUp = () => {
    setIsPressed(false)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleClick = () => {
    if (!isPressed) {
      // Quick click - cycle through states
      const currentIndex = taskStatusOptions.findIndex((option) => option.value === status)
      const nextIndex = (currentIndex + 1) % taskStatusOptions.length
      const nextOption = taskStatusOptions[nextIndex]
      if (nextOption) {
        onStatusChange(nextOption.value)
      }
    }
  }

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const iconElement = (() => {
    switch (status) {
      case 'complete':
        return <div className={`${baseClasses} rounded-full bg-gray-800`} />
      case 'in-progress':
        return (
          <div className={`${baseClasses} relative overflow-hidden rounded-full`}>
            <div className="absolute top-0 left-0 h-20 w-1/2 bg-gray-800" />
          </div>
        )
      case 'delegated':
        return (
          <div className={`${baseClasses} relative rounded-full`}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
              <div className="h-0.5 w-3 bg-gray-800" />
            </div>
          </div>
        )
      case 'appointment':
        return (
          <div className={`${baseClasses} relative rounded-full`}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
              <div className="h-0.5 w-3 bg-gray-800" />
              <div className="absolute top-1/2 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 transform bg-gray-800" />
            </div>
          </div>
        )
      default:
        return <div className={`${baseClasses} rounded-full bg-white`} />
    }
  })()

  return (
    <div
      onMouseEnter={onShowSelector}
      onMouseLeave={onHideSelector}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onClick={handleClick}
      className="relative"
    >
      {iconElement}
    </div>
  )
}
