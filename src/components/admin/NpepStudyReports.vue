<template>
  <section class="study-reports">
    <h3>自习记录</h3>
    <p>按班级、日期和运行模式查看统计、摄像头捕获与退出记录。中断恢复的片段归在同一次安排下，缺样不记作安静。</p>
    <v-alert
      type="info"
      variant="tonal"
      class="my-3"
    >
      此处为服务器已收到的报告，结束后尚未上传的报告不会显示。旧报告缺少可靠归属时仍在设备历史中查看。统计保留 30 天；照片按学校策略保留，备份删除边界尚未确认。
    </v-alert>
    <v-row class="mt-3">
      <v-col
        cols="12"
        md="5"
      >
        <v-select
          v-model="classId"
          :items="classes"
          item-title="name"
          item-value="id"
          label="自习班级"
          variant="outlined"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-text-field
          v-model="date"
          type="date"
          label="自习开始日期（可留空）"
          variant="outlined"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-select
          v-model="mode"
          :items="modes"
          label="运行模式"
          variant="outlined"
        />
      </v-col>
    </v-row>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="my-3"
    >
      {{ error }}
    </v-alert>
    <v-btn
      :disabled="!classId || busy"
      :loading="busy"
      prepend-icon="mdi-refresh"
      @click="load()"
    >
      查询自习记录
    </v-btn>
    <p
      v-if="loaded && !items.length"
      class="mt-3"
    >
      没有符合条件的已上传记录。
    </p>
    <v-list
      v-if="items.length"
      class="my-3"
    >
      <v-list-item
        v-for="item in items"
        :key="item.groupId"
        :title="`${item.window.start.slice(0,10)} ${item.window.start.slice(11,16)}–${item.window.end.slice(11,16)}`"
        :subtitle="`${modeText(item)} · ${item.fragmentCount} 个采集片段`"
      >
        <template #append>
          <v-btn
            variant="text"
            :disabled="busy"
            @click="detail(item)"
          >
            统计与捕获记录
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <v-btn
      v-if="cursor"
      variant="tonal"
      :disabled="busy"
      @click="load(cursor)"
    >
      下一页
    </v-btn>
    <section
      v-if="selected"
      class="session-detail"
    >
      <h4>{{ selected.window.start.slice(0,10) }} · {{ selected.window.start.slice(11,16) }}–{{ selected.window.end.slice(11,16) }}</h4>
      <p>{{ modeText(selected) }}。每个片段按当时的校准和阈值分别统计，不混合 dBFS 与估算 dB(A)，不评分、不排名。</p>
      <article
        v-for="fragment in selected.fragments"
        :key="fragment.sessionId"
        class="fragment"
      >
        <p>{{ time(fragment.startedAt) }}–{{ time(fragment.endedAt) }} · {{ fragment.outcome === 'Interrupted' ? '异常中断' : fragment.outcome === 'Faulted' ? '采集故障' : '已结束' }} · 服务器收到 {{ time(fragment.receivedAt) }}</p>
        <div class="metrics">
          <span>有效覆盖 <strong>{{ (fragment.summary.coverage * 100).toFixed(1) }}%</strong></span>
          <span>dBFS 均值 / 峰值 <strong>{{ value(fragment.summary.energyMeanDbfs) }} / {{ value(fragment.summary.peakDbfs) }}</strong></span>
          <span>削波 <strong>{{ fragment.summary.clippedPercent.toFixed(2) }}%</strong></span>
          <span>提醒 <strong>{{ fragment.study.statistics?.disciplineReminders ?? '未记录' }}</strong></span>
        </div>
        <p v-if="fragment.study.statistics">
          dBFS 高线以上 {{ seconds(fragment.study.statistics.raw.highSeconds) }}；中线以上 {{ seconds(fragment.study.statistics.raw.mediumSeconds) }}；高线有效判定 {{ seconds(fragment.study.statistics.raw.thresholdSampledSeconds) }}。
        </p>
        <p v-if="fragment.estimate">
          估算 dB(A) 均值 / 最大值 {{ value(fragment.estimate.summary.energyMeanDbA) }} / {{ value(fragment.estimate.summary.maximumDbA) }}；有效覆盖 {{ (fragment.estimate.summary.coverage * 100).toFixed(1) }}%。{{ fragment.estimate.reason ? '参考曾失效，仅统计有效参考期间。' : '' }}
        </p>
        <p v-if="fragment.study.statistics?.estimated">
          估算 dB(A) 高线以上 {{ seconds(fragment.study.statistics.estimated.highSeconds) }}；中线以上 {{ seconds(fragment.study.statistics.estimated.mediumSeconds) }}。
        </p>
      </article>
      <h4 class="mt-4">
        摄像头捕获
      </h4>
      <p v-if="!selected.photos?.length">
        没有当前可查看的照片；未拍摄、限频、等待补传和已到期均可能导致此结果。
      </p>
      <v-list v-if="selected.photos?.length">
        <v-list-item
          v-for="photo in selected.photos"
          :key="photo.eventId"
          :title="time(photo.capturedAt)"
          :subtitle="`${reason(photo.reason)} · ${photo.state === 'Stored' ? '已存储' : '上传处理中或不可用'} · 到期 ${time(photo.expiresAt)}`"
        >
          <template #append>
            <v-btn
              v-if="photo.state === 'Stored'"
              variant="text"
              :disabled="busy"
              @click="view(photo.eventId)"
            >
              查看画面
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <h4 class="mt-4">
        退出与恢复记录
      </h4>
      <p v-if="!selected.events?.length">
        没有已上传的关联记录。
      </p>
      <v-list v-if="selected.events?.length">
        <v-list-item
          v-for="event in selected.events"
          :key="event.eventId"
          :title="`${reason(event.reason)} · ${time(event.createdAt)}`"
          :subtitle="event.photoState === 'Stored' ? '关联画面已存储' : '没有当前可查看的关联画面'"
        >
          <template #append>
            <v-btn
              v-if="event.photoState === 'Stored' && event.photoEventId"
              variant="text"
              :disabled="busy"
              @click="view(event.photoEventId)"
            >
              查看关联画面
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <p v-if="selected.truncated">
        记录较多，此处最多显示各 300 条捕获与退出记录；可在独立照片记录中继续查询。
      </p>
    </section>
    <v-dialog
      :model-value="!!preview"
      max-width="1100"
      @update:model-value="closePreview"
    >
      <v-card v-if="preview">
        <v-card-title>自习捕获画面 · 仅供授权管理人员查看</v-card-title>
        <v-card-text>
          <img
            :src="preview"
            alt="自习捕获画面"
            class="photo-image"
          >
        </v-card-text>
        <v-card-actions>
          <v-btn @click="closePreview">
            关闭
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
<script setup>
import {onUnmounted, ref, watch} from 'vue';
import {npepAdminApi, npepSeatingApi, npepStudyPhotosApi} from '@/utils/classworksV2Client';
const props = defineProps({schoolId:{type:String,required:true},termId:{type:String,default:''}});
const classes=ref([]),classId=ref(null),term=ref(null),mode=ref(''),date=ref('');
const items=ref([]),cursor=ref(null),selected=ref(null),preview=ref(null),error=ref(''),busy=ref(false),loaded=ref(false);
const modes=[{title:'所有模式',value:''},{title:'日常模式 · ClassIsland 时间',value:'Daily'},{title:'考试模式 · Windows 时间',value:'Exam'}];
let generation=0,controller,catalogGeneration=0,catalogController;
function closePreview(){if(preview.value) URL.revokeObjectURL(preview.value);preview.value=null;}
function reset(){generation++;controller?.abort();closePreview();items.value=[];cursor.value=null;selected.value=null;error.value='';busy.value=false;loaded.value=false;}
const modeText=i=>i.mode==='Exam'?'考试模式 · Windows 时间':'日常模式 · ClassIsland 时间';
const time=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
const value=v=>Number.isFinite(v)?v.toFixed(1):'—';
const seconds=v=>`${Math.max(0,Number(v)||0).toFixed(1)} 秒`;
const reason=v=>({Noise:'连续超限',ExitIntent:'点击退出后台',ProcessRecovery:'异常恢复',Timeout:'管理验证超时',InvalidSecret:'管理口令未通过'}[v]||v);
const query=()=>({termId:term.value,classId:classId.value,...(mode.value?{mode:mode.value}:{}),...(date.value?{date:date.value}:{})});
function problem(e){if(e.code!=='ERR_CANCELED')error.value='请求未完成，请核对权限、服务器版本与班级范围后重试。';}
watch(()=>[props.schoolId,props.termId],async()=>{
  reset();catalogController?.abort();classes.value=[];classId.value=null;term.value=null;
  const n=++catalogGeneration;catalogController=new AbortController();
  try{const r=await npepSeatingApi.catalog(props.schoolId,props.termId,{signal:catalogController.signal});if(n===catalogGeneration){classes.value=r.data.classes;term.value=r.data.termId;}}
  catch(e){if(n===catalogGeneration)problem(e);}
},{immediate:true});
watch([classId,mode,date],reset);
async function request(params){return npepAdminApi.studySessions(props.schoolId,{params,signal:controller.signal});}
async function load(next=null){
  if(!classId.value||!term.value||busy.value)return;const n=generation;controller=new AbortController();busy.value=true;error.value='';selected.value=null;closePreview();
  try{const r=await request({...query(),...(next?{cursor:next}:{})});if(n===generation){items.value=r.data.items;cursor.value=r.data.cursor;loaded.value=true;}}
  catch(e){if(n===generation)problem(e);}finally{if(n===generation)busy.value=false;}
}
async function detail(item){
  if(busy.value)return;const n=generation;controller=new AbortController();busy.value=true;error.value='';selected.value=null;closePreview();
  try{const r=await request({...query(),groupId:item.groupId});if(n===generation)selected.value=r.data.items[0];}
  catch(e){if(n===generation)problem(e);}finally{if(n===generation)busy.value=false;}
}
async function view(id){
  if(busy.value)return;const n=generation;controller=new AbortController();busy.value=true;closePreview();
  try{const blob=await npepStudyPhotosApi.image(props.schoolId,id,{signal:controller.signal});if(n===generation)preview.value=URL.createObjectURL(blob);}
  catch(e){if(n===generation)problem(e);}finally{if(n===generation)busy.value=false;}
}
onUnmounted(()=>{reset();catalogGeneration++;catalogController?.abort();});
</script>
<style scoped>
.study-reports { margin-top:28px; padding:24px; border:1px solid rgba(var(--v-border-color),.2); border-radius:16px; }
.study-reports p { line-height:1.7; color:rgba(var(--v-theme-on-surface),.7); }
.session-detail { margin-top:24px; padding-top:20px; border-top:1px solid rgba(var(--v-border-color),.2); }
.fragment { padding:16px 0; border-bottom:1px solid rgba(var(--v-border-color),.15); }
.metrics { display:flex; flex-wrap:wrap; gap:12px 28px; margin:12px 0; }
.metrics strong { display:block; font-size:22px; font-variant-numeric:tabular-nums; }
.photo-image { display:block; max-width:100%; max-height:70vh; object-fit:contain; margin:auto; }
</style>
