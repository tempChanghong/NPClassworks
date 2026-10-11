<template>
  <v-sheet
    border
    rounded="lg"
    class="pa-4 mt-4"
  >
    <div class="d-flex align-center mb-3">
      <h4>采集设备与锁定</h4><v-spacer /><v-btn
        variant="text"
        :loading="busy"
        @click="refresh"
      >
        刷新
      </v-btn>
    </div>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-3"
    >
      {{ error }}
    </v-alert>
    <template v-if="snapshot">
      <p class="mb-3">
        设备枚举接收时间：{{ snapshot.inventory?.receivedAt || '尚未上报' }}。列表枚举不会打开麦克风或摄像头。
      </p>
      <v-select
        v-model="microphone"
        label="学校默认麦克风"
        :items="microphones"
        item-title="name"
        item-value="id"
        variant="outlined"
        clearable
        :disabled="busy || !fresh"
      />
      <v-select
        v-model="camera"
        label="学校默认摄像头"
        :items="cameras"
        item-title="name"
        item-value="id"
        variant="outlined"
        clearable
        :disabled="busy || !fresh"
      />
      <v-switch
        v-model="locked"
        label="锁定本机设备选择"
        :disabled="busy"
      />
      <p class="mb-3">
        设备应用版本 {{ snapshot.inventory?.appliedRevision ?? '未知' }} / 学校配置版本 {{ snapshot.policy.revision }}；本机{{ snapshot.inventory?.unlocked ? '已通过学校口令解锁' : '未报告本机解锁' }}。监测中更换设备需等待结束；口令解锁保持到学校再次锁定。
      </p>
      <p
        v-if="snapshot.inventory?.error"
        class="mb-3"
      >
        设备回执：{{ snapshot.inventory.error }}
      </p>
      <v-btn
        color="primary"
        :disabled="busy || !fresh"
        @click="save"
      >
        保存设备与锁定策略
      </v-btn>
      <p
        v-if="message"
        class="mt-3"
      >
        {{ message }}
      </p>
      <p
        v-if="!fresh"
        class="mt-3"
      >
        设备列表已过时或尚未上报，刷新并等待设备上线后才能下发选择。
      </p>
    </template>
  </v-sheet>
</template>
<script setup>
import {computed,ref,watch,onUnmounted} from 'vue';
import {npepAdminApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
const props=defineProps({schoolId:{type:String,required:true},deviceId:{type:String,required:true}});
const snapshot=ref(null),microphone=ref(null),camera=ref(null),locked=ref(false),busy=ref(false),error=ref(''),message=ref(''),now=ref(Date.now());
let generation=0,controller;
const timer=setInterval(()=>{now.value=Date.now();},1000);
const fresh=computed(()=>{const age=now.value-Date.parse(snapshot.value?.inventory?.receivedAt);return Number.isFinite(age)&&age>=-5000&&age<60000;});
const microphones=computed(()=>snapshot.value?.inventory?.microphones||[]),cameras=computed(()=>snapshot.value?.inventory?.cameras||[]);
async function run(save){
  if(busy.value||save&&!fresh.value)return;
  const token=generation,school=props.schoolId,device=props.deviceId;controller=new AbortController();busy.value=true;error.value='';message.value='';
  const current=()=>token===generation&&school===props.schoolId&&device===props.deviceId;
  try{
    if(save){
      await npepAdminApi.setEquipment(school,device,{requestId:globalThis.crypto.randomUUID(),expectedRevision:snapshot.value.policy.revision,microphoneId:microphone.value,cameraId:camera.value,locked:locked.value},{signal:controller.signal});
      if(!current())return;message.value='学校配置已保存；以设备应用回执为准。';
    }
    const result=await npepAdminApi.equipment(school,device,{signal:controller.signal});if(!current())return;
    snapshot.value=result.data;microphone.value=result.data.policy.microphoneId;camera.value=result.data.policy.cameraId;locked.value=result.data.policy.locked;
  }catch(failure){if(current())error.value=npepErrorMessage(failure);}
  finally{if(current())busy.value=false;}
}
const refresh=()=>run(false),save=()=>run(true);
watch(()=>[props.schoolId,props.deviceId],()=>{generation++;controller?.abort();snapshot.value=null;busy.value=false;void refresh();},{immediate:true,flush:'sync'});
onUnmounted(()=>{generation++;controller?.abort();clearInterval(timer);});
</script>
