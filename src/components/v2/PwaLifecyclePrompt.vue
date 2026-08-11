<template>
  <v-snackbar
    v-model="installVisible"
    color="surface"
    location="bottom"
    :timeout="-1"
  >
    <div class="font-weight-bold">
      安装 Classworks 作业板
    </div>
    <div class="text-caption">
      安装后可从桌面直接打开，并获得更稳定的全屏体验。
    </div>
    <template #actions>
      <v-btn
        color="primary"
        variant="text"
        @click="install"
      >
        安装
      </v-btn>
      <v-btn
        variant="text"
        @click="dismissInstall"
      >
        稍后
      </v-btn>
    </template>
  </v-snackbar>

  <v-snackbar
    v-model="updateVisible"
    color="primary"
    location="bottom"
    :timeout="-1"
  >
    新版本已经准备好，刷新后立即使用。
    <template #actions>
      <v-btn
        variant="text"
        @click="reload"
      >
        立即刷新
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import {onMounted, onUnmounted, ref} from "vue";

const INSTALL_DISMISS_KEY = "classworks-pwa-install-dismissed-at";
const installVisible = ref(false);
const updateVisible = ref(false);
let hadController = false;

function installPromptReady() {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
  const dismissedRecently = Number.isFinite(dismissedAt)
    && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
  installVisible.value = Boolean(window.deferredPwaPrompt && !dismissedRecently);
}

async function install() {
  const prompt = window.deferredPwaPrompt;
  if (!prompt) return;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  window.deferredPwaPrompt = null;
  installVisible.value = false;
  if (choice?.outcome !== "accepted") {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  }
}

function dismissInstall() {
  localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  installVisible.value = false;
}

function installed() {
  installVisible.value = false;
  localStorage.removeItem(INSTALL_DISMISS_KEY);
}

function controllerChanged() {
  if (hadController) updateVisible.value = true;
  hadController = true;
}

function reload() {
  window.location.reload();
}

onMounted(() => {
  installPromptReady();
  window.addEventListener("pwa-prompt-ready", installPromptReady);
  window.addEventListener("pwa-installed", installed);
  if ("serviceWorker" in navigator) {
    hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
  }
});

onUnmounted(() => {
  window.removeEventListener("pwa-prompt-ready", installPromptReady);
  window.removeEventListener("pwa-installed", installed);
  navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
});
</script>
