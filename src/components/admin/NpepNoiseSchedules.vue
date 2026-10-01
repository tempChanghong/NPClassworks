<template>
  <v-card
    class="rounded-xl mt-4"
    title="学校自习噪音排程"
  >
    <v-card-text>
      <p class="mb-3">
        {{ schoolName }} · 年级设置统一时段，班级可继承、覆盖或关闭。
      </p>
      <v-alert
        type="info"
        variant="tonal"
        class="mb-4"
      >
        保存后，支持自动排程的 NPEduTools 会接收规则，按 ClassIsland 学校时间执行。请在设备噪音报告中核对“已应用”和执行状态；仅保存规则不代表已开始监测。不保存原始音频。
      </v-alert>
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
      <p v-if="loaded && !catalog?.termId">
        学校尚无有效学期，请先完成学期配置。
      </p>
      <template v-if="targetId && loaded">
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
        <template v-if="draft.mode === 'Override'">
          <p class="text-caption mb-3">
            星期按开始日计算；结束早于开始表示跨午夜。相邻或重叠时段合并后最多三小时。
          </p>
          <v-row
            v-for="(rule, index) in draft.rules"
            :key="index"
            class="align-center"
          >
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="rule.days"
                :items="days"
                :label="`时段 ${index + 1} · 星期`"
                multiple
                chips
                :disabled="busy"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col
              cols="5"
              md="2"
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
              cols="5"
              md="2"
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
            <v-col cols="2">
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                :aria-label="`删除时段 ${index + 1}`"
                :disabled="busy"
                @click="draft.rules.splice(index, 1)"
              />
            </v-col>
          </v-row>
          <v-btn
            class="my-3"
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
          class="my-3"
        >
          {{ validationMessage }}
        </v-alert>
        <p class="text-caption mt-3">
          {{ revision ? `服务器版本：${revision}` : '尚未保存配置' }} · 仅列出当前有效学期的行政班。
        </p>
        <div class="d-flex flex-wrap ga-2 my-3">
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
          class="pa-4 rounded-lg bg-surface-variant"
        >
          <h3 class="text-subtitle-1">
            有效规则预览
          </h3>
          <p class="my-2">
            范围内 {{ preview.totalClasses }} 个班级；{{ preview.changedClasses }} 个班级的有效规则改变，涉及 {{ preview.pairedDevices }} 台已配对设备。
          </p>
          <p class="text-caption mb-3">
            配对数量不是在线数量，也不代表设备已应用规则。
          </p>
          <div
            v-for="item in preview.items"
            :key="item.classId"
            class="mb-3"
          >
            <strong>{{ item.name }}</strong> · {{ sourceName(item.effective.source) }}{{ item.changed ? ' · 将改变' : ' · 有效规则不变' }}
            <p
              v-for="(rule, i) in item.effective.rules"
              :key="i"
              class="text-body-2"
            >
              {{ ruleText(rule) }}
            </p>
          </div>
          <p v-if="preview.truncated">
            预览仅列出前 50 个班级，上面的汇总包含全部班级。
          </p>
        </div>
      </template>
      <v-btn
        v-else
        :loading="busy"
        class="mt-3"
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
const ruleText = rule => `${rule.days.map(d => days[d-1].title).join('、')} ${rule.start}–${rule.end}${rule.end < rule.start ? '（次日结束）' : ''}`;
</script>
