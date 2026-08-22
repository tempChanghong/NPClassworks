/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import {createRouter, createWebHistory} from 'vue-router/auto'
import {setupLayouts} from 'virtual:generated-layouts'
import {routes} from 'vue-router/auto-routes'
import {getInstanceSetupStatus} from '@/utils/classworksV2Client'
import {isDevelopmentOnlyPath} from '@/utils/routeAccess'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
})

router.beforeEach(async (to) => {
  if (isDevelopmentOnlyPath(to.path)) {
    return import.meta.env.DEV ? true : {path: '/', replace: true}
  }
  if (to.path === '/setup') return true
  try {
    const status = await getInstanceSetupStatus()
    if (status.state !== 'COMPLETED') {
      return {path: '/setup', query: {from: to.fullPath}}
    }
  } catch {
    // 后端不可用时保留原有离线与故障页面行为，不让 OOBE 检查阻断应用。
  }
  return true
})

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err, to) => {
  if (err?.message?.includes?.('Failed to fetch dynamically imported module')) {
    if (!localStorage.getItem('vuetify:dynamic-reload')) {
      console.log('Reloading page to fix dynamic import error')
      localStorage.setItem('vuetify:dynamic-reload', 'true')
      window.location.assign(to.fullPath)
    } else {
      console.error('Dynamic import error, reloading page did not fix it', err)
    }
  } else {
    console.error(err)
  }
})

router.isReady().then(() => {
  localStorage.removeItem('vuetify:dynamic-reload')
})

export default router
