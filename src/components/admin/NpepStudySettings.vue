<template>
  <section class="study-settings">
    <div class="study-heading">
      <h2>学校自习设置</h2>
      <p>统一安排原生全屏展示、当天作业与监测策略。班级可继承年级设置。</p>
    </div>
    <v-alert
      type="info"
      variant="tonal"
    >
      此处统一配置自习时段、展示、作业、噪音与拍照策略，由支持学校自习协议的桌面读取。保存不代表设备已应用、展示页已显示或正在采集；执行状态、报告与照片在本页“报告与照片”中查看。旧版排程已通过部署迁移导入，所有安排在此统一维护。
    </v-alert>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
    >
      {{ error }}
    </v-alert>
    <v-alert
      v-if="message"
      type="success"
      variant="tonal"
    >
      {{ message }}
    </v-alert>

    <section
      class="study-section"
      aria-label="自习配置范围"
    >
      <h3>1. 选择适用范围</h3>
      <p>{{ schoolName }} · {{ currentTermName }}。学校、学期在左侧切换。</p>
      <v-row class="mt-2">
        <v-col
          cols="12"
          md="4"
        >
          <v-select
            v-model="guardedType"
            :items="targetTypes"
            label="自习配置范围"
            open-text="自习配置范围"
            close-text="收起自习配置范围"
            variant="outlined"
            :disabled="busy || !loaded"
          />
        </v-col>
        <v-col
          cols="12"
          md="8"
        >
          <v-select
            v-model="guardedTarget"
            :items="targets"
            item-title="name"
            item-value="id"
            label="自习配置对象"
            open-text="自习配置对象"
            close-text="收起自习配置对象"
            variant="outlined"
            :disabled="busy || !loaded"
          />
        </v-col>
      </v-row>
      <v-select
        v-if="targetId && loaded"
        :model-value="draft.mode"
        :items="modes"
        label="自习启用规则"
        open-text="自习启用规则"
        close-text="收起自习启用规则"
        variant="outlined"
        :disabled="busy"
        @update:model-value="changeMode"
      />
      <p v-if="draft.mode === 'Inherit'">
        继承本年级的展示、作业和拍照策略；年级未配置时不会自动启用。
      </p>
      <p v-if="draft.mode === 'Disabled'">
        关闭本范围的自习展示与拍照策略，同时禁止旧客户端执行旧噪音排程。现场手动会话需另行停止。
      </p>
      <v-btn
        v-if="!loaded || !targetId"
        :loading="busy"
        variant="tonal"
        @click="refresh"
      >
        加载自习配置
      </v-btn>
    </section>

    <template v-if="draft.mode === 'Override' && settings">
      <section
        class="study-section"
        aria-label="自习时间与学校日历"
      >
        <h3>2. 时间与学校日历</h3>
        <v-btn-toggle
          v-model="scheduleMode"
          mandatory
          class="study-mode-switch my-3"
          :disabled="busy"
        >
          <v-btn value="Daily">
            日常模式 · ClassIsland 时间
          </v-btn>
          <v-btn value="Exam">
            考试模式 · Windows 时间
          </v-btn>
        </v-btn-toggle>
        <p>两种模式分别配置。此模式没有时段就不会定时监测；旧配置只用于日常模式。考试放映优先，自习继续后台采集、按策略拍照，暂停提示音且不补播。</p>
        <v-alert
          v-if="!activeSchedule.rules.length"
          type="info"
          variant="tonal"
          class="my-3"
        >
          当前模式不安排定时自习。
        </v-alert>
        <p>北京时间 19:15–21:30 为新建默认时段，星期和日期需明确填写。展示提前五分钟打开并显示已发布的自习座位表；开始前两分钟显示十秒准备提示，准备阶段不采集。</p>
        <v-row class="mt-2">
          <v-col
            cols="12"
            md="6"
          >
            <v-text-field
              v-model="startDate"
              type="date"
              label="自习生效日期"
              variant="outlined"
              :disabled="busy"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <v-text-field
              v-model="endDate"
              type="date"
              label="自习截止日期（可留空）"
              variant="outlined"
              :disabled="busy"
            />
          </v-col>
        </v-row>
        <div
          v-for="(rule, index) in activeSchedule.rules"
          :key="index"
          class="study-rule"
        >
          <div class="study-section-title">
            <h4>时段 {{ index + 1 }}</h4>
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              :aria-label="`删除自习时段 ${index + 1}`"
              :disabled="busy"
              @click="activeSchedule.rules.splice(index, 1)"
            />
          </div>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="rule.days"
                :items="days"
                multiple
                chips
                :label="`自习时段 ${index + 1} · 星期`"
                :open-text="`自习时段 ${index + 1} · 星期`"
                :close-text="`收起自习时段 ${index + 1} · 星期`"
                variant="outlined"
                :disabled="busy"
                hide-details
              />
            </v-col>
            <v-col
              cols="12"
              sm="6"
              md="3"
            >
              <v-text-field
                v-model="rule.start"
                type="time"
                :label="`自习开始 ${index + 1}`"
                variant="outlined"
                :disabled="busy"
                hide-details
              />
            </v-col>
            <v-col
              cols="12"
              sm="6"
              md="3"
            >
              <v-text-field
                v-model="rule.end"
                type="time"
                :label="`自习结束 ${index + 1}`"
                variant="outlined"
                :disabled="busy"
                hide-details
              />
            </v-col>
          </v-row>
        </div>
        <v-btn
          class="mt-3"
          variant="tonal"
          :disabled="busy || activeSchedule.rules.length >= 32"
          @click="addRule"
        >
          添加自习时段
        </v-btn>
        <p class="mt-3">
          星期与生效日期按时段开始日计算；结束早于开始表示跨午夜。相邻或重叠时段合并后最多三小时。
        </p>
        <h4 class="mt-5">
          节假日、补课日例外
        </h4>
        <p>未接入自动节假日日历。例外由管理员填写；补课日需指定采用星期几的时段。</p>
        <v-row
          v-for="(entry, index) in activeSchedule.exceptions"
          :key="index"
          class="mt-2"
        >
          <v-col
            cols="12"
            md="4"
          >
            <v-text-field
              v-model="entry.date"
              type="date"
              :label="`例外日期 ${index + 1}`"
              variant="outlined"
              :disabled="busy"
              hide-details
            />
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="entry.kind"
              :items="calendarKinds"
              :label="`例外安排 ${index + 1}`"
              :open-text="`例外安排 ${index + 1}`"
              :close-text="`收起例外安排 ${index + 1}`"
              variant="outlined"
              :disabled="busy"
              hide-details
              @update:model-value="entry.weekday = null"
            />
          </v-col>
          <v-col
            cols="10"
            md="4"
          >
            <v-select
              v-model="entry.weekday"
              :items="days"
              :label="`补课采用星期 ${index + 1}`"
              :open-text="`补课采用星期 ${index + 1}`"
              :close-text="`收起补课采用星期 ${index + 1}`"
              variant="outlined"
              :disabled="busy || entry.kind === 'Skip'"
              hide-details
            />
          </v-col>
          <v-col
            cols="2"
            md="1"
          >
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              :aria-label="`删除日历例外 ${index + 1}`"
              :disabled="busy"
              @click="activeSchedule.exceptions.splice(index, 1)"
            />
          </v-col>
        </v-row>
        <v-btn
          class="mt-3"
          variant="text"
          :disabled="busy || activeSchedule.exceptions.length >= 366"
          @click="addException"
        >
          添加日历例外
        </v-btn>
      </section>

      <section
        class="study-section"
        aria-label="自习展示与当天作业"
      >
        <h3>3. 展示与当天作业</h3>
        <p>大时钟与阶段提示采用桌面展示；作业位于页面下方。噪音展示由学校选择。</p>
        <v-row class="mt-2">
          <v-col
            cols="12"
            md="7"
          >
            <v-select
              v-model="settings.presentation.noiseDisplay"
              :items="noiseDisplays"
              label="学生页噪音展示"
              open-text="学生页噪音展示"
              close-text="收起学生页噪音展示"
              variant="outlined"
              :disabled="busy"
            />
          </v-col>
          <v-col
            cols="12"
            md="5"
          >
            <v-text-field
              model-value="连续无操作 10 分钟"
              label="临时使用电脑后自动返回"
              variant="outlined"
              readonly
            />
          </v-col>
        </v-row>
        <p>原生全屏页日常使用 ClassIsland 学校时间、考试使用 Windows 北京时间，下方展示作业。提前五分钟自动展示已发布的自习座位表，开始后两分钟收起；座位表不参与作业轮换。准备提示十秒，开始和结束各五秒。长按两秒临时收起，连续无操作十分钟后返回，操作其他软件也会重新计时；采集与照片策略继续。考试放映器优先，期间自习提示音暂停，过期不补播。手动自习的提前展示与无操作返回设置在本机配置，学校定时保护不套用于手动自习。</p>
        <v-switch
          v-model="settings.homework.enabled"
          label="展示当天作业"
          color="primary"
          :disabled="busy"
          hide-details
          class="my-3"
        />
        <template v-if="settings.homework.enabled">
          <v-select
            v-model="settings.homework.sourceMode"
            :items="homeworkModes"
            label="作业来源方式"
            open-text="作业来源方式"
            close-text="收起作业来源方式"
            variant="outlined"
            :disabled="busy"
            @update:model-value="settings.homework.sourceClassIds = []"
          />
          <v-select
            v-if="settings.homework.sourceMode === 'SelectedClasses'"
            v-model="settings.homework.sourceClassIds"
            :items="catalog.classes"
            item-title="name"
            item-value="id"
            multiple
            chips
            label="展示作业的来源行政班"
            open-text="展示作业的来源行政班"
            close-text="收起展示作业的来源行政班"
            variant="outlined"
            :disabled="busy"
          />
          <v-text-field
            v-model.number="settings.homework.rotationSeconds"
            type="number"
            min="15"
            max="600"
            step="1"
            label="作业每页轮换间隔"
            suffix="秒"
            variant="outlined"
            :disabled="busy"
          />
          <p>默认每页 60 秒。自动纳入所选行政班涉及的全部相关走班，不需要逐个挑选；保留来源标签，同一作业去重，无作业科目隐藏。长作业按内容量分页，新内容在当前页读完后展示。</p>
        </template>
      </section>

      <section
        class="study-section"
        aria-label="噪音与阈值拍照"
      >
        <h3>4. 噪音与阈值拍照</h3>
        <v-switch
          v-model="settings.noise.enabled"
          label="定时自习进行原生噪音监测"
          color="primary"
          :disabled="busy"
          hide-details
          class="my-3"
        />
        <p>阈值、持续超限时长与提醒间隔可在下方高级设置调整。使用估算单位前，需在各大屏完成本机参考校准。</p>
        <v-switch
          v-model="settings.photos.enabled"
          label="启用阈值拍照"
          color="primary"
          :disabled="busy"
          hide-details
          class="my-3"
        />
        <template v-if="settings.photos.enabled">
          <v-row class="mt-2">
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.number="settings.photos.retentionDays"
                type="number"
                min="1"
                max="180"
                step="1"
                label="照片保留时间"
                suffix="天"
                variant="outlined"
                :disabled="busy"
              />
            </v-col>
          </v-row>
          <p>连续超限时长使用高级设置中的“高线连续超限时间”，新建默认 3 秒；噪音触发与退出后台请求共用默认 30 秒限频。只在有效定时监测阶段工作，准备阶段和手动监测不触发；临时收起展示不会停止它。</p>
          <div class="study-device-note mt-3">
            <strong>摄像头：需现场明确选择</strong>
            <p>摄像头在 NPEduTools 初始设置或自习监测页选择并保存；未选择或不可用时不改用其他设备。每次单张取图后释放摄像头，不连续录制。照片上传失败时进入有上限的加密本机队列。</p>
          </div>
          <v-alert
            type="warning"
            variant="tonal"
            class="mt-4"
          >
            照片仅供同校 OWNER 和 ADMIN 查看、下载和删除。默认保留 30 天、最长 180 天，按实际拍摄时间计算；缩短保留期也作用于已有在线照片，延长不延长旧照片期限。备份保留边界尚未确认，到期删除不能视为所有备份副本都已消失。
          </v-alert>
          <v-checkbox
            v-if="settings.photos.retentionDays > 30"
            v-model="settings.photos.extendedRetentionAcknowledged"
            label="已了解延长照片保留时间的隐私与备份风险"
            :disabled="busy"
            hide-details
          />
        </template>
        <v-expansion-panels
          v-model="advancedPanel"
          class="study-advanced mt-4"
          variant="accordion"
          :disabled="busy"
        >
          <v-expansion-panel value="monitoring">
            <v-expansion-panel-title aria-label="高级设置">
              <div>
                <strong>高级设置</strong>
                <p class="mb-0">
                  阈值、持续超限时长、提醒与拍照间隔
                </p>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text eager>
              <h4 class="mb-3">
                噪音阈值与纪律提醒
              </h4>
              <v-select
                v-model="noiseUnit"
                :items="noiseUnits"
                label="双阈值使用的单位"
                variant="outlined"
                :disabled="busy || !settings.noise.enabled"
              />
              <p>切换单位不换算原有数值。估算 dB(A) 需要每台大屏先确认本机外部参考；缺少参考、输入设置变化、预热或无效采样时，该单位的效果和纪律提醒暂停，原始 dBFS 采集继续。</p>
              <v-text-field
                v-model="redLine"
                type="number"
                :min="noiseUnit === 'Estimated' ? 30 : -90"
                :max="noiseUnit === 'Estimated' ? 130 : 0"
                step="1"
                label="第一阈值线 · 高电平"
                :suffix="noiseUnit === 'Estimated' ? '估算 dB(A)' : 'dBFS'"
                variant="outlined"
                :disabled="busy || !settings.noise.enabled"
              />
              <v-text-field
                v-model="mediumLine"
                type="number"
                :min="noiseUnit === 'Estimated' ? 30 : -90"
                :max="noiseUnit === 'Estimated' ? 130 : 0"
                step="1"
                label="第二阈值线 · 中电平"
                :suffix="noiseUnit === 'Estimated' ? '估算 dB(A)' : 'dBFS'"
                variant="outlined"
                :disabled="busy || !settings.noise.enabled"
              />
              <v-text-field
                v-model.number="settings.noise.disciplineCooldownSeconds"
                type="number"
                min="1"
                max="86400"
                step="1"
                label="注意纪律最短间隔"
                suffix="秒"
                variant="outlined"
                :disabled="busy || !settings.noise.enabled"
              />
              <v-text-field
                v-model="highDuration"
                type="number"
                min="1"
                max="10"
                step="1"
                label="高线连续超限时间"
                suffix="秒"
                variant="outlined"
                :disabled="busy || !settings.noise.enabled"
              />
              <p>新建默认高线持续 3 秒，纪律提醒与照片使用同一持续条件；两者限频分别计算。已有保存值保留，不自动覆盖。</p>
              <p>默认 600 秒（10 分钟）至多提醒一次。连续达到第一线后，桌面显示五秒深红“注意纪律”并播放提示音；第二线仅显示较轻的红色边缘效果，无声音，达到第一线时边缘效果更强。提醒与拍照间隔分别计时，不播报拍照状态。高线必须大于中线。dBFS 越接近 0 电平越高；估算 dB(A) 随数值增大。留空表示尚未配置，不触发阈值效果。</p>
              <p>dBFS 是数字信号电平，不是教室声压级。新建估算配置默认中线 50、高线 65 dB(A)，管理员可以调整；已保存配置保持原值。估算 dB(A) 使用本机外部参考及 A 加权 F/S 平滑统计，未校准时只显示 dBFS。阈值需结合现场麦克风与增益确认，不用它直接排名班级。</p>
              <template v-if="settings.photos.enabled">
                <h4 class="mt-4 mb-3">
                  拍照间隔
                </h4>
                <v-text-field
                  v-model.number="settings.photos.cooldownSeconds"
                  type="number"
                  min="30"
                  max="300"
                  step="1"
                  label="拍照最短间隔"
                  suffix="秒"
                  variant="outlined"
                  :disabled="busy"
                />
              </template>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </section>
    </template>

    <section
      v-if="loaded && targetId"
      class="study-section"
      aria-label="自习预览与保存"
    >
      <h3>5. 预览影响并保存</h3>
      <p>保存版本 {{ revision }}。预览列出受影响班级、相关走班与指定日期时段；配对数量不等于在线或已执行数量。</p>
      <v-text-field
        v-model="previewDate"
        type="date"
        label="自习预览日期（可留空）"
        variant="outlined"
        :disabled="busy"
        class="mt-3"
      />
      <v-alert
        v-if="validation"
        type="warning"
        variant="tonal"
        class="my-3"
      >
        {{ validationMessage }}
      </v-alert>
      <div class="study-actions">
        <v-btn
          variant="tonal"
          :loading="busy"
          :disabled="!valid || busy"
          @click="previewDraft"
        >
          预览自习影响
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!valid || busy || !preview || !hasUnsavedChanges"
          @click="save"
        >
          保存自习设置
        </v-btn>
        <v-btn
          variant="text"
          :disabled="busy"
          @click="reload"
        >
          重新加载自习配置
        </v-btn>
      </div>
      <div
        v-if="preview"
        class="study-preview mt-4"
      >
        <p>范围内 {{ preview.totalClasses }} 个班级 · 有效设置改变 {{ preview.changedClasses }} 个 · 涉及已配对设备 {{ preview.pairedDevices }} 台。</p>
        <div
          v-for="item in preview.items"
          :key="item.classId"
          class="study-preview-class"
        >
          <div class="study-section-title">
            <h4>{{ item.name }}</h4>
            <v-chip
              size="small"
              variant="tonal"
            >
              {{ sourceLabel(item.effective.source) }}
            </v-chip>
          </div>
          <p v-if="item.effective.settings">
            作业轮换 {{ item.effective.settings.homework.rotationSeconds }} 秒 · 拍照{{ item.effective.settings.photos.enabled ? '已配置启用，设备待确认' : '关闭' }}。
          </p>
          <p v-if="item.homeworkSources.length">
            当天作业来源：{{ item.homeworkSources.map(source => source.name + (source.subjectName ? '（' + source.subjectName + '）' : '')).join('、') }}。
          </p>
          <p
            v-for="window in item.windows"
            :key="window.start"
          >
            {{ window.start.replace('T', ' ') }} — {{ window.end.replace('T', ' ') }}（学校时间）
          </p>
          <p v-if="preview.previewDate && !item.windows.length">
            所选开始日没有有效自习时段。
          </p>
        </div>
        <p v-if="preview.truncated">
          仅展示前 50 个班级，汇总包含全部范围。
        </p>
      </div>
    </section>
  </section>
</template>

<script setup>
import {computed, ref, toRef, watch} from 'vue';
import {useStudySettingsEditor} from '@/composables/admin/useStudySettingsEditor.js';
import {confirmAction} from '@/utils/actionDialog.js';
import {defaultStudyEstimatedThresholds, defaultStudyRule} from '@/utils/npepStudySettings.js';
const props = defineProps({schoolId: {type: String, required: true}, schoolName: {type: String, default: '当前学校'}, termId: {type: String, default: ''}});
const emit = defineEmits(['dirty']);
const editor = useStudySettingsEditor(toRef(props, 'schoolId'), toRef(props, 'termId'));
const {catalog, targetType, targetId, targets, draft, revision, preview, previewDate, busy, loaded, error, message,
  hasUnsavedChanges, validation, valid, changeMode, refresh, previewDraft, save} = editor;
watch(hasUnsavedChanges, value => emit('dirty', value), {immediate: true, flush: 'sync'});
const settings = computed(() => draft.value.settings);
const advancedPanel = ref(null);
watch([targetType, targetId, () => props.schoolId, () => props.termId, validation], (values, previous = []) => {
  if (values.slice(0, 4).some((value, index) => value !== previous[index])) advancedPanel.value = null;
  const photos = settings.value?.photos;
  const invalidPhotoInterval = !Number.isInteger(photos?.cooldownSeconds) || photos.cooldownSeconds < 30 || photos.cooldownSeconds > 300;
  if (['INVALID_NOISE', 'INCONSISTENT_THRESHOLD_DURATION', 'PHOTO_THRESHOLD_REQUIRED'].includes(values[4])
    || values[4] === 'INVALID_PHOTOS' && invalidPhotoInterval) advancedPanel.value = 'monitoring';
}, {immediate: true});
const currentTermName = computed(() => catalog.value?.terms.find(term => term.id === editor.termId.value)?.name || '未选择有效学期');
const targetTypes = [{title: '年级', value: 'GRADE'}, {title: '行政班', value: 'CLASS'}];
const modes = computed(() => [...(targetType.value === 'CLASS' ? [{title:'继承年级设置',value:'Inherit'}] : []),
  {title: targetType.value === 'GRADE' ? '设置本年级自习' : '单独设置本班自习',value:'Override'}, {title:'关闭自习展示与拍照',value:'Disabled'}]);
const days = ['周一','周二','周三','周四','周五','周六','周日'].map((title, i) => ({title,value:i+1}));
const calendarKinds = [{title:'停用（节假日等）',value:'Skip'}, {title:'按指定星期补课',value:'UseWeekday'}];
const noiseDisplays = [{title:'只显示状态',value:'Status'}, {title:'状态＋小型实时趋势',value:'StatusTrend'}, {title:'状态＋当前单位数值',value:'StatusDbfs'}];
const homeworkModes = [{title:'各班显示本班及相关走班作业',value:'OwnClass'}, {title:'指定来源行政班（自动包含其相关走班）',value:'SelectedClasses'}];
const scheduleMode = ref('Daily');
const emptyExamSchedule = Object.freeze({timeZone:'Asia/Shanghai', effectiveFrom:'', effectiveTo:null, rules:Object.freeze([]), exceptions:Object.freeze([])});
const activeSchedule = computed(() => {
  const s = settings.value;
  if (!s) return null;
  return scheduleMode.value === 'Exam' ? s.examSchedule || emptyExamSchedule : s.schedule;
});
function editableSchedule() {
  if (scheduleMode.value !== 'Exam') return settings.value.schedule;
  return settings.value.examSchedule ??= {timeZone:'Asia/Shanghai', effectiveFrom:'', effectiveTo:null, rules:[], exceptions:[]};
}
const startDate = computed({get: () => activeSchedule.value?.effectiveFrom || '', set: value => { editableSchedule().effectiveFrom = value; }});
const endDate = computed({get: () => activeSchedule.value?.effectiveTo || '', set: value => { editableSchedule().effectiveTo = value || null; }});
const highDuration = computed({get: () => settings.value?.noise.highContinuousSeconds, set: value => { const seconds = value === '' || value == null ? NaN : Number(value); settings.value.noise.highContinuousSeconds = seconds; settings.value.photos.continuousSeconds = seconds; }});
const noiseUnits = [{title:'dBFS 数字输入电平',value:'Dbfs'}, {title:'估算 dB(A) · 需要本机外部参考',value:'Estimated'}];
const noiseUnit = computed({get: () => settings.value?.noise.estimated ? 'Estimated' : 'Dbfs', set: value => {
  if ((settings.value.noise.estimated ? 'Estimated' : 'Dbfs') === value) return;
  settings.value.noise.estimated = value === 'Estimated' ? defaultStudyEstimatedThresholds() : null;
}});
const threshold = (raw, estimated) => computed({get: () => (settings.value?.noise.estimated ? settings.value.noise.estimated[estimated] : settings.value?.noise[raw]) ?? '', set: value => {
  const number = value === '' || value == null ? null : Number(value);
  if (settings.value.noise.estimated) settings.value.noise.estimated[estimated] = number;
  else settings.value.noise[raw] = number;
}});
const mediumLine = threshold('mediumLineDbfs', 'mediumDbA');
const redLine = threshold('redLineDbfs', 'highDbA');
const validationMessage = computed(() => ({INVALID_DATES:'请填写有效的生效日期；截止日期不能早于生效日期。',
  EMPTY_RULES:'至少添加一个自习时段。',INVALID_RULE:'请明确选择星期并填写开始、结束时间。',INVALID_DURATION:'时段不能等长或超过三小时。',
  MERGED_WINDOW_TOO_LONG:'时段或日历例外产生了超过三小时的连续自习，请调整。',INVALID_CALENDAR:'请核对日历例外日期、重复日期与补课星期；日期须在生效范围内。',
  INVALID_PRESENTATION:'展示设置格式无效，请重新读取并核对策略。',INVALID_HOMEWORK:'请选择有效作业来源；轮换间隔为 15–600 秒。',
  INCONSISTENT_THRESHOLD_DURATION:'高线连续超限时间与兼容字段不一致，请重新加载并核对。',
  INVALID_NOISE:'高线持续时间须为 1–10 秒；阈值须为 −90 至 0 dBFS 或 30 至 130 估算 dB(A)，第一线必须大于第二线；纪律提醒间隔须为 1–86400 秒。',INVALID_PHOTOS:'连续超限为 1–10 秒，间隔为 30–300 秒，保留为 1–180 天。',
  PHOTO_THRESHOLD_REQUIRED:'启用拍照前需开启原生噪音监测并明确填写红线阈值。',RETENTION_ACK_REQUIRED:'超过 30 天保留照片，需要确认延长保留的风险。'}[validation.value] || '请核对自习设置。'));
const sourceLabel = source => ({Grade:'继承年级',Class:'班级覆盖',Disabled:'已关闭',None:'未配置'}[source] || source);
async function discard() { return !hasUnsavedChanges.value || await confirmAction({title:'放弃未保存的自习设置？',message:'切换范围后，当前草稿不会保留。',confirmText:'放弃并切换',color:'warning'}); }
const guardedType = computed({get: () => targetType.value, set: async value => {
  if (value === targetType.value || busy.value || !await discard()) return;
  targetType.value = value; targetId.value = targets.value[0]?.id || '';
}});
const guardedTarget = computed({get: () => targetId.value, set: async value => {
  if (value === targetId.value || busy.value || !await discard()) return;
  targetId.value = value;
}});
function addRule() { editableSchedule().rules.push(defaultStudyRule()); }
function addException() { editableSchedule().exceptions.push({date:'',kind:'Skip',weekday:null}); }
async function reload() { if (await discard()) await refresh(); }
</script>

<style scoped>
.study-settings { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 18px; margin-top: 18px; }
.study-heading h2 { font-size: 24px; font-weight: 750; }
.study-heading p, .study-section p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; line-height: 1.8; }
.study-section { min-width: 0; padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.study-mode-switch { max-width: 100%; }
.study-settings :deep(input) { min-width: 0; }
.study-advanced { min-width: 0; }
.study-advanced :deep(.v-expansion-panel-title) { min-width: 0; padding: 16px; }
.study-advanced :deep(.v-expansion-panel-text__wrapper) { padding: 8px 16px 16px; }
.study-section h3 { font-size: 20px; font-weight: 750; margin-bottom: 6px; }
.study-section-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.study-rule { padding: 16px; border: 1px solid rgba(var(--v-border-color), .16); border-radius: 12px; }
.study-rule + .study-rule { margin-top: 12px; }
.study-rule .study-section-title { margin-bottom: 8px; }
.study-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.study-device-note { padding: 16px; background: rgba(var(--v-theme-on-surface), .04); border-radius: 12px; }
.study-preview-class { padding: 16px 0; border-top: 1px solid rgba(var(--v-border-color), .16); margin-top: 12px; }
@media (max-width: 600px) {
  .study-section { padding: 16px; }
  .study-mode-switch { display: flex; flex-direction: column; width: 100%; height: auto; }
  .study-mode-switch :deep(.v-btn) { min-height: 48px; width: 100%; }
  .study-mode-switch :deep(.v-btn__content) { white-space: normal; }
  .study-actions :deep(.v-btn) { width: 100%; }
}
</style>
