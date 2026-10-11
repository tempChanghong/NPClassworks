<template>
  <v-card class="npep-device-manager rounded-xl mt-4">
    <v-card-title class="npep-manager-header">
      <div>
        <div class="npep-eyebrow">
          学校互联
        </div>
        <h2>{{ sectionTitles[section] }}</h2>
        <p>{{ schoolName }} · NPEP 学校管理。</p>
      </div>
      <v-btn
        v-if="section === 'devices'"
        :loading="busy"
        prepend-icon="mdi-refresh"
        variant="tonal"
        @click="refresh"
      >
        刷新互联设备
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="success"
        variant="tonal"
        class="mb-3"
      >
        {{ message }}
      </v-alert>
      <v-alert
        v-if="stale"
        type="warning"
        variant="tonal"
        class="mb-3"
      >
        刷新未完成，以下为上次成功加载的记录，请勿视为实时状态。
      </v-alert>
      <section
        v-show="section === 'devices'"
        class="npep-overview"
        aria-labelledby="npep-devices-title"
      >
        <NpepDeviceOverview
          v-if="overview"
          v-model:search="search"
          :summary="overview.summary"
          :as-of="overview.asOf"
          :now="now"
          :stale="stale"
          :busy="busy"
          :filter="filter"
          :matched-total="overview.matchedTotal"
          :loaded-count="devices.length"
          @filter="applyOverview"
          @search="applyOverview()"
          @export="exportDiagnostics"
        />
        <v-alert
          v-if="overviewUnavailable"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          当前服务尚未提供学校运维概览；以下仅显示已加载的设备，不代表全校汇总。
        </v-alert>
        <div class="npep-section-heading mb-4">
          <div>
            <h3 id="npep-devices-title">
              已登记的互联设备
            </h3>
            <p>先核对设备归属与最近观测；远程操作是否执行，以设备回执为准。</p>
          </div>
          <v-chip
            v-if="loaded"
            variant="tonal"
            color="primary"
          >
            已加载 {{ devices.length }} 台{{ nextCursor ? ' · 还有更多' : '' }}
          </v-chip>
        </div>
        <p class="npep-observation-help mb-4">
          “在线”只表示查询时最近一分钟收到上报；观测过时请刷新。失联不代表软件已退出，自动录制已启用也不代表正在录制。
        </p>
        <div
          v-if="loaded && !devices.length && !stale && (!overview || overview.summary.total === 0)"
          class="npep-empty"
        >
          <v-icon
            icon="mdi-monitor-off"
            color="primary"
            size="38"
          />
          <strong>当前没有已登记的互联设备。</strong>
          <p>先开放对应班级大屏的网页配对，再由现场安装人员完成连接。</p>
          <v-btn
            color="primary"
            variant="tonal"
            @click="openScreenConfiguration"
          >
            前往班级大屏网页配对
          </v-btn>
        </div>
        <p
          v-else-if="loaded && !devices.length && !stale"
          class="npep-empty mb-4"
        >
          没有匹配当前筛选或搜索的设备。可选择“全部登记”并清空搜索后重试。
        </p>
        <v-card
          v-for="device in devices"
          :key="device.deviceId"
          variant="outlined"
          class="npep-device mb-3"
        >
          <v-card-text class="pa-5">
            <div class="npep-device-header">
              <div class="npep-device-heading">
                <v-icon
                  icon="mdi-desktop-tower-monitor"
                  color="primary"
                  size="28"
                />
                <div>
                  <h4>{{ device.deviceName }}</h4>
                  <p>{{ bindingName(device) }}</p>
                </div>
              </div>
              <div class="npep-device-badges">
                <v-chip size="small">
                  {{ npepStateName(effectiveState(device)) }}
                </v-chip>
                <v-chip
                  size="small"
                  :color="connectivity(device) === '在线' ? 'success' : undefined"
                >
                  {{ connectivity(device) }}
                </v-chip>
              </div>
            </div>
            <div class="npep-device-observation">
              <p v-if="device.issues?.length">
                待检查：{{ device.issues.map(overviewIssueName).join('；') }}。
              </p>
              <p>最近观测：{{ device.lastSeenAt ? time(device.lastSeenAt) : '尚未上报' }}</p>
              <p v-if="device.status">
                上次观测模式：{{ npepModeName(device.status.mode) }}；录制状态：{{ npepRecordingName(device.status.recording) }}；自动录制：{{ npepAutomaticName(device.status.automaticRecording) }}。
              </p>
              <p v-else>
                尚未收到运行状态上报。
              </p>
            </div>
            <div class="npep-device-actions">
              <v-btn
                :disabled="busy || stale || effectiveState(device) !== 'ACTIVE'"
                variant="tonal"
                @click="runtimeDevice = device"
              >
                考试模式
              </v-btn>
              <v-btn
                :disabled="busy || stale || effectiveState(device) !== 'ACTIVE'"
                variant="tonal"
                @click="planDevice = device"
              >
                考试方案
              </v-btn>
              <v-btn
                :disabled="busy || stale || effectiveState(device) !== 'ACTIVE'"
                variant="tonal"
                @click="noiseDevice = device"
              >
                噪音报告
              </v-btn>
              <v-btn
                variant="text"
                :aria-expanded="expandedDeviceId === device.deviceId"
                :aria-controls="`npep-device-detail-${device.deviceId}`"
                @click="expandedDeviceId = expandedDeviceId === device.deviceId ? null : device.deviceId"
              >
                {{ expandedDeviceId === device.deviceId ? '收起设备详情' : '查看设备详情' }}
              </v-btn>
            </div>
            <div
              v-if="expandedDeviceId === device.deviceId"
              :id="`npep-device-detail-${device.deviceId}`"
              class="npep-device-details"
            >
              <p>授权到期：{{ time(device.credentialExpiresAt) }}</p>
              <p v-if="device.status">
                NPEduTools {{ device.status.appVersion }} · ClassIsland：{{ bridge(device.status.classIsland) }} · ExamAware：{{ bridge(device.status.examAware) }}
              </p>
              <NpepStudyDeviceStatus
                v-if="effectiveState(device) === 'ACTIVE'"
                :key="`${schoolId}:${device.deviceId}`"
                :school-id="schoolId"
                :device-id="device.deviceId"
              />
              <NpepEquipmentSettings
                v-if="effectiveState(device)==='ACTIVE'"
                :key="`equipment:${schoolId}:${device.deviceId}`"
                :school-id="schoolId"
                :device-id="device.deviceId"
              />
              <v-btn
                v-if="device.state !== 'REVOKED'"
                :disabled="busy || stale"
                color="error"
                variant="text"
                @click="revoking = device"
              >
                撤销互联授权
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
        <v-btn
          v-if="nextCursor"
          :disabled="busy || stale"
          variant="tonal"
          @click="more"
        >
          加载更多互联设备
        </v-btn>
      </section>
      <section
        v-show="section === 'devices'"
        ref="configurationSection"
        class="npep-configuration mt-8"
        aria-labelledby="npep-configuration-title"
      >
        <div class="npep-section-heading mb-4">
          <div>
            <h3 id="npep-configuration-title">
              连接与配置
            </h3>
            <p>按实际任务展开设置。班级大屏网页配对和旧版桌面短码配对是两条不同流程。</p>
          </div>
        </div>
        <v-expansion-panels
          v-model="openConfiguration"
          multiple
          class="npep-configuration-panels"
        >
          <v-expansion-panel value="screen">
            <v-expansion-panel-title>
              <div><strong>班级大屏网页配对</strong><span>开放现有大屏，现场由网页生成一次性码</span></div>
            </v-expansion-panel-title>
            <v-expansion-panel-text eager>
              <NpepPairingAccess
                :school-id="schoolId"
                :term-id="termId"
                :bindings="bindings"
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel value="legacy">
            <v-expansion-panel-title>
              <div><strong>旧版桌面短码配对</strong><span>仅用于从 NPEduTools 桌面端发起的配对申请</span></div>
            </v-expansion-panel-title>
            <v-expansion-panel-text eager>
              <div
                class="npep-legacy"
              >
                <v-row>
                  <v-col
                    cols="12"
                    lg="12"
                  >
                    <h3 class="text-subtitle-1 mb-3">
                      关联本地设备
                    </h3>
                    <p class="mb-3">
                      先在大屏的 NPEduTools 中发起配对，将显示的短码输入这里。
                    </p>
                    <v-text-field
                      v-model="code"
                      label="8 位配对短码"
                      maxlength="9"
                      :disabled="busy || !!approved"
                      autocomplete="off"
                      variant="outlined"
                    />
                    <v-btn
                      :disabled="busy || !!approved || !loaded"
                      @click="resolve"
                    >
                      核对配对申请
                    </v-btn>
                    <div
                      v-if="candidate"
                      class="npep-candidate mt-4"
                    >
                      <p>申请设备：{{ candidate.deviceName }}</p>
                      <p>软件版本：{{ candidate.appVersion }}</p>
                      <p>申请到期：{{ time(candidate.expiresAt) }}</p>
                      <v-alert
                        v-if="expired"
                        type="warning"
                        variant="tonal"
                        class="my-2"
                      >
                        申请已过期，请在设备上重新发起配对。
                      </v-alert>
                      <template v-if="!approved">
                        <v-select
                          v-model="bindingId"
                          :items="bindingOptions"
                          label="关联的大屏与班级"
                          :disabled="busy || !!expired"
                          variant="outlined"
                          class="mt-3"
                        />
                        <p v-if="!bindingOptions.length">
                          没有可用大屏，请先为当前学期的有效班级创建并启用大屏账号。
                        </p>
                        <v-text-field
                          v-model="managementSecret"
                          type="password"
                          label="班级管理口令（未配置时必填，留空保留已有口令）"
                          maxlength="128"
                          autocomplete="new-password"
                          variant="outlined"
                          :disabled="busy || !!expired"
                        />
                        <v-checkbox
                          v-model="confirmed"
                          :disabled="busy || !!expired"
                          label="已核对设备、学校和班级，同意配对并授权学校互联功能"
                          hide-details
                        />
                        <v-btn
                          color="primary"
                          :disabled="busy || !confirmed || !bindingId || !!expired"
                          class="mt-2"
                          @click="approve"
                        >
                          批准并等待现场确认
                        </v-btn>
                      </template>
                      <template v-else>
                        <p class="mt-3">
                          {{ approved.schoolName }} · {{ approved.administrativeClassName }} · {{ approved.screenBindingName }}
                        </p>
                        <v-btn
                          :disabled="busy || !!expired"
                          variant="text"
                          class="mt-2"
                          @click="cancel"
                        >
                          取消此次配对
                        </v-btn>
                        <v-btn
                          :disabled="busy"
                          variant="text"
                          class="mt-2"
                          @click="newPairing"
                        >
                          核对另一台设备
                        </v-btn>
                      </template>
                    </div>
                  </v-col>
                </v-row>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </section>
      <section
        v-if="noiseVisited"
        v-show="section === 'noise'"
        class="npep-noise"
        aria-label="学校原生噪音监测"
      >
        <div class="npep-noise-reports mt-4">
          <h3>设备执行状态与报告</h3>
          <p class="npep-observation-help mt-2 mb-4">
            排程与阈值在“自习设置”中统一配置；此处核对设备执行状态、已上传的统计与照片。保存、设备已应用与实际采集是不同状态，请以新鲜的执行状态为准。
          </p>
          <v-select
            v-model="reportDeviceId"
            :items="reportDevices"
            label="报告设备（当前已加载列表）"
            variant="outlined"
            :disabled="busy || stale || !reportDevices.length"
            hide-details
          />
          <div class="npep-device-actions mt-3">
            <v-btn
              color="primary"
              variant="tonal"
              :disabled="busy || stale || !selectedReportDevice"
              @click="noiseDevice = selectedReportDevice"
            >
              查看噪音报告
            </v-btn>
            <v-btn
              v-if="nextCursor"
              :disabled="busy || stale"
              variant="text"
              @click="more"
            >
              加载更多互联设备
            </v-btn>
            <v-btn
              variant="text"
              @click="emit('navigate', 'devices')"
            >
              前往设备互联检索与配对
            </v-btn>
          </div>
          <p class="npep-observation-help mt-3">
            仅列出当前已加载且授权有效的设备；列表沿用设备互联的筛选条件，不代表全校设备。没有找到设备时，可前往设备互联检索或加载更多。
          </p>
        </div>
      </section>
      <section
        v-if="studyVisited"
        v-show="section === 'study'"
      >
        <NpepStudySettings
          :school-id="schoolId"
          :school-name="schoolName"
          :term-id="termId"
          @dirty="studyDirty = $event"
        />
        <v-expansion-panels
          v-model="legacySchedulePanels"
          class="mt-4"
        >
          <v-expansion-panel value="legacy">
            <v-expansion-panel-title>旧版噪音排程兼容</v-expansion-panel-title>
            <v-expansion-panel-text eager>
              <p class="npep-observation-help">
                仅用于尚未配置学校自习策略的班级。已配置自习策略（包括关闭策略）的班级，旧排程不再执行；编辑旧排程不会覆盖自习设置。
              </p>
              <NpepNoiseSchedules
                v-if="legacyScheduleVisited"
                :school-id="schoolId"
                :school-name="schoolName"
                :term-id="termId"
                @dirty="noiseDirty = $event"
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </section>
      <NpepSeatingSettings
        v-if="seatingVisited"
        v-show="section === 'seating'"
        :school-id="schoolId"
        :term-id="termId"
        @dirty="seatingDirty = $event"
      />
      <NpepStudyReports
        v-if="section === 'noise'"
        :school-id="schoolId"
        :term-id="termId"
      />
      <NpepStudyPhotos
        v-if="section === 'noise'"
        :school-id="schoolId"
        :term-id="termId"
      />
    </v-card-text>
    <v-dialog
      :model-value="!!noiseDevice"
      max-width="850"
      @update:model-value="value => { if (!value) noiseDevice = null; }"
    >
      <NpepNoiseReports
        v-if="noiseDevice"
        :key="`${schoolId}:${noiseDevice.deviceId}`"
        :school-id="schoolId"
        :device-id="noiseDevice.deviceId"
        :device-name="noiseDevice.deviceName"
        @close="noiseDevice = null"
      />
    </v-dialog>
    <v-dialog
      :model-value="!!revoking"
      max-width="520"
      :persistent="busy"
      @update:model-value="value => { if (!value && !busy) revoking = null; }"
    >
      <v-card
        v-if="revoking"
        title="撤销互联设备授权"
      >
        <v-card-text>
          <p>{{ schoolName }} · {{ revoking.deviceName }} · {{ bindingName(revoking) }}</p>
          <p class="mt-3">
            撤销后，这台 NPEduTools 不能继续上报状态，重新使用需要再次配对。网页大屏账号和 PIN 不受影响。
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :disabled="busy"
            @click="revoking = null"
          >
            保留授权
          </v-btn>
          <v-btn
            color="error"
            :loading="busy"
            @click="confirmRevoke"
          >
            确认撤销互联授权
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog
      :model-value="!!runtimeDevice"
      max-width="760"
      @update:model-value="value => { if (!value) runtimeDevice = null; }"
    >
      <NpepRuntimeControl
        v-if="runtimeDevice"
        :key="`${schoolId}:${runtimeDevice.deviceId}`"
        :school-id="schoolId"
        :device-id="runtimeDevice.deviceId"
        :school-name="schoolName"
        :device-name="runtimeDevice.deviceName"
        :binding-name="bindingName(runtimeDevice)"
        @close="runtimeDevice = null"
      />
    </v-dialog>
    <v-dialog
      :model-value="!!planDevice"
      max-width="900"
      @update:model-value="value => { if (!value) planDevice = null; }"
    >
      <NpepExamPlanControl
        v-if="planDevice"
        :key="`${schoolId}:${planDevice.deviceId}`"
        :school-id="schoolId"
        :device-id="planDevice.deviceId"
        :school-name="schoolName"
        :device-name="planDevice.deviceName"
        :binding-name="bindingName(planDevice)"
        @close="planDevice = null"
      />
    </v-dialog>
  </v-card>
</template>

<script setup>
import {computed, defineAsyncComponent, nextTick, onUnmounted, ref, toRef, watch} from "vue";
import NpepRuntimeControl from './NpepRuntimeControl.vue';
import NpepExamPlanControl from './NpepExamPlanControl.vue';
import NpepNoiseReports from './NpepNoiseReports.vue';
import NpepNoiseSchedules from './NpepNoiseSchedules.vue';
import NpepPairingAccess from './NpepPairingAccess.vue';
import NpepDeviceOverview from './NpepDeviceOverview.vue';
import NpepStudyDeviceStatus from './NpepStudyDeviceStatus.vue';
import {overviewIssueName} from '@/utils/npepDeviceOverview';
import {createNpepOverviewDiagnostics} from '@/utils/npepDiagnostics';
import {downloadDiagnosticBundle} from '@/utils/localDiagnostics';
import {getServerUrl} from '@/utils/socketClient';
import packageInfo from '../../../package.json';
import {useNpepManager} from "@/composables/admin/useNpepManager";
import {npepConnectivity, npepStateName, npepModeName, npepRecordingName, npepAutomaticName} from "@/utils/npepPresentation";

const props = defineProps({schoolId: {type: String, required: true}, schoolName: {type: String, default: "当前学校"}, termId: {type: String, default: ''}, section: {type: String, default: 'devices'}});
const emit = defineEmits(['dirty', 'navigate']);
const NpepStudySettings = defineAsyncComponent(() => import('./NpepStudySettings.vue'));
const NpepEquipmentSettings=defineAsyncComponent(()=>import('./NpepEquipmentSettings.vue'));
const NpepStudyReports = defineAsyncComponent(() => import('./NpepStudyReports.vue'));
const NpepStudyPhotos = defineAsyncComponent(() => import('./NpepStudyPhotos.vue'));
const section = toRef(props, 'section');
const sectionTitles = {devices: '大屏互联', study: '自习设置', noise: '噪音监测', seating: '自习座位表'};
const NpepSeatingSettings = defineAsyncComponent(() => import('./NpepSeatingSettings.vue'));
const noiseVisited = ref(false);
const studyVisited = ref(false);
const legacySchedulePanels = ref(null);
const legacyScheduleVisited = ref(false);
watch(legacySchedulePanels, value => { if (value === 'legacy') legacyScheduleVisited.value = true; });
const seatingVisited = ref(false);
const noiseDirty = ref(false), studyDirty = ref(false), seatingDirty = ref(false);
const reportDeviceId = ref(null);
watch(section, value => {
  if (value === 'noise') noiseVisited.value = true;
  if (value === 'study') studyVisited.value = true;
  if (value === 'seating') seatingVisited.value = true;
}, {immediate: true});
watch([noiseDirty, studyDirty, seatingDirty], ([noise, study, seating]) => emit('dirty', noise || study || seating), {immediate: true, flush: 'sync'});
onUnmounted(() => emit('dirty', false));
const manager = useNpepManager(toRef(props, "schoolId"));
const {devices, bindings, candidate, approved, code, bindingId, managementSecret,busy, error, message, loaded, stale, nextCursor, now,
  overview, overviewUnavailable, filter, search, applyOverview,
  expired, bindingOptions, refresh, more, resolve, approve, cancel, revoke} = manager;
const confirmed = ref(false), revoking = ref(null);
const openConfiguration = ref([]);
const expandedDeviceId = ref(null);
const configurationSection = ref(null);
const runtimeDevice = ref(null);
const planDevice = ref(null);
const noiseDevice = ref(null);
watch(() => props.schoolId, () => { runtimeDevice.value = null; planDevice.value = null; noiseDevice.value = null; openConfiguration.value = []; expandedDeviceId.value = null; });
watch([candidate, bindingId, () => props.schoolId], () => { confirmed.value = false; revoking.value = null; });
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN") : "未知";
const effectiveState = device => device.state === "ACTIVE" && Date.parse(device.credentialExpiresAt) <= now.value ? "EXPIRED" : device.state;
const connectivity = device => stale.value ? "待刷新核对" : npepConnectivity({...device, state: effectiveState(device)}, now.value);
const selectedReportDevice = computed(() => devices.value.find(device => device.deviceId === reportDeviceId.value && effectiveState(device) === 'ACTIVE'));
const reportDevices = computed(() => devices.value.filter(device => effectiveState(device) === 'ACTIVE').map(device => ({
  title: `${device.deviceName} · ${bindingName(device)} · ${connectivity(device)}`, value: device.deviceId,
})));
const bindingName = device => {
  if (device.screenBindingName) return `${device.screenBindingName} · ${device.bindingChanged ? '原班级绑定已变化或不可用' : device.administrativeClassName || '班级资料暂缺'}`;
  const screen = bindings.value.find(b => b.id === device.screenBindingId);
  if (screen && device.administrativeClassId && screen.administrativeClassId !== device.administrativeClassId) return `${screen.name} · 原班级绑定已变化`;
  return screen ? `${screen.name} · ${screen.administrativeClass?.name || '班级资料暂缺'}` : "原大屏资料不可用";
};
const bridge = value => ({READY: "已连接", DISCONNECTED: "未连接", UNKNOWN: "未知"}[value?.connection] || "未知");
function exportDiagnostics() {
  if (busy.value || !overview.value) return;
  try {
    const bundle = createNpepOverviewDiagnostics({overview: overview.value, devices: devices.value,
      schoolId: props.schoolId, filter: filter.value, stale: stale.value, now: now.value,
      backendUrl: getServerUrl(), appVersion: packageInfo.version, hasMore: Boolean(nextCursor.value)});
    downloadDiagnosticBundle(bundle, `NPClassworks-NPEP-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    message.value = '已生成本地诊断摘要；包含服务地址和归属编号，分享前请核对文件。';
  } catch {
    error.value = '无法导出当前诊断摘要，请刷新概览或检查浏览器下载权限后重试。';
  }
}
async function openScreenConfiguration() {
  openConfiguration.value = [...new Set([...openConfiguration.value, 'screen'])];
  await nextTick();
  configurationSection.value?.scrollIntoView({block: 'start'});
}
function newPairing() { candidate.value = null; approved.value = null; bindingId.value = ""; code.value = ""; message.value = ""; }
async function confirmRevoke() {
  const device = revoking.value;
  if (!device || busy.value) return;
  await revoke(device);
  revoking.value = null;
}
</script>

<style scoped>
.npep-device-manager { overflow-wrap: anywhere; scroll-margin-top: 88px; }
.npep-device-manager p { line-height: 1.7; }
.npep-manager-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 28px 12px;
  white-space: normal;
}
.npep-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.npep-section-tabs { margin: 0 28px 8px; border-bottom: 1px solid rgba(var(--v-border-color), .16); }
.npep-noise-reports { padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.npep-noise-reports h3 { font-size: 20px; font-weight: 750; }
.npep-manager-header h2 { margin-top: 4px; font-size: clamp(24px, 2vw, 30px); font-weight: 750; }
.npep-manager-header p { margin-top: 6px; color: rgba(var(--v-theme-on-surface), .7); font-size: 14px; }
.npep-device-manager > :deep(.v-card-text) { padding: 12px 28px 28px; }
.npep-section-heading { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.npep-section-heading h3 { font-size: 21px; font-weight: 750; }
.npep-section-heading p { margin-top: 4px; color: rgba(var(--v-theme-on-surface), .68); font-size: 14px; }
.npep-observation-help { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.npep-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 26px; border: 1px dashed rgba(var(--v-border-color), .28); border-radius: 16px; }
.npep-empty strong { font-size: 18px; }
.npep-empty p { margin: 0; color: rgba(var(--v-theme-on-surface), .7); }
.npep-device { border-color: rgba(var(--v-border-color), .2) !important; }
.npep-device-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.npep-device-heading { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.npep-device-heading h4 { font-size: 19px; font-weight: 750; line-height: 1.3; }
.npep-device-heading p { margin-top: 3px; color: rgba(var(--v-theme-on-surface), .68); font-size: 14px; }
.npep-device-badges, .npep-device-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.npep-device-observation { margin: 16px 0; padding: 13px 16px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); font-size: 14px; }
.npep-device-observation p + p { margin-top: 4px; }
.npep-device-details { margin-top: 16px; padding: 16px; border-top: 1px solid rgba(var(--v-border-color), .2); }
.npep-device-details p + p { margin-top: 5px; }
.npep-device-details :deep(.v-btn) { margin-top: 8px; }
.npep-configuration-panels :deep(.v-expansion-panel) { border: 1px solid rgba(var(--v-border-color), .16); border-radius: 14px !important; }
.npep-configuration-panels :deep(.v-expansion-panel-title) { min-height: 70px; }
.npep-configuration-panels :deep(.v-expansion-panel-title > div) { display: grid; gap: 3px; }
.npep-configuration-panels :deep(.v-expansion-panel-title strong) { font-size: 16px; }
.npep-configuration-panels :deep(.v-expansion-panel-title span) { color: rgba(var(--v-theme-on-surface), .65); font-size: 13px; }
.npep-legacy { max-width: 740px; }
@media (max-width: 600px) {
  .npep-device-manager { scroll-margin-top: 150px; }
  .npep-manager-header { padding: 20px 18px 10px; }
  .npep-section-tabs { margin-inline: 18px; }
  .npep-noise-reports { padding: 16px; }
  .npep-device-manager > :deep(.v-card-text) { padding: 10px 18px 20px; }
  .npep-device-actions :deep(.v-btn) { margin: 0; }
}
</style>
