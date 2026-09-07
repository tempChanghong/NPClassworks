import {computed, onUnmounted, ref} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {confirmAction} from "@/utils/actionDialog";

// One instance per admin page; shared messages and undo remain owned by the page.
export function useScreenAccountManager({selectedSchoolId, errorMessage, successMessage, offerUndo}) {
  const screenAccounts = ref([]);
  const screenBusy = ref(false);
  const screenSearch = ref("");
  const screenStatusFilter = ref("ALL");
  const newScreenName = ref("");
  const newScreenLoginCode = ref("");
  const newScreenPin = ref("");
  const newScreenAdministrativeClassId = ref("");
  const screenEditDialog = ref(false);
  const editingScreenId = ref("");
  const screenEdit = ref({name: "", loginCode: "", pin: "", administrativeClassId: ""});
  const screenEditSnapshot = ref("");
  const screenStatusOptions = [
    {title: "全部状态", value: "ALL"},
    {title: "在线", value: "ONLINE"},
    {title: "需关注", value: "DEGRADED"},
    {title: "离线", value: "OFFLINE"},
    {title: "未激活", value: "NOT_ACTIVATED"},
    {title: "已停用", value: "DISABLED"},
  ];

  const hasUnsavedChanges = computed(() => Boolean(
    newScreenName.value || newScreenLoginCode.value || newScreenPin.value || newScreenAdministrativeClassId.value ||
    screenEditDialog.value && JSON.stringify(screenEdit.value) !== screenEditSnapshot.value
  ));

  const filteredScreenAccounts = computed(() => {
    const keyword = screenSearch.value.toLowerCase();
    return screenAccounts.value.filter((screen) => {
      const matchesText = !keyword || [
        screen.name,
        screen.loginCode,
        screen.administrativeClass?.name,
        screen.administrativeClass?.code,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
      return matchesText && (screenStatusFilter.value === "ALL" || screen.dutyState === screenStatusFilter.value);
    });
  });

  async function loadScreenAccounts() {
    if (!selectedSchoolId.value) {
      screenAccounts.value = [];
      return;
    }
    screenBusy.value = true;
    try {
      screenAccounts.value = await classworksV2Api.classroomScreens(selectedSchoolId.value);
    } catch (error) {
      screenAccounts.value = [];
      errorMessage.value = describeApiError(error, "加载大屏账号失败");
    } finally {
      screenBusy.value = false;
    }
  }

  async function createScreenAccount() {
    screenBusy.value = true;
    errorMessage.value = "";
    try {
      const created = await classworksV2Api.createClassroomScreenAccount(selectedSchoolId.value, {
        name: newScreenName.value,
        loginCode: newScreenLoginCode.value,
        pin: newScreenPin.value,
        administrativeClassId: newScreenAdministrativeClassId.value,
      });
      newScreenName.value = "";
      newScreenLoginCode.value = "";
      newScreenPin.value = "";
      newScreenAdministrativeClassId.value = "";
      successMessage.value = `大屏账号 ${created.loginCode} 已创建，请在对应一体机上完成首次登录。`;
      await loadScreenAccounts();
    } catch (error) {
      errorMessage.value = describeApiError(error, "创建大屏账号失败");
    } finally {
      screenBusy.value = false;
    }
  }

  function openScreenEdit(screen) {
    editingScreenId.value = screen.id;
    screenEdit.value = {
      name: screen.name,
      loginCode: screen.loginCode || "",
      pin: "",
      administrativeClassId: screen.administrativeClassId,
    };
    screenEditSnapshot.value = JSON.stringify(screenEdit.value);
    screenEditDialog.value = true;
  }

  async function saveScreenAccount() {
    if (!editingScreenId.value) return;
    screenBusy.value = true;
    errorMessage.value = "";
    try {
      const input = {
        name: screenEdit.value.name,
        loginCode: screenEdit.value.loginCode,
        administrativeClassId: screenEdit.value.administrativeClassId,
      };
      if (screenEdit.value.pin) input.pin = screenEdit.value.pin;
      await classworksV2Api.updateClassroomScreenAccount(
        selectedSchoolId.value,
        editingScreenId.value,
        input,
      );
      screenEditDialog.value = false;
      successMessage.value = "大屏账号已更新。";
      await loadScreenAccounts();
    } catch (error) {
      errorMessage.value = describeApiError(error, "更新大屏账号失败");
    } finally {
      screenBusy.value = false;
    }
  }

  async function resetScreenDevice(screen) {
    if (!await confirmAction({
      title: "重置大屏设备绑定？",
      message: `将重置“${screen.name}”的设备绑定。`,
      details: ["原浏览器会立即退出", "需要使用原账号和 PIN 在设备上重新登录"],
      confirmText: "重置绑定",
      color: "error",
    })) return;
    screenBusy.value = true;
    try {
      await classworksV2Api.resetClassroomScreenDevice(selectedSchoolId.value, screen.id);
      successMessage.value = "旧设备登录已失效，可以在新设备上重新登录。";
      await loadScreenAccounts();
    } catch (error) {
      errorMessage.value = describeApiError(error, "重置大屏设备失败");
    } finally {
      screenBusy.value = false;
    }
  }

  async function setScreenActive(screen, isActive) {
    const action = isActive ? "启用" : "停用";
    if (!await confirmAction({
      title: `${action}大屏账号？`,
      message: `将${action}“${screen.name}”。`,
      details: isActive ? [] : ["设备将无法读取或修改作业", "班级和账号配置仍会保留"],
      confirmText: action,
      color: isActive ? "success" : "warning",
    })) return;
    const schoolId = selectedSchoolId.value;
    screenBusy.value = true;
    try {
      await classworksV2Api.updateClassroomScreenAccount(schoolId, screen.id, {isActive});
      successMessage.value = `大屏账号已${action}，可在下方短时撤销。`;
      await loadScreenAccounts();
      offerUndo({
        message: `已${action}大屏“${screen.name}”`,
        undo: async () => {
          await classworksV2Api.updateClassroomScreenAccount(schoolId, screen.id, {isActive: !isActive});
          successMessage.value = `已撤销“大屏${action}”。`;
          await loadScreenAccounts();
        },
      });
    } catch (error) {
      errorMessage.value = describeApiError(error, `${action}大屏账号失败`);
    } finally {
      screenBusy.value = false;
    }
  }

  function screenAccountSummary(screen) {
    const login = screen.loginCode ? `账号 ${screen.loginCode}` : "旧版绑定（需设置账号）";
    const device = screen.deviceFingerprint ? "设备已激活" : "等待设备首次登录";
    const status = screen.isActive ? "已启用" : "已停用";
    const heartbeat = screen.lastHeartbeatAt
      ? `心跳 ${new Date(screen.lastHeartbeatAt).toLocaleString("zh-CN")}`
      : "尚无值守心跳";
    const runtime = screen.runtimeStatus
      ? `v${screen.runtimeStatus.appVersion || "?"} · ${screen.runtimeStatus.syncState || "unknown"}${screen.runtimeStatus.pendingUploads ? ` · 待同步 ${screen.runtimeStatus.pendingUploads}` : ""}`
      : "无运行状态";
    return `${screen.administrativeClass?.name || "未绑定班级"} · ${login} · ${device} · ${status} · ${heartbeat} · ${runtime}`;
  }

  function screenDutyName(state) {
    return {
      ONLINE: "在线",
      DEGRADED: "需关注",
      OFFLINE: "离线",
      NOT_ACTIVATED: "未激活",
      DISABLED: "已停用",
    }[state] || "未知";
  }

  function screenDutyColor(state) {
    return {ONLINE: "success", DEGRADED: "warning", OFFLINE: "error", NOT_ACTIVATED: "info", DISABLED: "grey"}[state] || "grey";
  }

  async function issueScreenCommand(screen, type) {
    const action = type === "RELOAD_APP" ? "重新载入页面" : "立即刷新数据";
    if (!await confirmAction({
      title: `向大屏下发“${action}”？`,
      message: `指令将在“${screen.name}”下一次心跳时执行。`,
      confirmText: "下发指令",
    })) return;
    screenBusy.value = true;
    try {
      await classworksV2Api.issueClassroomScreenCommand(selectedSchoolId.value, screen.id, type);
      successMessage.value = `已向 ${screen.name} 下发“${action}”指令。`;
      await loadScreenAccounts();
    } catch (error) {
      errorMessage.value = describeApiError(error, "下发值守指令失败");
    } finally {
      screenBusy.value = false;
    }
  }

  let screenDutyTimer = null;
  function startDutyPolling() {
    stopDutyPolling();
    screenDutyTimer = window.setInterval(loadScreenAccounts, 30_000);
  }
  function stopDutyPolling() {
    window.clearInterval(screenDutyTimer);
    screenDutyTimer = null;
  }
  onUnmounted(stopDutyPolling);

  return {
    screenAccounts,
    screenBusy,
    screenSearch,
    screenStatusFilter,
    newScreenName,
    newScreenLoginCode,
    newScreenPin,
    newScreenAdministrativeClassId,
    screenEditDialog,
    screenEdit,
    screenStatusOptions,
    filteredScreenAccounts,
    hasUnsavedChanges,
    loadScreenAccounts,
    createScreenAccount,
    openScreenEdit,
    saveScreenAccount,
    resetScreenDevice,
    setScreenActive,
    screenAccountSummary,
    screenDutyName,
    screenDutyColor,
    issueScreenCommand,
    startDutyPolling,
    stopDutyPolling,
  };
}
