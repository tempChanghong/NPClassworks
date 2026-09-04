/**
 * main.js
 *
 * 精简启动流水线：快速挂载 Vue app，重型依赖（Sentry/Clarity）异步加载
 */

// 核心插件（Vuetify / Router / Pinia）
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'
import GlobalMessage from '@/components/GlobalMessage.vue'

// Composables
import { createApp } from 'vue'

import messageService from './utils/message'
import { captureOAuthCallback } from './utils/classworksV2Client'
import { initializeAnalytics } from 'virtual:npclassworks-analytics'
import { installLocalDiagnostics } from './utils/localDiagnostics'

captureOAuthCallback()

const app = createApp(App)

registerPlugins(app)
app.use(messageService)
installLocalDiagnostics(app)

app.component('GlobalMessage', GlobalMessage)

// 挂载 Vue app（首要目标：尽快渲染首屏）
app.mount('#app')

// ====== 以下全部异步，不阻塞首屏渲染 ======

// 异步初始化 Sentry（延迟到首帧渲染完成后，防止 errorHandler 与渲染周期冲突）
// setTimeout(() => {
//  import('./utils/sentry').then(({ initSentry }) => {
//    const router = app.config.globalProperties.$router
//    initSentry(app, router)
//  }).catch((err) => {
//    console.warn('Sentry 初始化失败:', err)
//  })
//}, 1000)

// 默认构建解析到空实现；只有显式开启分析的构建才包含第三方 SDK。
initializeAnalytics()
