/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import {createVuetify} from 'vuetify'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#171918',
          'on-background': '#EEF0EC',
          surface: '#202320',
          'on-surface': '#EEF0EC',
          primary: '#F2B56B',
          'on-primary': '#171918',
        },
      },
      light: {
        dark: false,
        colors: {
          background: '#F6F5F2',
          'on-background': '#232624',
          surface: '#FFFFFF',
          'on-surface': '#232624',
          primary: '#A94E24',
          'on-primary': '#FFFFFF',
        },
      },
    },
  },
})
