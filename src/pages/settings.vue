<template>
  <div class="settings-v2-page">
    <v-app-bar
      color="surface"
      flat
    >
      <v-btn
        icon="mdi-arrow-left"
        title="返回作业板"
        @click="goBack"
      />
      <v-app-bar-title>
        <div class="font-weight-bold">
          设置
        </div>
        <div class="text-caption text-medium-emphasis">
          Classworks 2 设置中心
        </div>
      </v-app-bar-title>
      <v-chip
        class="mr-4"
        color="primary"
        :prepend-icon="contextIcon"
        variant="tonal"
      >
        {{ contextLabel }}
      </v-chip>
    </v-app-bar>

    <v-container
      class="settings-v2-container"
      fluid
    >
      <v-skeleton-loader
        v-if="loading"
        type="list-item-avatar-three-line, article"
      />

      <template v-else>
        <v-alert
          v-if="loadError"
          class="mb-5"
          closable
          type="warning"
          variant="tonal"
          @click:close="loadError = ''"
        >
          {{ loadError }}；本机设置仍然可以修改。
        </v-alert>

        <v-select
          v-model="activeSection"
          class="settings-mobile-nav mb-4"
          density="comfortable"
          hide-details
          item-title="title"
          item-value="id"
          :items="navItems"
          label="设置分类"
          variant="outlined"
        />

        <div class="settings-v2-layout">
          <v-card
            class="settings-nav rounded-xl"
            variant="flat"
          >
            <v-list
              density="comfortable"
              nav
            >
              <v-list-item
                v-for="item in navItems"
                :key="item.id"
                :active="activeSection === item.id"
                :prepend-icon="item.icon"
                :title="item.title"
                @click="activeSection = item.id"
              />
            </v-list>
          </v-card>

          <main class="settings-content">
            <template v-if="activeSection === 'appearance'">
              <SettingsPanel
                description="控制当前浏览器中的主题和背景，不会影响其他同学或教室。"
                icon="mdi-palette-outline"
                title="外观"
              >
                <SettingRow
                  description="深色模式更适合长期显示，浅色模式适合光线充足的环境。"
                  title="主题模式"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-btn-toggle
                    :model-value="appearance.theme"
                    color="primary"
                    mandatory
                    variant="outlined"
                    @update:model-value="saveAppearance('theme', $event)"
                  >
                    <v-btn
                      prepend-icon="mdi-weather-night"
                      value="dark"
                    >
                      深色
                    </v-btn>
                    <v-btn
                      prepend-icon="mdi-white-balance-sunny"
                      value="light"
                    >
                      浅色
                    </v-btn>
                  </v-btn-toggle>
                </SettingRow>

                <SettingRow
                  description="背景图只保存在当前设备；大屏节能模式会关闭实时模糊。"
                  title="自定义背景"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-switch
                    :model-value="appearance.backgroundEnabled"
                    color="primary"
                    hide-details
                    @update:model-value="saveAppearance('backgroundEnabled', $event)"
                  />
                </SettingRow>

                <div
                  v-if="appearance.backgroundEnabled"
                  class="settings-subsection"
                >
                  <v-text-field
                    v-model="appearance.backgroundUrl"
                    label="背景图片网址"
                    placeholder="https://example.com/background.jpg"
                    prepend-inner-icon="mdi-link"
                    variant="outlined"
                    @change="saveAppearance('backgroundUrl', appearance.backgroundUrl)"
                  />
                  <div class="setting-slider-label">
                    <span>暗色遮罩</span><strong>{{ appearance.backgroundOpacity }}%</strong>
                  </div>
                  <v-slider
                    :model-value="appearance.backgroundOpacity"
                    color="primary"
                    hide-details
                    :max="80"
                    :min="0"
                    :step="5"
                    @update:model-value="saveAppearance('backgroundOpacity', $event)"
                  />
                  <div class="setting-slider-label mt-5">
                    <span>背景模糊</span><strong>{{ appearance.backgroundBlur }}px</strong>
                  </div>
                  <v-slider
                    :disabled="context === 'screen' && screenSettings.performanceMode === 'efficient'"
                    :model-value="appearance.backgroundBlur"
                    color="primary"
                    hide-details
                    :max="30"
                    :min="0"
                    :step="2"
                    @update:model-value="saveAppearance('backgroundBlur', $event)"
                  />
                </div>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'classes'">
              <SettingsPanel
                description="学生自己选择行政班和实际参加的走班教学班。"
                icon="mdi-account-school-outline"
                title="我的班级"
              >
                <SettingRow
                  :description="selectionDescription"
                  title="当前选班"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-btn
                    color="primary"
                    prepend-icon="mdi-tune-variant"
                    variant="tonal"
                    @click="store.selectionDialog = true"
                  >
                    修改选班
                  </v-btn>
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'teacher'">
              <SettingsPanel
                description="教师身份和学校权限由服务器管理，不会存入公共大屏设置。"
                icon="mdi-account-tie-outline"
                title="教师账号"
              >
                <v-alert
                  v-if="!store.isTeacherSignedIn"
                  type="info"
                  variant="tonal"
                >
                  当前没有登录教师账号。返回作业板后进入教师工作台即可登录。
                </v-alert>
                <template v-else>
                  <SettingRow
                    :description="store.account?.username || store.account?.email || '学校本地账号'"
                    title="当前账号"
                  >
                    <template #scope>
                      <ScopeChip type="account" />
                    </template>
                    <v-chip
                      color="success"
                      variant="tonal"
                    >
                      {{ store.account?.name || "教师" }}
                    </v-chip>
                  </SettingRow>
                  <SettingRow
                    :description="`负责 ${store.teacherWorkspaces.length} 个行政班或走班教学空间`"
                    title="教学范围"
                  >
                    <template #scope>
                      <ScopeChip type="account" />
                    </template>
                    <v-btn
                      prepend-icon="mdi-arrow-left"
                      variant="tonal"
                      @click="goBack"
                    >
                      返回工作台
                    </v-btn>
                  </SettingRow>
                  <SettingRow
                    v-if="canOpenAdmin"
                    description="班级结构、账号、学科和大屏绑定属于全校配置。"
                    title="学校管理"
                  >
                    <template #scope>
                      <ScopeChip type="admin" />
                    </template>
                    <v-btn
                      color="primary"
                      prepend-icon="mdi-shield-account-outline"
                      to="/classworks-admin"
                      variant="tonal"
                    >
                      进入管理后台
                    </v-btn>
                  </SettingRow>
                </template>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'screen-display'">
              <SettingsPanel
                description="只调整当前教室大屏的作业可读性。正文会放大，学科和认证标签保持紧凑。"
                icon="mdi-monitor-eye"
                title="显示与布局"
              >
                <div class="setting-slider-label">
                  <span>作业正文字号</span><strong>{{ screenSettings.fontScale }}%</strong>
                </div>
                <v-slider
                  :model-value="screenSettings.fontScale"
                  color="primary"
                  hide-details
                  :max="200"
                  :min="90"
                  :step="10"
                  thumb-label
                  @update:model-value="saveScreenSetting('fontScale', $event)"
                />
                <div class="text-caption text-medium-emphasis mb-5">
                  大屏上仍可使用 Ctrl + 加号/减号快速调整。
                </div>

                <SettingRow
                  description="紧凑模式可以在一屏中展示更多作业。"
                  title="空间密度"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-btn-toggle
                    :model-value="screenSettings.density"
                    color="primary"
                    mandatory
                    variant="outlined"
                    @update:model-value="saveScreenSetting('density', $event)"
                  >
                    <v-btn value="compact">
                      紧凑
                    </v-btn>
                    <v-btn value="comfortable">
                      舒适
                    </v-btn>
                  </v-btn-toggle>
                </SettingRow>

                <SettingRow
                  description="自动模式会在 1080P、2K 和 4K 上分别限制合理的最大列数。"
                  title="卡片列数"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-btn-toggle
                    class="column-toggle"
                    :model-value="screenSettings.columns"
                    color="primary"
                    mandatory
                    variant="outlined"
                    @update:model-value="saveScreenSetting('columns', $event)"
                  >
                    <v-btn value="auto">
                      自动
                    </v-btn>
                    <v-btn
                      v-for="column in 5"
                      :key="column"
                      :value="String(column)"
                    >
                      {{ column }}
                    </v-btn>
                  </v-btn-toggle>
                </SettingRow>

                <SettingRow
                  description="隐藏发布来源和发布时间可以进一步压缩卡片。"
                  title="次要信息"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-switch
                    :model-value="screenSettings.showSecondaryMetadata"
                    color="primary"
                    hide-details
                    @update:model-value="saveScreenSetting('showSecondaryMetadata', $event)"
                  />
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'screen-notifications'">
              <SettingsPanel
                description="控制当前班级大屏收到紧急通知时的提示方式。"
                icon="mdi-bell-outline"
                title="通知与声音"
              >
                <SettingRow
                  description="首次播放声音时，浏览器可能要求进行一次用户交互。"
                  title="紧急通知提示音"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-switch
                    :model-value="screenSettings.urgentNoticeSound"
                    color="error"
                    hide-details
                    @update:model-value="saveScreenSetting('urgentNoticeSound', $event)"
                  />
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'screen-performance'">
              <SettingsPanel
                description="节能模式适合长期运行的一体机；标准模式允许更多背景效果。"
                icon="mdi-speedometer-slow"
                title="性能与屏幕保护"
              >
                <SettingRow
                  description="节能模式关闭实时背景模糊和非必要合成效果。"
                  title="性能模式"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-btn-toggle
                    :model-value="screenSettings.performanceMode"
                    color="primary"
                    mandatory
                    variant="outlined"
                    @update:model-value="saveScreenSetting('performanceMode', $event)"
                  >
                    <v-btn
                      prepend-icon="mdi-leaf"
                      value="efficient"
                    >
                      节能
                    </v-btn>
                    <v-btn
                      prepend-icon="mdi-auto-fix"
                      value="standard"
                    >
                      标准
                    </v-btn>
                  </v-btn-toggle>
                </SettingRow>
                <SettingRow
                  description="每 5 分钟移动 1～2 像素，降低固定画面长时间停留。"
                  title="防烧屏轻微位移"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-switch
                    :model-value="screenSettings.antiBurnInShift"
                    color="primary"
                    hide-details
                    @update:model-value="saveScreenSetting('antiBurnInShift', $event)"
                  />
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'classroom-tools'">
              <SettingsPanel
                description="决定课堂工具入口中显示哪些功能。关闭功能不会删除考勤或花名册数据。"
                icon="mdi-toolbox-outline"
                title="课堂工具"
              >
                <SettingRow
                  v-for="tool in classroomTools"
                  :key="tool.id"
                  :description="tool.description"
                  :title="tool.title"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-switch
                    :model-value="toolSettings.enabledToolIds.includes(tool.id)"
                    color="primary"
                    hide-details
                    @update:model-value="setToolEnabled(tool.id, $event)"
                  />
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else-if="activeSection === 'device'">
              <SettingsPanel
                description="查看当前设备状态并处理应用更新。"
                icon="mdi-devices"
                title="设备与维护"
              >
                <SettingRow
                  v-if="context === 'screen'"
                  :description="`${screenWorkspaceCount} 个相关教学空间`"
                  title="大屏绑定"
                >
                  <template #scope>
                    <ScopeChip type="screen" />
                  </template>
                  <v-chip
                    color="success"
                    prepend-icon="mdi-monitor-lock"
                    variant="tonal"
                  >
                    {{ screenClassName }}
                  </v-chip>
                </SettingRow>
                <SettingRow
                  :description="storageDescription"
                  title="本机存储使用"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-icon icon="mdi-database-outline" />
                </SettingRow>
                <SettingRow
                  description="重新加载页面并检查已部署的新版本。"
                  title="重新加载应用"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-btn
                    prepend-icon="mdi-refresh"
                    variant="tonal"
                    @click="reloadApp"
                  >
                    重新加载
                  </v-btn>
                </SettingRow>
                <SettingRow
                  description="只删除可重新下载的静态缓存，不会删除选班、登录或大屏绑定。"
                  title="清理资源缓存"
                >
                  <template #scope>
                    <ScopeChip type="device" />
                  </template>
                  <v-btn
                    color="warning"
                    prepend-icon="mdi-cached"
                    variant="tonal"
                    @click="clearResourceCaches"
                  >
                    清理缓存
                  </v-btn>
                </SettingRow>
              </SettingsPanel>
            </template>

            <template v-else>
              <SettingsPanel
                description="面向行政班、走班教学班和班级大屏的统一作业板。"
                icon="mdi-information-outline"
                title="关于 Classworks 2"
              >
                <v-alert
                  color="primary"
                  icon="mdi-source-fork"
                  variant="tonal"
                >
                  NPClassworks 基于 Classworks 改造，保留熟悉的作业板体验，并增加教师工作台、走班模型、认证版本和大屏绑定。
                </v-alert>
                <SettingRow
                  description="学校结构和账号配置由管理员后台统一维护。"
                  title="系统架构"
                >
                  <template #scope>
                    <ScopeChip type="admin" />
                  </template>
                  <v-chip variant="tonal">
                    Classworks 2
                  </v-chip>
                </SettingRow>
              </SettingsPanel>
            </template>
          </main>
        </div>
      </template>
    </v-container>

    <ClassSelectionDialog
      v-model="store.selectionDialog"
      @teacher="openTeacherWorkbench"
    />

    <v-snackbar
      v-model="snackbar"
      color="success"
    >
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup>
import {computed, onMounted, onUnmounted, reactive, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useClassworksV2Store} from "@/stores/classworksV2";
import ClassSelectionDialog from "@/components/v2/ClassSelectionDialog.vue";
import SettingsPanel from "@/components/v2/settings/SettingsPanel.vue";
import SettingRow from "@/components/v2/settings/SettingRow.vue";
import ScopeChip from "@/components/v2/settings/ScopeChip.vue";
import {getSetting, setSetting} from "@/utils/settings";
import {
  loadScreenDisplaySettings,
  saveScreenDisplaySettings,
  SCREEN_DISPLAY_DEFAULTS,
} from "@/utils/screenDisplaySettings";
import {
  CLASSROOM_TOOL_DEFAULTS,
  loadClassroomToolSettings,
  saveClassroomToolSettings,
} from "@/utils/classroomToolSettings";

const route = useRoute();
const router = useRouter();
const store = useClassworksV2Store();
const loading = ref(true);
const loadError = ref("");
const activeSection = ref(String(route.query.section || "appearance"));
const snackbar = ref(false);
const snackbarText = ref("");
const storageEstimate = ref(null);

const requestedContext = computed(() => ["student", "teacher", "screen"].includes(String(route.query.context))
  ? String(route.query.context)
  : "student");
const context = computed(() => store.screenSession ? "screen" : requestedContext.value);
const contextLabel = computed(() => ({student: "学生", teacher: "教师", screen: "班级大屏"}[context.value]));
const contextIcon = computed(() => ({
  student: "mdi-book-open-variant",
  teacher: "mdi-account-tie-outline",
  screen: "mdi-monitor-dashboard",
}[context.value]));

const appearance = reactive({
  theme: getSetting("theme.mode"),
  backgroundEnabled: getSetting("background.enabled"),
  backgroundUrl: getSetting("background.url"),
  backgroundBlur: getSetting("background.blur"),
  backgroundOpacity: getSetting("background.opacity"),
});
const screenSettings = ref({...SCREEN_DISPLAY_DEFAULTS});
const toolSettings = ref({...CLASSROOM_TOOL_DEFAULTS, enabledToolIds: [...CLASSROOM_TOOL_DEFAULTS.enabledToolIds]});
const bindingId = computed(() => store.screenSession?.binding?.id || "");

const classroomTools = [
  {id: "attendance", title: "考勤", description: "记录缺勤、迟到和不参与学生。"},
  {id: "noise", title: "噪声监测", description: "在本机分析教室环境噪声。"},
  {id: "random", title: "随机点名", description: "未来可能删除；关闭后不再显示入口。"},
  {id: "exam", title: "考试看板", description: "未来可能删除；关闭后不再显示入口。"},
];

const commonItems = [
  {id: "appearance", title: "外观", icon: "mdi-palette-outline"},
];
const navItems = computed(() => {
  if (context.value === "screen") return [
    ...commonItems,
    {id: "screen-display", title: "显示与布局", icon: "mdi-monitor-eye"},
    {id: "screen-notifications", title: "通知与声音", icon: "mdi-bell-outline"},
    {id: "screen-performance", title: "性能与屏保", icon: "mdi-speedometer-slow"},
    {id: "classroom-tools", title: "课堂工具", icon: "mdi-toolbox-outline"},
    {id: "device", title: "设备与维护", icon: "mdi-devices"},
    {id: "about", title: "关于", icon: "mdi-information-outline"},
  ];
  if (context.value === "teacher") return [
    ...commonItems,
    {id: "teacher", title: "教师账号", icon: "mdi-account-tie-outline"},
    {id: "device", title: "设备与维护", icon: "mdi-devices"},
    {id: "about", title: "关于", icon: "mdi-information-outline"},
  ];
  return [
    ...commonItems,
    {id: "classes", title: "我的班级", icon: "mdi-account-school-outline"},
    {id: "device", title: "设备与维护", icon: "mdi-devices"},
    {id: "about", title: "关于", icon: "mdi-information-outline"},
  ];
});

const selectionDescription = computed(() => store.selectedWorkspaceIds.length
  ? `${store.selectedClassName}，共选择 ${store.selectedWorkspaceIds.length} 个行政班或走班空间`
  : "尚未选择行政班和走班教学班");
const canOpenAdmin = computed(() => store.schoolMemberships.some((membership) =>
  ["OWNER", "ADMIN"].includes(membership.role),
));
const screenClassName = computed(() => store.screenSession?.binding?.administrativeClass?.name || "班级大屏");
const screenWorkspaceCount = computed(() => store.screenSession?.workspaces?.length || 0);
const storageDescription = computed(() => {
  if (!storageEstimate.value) return "浏览器未提供存储统计";
  const used = (storageEstimate.value.usage / 1024 / 1024).toFixed(1);
  const quota = (storageEstimate.value.quota / 1024 / 1024).toFixed(0);
  return `已使用约 ${used} MB，可用配额约 ${quota} MB`;
});

watch(navItems, (items) => {
  if (!items.some((item) => item.id === activeSection.value)) activeSection.value = items[0]?.id || "appearance";
}, {immediate: true});

watch(bindingId, (id) => {
  if (!id) return;
  screenSettings.value = loadScreenDisplaySettings(id);
  toolSettings.value = loadClassroomToolSettings(id);
}, {immediate: true});

watch(() => [context.value, screenSettings.value.performanceMode], () => {
  document.body.classList.toggle(
    "classworks-screen-efficient",
    context.value === "screen" && screenSettings.value.performanceMode === "efficient",
  );
}, {immediate: true});

onMounted(async () => {
  const results = await Promise.allSettled([
    store.bootstrapStudent(),
    store.bootstrapTeacher(),
    store.bootstrapClassroomScreen(),
  ]);
  if (results.every((result) => result.status === "rejected")) loadError.value = "无法连接 Classworks 服务器";
  if (navigator.storage?.estimate) storageEstimate.value = await navigator.storage.estimate();
  loading.value = false;
});

onUnmounted(() => document.body.classList.remove("classworks-screen-efficient"));

function notify(message) {
  snackbarText.value = message;
  snackbar.value = true;
}

function saveAppearance(field, value) {
  const mapping = {
    theme: "theme.mode",
    backgroundEnabled: "background.enabled",
    backgroundUrl: "background.url",
    backgroundBlur: "background.blur",
    backgroundOpacity: "background.opacity",
  };
  if (!setSetting(mapping[field], value)) return;
  appearance[field] = value;
  notify("已保存到当前设备");
}

function saveScreenSetting(field, value) {
  screenSettings.value = saveScreenDisplaySettings(bindingId.value, {
    ...screenSettings.value,
    [field]: value,
  });
  notify("当前大屏设置已保存");
}

function setToolEnabled(id, enabled) {
  const ids = new Set(toolSettings.value.enabledToolIds);
  if (enabled) ids.add(id);
  else ids.delete(id);
  toolSettings.value = saveClassroomToolSettings(bindingId.value, {enabledToolIds: [...ids]});
  notify("课堂工具设置已保存");
}

function goBack() {
  router.push({path: "/", query: context.value === "teacher" ? {mode: "teacher"} : {}});
}

function openTeacherWorkbench() {
  store.selectionDialog = false;
  router.push({path: "/", query: {mode: "teacher"}});
}

function reloadApp() {
  window.location.reload();
}

async function clearResourceCaches() {
  if (!window.confirm("确定清理可重新下载的资源缓存吗？选班、登录和大屏绑定不会被删除。")) return;
  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }
  notify("资源缓存已清理，下次访问会重新下载必要文件");
  if (navigator.storage?.estimate) storageEstimate.value = await navigator.storage.estimate();
}
</script>

<style>
.settings-v2-page { min-height: 100vh; }
.settings-v2-container { max-width: 1780px; padding: clamp(16px, 2vw, 36px); }
.settings-v2-layout { display: grid; gap: 24px; grid-template-columns: 250px minmax(0, 1fr); }
.settings-nav {
  align-self: start;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  position: sticky;
  top: 88px;
}
.settings-content { min-width: 0; }
.settings-mobile-nav { display: none; }
.settings-panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 20px;
  overflow: hidden;
}
.settings-panel__heading { align-items: center; display: flex; gap: 16px; padding: 24px 26px 20px; }
.settings-panel__heading h1 { font-size: clamp(1.4rem, 0.5vw + 1rem, 1.9rem); line-height: 1.2; }
.settings-panel__heading p { color: rgba(var(--v-theme-on-surface), 0.68); margin-top: 5px; }
.settings-panel__icon {
  align-items: center;
  background: rgba(var(--v-theme-primary), 0.12);
  border-radius: 15px;
  color: rgb(var(--v-theme-primary));
  display: flex;
  flex: 0 0 52px;
  font-size: 1.65rem;
  height: 52px;
  justify-content: center;
}
.settings-panel__body { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); padding: 0 26px; }
.setting-row { align-items: center; display: flex; gap: 24px; justify-content: space-between; min-height: 92px; padding: 18px 0; }
.setting-row + .setting-row { border-top: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7)); }
.setting-row__copy { min-width: 0; }
.setting-row__title { align-items: center; display: flex; flex-wrap: wrap; font-size: 1rem; font-weight: 700; gap: 8px; }
.setting-row__description { color: rgba(var(--v-theme-on-surface), 0.65); font-size: 0.875rem; margin-top: 5px; }
.setting-row__control { align-items: center; display: flex; flex: 0 0 auto; justify-content: flex-end; }
.scope-chip { align-items: center; border-radius: 999px; display: inline-flex; font-size: 0.68rem; font-weight: 500; gap: 4px; padding: 3px 8px; }
.scope-chip--grey { background: rgba(var(--v-theme-on-surface), 0.08); color: rgba(var(--v-theme-on-surface), 0.7); }
.scope-chip--primary { background: rgba(var(--v-theme-primary), 0.12); color: rgb(var(--v-theme-primary)); }
.scope-chip--success { background: rgba(var(--v-theme-success), 0.12); color: rgb(var(--v-theme-success)); }
.scope-chip--warning { background: rgba(var(--v-theme-warning), 0.14); color: rgb(var(--v-theme-warning)); }
.settings-subsection { background: rgba(var(--v-theme-on-surface), 0.035); border-radius: 14px; margin: 4px 0 22px; padding: 20px; }
.setting-slider-label { align-items: center; display: flex; justify-content: space-between; }
.column-toggle { flex-wrap: wrap; height: auto; }

@media (max-width: 900px) {
  .settings-v2-layout { display: block; }
  .settings-nav { display: none; }
  .settings-mobile-nav { display: block; }
  .setting-row { align-items: flex-start; flex-direction: column; gap: 14px; }
  .setting-row__control { justify-content: flex-start; width: 100%; }
  .settings-panel__heading,
  .settings-panel__body { padding-left: 18px; padding-right: 18px; }
}
</style>
