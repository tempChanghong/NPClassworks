// The selected provider survives a network error; a failed poll never opens a second microphone.
export function createNativeNoiseController(api, publish, remember = {get: () => null, set: () => {}}, schedules = null) {
  let scope = '', epoch = 0, polling = false, state;
  let resumeBody = null;
  const empty = () => ({provider: 'checking', online: false, status: null, reports: [], commands: [], error: '', busy: false,
    schedule:null, scheduleError:''});
  function emit(patch) { state = {...state, ...patch}; publish(state); }
  function context(key) {
    if (key === scope) return;
    scope = key; epoch++; polling = false; resumeBody = null;
    state = empty();
    if (remember.get(key) === 'native') state.provider = 'native';
    publish(state);
  }
  async function poll() {
    if (!scope || polling) return;
    const current = epoch; polling = true;
    try {
      const value = await api.screen();
      if (current !== epoch) return;
      if (!['native', 'browser'].includes(value.provider)) throw new Error('噪音接口响应不兼容');
      remember.set(scope, value.provider);
      emit({...value, error: ''});
      if (schedules && value.provider === 'native') {
        try {
          const schedule = await schedules.screen();
          if (current === epoch) emit({schedule, scheduleError:''});
        } catch (e) {
          if (current === epoch) emit({schedule:state.schedule?{...state.schedule,online:false,applied:false}:null,
            scheduleError:[404,426].includes(e?.response?.status)?'服务端尚未支持自动监测排程':'排程状态暂不可确认；请在桌面查看。'});
        }
      }
    } catch (e) {
      if (current !== epoch) return;
      // Only a positively unsupported old server allows the original browser implementation.
      const unsupported = [404, 426].includes(e?.response?.status);
      emit({online: false, error: unsupported ? '服务端暂不支持原生监测' : '连接中断，当前状态未知；请在 NPEduTools 本机查看或停止。',
        schedule:state.schedule?{...state.schedule,online:false,applied:false}:null,
        ...(unsupported && state.provider !== 'native' ? {provider: 'browser'} : {})});
    } finally { if (current === epoch) polling = false; }
  }
  async function command(action, durationSeconds = 10800) {
    if (state.busy || !state.online || state.provider !== 'native' || !state.status) return false;
    const current = epoch, s = state.status;
    emit({busy: true, error: ''});
    try {
      await api.screen({requestId: globalThis.crypto.randomUUID(), action, instanceId: s.instanceId,
        revision: s.revision, sessionId: s.sessionId, durationSeconds});
      if (current === epoch) emit({error: '请求已送达服务器，等待桌面执行回执。'});
      return true;
    } catch (e) {
      if (current === epoch) emit({error: `请求未确认：${e?.response?.data?.error?.code || e.message}。请刷新查看实际状态。`});
      return false;
    } finally { if (current === epoch) { emit({busy: false}); await poll(); } }
  }
  state = empty();
  async function resumeSchedule() {
    const schedule=state.schedule;
    if(!schedules || state.busy || !state.online || !schedule?.online || !schedule.applied || !schedule.status?.window) return false;
    const current=epoch, body={version:schedule.policy.version,window:schedule.status.window};
    if(!resumeBody || JSON.stringify(body)!==JSON.stringify({version:resumeBody.version,window:resumeBody.window}))
      resumeBody={...body,requestId:globalThis.crypto.randomUUID()};
    emit({busy:true,scheduleError:''});
    try {
      await schedules.screen(resumeBody);
      if(current===epoch) { resumeBody=null; emit({scheduleError:'恢复请求已提交，等待桌面回执；请以运行状态为准。'}); }
      return true;
    } catch(e) {
      if(current===epoch) emit({scheduleError:`恢复未确认：${e?.response?.data?.error?.code||e.message}`});
      return false;
    } finally { if(current===epoch) {emit({busy:false}); await poll();} }
  }
  return {context, poll, command, resumeSchedule, snapshot: () => state};
}
