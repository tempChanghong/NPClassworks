import {computed, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {confirmAction, promptAction} from "@/utils/actionDialog";

// The page owns shared credentials, notifications, undo and cross-section refreshes.
export function useAdminAccounts({selectedSchoolId, selectedSchool, errorMessage, successMessage,
  recentCredentials, roleName, offerUndo, bootstrap, loadRoster}) {
  const localAccounts = ref([]);
  const accountBusy = ref(false);
  const accountSearch = ref("");
  const accountStatusFilter = ref("ALL");
  const newAdminUsername = ref("");
  const newAdminName = ref("");
  const newAdminPin = ref("");
  const newAdminRole = ref("ADMIN");
  const accountStatusOptions = [
    {title: "全部状态", value: "ALL"},
    {title: "正常使用", value: "ACTIVE"},
    {title: "已停用", value: "DISABLED"},
    {title: "管理员", value: "ADMIN"},
    {title: "教师", value: "TEACHER"},
  ];
  const adminRoleOptions = computed(() => selectedSchool.value?.role === "OWNER"
    ? [
        {title: "管理员", value: "ADMIN"},
        {title: "学校所有者", value: "OWNER"},
      ]
    : [{title: "管理员", value: "ADMIN"}]);
  const filteredLocalAccounts = computed(() => {
    const keyword = accountSearch.value.toLowerCase();
    return localAccounts.value.filter((account) => {
      const matchesText = !keyword || [account.name, account.username, account.schoolRole]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
      const matchesStatus = accountStatusFilter.value === "ALL" ||
        (accountStatusFilter.value === "ACTIVE" && !account.disabled) ||
        (accountStatusFilter.value === "DISABLED" && account.disabled) ||
        (accountStatusFilter.value === "ADMIN" && Boolean(account.schoolRole)) ||
        (accountStatusFilter.value === "TEACHER" && !account.schoolRole);
      return matchesText && matchesStatus;
    });
  });

  async function loadLocalAccounts() {
    if (!selectedSchoolId.value) {
      localAccounts.value = [];
      return;
    }
    accountBusy.value = true;
    try {
      localAccounts.value = await classworksV2Api.localAccounts(selectedSchoolId.value);
    } catch (error) {
      localAccounts.value = [];
      errorMessage.value = describeApiError(error, "加载本地账号失败");
    } finally {
      accountBusy.value = false;
    }
  }

  async function createAdministrator() {
    accountBusy.value = true;
    errorMessage.value = "";
    try {
      await classworksV2Api.createLocalAdministrator(selectedSchoolId.value, {
        username: newAdminUsername.value,
        name: newAdminName.value,
        pin: newAdminPin.value,
        role: newAdminRole.value,
      });
      recentCredentials.value = [{
        school: selectedSchool.value?.school.name || "",
        name: newAdminName.value,
        username: newAdminUsername.value,
        pin: newAdminPin.value,
        workspaces: roleName(newAdminRole.value),
      }];
      newAdminUsername.value = "";
      newAdminName.value = "";
      newAdminPin.value = "";
      successMessage.value = "第二管理员已创建；可用账号管理工具栏的下载按钮导出本次凭据。";
      await Promise.all([bootstrap(), loadLocalAccounts()]);
    } catch (error) {
      errorMessage.value = describeApiError(error, "创建管理员失败");
    } finally {
      accountBusy.value = false;
    }
  }

  async function resetAccountPin(account) {
    const pin = await promptAction({
      title: "重置账号 PIN",
      message: `为 ${account.name || account.username} 设置新 PIN。保存后，该账号的其他设备将退出。`,
      label: "新 PIN（4～8位数字）",
      secret: true,
      confirmText: "重置 PIN",
      color: "warning",
      rules: [(value) => /^\d{4,8}$/.test(value) || "请输入4～8位数字"],
    });
    if (pin === null) return;
    try {
      await classworksV2Api.updateLocalAccount(selectedSchoolId.value, account.id, {pin});
      recentCredentials.value = [{
        school: selectedSchool.value?.school.name || "",
        name: account.name,
        username: account.username,
        pin,
        workspaces: "PIN 已重置",
      }];
      successMessage.value = "PIN 已重置，该账号的其他设备已退出。";
      await loadLocalAccounts();
    } catch (error) {
      errorMessage.value = describeApiError(error, "重置 PIN 失败");
    }
  }

  async function setAccountDisabled(account, disabled) {
    const action = disabled ? "停用" : "启用";
    if (!await confirmAction({
      title: `${action}账号？`,
      message: `将${action}“${account.name || account.username}”。`,
      details: disabled ? ["当前会话将被撤销", "班级分配会保留"] : [],
      confirmText: action,
      color: disabled ? "warning" : "success",
    })) return;
    const schoolId = selectedSchoolId.value;
    try {
      await classworksV2Api.updateLocalAccount(schoolId, account.id, {disabled});
      successMessage.value = `账号已${action}，可在下方短时撤销。`;
      await loadLocalAccounts();
      offerUndo({
        message: `已${action}账号“${account.name || account.username}”`,
        undo: async () => {
          await classworksV2Api.updateLocalAccount(schoolId, account.id, {disabled: !disabled});
          successMessage.value = `已撤销“账号${action}”。`;
          await loadLocalAccounts();
        },
      });
    } catch (error) {
      errorMessage.value = describeApiError(error, `${action}账号失败`);
    }
  }

  async function deactivateAccount(account) {
    if (!await confirmAction({
      title: "注销账号全部权限？",
      message: `将移除“${account.name || account.username}”在本校的管理和教学权限。`,
      details: ["账号将停用", "发布历史会保留", "此操作无法从页面撤销"],
      confirmText: "注销权限",
      color: "error",
    })) return;
    try {
      await classworksV2Api.deactivateLocalAccount(selectedSchoolId.value, account.id);
      successMessage.value = "账号已停用，学校与教学空间权限已移除。";
      await Promise.all([bootstrap(), loadLocalAccounts(), loadRoster()]);
    } catch (error) {
      errorMessage.value = describeApiError(error, "注销账号权限失败");
    }
  }

  function accountSummary(account) {
    const role = account.schoolRole ? roleName(account.schoolRole) : "教师";
    const status = account.disabled
      ? "已停用"
      : "可登录";
    const activeWorkspaces = account.workspaces.filter((workspace) => workspace.term.status === "ACTIVE");
    const lastLogin = account.lastLoginAt
      ? new Date(account.lastLoginAt).toLocaleString("zh-CN")
      : "从未登录";
    return `${role} · ${status} · 当前学期 ${activeWorkspaces.length} 个教学空间 · 最后登录 ${lastLogin}`;
  }

  watch(adminRoleOptions, (options) => {
    if (!options.some((option) => option.value === newAdminRole.value)) {
      newAdminRole.value = "ADMIN";
    }
  });


  return {
    localAccounts,
    accountBusy,
    accountSearch,
    accountStatusFilter,
    newAdminUsername,
    newAdminName,
    newAdminPin,
    newAdminRole,
    accountStatusOptions,
    adminRoleOptions,
    filteredLocalAccounts,
    loadLocalAccounts,
    createAdministrator,
    resetAccountPin,
    setAccountDisabled,
    deactivateAccount,
    accountSummary,
  };
}
