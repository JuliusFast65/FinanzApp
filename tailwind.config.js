/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores personalizados para FinanzApp
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#059669', // Color principal de la app
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Colores para estados financieros
        finance: {
          success: '#10b981', // Verde para pagos/ingresos
          warning: '#f59e0b', // Amarillo para advertencias
          danger: '#ef4444',  // Rojo para deudas/cargos
          info: '#3b82f6',    // Azul para información
        }
      },
      fontFamily: {
        sans: ['Nunito Sans', 'sans-serif'], // Actualizamos la fuente por defecto
        // Fuentes manuscritas
        caveat: ['Caveat', 'cursive'],
        'patrick-hand': ['"Patrick Hand"', 'cursive'],
        'indie-flower': ['"Indie Flower"', 'cursive'],
        kalam: ['Kalam', 'cursive'],
        'gochi-hand': ['"Gochi Hand"', 'cursive'],
        // Nuevas fuentes clásicas
        lora: ['Lora', 'serif'],
      },
    },
  },
  plugins: [],
}
