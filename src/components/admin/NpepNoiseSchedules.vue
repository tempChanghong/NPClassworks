<template>
  <v-card class="noise-schedule-editor rounded-xl mt-4">
    <v-card-title class="schedule-header">
      <span class="schedule-eyebrow">学校策略 · NPEP</span>
      <h2>学校自习噪音排程</h2>
      <p>{{ schoolName }} · 年级设置统一时段，班级可继承、覆盖或关闭。</p>
    </v-card-title>
    <v-card-text class="schedule-content">
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
        class="schedule-section"
        aria-labelledby="schedule-target-title"
      >
        <div class="schedule-section-heading">
          <h3 id="schedule-target-title">
            1. 选择配置范围
          </h3>
          <p>先确定学期、年级或行政班，再核对当前对象。</p>
        </div>
        <v-row>
          <v-col
            cols="12"
            md="4"
          >
            <v-select
              v-model="editorTerm"
              :items="catalog?.terms || []"
              item-title="name"
              item-value="id"
              label="排程学期"
              open-text="排程学期"
              close-text="收起排程学期"
              :disabled="busy"
              variant="outlined"
              @update:model-value="refresh"
            />
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="targetType"
              :items="[{title:'年级',value:'GRADE'},{title:'行政班',value:'CLASS'}]"
              label="配置范围"
              open-text="配置范围"
              close-text="收起配置范围"
              :disabled="busy"
              variant="outlined"
              @update:model-value="selectFirst"
            />
          </v-col>
          <v-col
            cols="12"
            md="5"
          >
            <v-select
              v-model="targetId"
              :items="targets"
              item-title="name"
              item-value="id"
              label="配置对象"
              open-text="配置对象"
              close-text="收起配置对象"
              :disabled="busy || !loaded"
              variant="outlined"
            />
          </v-col>
        </v-row>
        <p
          v-if="loaded && !catalog?.termId"
          class="schedule-note"
        >
          学校尚无有效学期，请先完成学期配置。
        </p>
      </section>

      <template v-if="targetId && loaded">
        <section
          class="schedule-section"
          aria-labelledby="schedule-rules-title"
        >
          <div class="schedule-section-heading">
            <h3 id="schedule-rules-title">
              2. 设置自动监测规则
            </h3>
            <p>规则只面向所选范围；手动监测仍由设备现场控制。</p>
          </div>
          <v-select
            v-model="draft.mode"
            :items="modes"
            label="自动监测规则"
            open-text="自动监测规则"
            close-text="收起自动监测规则"
            :disabled="busy"
            variant="outlined"
            @update:model-value="changeMode"
          />
          <p
            v-if="draft.mode === 'Inherit'"
            class="schedule-note"
          >
            此班级继承年级时段；年级规则变更后会随之调整。
          </p>
          <p
            v-if="draft.mode === 'Disabled'"
            class="schedule-note"
          >
            此范围将关闭自动监测，不影响现场手动监测。
          </p>
          <template v-if="draft.mode === 'Override'">
            <p class="schedule-note mb-3">
              星期按开始日计算；结束早于开始表示跨午夜。相邻或重叠时段合并后最多三小时。
            </p>
            <div
              v-for="(rule, index) in draft.rules"
              :key="index"
              class="schedule-rule"
            >
              <div class="schedule-rule-heading">
                <h4>时段 {{ index + 1 }}</h4>
                <v-btn
                  icon="mdi-delete-outline"
                  variant="text"
                  :aria-label="'删除时段 ' + (index + 1)"
                  :disabled="busy"
                  @click="draft.rules.splice(index, 1)"
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
                    :label="'时段 ' + (index + 1) + ' · 星期'"
                    multiple
                    chips
                    :disabled="busy"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
                <v-col
                  cols="6"
                  md="3"
                >
                  <v-text-field
                    v-model="rule.start"
                    type="time"
                    label="开始"
                    :disabled="busy"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
                <v-col
                  cols="6"
                  md="3"
                >
                  <v-text-field
                    v-model="rule.end"
                    type="time"
                    label="结束"
                    :disabled="busy"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
              </v-row>
            </div>
            <v-btn
              class="mt-3"
              variant="tonal"
              :disabled="busy || draft.rules.length >= 32"
              @click="draft.rules.push({days:[1,2,3,4,5],start:'19:00',end:'21:00'})"
            >
              添加时段
            </v-btn>
          </template>
          <v-alert
            v-if="validation"
            type="warning"
            variant="tonal"
            class="mt-4"
          >
            {{ validationMessage }}
          </v-alert>
        </section>

        <section
          class="schedule-section"
          aria-labelledby="schedule-preview-title"
        >
          <div class="schedule-section-heading">
            <h3 id="schedule-preview-title">
              3. 预览影响并保存
            </h3>
            <p>先确认受影响班级和配对设备，再保存规则。</p>
          </div>
          <p class="schedule-note">
            {{ revision ? '服务器版本：' + revision : '尚未保存配置' }} · 仅列出当前有效学期的行政班。
          </p>
          <div class="schedule-actions">
            <v-btn
              :loading="busy"
              :disabled="!valid || busy"
              variant="tonal"
              @click="previewDraft"
            >
              预览影响
            </v-btn>
            <v-btn
              :disabled="!valid || busy || !preview || preview.baseRevision !== revision"
              color="primary"
              @click="save"
            >
              保存排程
            </v-btn>
            <v-btn
              :disabled="busy"
              variant="text"
              @click="refresh"
            >
              重新加载服务器配置
            </v-btn>
          </div>
          <div
            v-if="preview"
            class="schedule-preview"
          >
            <h3>有效规则预览</h3>
            <div class="schedule-preview-metrics">
              <div><span>范围内班级</span><strong>{{ preview.totalClasses }}</strong></div>
              <div><span>有效规则将改变</span><strong>{{ preview.changedClasses }}</strong></div>
              <div><span>已配对设备</span><strong>{{ preview.pairedDevices }}</strong></div>
            </div>
            <p class="schedule-note mt-3">
              范围内 {{ preview.totalClasses }} 个班级；{{ preview.changedClasses }} 个班级的有效规则改变，涉及 {{ preview.pairedDevices }} 台已配对设备。配对数量不是在线数量，也不代表设备已应用规则。
            </p>
            <div
              v-for="item in preview.items"
              :key="item.classId"
              class="schedule-preview-item"
            >
              <div>
                <strong>{{ item.name }}</strong>
                <span>{{ sourceName(item.effective.source) }}</span>
                <v-chip
                  size="small"
                  :color="item.changed ? 'primary' : undefined"
                  variant="tonal"
                >
                  {{ item.changed ? '将改变' : '有效规则不变' }}
                </v-chip>
              </div>
              <p
                v-for="(rule, i) in item.effective.rules"
                :key="i"
              >
                {{ ruleText(rule) }}
              </p>
            </div>
            <p
              v-if="preview.truncated"
              class="schedule-note mt-3"
            >
              预览仅列出前 50 个班级，上面的汇总包含全部班级。
            </p>
          </div>
          <p class="schedule-note mt-4">
            保存后，支持自动排程的 NPEduTools 会接收规则，按 ClassIsland 学校时间执行。请在设备噪音报告中核对“已应用”和执行状态；保存本身不代表已开始监测。不保存原始音频。
          </p>
        </section>
      </template>
      <v-btn
        v-else
        :loading="busy"
        @click="refresh"
      >
        刷新排程配置
      </v-btn>
    </v-card-text>
  </v-card>
</template>
<script setup>
import {computed, toRef} from 'vue';
import {useNoiseScheduleEditor} from '@/composables/admin/useNoiseScheduleEditor.js';
const props = defineProps({schoolId: {type: String, required: true}, schoolName: {type: String, default: '当前学校'}, termId: {type: String, default: ''}});
const editor = useNoiseScheduleEditor(toRef(props, 'schoolId'), toRef(props, 'termId'));
const {catalog, termId: editorTerm, targetType, targetId, targets, draft, revision, preview, busy, error, message, loaded, valid, validation, refresh, previewDraft, save} = editor;
const days = ['周一','周二','周三','周四','周五','周六','周日'].map((title, i) => ({title, value:i+1}));
const modes = computed(() => [...(targetType.value === 'CLASS' ? [{title:'继承年级',value:'Inherit'}] : []), {title:'使用本范围时段',value:'Override'}, {title:'关闭自动监测',value:'Disabled'}]);
const validationMessage = computed(() => ({EMPTY_RULES:'请至少添加一个时段。',INVALID_RULE:'请检查星期和开始／结束时间。',INVALID_DURATION:'时段不能等长或超过三小时。',MERGED_WINDOW_TOO_LONG:'相邻或重叠时段合并后超过三小时，请调整。'}[validation.value] || '排程配置无效，请检查填写内容。'));
function selectFirst() { targetId.value = targets.value[0]?.id || ''; }
function changeMode(mode) {
  draft.value.rules = mode === 'Override' ? [{days:[1,2,3,4,5],start:'19:00',end:'21:00'}] : [];
}
const sourceName = source => ({Grade:'继承年级',Class:'班级时段',Disabled:'已关闭',None:'未配置'}[source]);
const ruleText = rule => rule.days.map(d => days[d-1].title).join('、')+' '+rule.start+'–'+rule.end+(rule.end < rule.start ? '（次日结束）' : '');
</script>
<style scoped>
.schedule-header { display: grid; gap: 5px; padding: 26px 28px 16px; white-space: normal; }
.schedule-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.schedule-header h2 { font-size: clamp(24px, 2vw, 30px); font-weight: 750; }
.schedule-header p, .schedule-note { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.schedule-content { display: grid; gap: 18px; padding: 0 28px 28px !important; }
.schedule-section { padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.schedule-section-heading { margin-bottom: 18px; }
.schedule-section-heading h3 { font-size: 20px; font-weight: 750; }
.schedule-section-heading p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.schedule-rule { padding: 16px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 14px; }
.schedule-rule + .schedule-rule { margin-top: 12px; }
.schedule-rule-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.schedule-rule-heading h4 { font-size: 16px; }
.schedule-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.schedule-preview { margin-top: 16px; padding: 18px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 14px; }
.schedule-preview h3 { font-size: 18px; font-weight: 750; }
.schedule-preview-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.schedule-preview-metrics > div { display: grid; gap: 5px; padding: 12px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); }
.schedule-preview-metrics span { color: rgba(var(--v-theme-on-surface), .68); font-size: 12px; }
.schedule-preview-metrics strong { font-size: 18px; }
.schedule-preview-item { margin-top: 12px; padding: 12px 0; border-top: 1px solid rgba(var(--v-border-color), .16); }
.schedule-preview-item > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.schedule-preview-item span, .schedule-preview-item p { color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; }
.schedule-preview-item p { margin-top: 5px; }
@media (max-width: 600px) {
  .schedule-header { padding: 20px 18px 16px; }
  .schedule-content { padding: 0 18px 18px !important; }
  .schedule-section { padding: 16px; }
  .schedule-preview { padding: 14px; }
  .schedule-preview-metrics { grid-template-columns: 1fr; }
  .schedule-actions :deep(.v-btn) { width: 100%; }
}
</style>
