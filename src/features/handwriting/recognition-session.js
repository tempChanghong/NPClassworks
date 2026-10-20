import {CONTEXT_VERSION} from "./context.js";
import pins from "./resource-pins.js";
import {InputBufferPool} from './input-buffer-pool.js';
const workerPath = pins.files.find(file => file.path.endsWith("/ocr-worker.js")).path;
let activeOwner;
let localLockRelease;
let sequence = 0;
const requestTimeoutMs = 90000;
// One recovery bit for this page's fixed resources, shared across replacement
// sessions. Normal cancellation never requests a rehash; compute failures do.
let verifyCachedResources = false;
export class RecognitionSession {
  constructor(progress,{reuseInputs=pins.version==='r18'||pins.inputReuseVersion===1}={}) { this.progress = progress; this.generation = 0; this.worker = null; this.pending = null; this.controller = null; this.ready = false; this.inputPool=reuseInputs?new InputBufferPool():null; }
  async acquire(generation, signal) {
    if (activeOwner && activeOwner !== this) throw Error("本窗口已有手写任务，请先完成或关闭它。");
    activeOwner = this;
    if (!this.unlock && navigator.locks) {
      let unlock;
      const gate = new Promise(resolve => { unlock = resolve; this.unlock = resolve; });
      let waiting = true, cancelWait, timeout;
      let acquired;
      try {
        acquired = await new Promise((resolve, reject) => {
          const settle = (finish, value) => { if (waiting) { waiting = false; finish(value); } };
          cancelWait = () => settle(reject, Error("识别已取消，笔迹保留。"));
          timeout = setTimeout(() => settle(reject, Error("等待识别任务超时，笔迹保留，请重试。")), requestTimeoutMs);
          signal.addEventListener('abort', cancelWait, {once: true});
          if (signal.aborted) { cancelWait(); return; }
          const requestLock = () => {
            if (!waiting || signal.aborted || generation !== this.generation) { unlock(); return; }
            let released;
            const completion = new Promise(done => { released = done; });
            const finish = () => {
              if (localLockRelease === completion) localLockRelease = null;
              released();
            };
            try {
              navigator.locks.request("npclassworks-handwriting-lab-ocr", {ifAvailable: true}, async lock => {
                if (lock) localLockRelease = completion;
                // A browser lock callback may arrive after cancellation or timeout.
                // Release only its captured gate; never the immediate retry's lock.
                if (!waiting || signal.aborted || generation !== this.generation) { unlock(); return; }
                settle(resolve, Boolean(lock)); if (lock) await gate;
              }).then(finish, error => { finish(); settle(reject, error); });
            } catch (error) { finish(); settle(reject, error); }
          };
          // Resolving our old gate does not synchronously release its native
          // lock. Wait for that receipt, including after closing/reopening an
          // editor. Keep ifAvailable: never queue behind another window's work.
          if (localLockRelease) localLockRelease.then(requestLock);
          else requestLock();
        });
      } finally {
        waiting = false; clearTimeout(timeout); signal.removeEventListener('abort', cancelWait);
      }
      if (!acquired) {
        unlock();
        if (this.unlock === unlock) this.unlock = null;
        if (generation === this.generation && activeOwner === this) activeOwner = null;
        throw Error(generation !== this.generation ? "识别已取消，笔迹保留。" : "另一个窗口正在使用手写识别，请先关闭那里的手写区。");
      }
    }
  }
  async recognize(makeLines) {
    if (this.controller || this.pending) throw Error("已有识别任务，请稍候。");
    const generation = this.generation, controller = this.controller = new AbortController();
    try {
      await this.acquire(generation, controller.signal);
      if (generation !== this.generation) throw Error("识别已取消，笔迹保留。");
      let resources;
      if (!this.ready) {
        const verifyCached = verifyCachedResources;
        resources = (await this.send({type: "prepare-resources", verifyCached})).resources;
        if (generation !== this.generation) throw Error("识别已取消，笔迹保留。");
        if (verifyCached) verifyCachedResources = false;
        this.retireWorker();
      }
      if (generation !== this.generation || document.hidden) throw Error("识别已取消，笔迹保留。");
      // Preprocess only after download, so tensors do not sit through cold preparation.
      // Nested pthread shutdown is asynchronous and can overlap an immediate
      // re-open. One compute thread avoids that extra live model during teardown
      // in this integration. The FP32 model and recognition math are unchanged.
      const lines = makeLines(this.inputPool);
      if (!lines.length) throw Error("请先写下需要识别的内容。");
      const reuse=!!this.inputPool&&lines.every(line=>this.inputPool.owns(line.data.buffer));
      if(this.inputPool?.stats().borrowed&&!reuse)throw Error('识别输入缓冲来源不一致。');
      const output = await this.send({type: "recognize", lines, singleThread: true,...(reuse?{inputReuseVersion:1}:{})});
      if (generation !== this.generation) throw Error("识别已取消，笔迹保留。");
      this.ready = true;
      return {...output, resources,inputPoolStats:this.inputPool?.stats()};
    } catch (error) {
      // A canceled request can finish after an immediate retry. It must never
      // dispose the new generation's worker or release its cross-window lock.
      if (generation === this.generation) this.dispose(error.message);
      throw error;
    } finally { if (this.controller === controller) this.controller = null; }
  }
  send(message) {
    const id = ++sequence;
    const computation = message.type === "recognize";
    if (!this.worker) {
      const worker = message.type === "prepare-resources"
        ? new Worker(new URL("./resource-preparation-worker.js", import.meta.url), {type: "module", name: "handwriting-resources"})
        : new Worker(workerPath, {type: "module", name: "handwriting-ocr"});
      this.worker = worker;
      this.messageErrorHandler = () => { if (this.worker === worker) { if (computation) verifyCachedResources = true; this.dispose("识别组件通信失败，笔迹保留，请重试。"); } };
      worker.addEventListener("messageerror", this.messageErrorHandler);
    }
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { if (this.pending?.id === id) { if (computation) verifyCachedResources = true; this.dispose("识别等待超时，笔迹保留，请重试。"); } }, requestTimeoutMs);
      this.pending = {id, resolve, reject, timeout,reuse:message.inputReuseVersion===1};
      worker.onmessage = ({data}) => {
        if (this.worker !== worker || this.pending?.id !== id) return;
        const invalidReply = () => {
          if (computation) verifyCachedResources = true;
          this.dispose("识别组件响应异常，笔迹保留，请重试。");
        };
        if (!data || typeof data !== "object" || Array.isArray(data)) { invalidReply(); return; }
        if (this.pending?.id !== data.id) return;
        if (data.type === "progress") { if (typeof data.message !== "string") invalidReply(); else this.progress(data.message); return; }
        if (data.type !== "prepared" && data.type !== "result" && data.type !== "error") return;
        if (data.type !== "error" && (data.type !== (computation ? "result" : "prepared") ||
            computation && !Array.isArray(data.lines) || !computation && (!data.resources || typeof data.resources !== "object")))
        { invalidReply(); return; }
        const current = this.pending; this.pending = null; clearTimeout(current.timeout);
        if(current.reuse&&data.type==='result'){
          try{if(data.inputReuseVersion!==1)throw Error('识别输入复用回执版本不一致。');this.inputPool.accept(data.returnedInputBuffers);}catch(error){verifyCachedResources = true;delete data.returnedInputBuffers;current.reject(error);return;}
        }
        delete data.returnedInputBuffers;
        if (data.type === "error") {
          if (computation) verifyCachedResources = true;
          const message = typeof data.message === "string" && data.message ? data.message : "识别未完成，笔迹保留，请重试。";
          const detail = computation ? `${message} 可先点击“识别文字”重试，将复核本机识别资源。` : message;
          current.reject(Object.assign(Error(detail), {retrySingleThread: data.retrySingleThread}));
        }
        else current.resolve(data);
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        if (computation) verifyCachedResources = true;
        this.dispose(navigator.onLine === false
          ? "识别组件中断，当前处于离线状态。请联网后重试，笔迹保留。"
          : "识别组件中断，笔迹保留，请重试。");
      };
      try {
        this.worker.postMessage({id, protocol: 2, contextVersion: CONTEXT_VERSION,
          profile: "accurate", memoryLocal: false, sentAt: globalThis.performance.timeOrigin + globalThis.performance.now(), ...message},
        [...new Set((message.lines || []).map(line => line.data.buffer))]);
      } catch (error) { this.dispose(error.message); }
    });
  }
  dispose(message = "识别已取消，笔迹保留。") {
    this.generation++; this.controller?.abort(); this.controller = null; this.retireWorker(); this.ready = false;
    this.inputPool?.clear();
    if (this.pending) { const current = this.pending; this.pending = null; clearTimeout(current.timeout); current.reject(Error(message)); }
    this.unlock?.(); this.unlock = null; if (activeOwner === this) activeOwner = null;
  }
  retireWorker() {
    if (!this.worker) return;
    this.worker.onmessage = null; this.worker.onerror = null;
    this.worker.removeEventListener("messageerror", this.messageErrorHandler); this.messageErrorHandler = null;
    this.worker.terminate(); this.worker = null;
  }
}
