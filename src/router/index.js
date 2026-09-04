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
import {isDevelopmentOnlyPath, isRetiredClassworksPath} from '@/utils/routeAccess'
import {
  hasCompletedSetup,
  rememberCompletedSetup,
  SETUP_STATUS_TIMEOUT_MS,
} from '@/utils/setupStatusCache'
import {recordDiagnosticEvent} from '@/utils/localDiagnostics'
import {showAppRecovery} from '@/utils/appRecovery'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
})

router.beforeEach(async (to) => {
  if (isRetiredClassworksPath(to.path)) {
    return {path: '/', replace: true}
  }
  if (isDevelopmentOnlyPath(to.path)) {
    return import.meta.env.DEV ? true : {path: '/', replace: true}
  }
  if (to.path === '/setup') return true
  if (hasCompletedSetup()) return true
  try {
    const status = await getInstanceSetupStatus({timeout: SETUP_STATUS_TIMEOUT_MS})
    if (rememberCompletedSetup(status)) return true
    if (status.state !== 'COMPLETED') {
      return {path: '/setup', query: {from: to.fullPath}}
    }
  } catch {
    // 后端不可用时保留原有离线与故障页面行为，不让 OOBE 检查阻断应用。
  }
  return true
})

router.onError((err, to) => {
  const message = err?.message || String(err)
  if (/dynamically imported module|module script failed|error loading dynamically imported module/i.test(message)) {
    recordDiagnosticEvent({
      category: 'APP',
      severity: 'ERROR',
      code: 'ROUTE_CHUNK_LOAD_FAILED',
      message,
      context: {route: to?.path || ''},
    })
    showAppRecovery({
      kind: 'resource',
      title: '新版页面资源载入失败',
      message: '页面模块没有完整载入，可以清理资源缓存后重新加载。',
      detail: message,
    })
  }
  console.error(err)
})

export default router
