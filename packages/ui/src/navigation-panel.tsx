import { Calendar, Clock, Settings, Sparkles, X } from 'lucide-react'

export type NavigationPage = 'today' | 'next' | 'someday' | 'settings'

export interface NavigationPanelProps {
  showNavigation: boolean
  currentPage: NavigationPage
  onNavigate: (page: NavigationPage) => void
  onClose: () => void
}

export const NavigationPanel = ({
  showNavigation,
  currentPage,
  onNavigate,
  onClose
}: NavigationPanelProps) => {
  const handleNavigate = (page: NavigationPage) => {
    onNavigate(page)
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`bg-opacity-50 fixed inset-0 z-40 bg-black transition-opacity duration-300 ${
          showNavigation ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Navigation Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-80 transform bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          showNavigation ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-mono text-xl font-light text-gray-800">Navigation</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => handleNavigate('today')}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                currentPage === 'today'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="font-medium">Today</span>
            </button>

            <button
              onClick={() => handleNavigate('next')}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                currentPage === 'next'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Clock className="h-5 w-5" />
              <span className="font-medium">Next</span>
            </button>

            <button
              onClick={() => handleNavigate('someday')}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                currentPage === 'someday'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="font-medium">Someday</span>
            </button>

            <button
              onClick={() => handleNavigate('settings')}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                currentPage === 'settings'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Settings className="h-5 w-5" />
              <span className="font-medium">Settings</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  )
}
