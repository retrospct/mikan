/** @type {import('tailwindcss').Config} */
const { tailwindV3Theme } = require('@mikan/design-tokens/v3')

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: tailwindV3Theme,
  safelist: [
    // Ensure task status colors are always included
    'bg-task-todo-bg',
    'bg-task-progress-bg',
    'bg-task-complete-bg',
    'bg-task-appointment-bg',
    'border-task-todo-border',
    'border-task-progress-border',
    'border-task-complete-border',
    'border-task-appointment-border',
    'text-task-todo-text',
    'text-task-progress-text',
    'text-task-complete-text',
    'text-task-appointment-text'
  ],
  plugins: []
}
