import { Calendar, Clock, Settings, Sparkles, X } from 'lucide-react'

export type NavigationPage = 'today' | 'next' | 'someday' | 'settings'

export interface NavigationPanelProps {
  showNavigation: boolean
  currentPage: NavigationPage
  onNavigate: (page: NavigationPage) => void
  onClose: () => void
}

export const NavigationPanel = ({ showNavigation, currentPage, onNavigate, onClose }: NavigationPanelProps) => {
  const handleNavigate = (page: NavigationPage) => {
    onNavigate(page)
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${
          showNavigation ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Navigation Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          showNavigation ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-light text-gray-800 font-mono">Navigation</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => handleNavigate('today')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                currentPage === 'today' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="font-medium">Today</span>
            </button>

            <button
              onClick={() => handleNavigate('next')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                currentPage === 'next' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="font-medium">Next</span>
            </button>

            <button
              onClick={() => handleNavigate('someday')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                currentPage === 'someday' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Someday</span>
            </button>

            <button
              onClick={() => handleNavigate('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                currentPage === 'settings' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Settings</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  )
}
