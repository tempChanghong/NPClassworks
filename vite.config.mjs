// Plugins
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import Layouts from 'vite-plugin-vue-layouts'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'
//import { TDesignResolver } from 'unplugin-vue-components/resolvers'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    VueRouter(),
    mode === 'development' && vueDevTools(),
    Layouts(),
    Vue({
      template: { transformAssetUrls }
    }),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        navigateFallback: 'index.html',
        enabled: false,
        suppressWarnings: true,
      },

      lang: 'zh-CN',
      injectRegister: 'auto',
      strategies: 'generateSW',


      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: [
          // 音频由下方 sound-cache 按需缓存。不要把整套声音塞进
          // precache，否则首次安装/更新 PWA 时会一次性下载全部 MP3。
          '**/*.{js,css,html,ico,png,svg,webmanifest,txt,json,woff2}',
        ],
        // UAF PDF 导出的三套中文字库接近 24 MB，只有使用导出功能时
        // 才需要。文件仍会复制到 dist，但交给 uaf-cache 首次按需获取。
        globIgnores: ['sounds/**', 'uaf/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/accounts\//,
          /^\/kv\//,
          /^\/apps\//,
          /^\/devices\//,
          /^\/auth\//,
          /^\/auto-auth\//,
          /^\/socket\.io\//,
          /^\/metrics(?:\/|$)/,
          /^\/check(?:\/|$)/,
          /^\/ready(?:\/|$)/,
        ],
        runtimeCaching: [
          {
            // 后端接口和 Socket.IO 必须始终走网络。尤其不能把带有
            // Authorization 的教师接口放入所有账号共享的 Cache Storage。
            urlPattern: ({ url, sameOrigin }) => {
              if (!sameOrigin) return false;
              return [
                '/api/',
                '/accounts/',
                '/kv/',
                '/apps/',
                '/devices/',
                '/auth/',
                '/auto-auth/',
                '/socket.io/',
              ].some((prefix) => url.pathname.startsWith(prefix)) ||
                url.pathname === '/metrics' ||
                url.pathname === '/check' ||
                url.pathname === '/ready';
            },
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url, sameOrigin }) => {
              return sameOrigin && url.pathname.startsWith('/assets/');
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 60 // 60 天
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ url, sameOrigin }) => {
              return sameOrigin && url.pathname.startsWith('/sounds/');
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'sound-cache',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 天
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ url, sameOrigin }) => {
              return sameOrigin && url.pathname.startsWith('/uaf/');
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'uaf-cache',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 90 // 90 天
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ url, sameOrigin }) => {
              return sameOrigin && url.pathname.startsWith('/pwa/');
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pwa-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 天
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 匹配当前域名下除了上述规则外的所有请求
            urlPattern: ({ url, sameOrigin }) => {
              if (!sameOrigin) return false;
              const path = url.pathname;
              const backendPrefixes = [
                '/api/',
                '/accounts/',
                '/kv/',
                '/apps/',
                '/devices/',
                '/auth/',
                '/auto-auth/',
                '/socket.io/',
              ];
              if (
                backendPrefixes.some((prefix) => path.startsWith(prefix)) ||
                path === '/metrics' ||
                path === '/check' ||
                path === '/ready'
              ) return false;
              // 排除已经由其他规则处理的路径
              return !(
                path.includes('/assets/') ||
                path.includes('/pwa/') ||
                path.includes('/sounds/') ||
                path.includes('/uaf/')
              );
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'other-resources',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 1 天
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
        ],
        additionalManifestEntries: [],
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['sw-cache-manager.js']
      },
      manifest: {
        id: '7C24F2B3.ClassworksPWA',
        name: 'Classworks 作业板',
        short_name: 'Classworks',
        description: '适用于班级大屏的作业板小工具，支持记录、查看并同步作业。',
        theme_color: '#212121',
        background_color: '#212121',
        lang: 'zh-CN',
        dir: 'ltr',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui', 'fullscreen'],
        start_url: './',
        scope: './',
        orientation: 'any',
        categories: ['education', 'productivity', 'utilities'],
        prefer_related_applications: false,
        launch_handler: {
          client_mode: 'navigate-existing',
        },
        screenshots: [
          {
            src: './images/1.jpeg',
            sizes: '1901x1080',
            type: 'image/jpeg',
            form_factor: 'wide',
            label: 'Classworks 作业板主界面',
          },
          {
            src: './images/2.jpeg',
            sizes: '1901x1080',
            type: 'image/jpeg',
            form_factor: 'wide',
            label: 'Classworks 设置与管理界面',
          },
        ],
        file_handlers: [
          {
            action: './?file-handler=true',
            accept: {
              'application/octet-stream': ['.csb', '.csi'],
              'application/x-classworks-backup': ['.csb'],
              'application/x-classworks-install': ['.csi'],
            },
          },
        ],
        protocol_handlers: [
          {
            protocol: 'cs',
            url: './?protocol=%s',
          },
        ],
        icons: [
          {
            src: './pwa/image/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: './pwa/image/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: './pwa/image/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: './pwa/image/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: '随机点名',
            short_name: '随机点名',
            url: './#random-picker',
            icons: [
              {
                src: './pwa/image/pwa-64x64.png',
                sizes: '64x64',
                type: 'image/png'
              }
            ]
          },
        ],
      }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Components({
      // 排除已在 index.vue 中通过 defineAsyncComponent 手动懒加载的组件
      // 避免 unplugin-vue-components 生成冲突的静态 import
      directoryAsNamespace: false,
      globs: [
        'src/components/**/[A-Z]*.vue',
        // TimeCard 已用 defineAsyncComponent 注册；不要再把它发现为可
        // 自动导入组件，否则同一文件会同时生成静态和动态 import。
        '!src/components/NoiseMonitorDetail.vue',
      ],
      exclude: [/pages\/index\.vue$/],
    }),
    Fonts({
      google: {
        families: [{
          name: 'Roboto',
          styles: 'wght@100;300;400;500;700;900',
        }],
      },
    }),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
      ],
      eslintrc: {
        enabled: true,
      },
      vueTemplate: true,
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  build: {
    // ===== Chunk 分割优化 =====
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // 核心框架（极少变动，长缓存）
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // UI 框架
          'vendor-vuetify': ['vuetify'],
          // 监控（异步加载，独立 chunk）
          // 'vendor-sentry': ['@sentry/vue'],
          // 实时通信
          'vendor-socket': ['socket.io-client'],
          // 通用工具库
          'vendor-utils': ['axios', 'uuid', 'js-base64'],
        },
      },
    },
  },
  server: {
    port: 3031,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/accounts': 'http://127.0.0.1:3000',
      '/kv': 'http://127.0.0.1:3000',
      '/apps': 'http://127.0.0.1:3000',
      '/devices': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000',
      '/auto-auth': 'http://127.0.0.1:3000',
      '/check': 'http://127.0.0.1:3000',
      '/ready': 'http://127.0.0.1:3000',
      '/metrics': 'http://127.0.0.1:3000',
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
    },
  },
}))
