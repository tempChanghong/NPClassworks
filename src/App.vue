<template>
  <v-app :style="vAppStyle">
    <!-- 自定义背景层 -->
    <template v-if="bgEnabled">
      <div
        class="app-background-image"
        :style="bgImageStyle"
      />
      <div
        class="app-background-overlay"
        :style="bgOverlayStyle"
      />
    </template>

    <!-- 正常路由 -->
    <router-view v-slot="{ Component, route }">
      <transition
        mode="out-in"
        name="md3"
      >
        <component
          :is="Component"
          v-if="!hideLockedManagement"
          :key="route.path"
        />
      </transition>
    </router-view>
    <global-message />
    <rate-limit-modal />
    <PwaLifecyclePrompt />
    <NoiseScheduleManager />
    <ActionDialogHost />
    <AppRecoveryDialog />
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useTheme } from "vuetify";
import { getSetting, watchSettings } from "@/utils/settings";
import RateLimitModal from "@/components/RateLimitModal.vue";
import PwaLifecyclePrompt from "@/components/v2/PwaLifecyclePrompt.vue";
import NoiseScheduleManager from "@/components/v2/NoiseScheduleManager.vue";
import ActionDialogHost from "@/components/common/ActionDialogHost.vue";
import AppRecoveryDialog from "@/components/common/AppRecoveryDialog.vue";
import {useRoute, useRouter} from "vue-router";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {installScreenSessionLifecycle} from "@/utils/screenSessionLifecycle";
import {screenExitState} from "@/utils/screenTemporaryExit";
import {findBackgroundPreset, loadPresetBackground, pruneBackgroundCache} from "@/utils/backgroundPresets";

const currentRoute = useRoute();
const router = useRouter();
const store = useClassworksV2Store();
const hideLockedManagement = computed(() => currentRoute.path === "/classworks-admin"
  && screenExitState.value.bound && !screenExitState.value.unlocked);
let stopScreenLifecycle;

const theme = useTheme();

// Background reactive refs
const bgEnabled = ref(false);
const bgSrc = ref("");
const bgBlur = ref(10);
const bgOpacity = ref(30);
let backgroundRequest = 0, backgroundKey = "", backgroundObjectUrl = "";
function releaseBackgroundObject() {
  if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
  backgroundObjectUrl = "";
}
onUnmounted(() => { backgroundRequest++; releaseBackgroundObject(); });

async function loadBgSettings() {
  bgEnabled.value = getSetting("background.enabled") || false;
  const imageData = getSetting("background.imageData") || "";
  const url = getSetting("background.url") || "";
  bgBlur.value = getSetting("background.blur") ?? 10;
  bgOpacity.value = getSetting("background.opacity") ?? 30;
  const selection = getSetting("background.selection");
  const key = JSON.stringify([bgEnabled.value, selection, imageData, url]);
  if (key === backgroundKey) return;
  backgroundKey = key;
  const request = ++backgroundRequest;
  if (!bgEnabled.value) { releaseBackgroundObject(); bgSrc.value = ""; return; }
  if (selection?.kind === "preset") {
    const preset = findBackgroundPreset(selection.id);
    if (!preset) { releaseBackgroundObject(); bgSrc.value = ""; return; }
    try {
      const {objectUrl} = await loadPresetBackground(preset);
      if (request !== backgroundRequest) { URL.revokeObjectURL(objectUrl); return; }
      releaseBackgroundObject(); backgroundObjectUrl = objectUrl; bgSrc.value = objectUrl;
      await pruneBackgroundCache(preset.id);
    } catch { if (request === backgroundRequest) backgroundKey = ""; }
  } else {
    releaseBackgroundObject();
    bgSrc.value = selection?.kind === "url" ? selection.url : imageData || url;
  }
}

const vAppStyle = computed(() => {
  if (!bgEnabled.value || !bgSrc.value) return {};
  return { background: "transparent" };
});

const bgImageStyle = computed(() => ({
  backgroundImage: `url(${bgSrc.value})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: `blur(${bgBlur.value}px)`,
  // Scale slightly to hide blur edge artifacts
  transform: "scale(1.05)",
}));

const bgOverlayStyle = computed(() => ({
  background: `rgba(0, 0, 0, ${bgOpacity.value / 100})`,
}));

let unwatchSettings = null;

const onBeforeInstallPrompt = (e) => {
  e.preventDefault();
  window.deferredPwaPrompt = e;
  window.dispatchEvent(new window.Event('pwa-prompt-ready'));
};

const onAppInstalled = () => {
  window.deferredPwaPrompt = null;
  window.dispatchEvent(new window.Event('pwa-installed'));
};

onMounted(() => {
  stopScreenLifecycle = installScreenSessionLifecycle({router, store});
  // 应用保存的主题设置
  const savedTheme = getSetting("theme.mode");
  theme.global.name.value = savedTheme;

  loadBgSettings();

  unwatchSettings = watchSettings((_, event) => {
    // If event detail is available (same-tab change), only reload on background keys
    const changedKey = event?.detail?.key;
    if (!changedKey || changedKey.startsWith("background.") || changedKey === "theme.mode") {
      loadBgSettings();
      theme.global.name.value = getSetting("theme.mode");
    }
  });

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
});

onUnmounted(() => {
  stopScreenLifecycle?.();
  if (unwatchSettings) unwatchSettings();
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.removeEventListener('appinstalled', onAppInstalled);
});
</script>
<style>
/* 全局样式（从 index.vue 迁移，确保全局可用且仅加载一次） */
@import "@/styles/index.scss";
@import "@/styles/transitions.scss";
@import "@/styles/global.scss";

.md3-enter-active,
.md3-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md3-enter-from {
  opacity: 0;
  transform: translateX(0.5vw);
}

.md3-leave-to {
  opacity: 0;
  transform: translateX(-0.5vw);
}

/* 自定义背景层 */
.app-background-image,
.app-background-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  pointer-events: none;
}

.app-background-image {
  transform-origin: center center;
  will-change: transform, filter;
}
</style>
