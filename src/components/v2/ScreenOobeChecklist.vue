<template>
  <v-card
    class="screen-oobe mx-auto rounded-xl"
    max-width="980"
  >
    <v-card-title class="pa-6 pb-2">
      <div class="d-flex align-center ga-4">
        <v-avatar
          color="primary"
          size="58"
          variant="tonal"
        >
          <v-icon
            icon="mdi-monitor-check"
            size="34"
          />
        </v-avatar>
        <div>
          <div class="text-h5 font-weight-bold">
            完成大屏初始化
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            {{ screenName }} · {{ className }}
          </div>
        </div>
      </div>
    </v-card-title>

    <v-card-text class="pa-6">
      <v-row>
        <v-col
          cols="12"
          md="6"
        >
          <v-card
            class="setup-item h-100"
            variant="tonal"
          >
            <v-card-text>
              <div class="setup-item__heading">
                <v-icon
                  color="primary"
                  icon="mdi-volume-high"
                />
                <strong>提示音</strong>
                <v-spacer />
                <v-chip
                  :color="audioReady ? 'success' : 'warning'"
                  size="small"
                >
                  {{ audioReady ? "已测试" : "待测试" }}
                </v-chip>
              </div>
              <p>播放一声通知提示，确认音量清晰。</p>
              <v-btn
                color="primary"
                prepend-icon="mdi-play"
                variant="tonal"
                @click="testAudio"
              >
                测试提示音
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          cols="12"
          md="6"
        >
          <v-card
            class="setup-item h-100"
            variant="tonal"
          >
            <v-card-text>
              <div class="setup-item__heading">
                <v-icon
                  color="primary"
                  icon="mdi-bell-outline"
                />
                <strong>系统通知</strong>
                <v-spacer />
                <v-chip
                  :color="notificationColor"
                  size="small"
                >
                  {{ notificationLabel }}
                </v-chip>
              </div>
              <p>页面失焦时，系统通知可以补充显示通知内容。</p>
              <v-btn
                :disabled="notificationState === 'granted' || notificationState === 'unsupported'"
                prepend-icon="mdi-bell-check-outline"
                variant="tonal"
                @click="requestNotifications"
              >
                请求通知权限
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          v-if="noiseEnabled"
          cols="12"
          md="6"
        >
          <v-card
            class="setup-item h-100"
            variant="tonal"
          >
            <v-card-text>
              <div class="setup-item__heading">
                <v-icon
                  color="primary"
                  icon="mdi-microphone-outline"
                />
                <strong>噪声监测麦克风</strong>
                <v-spacer />
                <v-chip
                  :color="microphoneState === 'granted' ? 'success' : 'warning'"
                  size="small"
                >
                  {{ microphoneLabel }}
                </v-chip>
              </div>
              <p>测试麦克风输入，并选择有声音信号的设备。音频只在本机分析。</p>
              <MicrophoneDevicePicker
                :binding-id="bindingId"
                @permission="handleMicrophonePermission"
                @saved="message = '大屏麦克风已保存。'"
              />
            </v-card-text>
          </v-card>
        </v-col>

        <v-col
          cols="12"
          :md="noiseEnabled ? 6 : 12"
        >
          <v-card
            class="setup-item h-100"
            variant="tonal"
          >
            <v-card-text>
              <div class="setup-item__heading">
                <v-icon
                  color="primary"
                  icon="mdi-format-size"
                />
                <strong>作业正文字号</strong>
                <v-spacer />
                <v-chip
                  color="primary"
                  size="small"
                >
                  {{ fontScale }}%
                </v-chip>
              </div>
              <p
                class="font-preview"
                :style="{fontSize: `${1.05 * fontScale / 100}rem`}"
              >
                示例：完成练习册第 10～12 页
              </p>
              <v-slider
                v-model="fontScale"
                color="primary"
                hide-details
                :max="200"
                :min="90"
                :step="10"
                thumb-label
                @end="saveFontScale"
              />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-alert
        v-if="message"
        class="mt-5"
        type="info"
        variant="tonal"
      >
        {{ message }}
      </v-alert>
    </v-card-text>

    <v-card-actions class="pa-6 pt-0">
      <v-btn
        prepend-icon="mdi-fullscreen"
        variant="text"
        @click="enterFullscreen"
      >
        进入全屏
      </v-btn>
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="mdi-check"
        size="large"
        @click="$emit('complete')"
      >
        完成并进入大屏
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import {computed, onMounted, ref} from "vue";
import MicrophoneDevicePicker from "@/components/v2/MicrophoneDevicePicker.vue";
import {loadClassroomToolSettings} from "@/utils/classroomToolSettings";
import {microphonePermissionLabel, queryMicrophonePermission} from "@/utils/microphonePermission";
import {loadScreenDisplaySettings, saveScreenDisplaySettings} from "@/utils/screenDisplaySettings";
import {getSetting} from "@/utils/settings";
import {playProminentNotificationSound} from "@/utils/prominentNotificationSound";
import {screenNotificationSoundProfile} from "@/utils/notificationAlerts";

const props = defineProps({
  bindingId: {type: String, required: true},
  screenName: {type: String, default: "班级大屏"},
  className: {type: String, default: ""},
});
defineEmits(["complete"]);

const audioReady = ref(false);
const notificationState = ref(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
const microphoneState = ref("prompt");
const message = ref("");
const fontScale = ref(loadScreenDisplaySettings(props.bindingId).fontScale);
const noiseEnabled = computed(() => loadClassroomToolSettings(props.bindingId).enabledToolIds.includes("noise"));
const notificationLabel = computed(() => ({
  granted: "已允许",
  denied: "已拒绝",
  default: "等待授权",
  unsupported: "不支持",
})[notificationState.value] || "等待授权");
const notificationColor = computed(() => notificationState.value === "granted" ? "success" : "warning");
const microphoneLabel = computed(() => microphonePermissionLabel(microphoneState.value));

onMounted(async () => {
  if (noiseEnabled.value) microphoneState.value = await queryMicrophonePermission();
});

async function testAudio() {
  try {
    const profile = screenNotificationSoundProfile({priority: "NORMAL"}, {
      singleSound: getSetting("notification.singleSound"),
      urgentSound: getSetting("notification.urgentSound"),
    });
    const playback = await playProminentNotificationSound(profile.filename, {
      gainValue: profile.gainValue,
    });
    if (!playback) throw new Error("当前浏览器未能播放提示音");
    audioReady.value = true;
    message.value = "实际通知提示音测试完成。";
  } catch (error) {
    message.value = error.message || "提示音测试失败";
  }
}

async function requestNotifications() {
  if (typeof Notification === "undefined") return;
  notificationState.value = await Notification.requestPermission();
}

function handleMicrophonePermission(state) {
  microphoneState.value = state;
  message.value = microphonePermissionLabel(state);
}

function saveFontScale() {
  saveScreenDisplaySettings(props.bindingId, {
    ...loadScreenDisplaySettings(props.bindingId),
    fontScale: fontScale.value,
  });
}

async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    message.value = document.fullscreenElement ? "已进入全屏。" : "当前浏览器未进入全屏，可稍后重试。";
  } catch {
    message.value = "浏览器阻止了全屏请求，可以使用浏览器菜单或 F11。";
  }
}
</script>

<style scoped>
.screen-oobe { margin-top: clamp(12px, 4vh, 48px); }
.setup-item { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.setup-item__heading { align-items: center; display: flex; gap: 10px; }
.setup-item p { color: rgba(var(--v-theme-on-surface), 0.68); line-height: 1.55; margin: 14px 0; }
.setup-item .font-preview { color: rgb(var(--v-theme-on-surface)); min-height: 44px; }
</style>
