import {ref} from "vue";
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
  const homeworkSettingsBusy = ref(false);
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
    if (!selectedSchoolId.value) {
      resetHomeworkQuickDeadlines();
      resetHomeworkQuickInputs();
      homeworkQuickInputSubjects.value = [];
      homeworkSettingsSnapshot.value = homeworkSettingsValue();
      return;
    }
    homeworkSettingsBusy.value = true;
    try {
      const [settings, subjects] = await Promise.all([
        classworksV2Api.schoolHomeworkSettings(selectedSchoolId.value),
        classworksV2Api.subjects(selectedSchoolId.value),
      ]);
      homeworkQuickDeadlines.value = sanitizeHomeworkQuickDeadlines(settings.quickDeadlines);
      homeworkQuickInputs.value = sanitizeHomeworkQuickInputs(settings.quickInputs);
      homeworkQuickInputSubjects.value = subjects;
      homeworkSettingsSnapshot.value = homeworkSettingsValue();
    } catch (error) {
      errorMessage.value = describeApiError(error, "加载作业快捷时间失败");
    } finally {
      homeworkSettingsBusy.value = false;
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
    homeworkSettingsBusy.value = true;
    errorMessage.value = "";
    try {
      const settings = await classworksV2Api.updateSchoolHomeworkSettings(selectedSchoolId.value, {
        quickDeadlines: homeworkQuickDeadlines.value,
        quickInputs: homeworkQuickInputs.value,
      });
      homeworkQuickDeadlines.value = sanitizeHomeworkQuickDeadlines(settings.quickDeadlines);
      homeworkQuickInputs.value = sanitizeHomeworkQuickInputs(settings.quickInputs);
      homeworkSettingsSnapshot.value = homeworkSettingsValue();
      successMessage.value = "全校作业快捷时间和快捷词已保存；教师端和大屏刷新后生效。";
    } catch (error) {
      errorMessage.value = describeApiError(error, "保存作业快捷时间失败");
    } finally {
      homeworkSettingsBusy.value = false;
    }
  }


  return {
    homeworkSettingsBusy,
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
