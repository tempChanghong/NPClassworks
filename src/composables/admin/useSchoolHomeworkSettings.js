import {computed, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {
  DEFAULT_HOMEWORK_QUICK_DEADLINES,
  sanitizeHomeworkQuickDeadlines,
} from "@/utils/homeworkQuickDeadlines";
import {
  DEFAULT_HOMEWORK_QUICK_INPUTS,
  sanitizeHomeworkQuickInputs,
} from "@/utils/homeworkQuickInputs";

// Both panels share one page-owned instance, including the saved snapshot.
export function useSchoolHomeworkSettings({selectedSchoolId, errorMessage, successMessage}) {
  const loading = ref(false);
  const saving = ref(false);
  const loadedSchoolId = ref("");
  let requestVersion = 0;
  const homeworkSettingsBusy = computed(() => loading.value || saving.value);
  const homeworkSettingsReady = computed(() => Boolean(selectedSchoolId.value)
    && loadedSchoolId.value === selectedSchoolId.value && !loading.value);
  watch(selectedSchoolId, () => {
    requestVersion++;
    loadedSchoolId.value = "";
    homeworkSettingsSnapshot.value = "";
    loading.value = false;
    saving.value = false;
  }, {flush: "sync"});
  const homeworkQuickDeadlines = ref(DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item})));
  const homeworkQuickInputs = ref(DEFAULT_HOMEWORK_QUICK_INPUTS.map((item) => ({...item, subjectIds: []})));
  const homeworkQuickInputSubjects = ref([]);
  const homeworkSettingsSnapshot = ref("");
  const quickDeadlineDayOptions = [
    ...Array.from({length: 15}, (_, dayOffset) => ({
    title: dayOffset === 0 ? "当天" : dayOffset === 1 ? "明天" : dayOffset === 2 ? "后天" : `${dayOffset}天后`,
      value: `relative:${dayOffset}`,
    })),
    ...[1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      title: `下${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday]}`,
      value: `next-weekday:${weekday}`,
    })),
  ];
  const quickInputModeOptions = [
    {title: "插入文字", value: "INLINE"},
    {title: "换行", value: "NEW_LINE"},
  ];

  function homeworkSettingsValue() {
    return JSON.stringify({
      quickDeadlines: homeworkQuickDeadlines.value,
      quickInputs: homeworkQuickInputs.value,
    });
  }

  async function loadSchoolHomeworkSettings() {
    const schoolId = selectedSchoolId.value;
    const version = ++requestVersion;
    const current = () => version === requestVersion && schoolId === selectedSchoolId.value;
    loadedSchoolId.value = "";
    homeworkQuickInputSubjects.value = [];
    saving.value = false;
    if (!schoolId) {
      resetHomeworkQuickDeadlines();
      resetHomeworkQuickInputs();
      homeworkSettingsSnapshot.value = homeworkSettingsValue();
      loading.value = false;
      return;
    }
    loading.value = true;
    errorMessage.value = "";
    try {
      const [settings, subjects] = await Promise.all([
        classworksV2Api.schoolHomeworkSettings(schoolId),
        classworksV2Api.subjects(schoolId),
      ]);
      if (!current()) return;
      homeworkQuickDeadlines.value = sanitizeHomeworkQuickDeadlines(settings.quickDeadlines);
      homeworkQuickInputs.value = sanitizeHomeworkQuickInputs(settings.quickInputs);
      homeworkQuickInputSubjects.value = subjects;
      homeworkSettingsSnapshot.value = homeworkSettingsValue();
      loadedSchoolId.value = schoolId;
    } catch (error) {
      if (current()) errorMessage.value = describeApiError(error, "加载作业快捷时间失败");
    } finally {
      if (current()) loading.value = false;
    }
  }

  function addHomeworkQuickDeadline() {
    if (homeworkQuickDeadlines.value.length >= 8) return;
    homeworkQuickDeadlines.value.push({label: "新时间", dayOffset: 1, time: "17:30"});
  }

  function quickDeadlineDateValue(preset) {
    return preset.dateRule === "next-weekday"
      ? `next-weekday:${preset.weekday}`
      : `relative:${preset.dayOffset}`;
  }

  function updateQuickDeadlineDateRule(preset, value) {
    const [rule, rawValue] = String(value).split(":");
    if (rule === "next-weekday") {
      preset.dateRule = "next-weekday";
      preset.weekday = Number(rawValue);
      delete preset.dayOffset;
      return;
    }
    delete preset.dateRule;
    delete preset.weekday;
    preset.dayOffset = Number(rawValue);
  }

  function resetHomeworkQuickDeadlines() {
    homeworkQuickDeadlines.value = DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item}));
  }

  function addHomeworkQuickInput() {
    if (homeworkQuickInputs.value.length >= 64) return;
    homeworkQuickInputs.value.push({label: "新词", text: "", group: "常用", subjectIds: [], insertMode: "INLINE"});
  }

  function resetHomeworkQuickInputs() {
    homeworkQuickInputs.value = DEFAULT_HOMEWORK_QUICK_INPUTS.map((item) => ({...item, subjectIds: []}));
  }

  async function saveSchoolHomeworkSettings() {
    if (homeworkSettingsBusy.value || !homeworkSettingsReady.value) return;
    const valid = homeworkQuickDeadlines.value.length >= 1 && homeworkQuickDeadlines.value.length <= 8 &&
      homeworkQuickDeadlines.value.every((preset) => (
        preset.label.trim() && preset.label.trim().length <= 16 &&
        (preset.dateRule === "next-weekday"
          ? Number.isInteger(preset.weekday) && preset.weekday >= 0 && preset.weekday <= 6
          : Number.isInteger(preset.dayOffset) && preset.dayOffset >= 0 && preset.dayOffset <= 14) &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preset.time)
      ));
    if (!valid) {
      errorMessage.value = "请填写1至8个有效快捷时间，名称不超过16字，并选择有效的相对日期或下周星期。";
      return;
    }
    const quickInputsValid = homeworkQuickInputs.value.length <= 64 && homeworkQuickInputs.value.every((item) => (
      item.label?.trim() && item.label.trim().length <= 16 &&
      String(item.text || "").trim().length <= 120 && String(item.group || "").trim().length <= 16 &&
      ["INLINE", "NEW_LINE"].includes(item.insertMode) &&
      (item.insertMode === "NEW_LINE" || String(item.text || "").trim()) &&
      Array.isArray(item.subjectIds)
    ));
    if (!quickInputsValid) {
      errorMessage.value = "请检查快捷词：按钮名必填且不超过16字，普通快捷词必须填写插入内容。";
      return;
    }
    saving.value = true;
    errorMessage.value = "";
    successMessage.value = "";
    const schoolId = selectedSchoolId.value;
    const version = ++requestVersion;
    const current = () => version === requestVersion && schoolId === selectedSchoolId.value;
    const submitted = homeworkSettingsValue();
    try {
      const settings = await classworksV2Api.updateSchoolHomeworkSettings(schoolId, JSON.parse(submitted));
      if (!current()) return;
      const saved = {
        quickDeadlines: sanitizeHomeworkQuickDeadlines(settings.quickDeadlines),
        quickInputs: sanitizeHomeworkQuickInputs(settings.quickInputs),
      };
      const unchanged = homeworkSettingsValue() === submitted;
      if (unchanged) {
        homeworkQuickDeadlines.value = saved.quickDeadlines;
        homeworkQuickInputs.value = saved.quickInputs;
      }
      homeworkSettingsSnapshot.value = JSON.stringify(saved);
      successMessage.value = unchanged ? "全校作业快捷时间和快捷词已保存；教师端和大屏刷新后生效。"
        : "本次提交已保存；之后输入的修改仍未保存，请再次保存。";
    } catch (error) {
      if (current()) errorMessage.value = describeApiError(error, "保存作业快捷时间失败");
    } finally {
      if (current()) saving.value = false;
    }
  }


  return {
    homeworkSettingsBusy,
    homeworkSettingsReady,
    homeworkQuickDeadlines,
    homeworkQuickInputs,
    homeworkQuickInputSubjects,
    homeworkSettingsSnapshot,
    quickDeadlineDayOptions,
    quickInputModeOptions,
    homeworkSettingsValue,
    loadSchoolHomeworkSettings,
    addHomeworkQuickDeadline,
    quickDeadlineDateValue,
    updateQuickDeadlineDateRule,
    resetHomeworkQuickDeadlines,
    addHomeworkQuickInput,
    resetHomeworkQuickInputs,
    saveSchoolHomeworkSettings,
  };
}
