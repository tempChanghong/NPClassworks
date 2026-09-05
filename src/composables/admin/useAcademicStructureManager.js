import {computed, ref, watch} from "vue";
import {useTimedUndo} from "@/composables/useTimedUndo";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {buildSubjectRulePreset} from "@/utils/academicStructure";
import {buildConflictComparison} from "@/utils/conflictComparison";

// Called once per component setup so refs, watchers and undo cleanup retain their lifecycle.
export function useAcademicStructureManager(props) {
  const {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo} = useTimedUndo();

  const section = ref("school");
  const sectionOptions = [
    {title: "学校与学科", value: "school"},
    {title: "年级与行政班", value: "organization"},
    {title: "行政班授课规则", value: "classes"},
    {title: "走班教学班与来源", value: "groups"},
  ];
  const structure = ref(null);
  const schoolProfile = ref(null);
  const schoolForm = ref({name: "", teacherAuthMode: "LOCAL_PIN", allowOAuthTeacherLogin: false, sharedPassword: ""});
  const loading = ref(false);
  const errorMessage = ref("");
  const successMessage = ref("");
  const selectedClassId = ref("");
  const ruleModes = ref({});
  const preset = ref("custom");
  const presetFixedSubjectIds = ref([]);
  const conflictingCourseGroups = ref([]);
  const courseGroupDialog = ref(false);
  const editingCourseGroupId = ref("");
  const courseGroupForm = ref(emptyCourseGroupForm());
  const gradeDialog = ref(false);
  const editingGradeId = ref("");
  const gradeForm = ref(emptyGradeForm());
  const administrativeClassDialog = ref(false);
  const editingAdministrativeClassId = ref("");
  const administrativeClassForm = ref(emptyAdministrativeClassForm());
  const subjectDialog = ref(false);
  const editingSubjectId = ref("");
  const subjectForm = ref(emptySubjectForm());
  const batchClassDialog = ref(false);
  const batchClassForm = ref(emptyBatchClassForm());
  const impactDialog = ref(false);
  const pendingImpact = ref(null);
  const pendingImpactAction = ref(null);
  const conflictDialog = ref(false);
  const organizationConflict = ref(null);
  const organizationConflictRows = computed(() => organizationConflict.value
    ? buildConflictComparison(
      organizationConflict.value.local,
      organizationConflict.value.current,
      organizationConflict.value.fields,
    )
    : []);

  const COMMON_NAME_FIELDS = [
    {key: "name", label: "名称"},
    {key: "code", label: "代码"},
  ];

  const teacherAuthModeOptions = [
    {title: "教师个人账号 + PIN", value: "LOCAL_PIN"},
    {title: "教师账号 + 学校通用密码", value: "SHARED_PASSWORD"},
    {title: "OAuth 邮箱登录", value: "OAUTH_EMAIL"},
  ];
  const subjectCategoryOptions = [
    {title: "基础科目", value: "CORE"},
    {title: "选考科目", value: "ELECTIVE"},
    {title: "其他科目", value: "OTHER"},
  ];

  const deliveryModeOptions = [
    {title: "随行政班", value: "ADMIN_CLASS"},
    {title: "走班教学", value: "COURSE_GROUP"},
    {title: "本班不开设", value: "NOT_OFFERED"},
  ];
  const presetOptions = [
    {title: "仅必修随班，选科全部走班", value: "all-walking"},
    {title: "单科定班", value: "single-fixed"},
    {title: "三科完全定班", value: "triple-fixed"},
    {title: "全部科目随行政班", value: "all-fixed"},
    {title: "完全自定义", value: "custom"},
  ];

  const administrativeClassOptions = computed(() => (structure.value?.administrativeClasses || []).map((item) => ({
    title: `${item.name} · ${item.code}`,
    value: item.id,
  })));
  const selectedAdministrativeClass = computed(() => (structure.value?.administrativeClasses || [])
    .find((item) => item.id === selectedClassId.value));
  const electiveSubjectOptions = computed(() => (structure.value?.subjects || [])
    .filter((subject) => subject.category !== "CORE")
    .map((subject) => ({title: subject.name, value: subject.id})));
  const subjectOptions = computed(() => (structure.value?.subjects || []).map((subject) => ({
    title: `${subject.name} · ${subject.code}`,
    value: subject.id,
  })));
  const gradeOptions = computed(() => (structure.value?.grades || []).map((grade) => ({
    title: `${grade.name} · ${grade.code}`,
    value: grade.id,
  })));
  const courseGroupSourceOptions = computed(() => (structure.value?.administrativeClasses || [])
    .filter((item) => item.gradeId === courseGroupForm.value.gradeId && item.subjectRules.some(
      (rule) => rule.subjectId === courseGroupForm.value.subjectId && rule.deliveryMode === "COURSE_GROUP",
    ))
    .map((item) => ({title: `${item.name} · ${item.code}`, value: item.id})));
  const sortedCourseGroups = computed(() => [...(structure.value?.courseGroups || [])].sort((left, right) =>
    (left.subject?.sortOrder || 0) - (right.subject?.sortOrder || 0) || left.code.localeCompare(right.code)));
  const batchClassPreview = computed(() => {
    const start = Number(batchClassForm.value.startNumber);
    const end = Number(batchClassForm.value.endNumber);
    if (!batchClassForm.value.gradeId || !batchClassForm.value.namePrefix || !batchClassForm.value.codePrefix ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start >= 100) return [];
    return Array.from({length: end - start + 1}, (_, index) => {
      const number = start + index;
      return {
        gradeId: batchClassForm.value.gradeId,
        name: `${batchClassForm.value.namePrefix}${number}班`,
        code: `${batchClassForm.value.codePrefix}${String(number).padStart(2, "0")}`,
        isStudentSelectable: batchClassForm.value.isStudentSelectable,
      };
    });
  });

  function emptyCourseGroupForm() {
    return {
      name: "",
      code: "",
      gradeId: "",
      subjectId: "",
      sourceClassIds: [],
      isStudentSelectable: true,
      isActive: true,
    };
  }

  function emptyGradeForm() {
    return {name: "", code: "", sortOrder: (structure.value?.grades?.length || 0) * 10};
  }

  function emptyAdministrativeClassForm() {
    return {name: "", code: "", gradeId: "", isStudentSelectable: true, isActive: true};
  }

  function emptySubjectForm() {
    return {name: "", code: "", category: "OTHER", sortOrder: (structure.value?.subjects?.length || 0) * 10};
  }

  function emptyBatchClassForm() {
    return {gradeId: "", startNumber: 1, endNumber: 8, namePrefix: "", codePrefix: "", isStudentSelectable: true};
  }

  function administrativeClassesForGrade(gradeId) {
    return (structure.value?.administrativeClasses || [])
      .filter((item) => item.gradeId === gradeId)
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  function subjectCategoryLabel(category) {
    return {CORE: "基础科目", ELECTIVE: "选考科目", OTHER: "其他科目"}[category] || "其他科目";
  }

  function teacherAuthModeLabel(mode) {
    return teacherAuthModeOptions.find((item) => item.value === mode)?.title || String(mode || "（空）");
  }

  function subjectName(value) {
    return (structure.value?.subjects || []).find((item) => item.id === value)?.name || String(value || "（空）");
  }

  function administrativeClassNames(value) {
    const ids = Array.isArray(value) ? value : [value];
    return ids.map((id) => (structure.value?.administrativeClasses || [])
      .find((item) => item.id === id)?.name || id).join("、");
  }

  function subjectRuleSummary(modes = {}) {
    return (structure.value?.subjects || []).map((subject) => {
      const mode = modes[subject.id] || "NOT_OFFERED";
      const label = deliveryModeOptions.find((item) => item.value === mode)?.title || mode;
      return `${subject.name}：${label}`;
    });
  }

  function courseGroupSnapshot(group) {
    if (!group) return {};
    return {
      name: group.name,
      code: group.code,
      gradeId: group.gradeId,
      subjectId: group.subjectId,
      sourceClassIds: group.sourceClasses?.map((item) => item.administrativeClassId) || [],
      isStudentSelectable: group.isStudentSelectable,
      isActive: group.isActive,
    };
  }

  function administrativeClassSnapshot(administrativeClass) {
    if (!administrativeClass) return {};
    return {
      name: administrativeClass.name,
      code: administrativeClass.code,
      gradeId: administrativeClass.gradeId,
      isStudentSelectable: administrativeClass.isStudentSelectable,
      isActive: administrativeClass.isActive,
    };
  }

  function hydrateRules() {
    const rules = new Map((selectedAdministrativeClass.value?.subjectRules || [])
      .map((rule) => [rule.subjectId, rule.deliveryMode]));
    ruleModes.value = Object.fromEntries((structure.value?.subjects || [])
      .map((subject) => [subject.id, rules.get(subject.id) || "NOT_OFFERED"]));
    preset.value = "custom";
    presetFixedSubjectIds.value = [];
    conflictingCourseGroups.value = [];
  }

  async function loadStructure() {
    if (!props.schoolId || !props.termId) {
      structure.value = null;
      return;
    }
    loading.value = true;
    errorMessage.value = "";
    try {
      [structure.value, schoolProfile.value] = await Promise.all([
        classworksV2Api.managedAcademicStructure(props.schoolId, props.termId),
        classworksV2Api.managedSchoolProfile(props.schoolId),
      ]);
      schoolForm.value = {
        name: schoolProfile.value.name,
        teacherAuthMode: schoolProfile.value.teacherAuthMode,
        allowOAuthTeacherLogin: schoolProfile.value.allowOAuthTeacherLogin,
        sharedPassword: "",
      };
      if (!structure.value.administrativeClasses.some((item) => item.id === selectedClassId.value)) {
        selectedClassId.value = structure.value.administrativeClasses[0]?.id || "";
      } else {
        hydrateRules();
      }
    } catch (error) {
      structure.value = null;
      errorMessage.value = describeApiError(error, "加载授课结构失败");
    } finally {
      loading.value = false;
    }
  }

  function cloneDraft(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function handleOrganizationConflict(error, descriptor) {
    if (error.response?.data?.code !== "ORGANIZATION_VERSION_CONFLICT") return false;
    const local = cloneDraft(descriptor.local);
    subjectDialog.value = false;
    gradeDialog.value = false;
    administrativeClassDialog.value = false;
    courseGroupDialog.value = false;
    cancelImpactChange();
    await loadStructure();
    organizationConflict.value = {
      ...descriptor,
      local,
      current: descriptor.current(),
    };
    conflictDialog.value = true;
    errorMessage.value = "";
    return true;
  }

  function acceptOrganizationServerVersion() {
    conflictDialog.value = false;
    organizationConflict.value = null;
    successMessage.value = "已采用服务器最新版，本次本地修改没有写入。";
  }

  function keepOrganizationLocalDraft() {
    const conflict = organizationConflict.value;
    if (!conflict) return;
    conflict.restore(cloneDraft(conflict.local));
    conflictDialog.value = false;
    organizationConflict.value = null;
    errorMessage.value = "本地输入已恢复。再次保存会以服务器最新版为基础生成新版本。";
  }

  async function saveSchoolProfile() {
    loading.value = true;
    errorMessage.value = "";
    try {
      schoolProfile.value = await classworksV2Api.updateManagedSchoolProfile(props.schoolId, {
        ...schoolForm.value,
        expectedUpdatedAt: schoolProfile.value?.updatedAt,
      });
      schoolForm.value.sharedPassword = "";
      successMessage.value = "学校基础设置已保存。";
    } catch (error) {
      if (!await handleOrganizationConflict(error, {
        title: "比较学校基础设置",
        local: schoolForm.value,
        current: () => schoolProfile.value,
        fields: [
          {key: "name", label: "学校名称"},
          {key: "teacherAuthMode", label: "教师登录方式", format: teacherAuthModeLabel},
          {key: "allowOAuthTeacherLogin", label: "允许 OAuth 登录"},
        ],
        restore: (draft) => { schoolForm.value = draft; section.value = "school"; },
      })) {
        errorMessage.value = describeApiError(error, "保存学校基础设置失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function openSubjectDialog(subject = null) {
    editingSubjectId.value = subject?.id || "";
    subjectForm.value = subject ? {
      name: subject.name,
      code: subject.code,
      category: subject.category,
      sortOrder: subject.sortOrder,
    } : emptySubjectForm();
    subjectDialog.value = true;
  }

  async function saveSubject() {
    loading.value = true;
    errorMessage.value = "";
    try {
      if (editingSubjectId.value) {
        const existing = (structure.value?.subjects || []).find((item) => item.id === editingSubjectId.value);
        await classworksV2Api.updateManagedSubject(props.schoolId, editingSubjectId.value, {
          ...subjectForm.value,
          expectedUpdatedAt: existing?.updatedAt,
        });
      } else {
        await classworksV2Api.createManagedSubject(props.schoolId, subjectForm.value);
      }
      subjectDialog.value = false;
      successMessage.value = editingSubjectId.value ? "学科已更新。" : "学科已创建。";
      await loadStructure();
    } catch (error) {
      const subjectId = editingSubjectId.value;
      if (!await handleOrganizationConflict(error, {
        title: "比较学科设置",
        local: subjectForm.value,
        current: () => (structure.value?.subjects || []).find((item) => item.id === subjectId) || {},
        fields: [...COMMON_NAME_FIELDS, {key: "category", label: "分类", format: subjectCategoryLabel},
          {key: "sortOrder", label: "排序"}],
        restore: (draft) => {
          editingSubjectId.value = subjectId;
          subjectForm.value = draft;
          subjectDialog.value = true;
        },
      })) {
        errorMessage.value = describeApiError(error, "保存学科失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function applyPreset() {
    try {
      ruleModes.value = buildSubjectRulePreset(
        structure.value?.subjects || [],
        preset.value,
        presetFixedSubjectIds.value,
      );
      errorMessage.value = "";
    } catch (error) {
      errorMessage.value = error.message;
    }
  }

  async function saveSubjectRules(removeConflictingSources) {
    if (!selectedClassId.value) return;
    loading.value = true;
    errorMessage.value = "";
    conflictingCourseGroups.value = [];
    try {
      const subjectRules = (structure.value?.subjects || [])
        .filter((subject) => ruleModes.value[subject.id] !== "NOT_OFFERED")
        .map((subject) => ({
          subjectId: subject.id,
          deliveryMode: ruleModes.value[subject.id],
          isCompulsory: ruleModes.value[subject.id] === "ADMIN_CLASS",
        }));
      await classworksV2Api.replaceAdministrativeClassSubjectRules(
        props.schoolId,
        selectedClassId.value,
        {
          subjectRules,
          removeConflictingSources,
          expectedUpdatedAt: selectedAdministrativeClass.value?.updatedAt,
        },
      );
      successMessage.value = removeConflictingSources
        ? "授课规则已保存，冲突的走班来源关系已解除。"
        : "行政班授课规则已保存。";
      await loadStructure();
    } catch (error) {
      if (error.response?.data?.code === "SUBJECT_RULE_SOURCE_CONFLICT") {
        conflictingCourseGroups.value = error.response.data.details?.courseGroups || [];
        errorMessage.value = "请确认是否解除冲突的走班来源关系。";
      } else if (!await handleOrganizationConflict(error, {
        title: `比较 ${selectedAdministrativeClass.value?.name || "行政班"} 授课规则`,
        local: {rules: subjectRuleSummary(ruleModes.value)},
        current: () => ({rules: subjectRuleSummary(Object.fromEntries(
          (selectedAdministrativeClass.value?.subjectRules || []).map((rule) => [rule.subjectId, rule.deliveryMode]),
        ))}),
        fields: [{key: "rules", label: "授课规则", format: (value) => Array.isArray(value) ? value.join("；") : String(value)}],
        restore: (draft) => {
          ruleModes.value = Object.fromEntries((draft.rules || []).map((entry) => entry.split("：")).map(([name, mode]) => {
            const subject = (structure.value?.subjects || []).find((item) => item.name === name);
            const value = deliveryModeOptions.find((item) => item.title === mode)?.value || "NOT_OFFERED";
            return [subject?.id, value];
          }).filter(([id]) => id));
          section.value = "classes";
        },
      })) {
        errorMessage.value = describeApiError(error, "保存授课规则失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function openCourseGroupDialog(group = null) {
    const defaultGradeId = structure.value?.grades[0]?.id || "";
    const defaultSubjectId = (structure.value?.subjects || []).find((subject) =>
      (structure.value?.administrativeClasses || []).some((item) =>
        item.gradeId === defaultGradeId && item.subjectRules.some(
          (rule) => rule.subjectId === subject.id && rule.deliveryMode === "COURSE_GROUP",
        )))?.id || structure.value?.subjects[0]?.id || "";
    editingCourseGroupId.value = group?.id || "";
    courseGroupForm.value = group ? {
      name: group.name,
      code: group.code,
      gradeId: group.gradeId,
      subjectId: group.subjectId,
      sourceClassIds: group.sourceClasses.map((item) => item.administrativeClassId),
      isStudentSelectable: group.isStudentSelectable,
      isActive: group.isActive,
    } : {
      ...emptyCourseGroupForm(),
      gradeId: defaultGradeId,
      subjectId: defaultSubjectId,
    };
    courseGroupDialog.value = true;
  }

  async function loadDeactivationImpact(workspaceId, action) {
    const impact = await classworksV2Api.workspaceChangeImpact(props.schoolId, workspaceId);
    if (!impact.requiresConfirmation) return false;
    pendingImpact.value = impact;
    pendingImpactAction.value = action;
    impactDialog.value = true;
    return true;
  }

  function cancelImpactChange() {
    impactDialog.value = false;
    pendingImpact.value = null;
    pendingImpactAction.value = null;
  }

  async function confirmImpactChange() {
    const action = pendingImpactAction.value;
    if (action === "administrative-class") await saveAdministrativeClass(true);
    if (action === "course-group") await saveCourseGroup(true);
  }

  async function saveCourseGroup(confirmImpact = false) {
    loading.value = true;
    errorMessage.value = "";
    let deactivation = null;
    try {
      const input = {...courseGroupForm.value};
      if (editingCourseGroupId.value) {
        delete input.gradeId;
        const existing = (structure.value?.courseGroups || []).find((item) => item.id === editingCourseGroupId.value);
        if (!confirmImpact && existing?.isActive && input.isActive === false &&
          await loadDeactivationImpact(editingCourseGroupId.value, "course-group")) return;
        if (existing?.isActive && input.isActive === false) {
          deactivation = {type: "course-group", id: existing.id, name: existing.name};
        }
        input.confirmImpact = confirmImpact;
        input.expectedUpdatedAt = existing?.updatedAt;
        await classworksV2Api.updateManagedCourseGroup(props.schoolId, editingCourseGroupId.value, input);
      } else {
        input.termId = props.termId;
        await classworksV2Api.createManagedCourseGroup(props.schoolId, input);
      }
      cancelImpactChange();
      courseGroupDialog.value = false;
      successMessage.value = editingCourseGroupId.value ? "走班教学班已更新。" : "走班教学班已创建。";
      await loadStructure();
      if (deactivation) offerWorkspaceReactivation(deactivation);
    } catch (error) {
      if (error.response?.data?.code === "ORGANIZATION_CHANGE_CONFIRMATION_REQUIRED") {
        pendingImpact.value = error.response.data.details;
        pendingImpactAction.value = "course-group";
        impactDialog.value = true;
      } else if (!await handleOrganizationConflict(error, {
        title: "比较走班教学班设置",
        local: courseGroupForm.value,
        current: () => courseGroupSnapshot((structure.value?.courseGroups || [])
          .find((item) => item.id === editingCourseGroupId.value)),
        fields: [...COMMON_NAME_FIELDS, {key: "subjectId", label: "科目", format: subjectName},
          {key: "sourceClassIds", label: "来源行政班", format: administrativeClassNames},
          {key: "isStudentSelectable", label: "学生可选择"},
          {key: "isActive", label: "启用状态"}],
        restore: (draft) => { courseGroupForm.value = draft; courseGroupDialog.value = true; },
      })) {
        errorMessage.value = describeApiError(error, "保存走班教学班失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function openGradeDialog(grade = null) {
    editingGradeId.value = grade?.id || "";
    gradeForm.value = grade
      ? {name: grade.name, code: grade.code, sortOrder: grade.sortOrder}
      : emptyGradeForm();
    gradeDialog.value = true;
  }

  async function saveGrade() {
    loading.value = true;
    errorMessage.value = "";
    try {
      if (editingGradeId.value) {
        const existing = (structure.value?.grades || []).find((item) => item.id === editingGradeId.value);
        await classworksV2Api.updateManagedGrade(props.schoolId, editingGradeId.value, {
          ...gradeForm.value,
          expectedUpdatedAt: existing?.updatedAt,
        });
      } else {
        await classworksV2Api.createManagedGrade(props.schoolId, {...gradeForm.value, termId: props.termId});
      }
      gradeDialog.value = false;
      successMessage.value = editingGradeId.value ? "年级已更新。" : "年级已创建。";
      await loadStructure();
    } catch (error) {
      const gradeId = editingGradeId.value;
      if (!await handleOrganizationConflict(error, {
        title: "比较年级设置",
        local: gradeForm.value,
        current: () => (structure.value?.grades || []).find((item) => item.id === gradeId) || {},
        fields: [...COMMON_NAME_FIELDS, {key: "sortOrder", label: "排序"}],
        restore: (draft) => { gradeForm.value = draft; gradeDialog.value = true; },
      })) {
        errorMessage.value = describeApiError(error, "保存年级失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function openAdministrativeClassDialog(gradeId, administrativeClass = null) {
    editingAdministrativeClassId.value = administrativeClass?.id || "";
    administrativeClassForm.value = administrativeClass ? {
      name: administrativeClass.name,
      code: administrativeClass.code,
      gradeId: administrativeClass.gradeId,
      isStudentSelectable: administrativeClass.isStudentSelectable,
      isActive: administrativeClass.isActive,
    } : {...emptyAdministrativeClassForm(), gradeId};
    administrativeClassDialog.value = true;
  }

  async function saveAdministrativeClass(confirmImpact = false) {
    loading.value = true;
    errorMessage.value = "";
    let deactivation = null;
    try {
      if (editingAdministrativeClassId.value) {
        const input = {...administrativeClassForm.value};
        delete input.gradeId;
        const existing = (structure.value?.administrativeClasses || [])
          .find((item) => item.id === editingAdministrativeClassId.value);
        if (!confirmImpact && existing?.isActive && input.isActive === false &&
          await loadDeactivationImpact(editingAdministrativeClassId.value, "administrative-class")) return;
        if (existing?.isActive && input.isActive === false) {
          deactivation = {type: "administrative-class", id: existing.id, name: existing.name};
        }
        input.confirmImpact = confirmImpact;
        input.expectedUpdatedAt = existing?.updatedAt;
        await classworksV2Api.updateManagedAdministrativeClass(
          props.schoolId,
          editingAdministrativeClassId.value,
          input,
        );
      } else {
        await classworksV2Api.createManagedAdministrativeClass(
          props.schoolId,
          {...administrativeClassForm.value, termId: props.termId},
        );
      }
      cancelImpactChange();
      administrativeClassDialog.value = false;
      successMessage.value = editingAdministrativeClassId.value ? "行政班已更新。" : "行政班已创建。请继续配置授课规则。";
      await loadStructure();
      if (deactivation) offerWorkspaceReactivation(deactivation);
    } catch (error) {
      if (error.response?.data?.code === "ORGANIZATION_CHANGE_CONFIRMATION_REQUIRED") {
        pendingImpact.value = error.response.data.details;
        pendingImpactAction.value = "administrative-class";
        impactDialog.value = true;
      } else if (!await handleOrganizationConflict(error, {
        title: "比较行政班设置",
        local: administrativeClassForm.value,
        current: () => administrativeClassSnapshot((structure.value?.administrativeClasses || [])
          .find((item) => item.id === editingAdministrativeClassId.value)),
        fields: [...COMMON_NAME_FIELDS, {key: "isStudentSelectable", label: "学生可选择"},
          {key: "isActive", label: "启用状态"}],
        restore: (draft) => { administrativeClassForm.value = draft; administrativeClassDialog.value = true; },
      })) {
        errorMessage.value = describeApiError(error, "保存行政班失败");
      }
    } finally {
      loading.value = false;
    }
  }

  function offerWorkspaceReactivation(descriptor) {
    const typeLabel = descriptor.type === "course-group" ? "走班教学班" : "行政班";
    successMessage.value = `${descriptor.name}已停用，可在下方短时撤销。`;
    offerUndo({
      message: `已停用${typeLabel}“${descriptor.name}”`,
      undo: async () => {
        const collection = descriptor.type === "course-group"
          ? structure.value?.courseGroups
          : structure.value?.administrativeClasses;
        const current = (collection || []).find((item) => item.id === descriptor.id);
        const input = {isActive: true, expectedUpdatedAt: current?.updatedAt};
        if (descriptor.type === "course-group") {
          await classworksV2Api.updateManagedCourseGroup(props.schoolId, descriptor.id, input);
        } else {
          await classworksV2Api.updateManagedAdministrativeClass(props.schoolId, descriptor.id, input);
        }
        successMessage.value = `${descriptor.name}已重新启用。`;
        await loadStructure();
      },
    });
  }

  async function undoLastDeactivation() {
    errorMessage.value = "";
    try {
      await executeUndo();
    } catch (error) {
      clearUndo();
      errorMessage.value = describeApiError(error, "撤销停用失败，组织数据可能已被其他管理员修改");
    }
  }

  function applyBatchGradeDefaults() {
    const grade = (structure.value?.grades || []).find((item) => item.id === batchClassForm.value.gradeId);
    if (!grade) return;
    batchClassForm.value.namePrefix = grade.name;
    batchClassForm.value.codePrefix = `${grade.code}-C`;
  }

  function openBatchClassDialog() {
    batchClassForm.value = {
      ...emptyBatchClassForm(),
      gradeId: structure.value?.grades?.[0]?.id || "",
    };
    applyBatchGradeDefaults();
    batchClassDialog.value = true;
  }

  async function saveBatchClasses() {
    if (!batchClassPreview.value.length) return;
    loading.value = true;
    errorMessage.value = "";
    try {
      const result = await classworksV2Api.createManagedAdministrativeClassesBatch(props.schoolId, {
        termId: props.termId,
        classes: batchClassPreview.value,
      });
      batchClassDialog.value = false;
      successMessage.value = `已创建 ${result.count} 个行政班，请继续配置授课规则。`;
      await loadStructure();
    } catch (error) {
      errorMessage.value = describeApiError(error, "批量创建行政班失败");
    } finally {
      loading.value = false;
    }
  }

  watch(() => [props.schoolId, props.termId], loadStructure, {immediate: true});
  watch(selectedClassId, hydrateRules);
  watch(section, () => {
    errorMessage.value = "";
    conflictingCourseGroups.value = [];
  });

  return {
    undoOffer,
    undoBusy,
    remainingSeconds,
    clearUndo,
    section,
    sectionOptions,
    structure,
    schoolProfile,
    schoolForm,
    loading,
    errorMessage,
    successMessage,
    selectedClassId,
    ruleModes,
    preset,
    presetFixedSubjectIds,
    conflictingCourseGroups,
    courseGroupDialog,
    editingCourseGroupId,
    courseGroupForm,
    gradeDialog,
    editingGradeId,
    gradeForm,
    administrativeClassDialog,
    editingAdministrativeClassId,
    administrativeClassForm,
    subjectDialog,
    editingSubjectId,
    subjectForm,
    batchClassDialog,
    batchClassForm,
    impactDialog,
    pendingImpact,
    conflictDialog,
    organizationConflict,
    organizationConflictRows,
    teacherAuthModeOptions,
    subjectCategoryOptions,
    deliveryModeOptions,
    presetOptions,
    administrativeClassOptions,
    selectedAdministrativeClass,
    electiveSubjectOptions,
    subjectOptions,
    gradeOptions,
    courseGroupSourceOptions,
    sortedCourseGroups,
    batchClassPreview,
    administrativeClassesForGrade,
    subjectCategoryLabel,
    acceptOrganizationServerVersion,
    keepOrganizationLocalDraft,
    saveSchoolProfile,
    openSubjectDialog,
    saveSubject,
    applyPreset,
    saveSubjectRules,
    openCourseGroupDialog,
    cancelImpactChange,
    confirmImpactChange,
    saveCourseGroup,
    openGradeDialog,
    saveGrade,
    openAdministrativeClassDialog,
    saveAdministrativeClass,
    undoLastDeactivation,
    applyBatchGradeDefaults,
    openBatchClassDialog,
    saveBatchClasses,
  };
}
