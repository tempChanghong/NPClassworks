async function loadAnalytics() {
  if (localStorage.getItem('classworks-v2-screen-token')) return
  try {
    const [{default: Clarity}, fingerprintModule] = await Promise.all([
      import('@microsoft/clarity'),
      import('@fingerprintjs/fingerprintjs'),
    ])
    const FingerprintJS = fingerprintModule.default || fingerprintModule
    const fingerprint = await FingerprintJS.load()
    const result = await fingerprint.get()
    Clarity.init('rhp8uqoc3l')
    Clarity.identify(result.visitorId)
  } catch (error) {
    console.warn('访问分析加载失败:', error)
  }
}

export function initializeAnalytics() {
  if (document.readyState === 'complete') {
    void loadAnalytics()
  } else {
    window.addEventListener('load', loadAnalytics, {once: true})
  }
}
