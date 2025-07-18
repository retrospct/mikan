import { colors } from './colors.js'

/**
 * Tailwind CSS v3 Configuration
 * For use with React Native / NativeWind
 */

export const tailwindV3Colors = {
  // Flatten nested colors for v3 compatibility
  'blue-1000': colors.blue[1000],
  'purple-1000': colors.purple[1000],
  'red-1000': colors.red[1000],

  // Standard gray palette
  gray: colors.gray,

  // Task-specific colors as flat structure
  'task-todo-bg': colors.task.todo.bg,
  'task-todo-border': colors.task.todo.border,
  'task-todo-text': colors.task.todo.text,

  'task-progress-bg': colors.task['in-progress'].bg,
  'task-progress-border': colors.task['in-progress'].border,
  'task-progress-text': colors.task['in-progress'].text,

  'task-complete-bg': colors.task.complete.bg,
  'task-complete-border': colors.task.complete.border,
  'task-complete-text': colors.task.complete.text,

  'task-appointment-bg': colors.task.appointment.bg,
  'task-appointment-border': colors.task.appointment.border,
  'task-appointment-text': colors.task.appointment.text
}

export const spacing = {
  '18': '4.5rem',
  '88': '22rem'
}

export const fontFamily = {
  geist: ['Geist', 'system-ui', 'sans-serif'],
  'geist-mono': ['Geist Mono', 'ui-monospace', 'monospace']
}

/**
 * Complete theme extension for Tailwind v3
 */
export const tailwindV3Theme = {
  extend: {
    colors: tailwindV3Colors,
    spacing,
    fontFamily
  }
}

export default tailwindV3Theme
