import {spawn} from 'node:child_process';

// Re-discover the browser's process group before EVERY sample. Edge can spawn
// utility processes after model load; a frozen PID list silently omits them.
export async function startBrowserProcessSampler(control,onSample){
  const child=spawn('powershell.exe',['-NoProfile','-Command',`[Console]::WriteLine('READY'); while($null -ne ($line=[Console]::In.ReadLine())) { try { $idsToRead=@($line.Split(',') | ForEach-Object {[int]$_}); $rows=@(Get-Process -Id $idsToRead -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64,WorkingSet64); [Console]::WriteLine((ConvertTo-Json -Compress -Depth 4 -InputObject @{time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();processes=$rows})); } catch { [Console]::WriteLine((ConvertTo-Json -Compress -InputObject @{error=$_.Exception.Message})); } }`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let ready,buffer='',waiting,tail=Promise.resolve(),stopped=false;
  const started=new Promise((ok,no)=>{const timer=setTimeout(()=>{child.kill();no(Error('Process sampler failed to start'));},5000);ready=()=>{clearTimeout(timer);ok();};child.once('error',error=>{clearTimeout(timer);no(error);});});
  const rejectPending=error=>{if(!waiting)return;const current=waiting;waiting=null;clearTimeout(current.timer);current.no(error);};
  child.stdin.on('error',rejectPending);child.on('exit',()=>rejectPending(Error('Process sampler exited')));
  child.stdout.on('data',chunk=>{buffer+=chunk;let position;while((position=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,position).trim();buffer=buffer.slice(position+1);if(line==='READY'){ready();continue;}if(waiting){const {ok,no,timer}=waiting;waiting=null;clearTimeout(timer);try{const value=JSON.parse(line);if(value.error)no(Error(value.error));else ok(value);}catch(error){no(error);}}}});
  await started;
  const sample=()=>{
    const result=tail.then(async()=>{
      if(stopped)throw Error('Sampler is stopped');
      const info=(await control.send('SystemInfo.getProcessInfo')).processInfo;
      const response=await new Promise((ok,no)=>{waiting={ok,no,timer:setTimeout(()=>{waiting=null;no(Error('Process sampler timeout'));},5000)};child.stdin.write(info.map(p=>p.id).join(',')+'\n');});
      const value={...response,info,bytes:response.processes.reduce((n,p)=>n+p.PrivateMemorySize64,0)};onSample(value);return value;
    });tail=result.catch(()=>{});return result;
  };
  return {sample,async stop(){await tail;stopped=true;child.stdin.end();child.kill();}};
}
