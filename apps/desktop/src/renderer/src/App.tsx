import type { NavigationPage } from '@mikan/ui/navigation-panel'
import { NavigationPanel } from '@mikan/ui/navigation-panel'
import { TaskIcon } from '@mikan/ui/task-icon'
import { TaskStatusSelector } from '@mikan/ui/task-status-selector'
import type { Task, TaskStatus } from '@mikan/ui/task-types'
import { JSX, useState } from 'react'

export default function TodoApp(): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      text: 'Finalize reward tiers',
      status: 'in-progress',
      aiSuggestion: 'Consider breaking this into smaller tasks for better progress tracking'
    },
    {
      id: '2',
      text: 'Design new packaging',
      status: 'todo',
      aiSuggestion: 'Schedule a design review meeting with the team'
    },
    {
      id: '3',
      text: 'Email Zach - audio mix',
      status: 'todo'
    },
    {
      id: '4',
      text: '10:30am - call w/ Jack',
      status: 'appointment',
      time: '10:30am'
    },
    {
      id: '5',
      text: 'Shoot photos of new tees',
      status: 'complete'
    },
    {
      id: '6',
      text: 'Resize web graphics',
      status: 'delegated'
    },
    {
      id: '7',
      text: '2:00pm - Christine',
      status: 'appointment',
      time: '2:00pm'
    },
    {
      id: '8',
      text: 'Order new custom tape',
      status: 'todo'
    }
  ])

  const [newTask, setNewTask] = useState('')
  const [showAISuggestions, setShowAISuggestions] = useState(false)
  const [selectorState, setSelectorState] = useState<{
    isVisible: boolean
    taskId: string | null
    position: { x: number; y: number }
  }>({
    isVisible: false,
    taskId: null,
    position: { x: 0, y: 0 }
  })

  const [showNavigation, setShowNavigation] = useState(false)
  const [currentPage, setCurrentPage] = useState<NavigationPage>('today')

  const today = new Date()
  const formattedDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getDate().toString().padStart(2, '0')}.${today.getFullYear().toString().slice(-2)}`

  const updateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks(tasks.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task)))
    setSelectorState({ isVisible: false, taskId: null, position: { x: 0, y: 0 } })
  }

  const hideSelector = () => {
    setSelectorState({ isVisible: false, taskId: null, position: { x: 0, y: 0 } })
  }

  const addTask = () => {
    if (newTask.trim()) {
      const newTaskObj: Task = {
        id: Date.now().toString(),
        text: newTask.trim(),
        status: 'todo'
      }
      setTasks([...tasks, newTaskObj])
      setNewTask('')
    }
  }

  const aiSuggestions = [
    "Based on your schedule, consider moving the 'Design new packaging' task to tomorrow for better focus.",
    'You have two calls today - would you like me to set reminders 5 minutes before each?',
    "The 'Email Zach' task has been pending. Should I draft a follow-up reminder?",
    'Your creative tasks are clustered. Consider spacing them out for better productivity.'
  ]

  const renderPageContent = () => {
    switch (currentPage) {
      case 'next':
        return (
          <div className="space-y-6">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="font-mono text-4xl font-light text-gray-800">Next</h1>
              <span className="text-lg font-light text-gray-600">Upcoming Tasks</span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-2 font-mono font-medium text-gray-800">This Week</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Plan quarterly review meeting</div>
                  <div>• Update project documentation</div>
                  <div>• Review team feedback</div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-2 font-mono font-medium text-gray-800">Next Week</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Prepare presentation slides</div>
                  <div>• Schedule client check-ins</div>
                  <div>• Order office supplies</div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'someday':
        return (
          <div className="space-y-6">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="font-mono text-4xl font-light text-gray-800">Someday</h1>
              <span className="text-lg font-light text-gray-600">Future Ideas</span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-2 font-mono font-medium text-gray-800">Learning Goals</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Learn a new programming language</div>
                  <div>• Take a photography course</div>
                  <div>• Read more books on design</div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-2 font-mono font-medium text-gray-800">Travel & Experiences</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Visit Japan</div>
                  <div>• Go on a hiking trip</div>
                  <div>• Attend a design conference</div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-2 font-mono font-medium text-gray-800">Projects</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Build a personal website</div>
                  <div>• Start a side project</div>
                  <div>• Write a blog</div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'settings':
        return (
          <div className="space-y-6">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="font-mono text-4xl font-light text-gray-800">Settings</h1>
              <span className="text-lg font-light text-gray-600">Preferences</span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-4 font-mono font-medium text-gray-800">AI Assistance</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm text-gray-700">Enable proactive suggestions</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm text-gray-700">Smart task prioritization</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm text-gray-700">Auto-schedule appointments</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-4 font-mono font-medium text-gray-800">Notifications</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm text-gray-700">Daily reminders</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm text-gray-700">Task deadline alerts</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-4 font-mono font-medium text-gray-800">Appearance</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Theme</span>
                    <select className="rounded border border-gray-300 px-3 py-1 text-sm">
                      <option>Light</option>
                      <option>Dark</option>
                      <option>Auto</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Font Size</span>
                    <select className="rounded border border-gray-300 px-3 py-1 text-sm">
                      <option>Small</option>
                      <option>Medium</option>
                      <option>Large</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return (
          <>
            {/* AI Suggestions */}
            <div className="mb-8">
              <button
                onClick={() => setShowAISuggestions(!showAISuggestions)}
                className="mb-4 flex items-center gap-2 text-sm text-blue-600 transition-colors hover:text-blue-800"
              >
                {/* <Sparkles className="w-4 h-4" /> */}
                AI Insights {showAISuggestions ? '(Hide)' : '(Show)'}
              </button>

              {showAISuggestions && (
                <div className="mb-6 rounded-r-lg border-l-4 border-blue-200 bg-blue-50 p-4">
                  <div className="space-y-2">
                    {aiSuggestions.slice(0, 2).map((suggestion, index) => (
                      <p key={index} className="text-sm text-blue-800">
                        • {suggestion}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Task List */}
            <div className="space-y-6">
              {tasks.map((task) => (
                <div key={task.id} className="group relative">
                  <div className="flex items-center gap-4">
                    <TaskIcon
                      status={task.status}
                      onStatusChange={(newStatus: TaskStatus) =>
                        updateTaskStatus(task.id, newStatus)
                      }
                      onShowSelector={() => {
                        const element = document.getElementById(`task-${task.id}`)
                        if (element) {
                          const rect = element.getBoundingClientRect()
                          setSelectorState({
                            isVisible: true,
                            taskId: task.id,
                            position: {
                              x: rect.right + 10,
                              y: rect.top + rect.height / 2
                            }
                          })
                        }
                      }}
                      onHideSelector={hideSelector}
                    />
                    <div className="flex-1" id={`task-${task.id}`}>
                      <div
                        className={`text-lg font-light ${task.status === 'complete' ? 'text-gray-500 line-through' : 'text-gray-800'}`}
                      >
                        {task.text}
                      </div>
                      <div className="mt-2 h-px bg-gray-300"></div>
                    </div>
                  </div>

                  {/* AI Suggestion for specific tasks */}
                  {task.aiSuggestion && showAISuggestions && (
                    <div className="mt-2 ml-10 text-xs text-blue-600 italic opacity-0 transition-opacity group-hover:opacity-100">
                      💡 {task.aiSuggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Task */}
            <div className="mt-12">
              {/* <div className="mt-12 flex items-center gap-4"> */}
              {/* <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:border-gray-500 transition-colors">
                <Plus className="w-3 h-3 text-gray-400" />
              </div> */}
              <div className="flex-1">
                {/* <div className="flex-1"> */}
                <input
                  type="text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTask()}
                  placeholder="Add a new task..."
                  className="w-full border-none bg-transparent text-lg font-light text-gray-800 placeholder-gray-400 outline-none"
                />
                <div className="mt-2 h-px bg-gray-300"></div>
              </div>
            </div>
          </>
        )
    }
  }

  return (
    <div className="draggable min-h-screen bg-gray-50 p-8 font-[family-name:var(--font-geist-sans)]">
      <div className="not-draggable mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-12 flex items-center justify-between">
          <h1 className="text-2xl font-light text-gray-800">Today</h1>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-light text-gray-600 italic">{formattedDate}</h3>
              <div className="h-[0.25px] w-full bg-gray-800" />
            </div>
            <button
              onClick={() => setShowNavigation(true)}
              className="flex flex-col gap-2 rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <div className="h-3 w-3 rounded-full border-2 border-gray-300"></div>
              <div className="h-3 w-3 rounded-full border-2 border-gray-300"></div>
              <div className="h-3 w-3 rounded-full border-2 border-gray-300"></div>
            </button>
          </div>
        </div>

        {/* Page Content */}
        {renderPageContent()}

        {/* Navigation Panel */}
        <NavigationPanel
          showNavigation={showNavigation}
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onClose={() => setShowNavigation(false)}
        />

        {/* Task Status Selector */}
        <TaskStatusSelector
          currentStatus={
            selectorState.taskId
              ? tasks.find((t) => t.id === selectorState.taskId)?.status || 'todo'
              : 'todo'
          }
          onSelect={(status: TaskStatus) => {
            if (selectorState.taskId) {
              updateTaskStatus(selectorState.taskId, status)
            }
          }}
          isVisible={selectorState.isVisible}
          position={selectorState.position}
        />
      </div>
    </div>
  )
}
