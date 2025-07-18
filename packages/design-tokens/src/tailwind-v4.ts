import { colors } from './colors.js'

/**
 * Tailwind CSS v4 Configuration
 * For use with Next.js web and Electron desktop apps
 */

export const tailwindV4Theme = {
  // Brand colors
  '--color-blue-1000': colors.blue[1000],
  '--color-purple-1000': colors.purple[1000],
  '--color-red-1000': colors.red[1000],

  // Gray palette
  '--color-gray-50': colors.gray[50],
  '--color-gray-100': colors.gray[100],
  '--color-gray-200': colors.gray[200],
  '--color-gray-300': colors.gray[300],
  '--color-gray-400': colors.gray[400],
  '--color-gray-500': colors.gray[500],
  '--color-gray-600': colors.gray[600],
  '--color-gray-700': colors.gray[700],
  '--color-gray-800': colors.gray[800],
  '--color-gray-900': colors.gray[900],
  '--color-gray-950': colors.gray[950],

  // Task status colors
  '--color-task-todo-bg': colors.task.todo.bg,
  '--color-task-todo-border': colors.task.todo.border,
  '--color-task-todo-text': colors.task.todo.text,

  '--color-task-progress-bg': colors.task['in-progress'].bg,
  '--color-task-progress-border': colors.task['in-progress'].border,
  '--color-task-progress-text': colors.task['in-progress'].text,

  '--color-task-complete-bg': colors.task.complete.bg,
  '--color-task-complete-border': colors.task.complete.border,
  '--color-task-complete-text': colors.task.complete.text,

  '--color-task-appointment-bg': colors.task.appointment.bg,
  '--color-task-appointment-border': colors.task.appointment.border,
  '--color-task-appointment-text': colors.task.appointment.text,

  // Spacing
  '--spacing-18': '4.5rem',
  '--spacing-88': '22rem',

  // Font families
  '--font-family-geist': 'Geist, system-ui, sans-serif',
  '--font-family-geist-mono': 'Geist Mono, ui-monospace, monospace'
}

/**
 * CSS custom properties string for @theme directive
 */
export const tailwindV4ThemeCSS = Object.entries(tailwindV4Theme)
  .map(([key, value]) => `  ${key}: ${value};`)
  .join('\n')

export default tailwindV4Theme
