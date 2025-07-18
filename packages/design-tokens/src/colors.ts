/**
 * Mikan Design System Colors
 * Shared color palette across all applications
 */

export const colors = {
  // Brand colors from existing tailwind-config
  blue: {
    1000: '#2a8af6'
  },
  purple: {
    1000: '#a853ba'
  },
  red: {
    1000: '#e92a67'
  },

  // Extended palette for task management
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712'
  },

  // Task status colors
  task: {
    todo: {
      bg: '#f3f4f6', // gray-100
      border: '#d1d5db', // gray-300
      text: '#374151' // gray-700
    },
    'in-progress': {
      bg: '#eff6ff', // blue-50
      border: '#93c5fd', // blue-300
      text: '#1d4ed8' // blue-700
    },
    complete: {
      bg: '#f0fdf4', // green-50
      border: '#86efac', // green-300
      text: '#15803d' // green-700
    },
    appointment: {
      bg: '#fef3c7', // amber-100
      border: '#fcd34d', // amber-300
      text: '#d97706' // amber-600
    }
  }
} as const

export type ColorPalette = typeof colors
