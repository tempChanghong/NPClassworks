<template>
  <div
    class="handwriting-launcher"
    :data-field="field"
  >
    <v-btn
      :disabled="target.disabled"
      prepend-icon="mdi-draw"
      variant="tonal"
      @pointerdown.prevent
      @click="open()"
    >
      手写输入{{ field === 'content' ? '必做正文' : '选做正文' }}
    </v-btn>
    <v-btn
      v-if="lastEdit"
      variant="text"
      @click="undoInsert"
    >
      撤销本次插入
    </v-btn>
    <span
      role="status"
      class="text-medium-emphasis"
    >{{ notice }}</span>
    <v-dialog
      v-model="opened"
      fullscreen
      persistent
      :retain-focus="true"
      :transition="false"
    >
      <v-card
        class="handwriting-workspace"
        :data-busy="busy"
        :data-worker="session?.ready || false"
      >
        <header>
          <div><small>{{ label }}</small><h2>手写{{ field === 'content' ? '必做正文' : '选做正文' }}</h2></div>
          <v-btn
            variant="text"
            @click="close"
          >
            返回录入
          </v-btn>
        </header>
        <div class="handwriting-body">
          <p class="text-medium-emphasis">
            每行写一段，写好后识别。确认只插入文字，不保存笔迹。
          </p>
          <canvas
            ref="canvas"
            class="handwriting-canvas"
            width="1200"
            height="480"
            aria-label="手写区域，三行"
            :style="{pointerEvents: busy ? 'none' : ''}"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up"
            @pointercancel="cancelPointer"
            @lostpointercapture="cancelPointer"
          />
          <div class="handwriting-toolbar">
            <v-btn
              :disabled="busy || !strokeCount"
              variant="tonal"
              @click="undoStroke"
            >
              撤销一笔
            </v-btn>
            <v-btn
              :disabled="busy || !strokeCount"
              variant="text"
              @click="clearInk"
            >
              清空笔迹
            </v-btn>
            <v-spacer />
            <span>{{ strokeCount }} 笔</span>
            <v-btn
              :disabled="busy || !strokeCount || invalidated"
              color="primary"
              @click="recognize"
            >
              识别文字
            </v-btn>
            <v-btn
              v-if="busy"
              variant="text"
              @click="cancelRecognition"
            >
              取消识别
            </v-btn>
          </div>
          <p
            role="status"
            class="handwriting-status"
          >
            {{ status }}
          </p>
          <v-alert
            v-if="invalidated"
            type="warning"
            variant="tonal"
          >
            编辑范围已变化，未向新班级或新作业插入结果。请复制需要保留的文字，再返回重开。
          </v-alert>
          <v-textarea
            ref="resultInput"
            v-model="result"
            class="handwriting-result"
            label="识别结果，可直接修改"
            rows="3"
            auto-grow
            :max-rows="8"
            variant="outlined"
            :disabled="busy"
          />
          <details
            v-if="choices.length"
            class="handwriting-choices"
          >
            <summary>识别候选</summary><v-btn
              v-for="choice in choices"
              :key="choice"
              :disabled="busy || resultEdited"
              :variant="choice === result ? 'tonal' : 'text'"
              @click="chooseResult(choice)"
            >
              {{ choice }}
            </v-btn>
          </details>
          <small>{{ offline ? '识别资源已可离线使用' : `识别资源待确认，识别时按需准备，完整约 ${resourceMiB} MiB；普通录入不加载模型` }} · 识别在本机完成，不上传笔迹</small>
        </div>
        <footer>
          <span>插入后仍需在原页面保存作业</span>
          <v-btn
            :disabled="busy || invalidated || !result.trim()"
            color="primary"
            size="large"
            @click="insert"
          >
            插入正文
          </v-btn>
        </footer>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, watch} from "vue";
import {registerAppReloadBlocker} from "@/utils/appReloadProtection";
import {WIDTH, HEIGHT, ROW_HEIGHT, rowBounds} from "./geometry.js";
import {prepareLine} from "./prepare-input.js";
import {RecognitionSession} from "./recognition-session.js";
import {offlineReady, resourceBytes} from "./resource-manager.js";
import {LineResultCache} from "./line-result-cache.js";
const emit = defineEmits(["recognized"]);
const props = defineProps({target: {type: Object, required: true}, field: {type: String, required: true}, label: {type: String, default: ""}});
const opened = ref(false), busy = ref(false), canvas = ref(null), resultInput = ref(null), result = ref(""), notice = ref(""), status = ref("");
const invalidated = ref(false), strokeCount = ref(0), offline = ref(false), choices = ref([]), resultEdited = ref(false);
const session = shallowRef(null), lastEdit = shallowRef(null);
const rowResults = new LineResultCache(), rowRevisions = [0, 0, 0];
const resourceMiB = Math.ceil(resourceBytes / (1024 * 1024));
const pointLimitNotice = "笔迹较多，已达到本段上限，请先识别并插入这一段。";
const strokeLimitNotice = "笔画较多，请先识别并插入这一段。";
let snapshot, strokes = [], pointCount = 0, active, frame = 0, idleTimer, operation = 0, recognizedInk = -1, inkVersion = 0, resettingResult = false, applyingText = false;
const scope = computed(() => props.target.scope);
watch([scope, () => props.target.value], () => {
  if (lastEdit.value && (lastEdit.value.scope !== props.target.scope || lastEdit.value.after !== props.target.value)) lastEdit.value = null;
  // Even if text is later restored to the same value, the old asynchronous
  // result no longer owns this edit. Do not invalidate our own confirmed write.
  if (opened.value && !applyingText) { invalidated.value = true; rowResults.reset(); cancelRecognition(); }
}, {flush: "sync"});
watch(result, () => { if (!resettingResult) resultEdited.value = true; }, {flush: "sync"});
const releaseReloadBlocker = registerAppReloadBlocker(() => opened.value && (strokeCount.value || result.value || busy.value) ? "手写区有未确认内容，请先插入文字或返回录入。" : "");
function idle() {
  clearTimeout(idleTimer);
  if (!session.value?.ready || busy.value || active) return;
  idleTimer = setTimeout(() => { session.value?.dispose(); status.value = "识别资源已空闲释放，笔迹与文字保留。"; }, 15000);
}
function finishPointer() {
  const pointer = active?.id; active = null;
  if (pointer !== undefined && canvas.value?.hasPointerCapture(pointer)) canvas.value.releasePointerCapture(pointer);
}
function render() {
  frame = 0; const context = canvas.value?.getContext("2d"); if (!context) return;
  context.lineWidth = 4.5; context.lineCap = context.lineJoin = "round"; context.strokeStyle = context.fillStyle = "#192e25";
  for (const stroke of strokes) {
    if (!stroke.painted) { const p = stroke.points[0]; context.beginPath(); context.arc(p.x, p.y, 2.25, 0, Math.PI * 2); context.fill(); stroke.painted = 1; }
    if (stroke.painted < stroke.points.length) { context.beginPath(); const start = stroke.points[stroke.painted - 1]; context.moveTo(start.x, start.y); for (let i = stroke.painted; i < stroke.points.length; i++) context.lineTo(stroke.points[i].x, stroke.points[i].y); context.stroke(); stroke.painted = stroke.points.length; }
  }
}
function point(event, row, rect) {
  return {x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)),
    y: Math.max(row * ROW_HEIGHT + 3, Math.min((row + 1) * ROW_HEIGHT - 3, (event.clientY - rect.top) * HEIGHT / rect.height))};
}
function append(event, rect) {
  if (!active || pointCount >= 25000) return;
  active.stroke.points.push(point(event, active.stroke.row, rect || canvas.value.getBoundingClientRect())); pointCount++; inkVersion++;
  if (pointCount === 25000) status.value = pointLimitNotice;
  if (!frame) frame = window.requestAnimationFrame(render);
}
function down(event) {
  if (busy.value || active || !event.isPrimary || event.button > 0) return;
  if (strokes.length >= 500) { status.value = strokeLimitNotice; return; }
  event.preventDefault();
  const rect = canvas.value.getBoundingClientRect(), row = Math.max(0, Math.min(2, Math.floor((event.clientY - rect.top) / rect.height * 3)));
  if (pointCount >= 25000) { status.value = pointLimitNotice; return; }
  // Only accepted ink pauses idle disposal. A capped touch has no active
  // pointer to reschedule it on release, so leave the existing timer running.
  clearTimeout(idleTimer);
  const stroke = {row, points: [point(event, row, rect)], painted: 0}; strokes.push(stroke); pointCount++; active = {id: event.pointerId, stroke}; strokeCount.value = strokes.length; inkVersion++;
  if (pointCount === 25000) status.value = pointLimitNotice;
  rowRevisions[row]++;
  try { canvas.value.setPointerCapture(event.pointerId); } catch { finishPointer(); idle(); }
  if (!frame) frame = window.requestAnimationFrame(render);
}
function move(event) {
  if (active?.id !== event.pointerId || pointCount >= 25000) return;
  const samples = event.getCoalescedEvents?.(), rect = canvas.value.getBoundingClientRect();
  if (samples?.length) {
    for (const sample of samples) { append(sample, rect); if (pointCount >= 25000) break; }
  } else append(event, rect);
}
function up(event) { if (active?.id !== event.pointerId) return; append(event); finishPointer(); idle(); }
function cancelPointer(event) { if (active?.id === event.pointerId) { finishPointer(); idle(); } }
function clearLimitNotice() {
  // Undo/clear release capacity. Keep unrelated recognition errors visible.
  if (status.value === pointLimitNotice || status.value === strokeLimitNotice) status.value = "可继续书写，写好后点击识别。";
}
function clearInk() { finishPointer(); if (frame) window.cancelAnimationFrame(frame); frame = 0; strokes = []; pointCount = 0; strokeCount.value = 0; inkVersion++; rowResults.reset(); canvas.value?.getContext("2d").clearRect(0, 0, WIDTH, HEIGHT); clearLimitNotice(); idle(); }
// Undo repaints the whole canvas. Antialiasing at segment joins can change even
// in other rows, so invalidate all rows instead of guessing from the removed row.
function undoStroke() { finishPointer(); if (frame) window.cancelAnimationFrame(frame); frame = 0; pointCount -= strokes.pop()?.points.length || 0; inkVersion++; rowResults.reset(); strokeCount.value = strokes.length; canvas.value.getContext("2d").clearRect(0, 0, WIDTH, HEIGHT); for (const s of strokes) s.painted = 0; render(); clearLimitNotice(); idle(); }
async function open(captured = null) {
  try {
    const current = props.target.capture();
    if (captured && (captured.scope !== current.scope || captured.value !== current.value)) throw Error('编辑范围已变化，请重新打开手写输入。');
    snapshot = captured || current;
  } catch (error) { notice.value = error.message; return; }
  operation++; invalidated.value = false; offline.value = false; opened.value = true; notice.value = ""; status.value = "写好后点击识别，首次准备可能较慢。";
  resettingResult = true; result.value = ""; resettingResult = false; resultEdited.value = false; choices.value = []; recognizedInk = -1;
  session.value = new RecognitionSession(message => { status.value = message; });
  await nextTick(); clearInk(); const current = operation;
  const ready = await offlineReady(); if (current === operation && opened.value) offline.value = ready;
}
defineExpose({open});
function cancelRecognition() { operation++; session.value?.dispose(); busy.value = false; status.value = "识别已停止，笔迹与文字保留。"; }
function chooseResult(choice) {
  if (busy.value || resultEdited.value) return;
  // Comparing generated candidates is not a manual edit. Keep the original
  // candidate available, while still protecting text typed by the user.
  resettingResult = true; result.value = choice; resettingResult = false;
}
async function close() {
  if ((strokeCount.value || result.value) && !window.confirm("返回录入会丢弃尚未插入的笔迹与结果，已插入的文字保留。是否返回？")) return;
  cancelRecognition(); clearTimeout(idleTimer); clearInk(); opened.value = false; snapshot = null;
}
async function recognize() {
  if (busy.value || invalidated.value) return;
  finishPointer(); if (frame) window.cancelAnimationFrame(frame); render(); clearTimeout(idleTimer);
  const current = ++operation, start = window.performance.now(), version = inkVersion; busy.value = true;
  try {
    let preprocessMs = 0;
    const plan = rowResults.plan(rowBounds(strokes), rowRevisions);
    if (plan.missing.length && !session.value.ready) offline.value = false;
    const out = plan.missing.length ? await session.value.recognize(inputPool => { const before = window.performance.now(); const lines = plan.missing.map(b => prepareLine(canvas.value, b, "accurate", inputPool)).filter(Boolean); preprocessMs += window.performance.now() - before; return lines; })
      : {lines: [], cold: false, loadMs: 0, runtimeThreads: 0};
    if (current !== operation || !opened.value || invalidated.value) return;
    out.lines = rowResults.finish(plan, out.lines);
    resettingResult = true; result.value = out.lines.map(l => l.text).join("\n"); resettingResult = false; resultEdited.value = false; recognizedInk = version;
    const candidates = out.lines.length === 1 ? [...new Set([result.value, ...out.lines[0].candidates])].filter(Boolean).slice(0, 5) : [];
    choices.value = candidates.length > 1 ? candidates : [];
    if (out.resources) offline.value = out.resources.offline;
    status.value = out.resources?.warning || (result.value ? (plan.missing.length ? "识别完成，可修改后插入正文。" : "笔迹未变化，沿用上次识别结果，可修改后插入正文。") : "未识别出文字，请继续书写后重试。");
    const metrics = {totalMs: window.performance.now() - start,
      preprocessMs, cold: out.cold, loadMs: out.loadMs, runtimeThreads: out.runtimeThreads,
      inferredRows: plan.missing.length, reusedRows: out.lines.filter(l => l.reused).length,
      inputPoolStats:out.inputPoolStats||null,
      modelMs: out.lines.reduce((n, l) => n + l.modelMs, 0), decodeMs: out.lines.reduce((n, l) => n + l.decodeMs, 0)};
    // Timing only: no recognized text, ink or input buffers escape the editor.
    emit("recognized", metrics);
    await nextTick();
    if (current === operation && result.value) resultInput.value?.$el?.scrollIntoView({block: "nearest"});
  } catch (error) { if (current === operation) status.value = error.message; }
  finally { if (current === operation) { busy.value = false; idle(); } }
}
async function insert() {
  if (busy.value || invalidated.value) return;
  if (strokeCount.value && recognizedInk !== inkVersion && !window.confirm("当前文字未对应最新笔迹。仍插入当前文字？新增笔迹不会保存。")) return;
  try {
    applyingText = true;
    try { lastEdit.value = props.target.apply(snapshot, result.value); }
    finally { applyingText = false; }
    session.value?.dispose(); clearTimeout(idleTimer); operation++; clearInk(); opened.value = false; snapshot = null;
    notice.value = "文字已插入，尚未保存作业。";
    await nextTick(); props.target.restoreSelection(lastEdit.value);
  } catch (error) { status.value = error.message; }
}
function undoInsert() { try { props.target.undo(lastEdit.value); lastEdit.value = null; notice.value = "已撤销本次插入。"; } catch (error) { notice.value = error.message; } }
function background() { if (document.hidden && opened.value) { finishPointer(); cancelRecognition(); } }
function unload(event) { if (opened.value && (strokeCount.value || result.value)) { event.preventDefault(); event.returnValue = ""; } }
document.addEventListener("visibilitychange", background); window.addEventListener("beforeunload", unload);
onBeforeUnmount(() => { operation++; finishPointer(); if (frame) window.cancelAnimationFrame(frame); clearTimeout(idleTimer); session.value?.dispose(); releaseReloadBlocker(); document.removeEventListener("visibilitychange", background); window.removeEventListener("beforeunload", unload); });
</script>

