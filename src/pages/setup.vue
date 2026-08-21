<template>
  <v-app>
    <v-main class="setup-page">
      <v-container
        class="py-8 py-md-12"
        max-width="1120"
      >
        <div class="setup-heading mb-7">
          <v-avatar
            color="primary"
            size="58"
            variant="tonal"
          >
            <v-icon
              icon="mdi-server-cog-outline"
              size="32"
            />
          </v-avatar>
          <div>
            <div class="text-overline text-primary font-weight-bold">
              NPCLASSWORKS KV
            </div>
            <h1 class="text-h4 font-weight-bold">
              实例首次配置
            </h1>
            <p class="text-body-1 text-medium-emphasis mb-0">
              先建立可登录的学校，再按实际掌握的资料逐步补充班级、教师和大屏。
            </p>
          </div>
        </div>

        <v-alert
          v-if="errorMessage"
          class="mb-5"
          closable
          type="error"
          variant="tonal"
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading"
          class="mb-5"
          indeterminate
          rounded
        />

        <v-card
          v-if="status?.state === 'COMPLETED'"
          class="rounded-xl pa-3"
          elevation="3"
        >
          <v-empty-state
            icon="mdi-check-decagram-outline"
            text="初始化入口已经锁定。请使用学校管理员账号继续管理学校。"
            title="实例已经完成初始化"
          >
            <template #actions>
              <v-btn
                color="primary"
                prepend-icon="mdi-view-dashboard-outline"
                to="/classworks-admin"
              >
                进入学校管理
              </v-btn>
              <v-btn
                prepend-icon="mdi-home-outline"
                to="/"
              >
                返回作业板
              </v-btn>
            </template>
          </v-empty-state>
        </v-card>

        <template v-else>
          <v-card
            class="rounded-xl mb-5"
            elevation="2"
          >
            <v-card-text class="pa-4 pa-md-5">
              <div class="stage-track">
                <button
                  v-for="(item, index) in stageItems"
                  :key="item.value"
                  class="stage-item"
                  :class="{active: stage === item.value, done: stage > item.value}"
                  :disabled="item.value > unlockedStage"
                  type="button"
                  @click="stage = item.value"
                >
                  <span>{{ stage > item.value ? '✓' : index + 1 }}</span><div>{{ item.title }}</div>
                </button>
              </div>
            </v-card-text>
          </v-card>

          <v-window v-model="stage">
            <v-window-item :value="1">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  服务检查与初始化授权
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-list
                    class="check-list rounded-lg mb-5"
                    lines="two"
                  >
                    <v-list-item
                      v-for="check in status?.checks || []"
                      :key="check.code"
                      :prepend-icon="check.ok ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'"
                      :title="check.message"
                    >
                      <template #append>
                        <v-chip
                          :color="check.ok ? 'success' : check.severity === 'ERROR' ? 'error' : 'warning'"
                          size="small"
                          variant="tonal"
                        >
                          {{ check.ok ? '正常' : check.severity === 'ERROR' ? '必须处理' : '建议处理' }}
                        </v-chip>
                      </template>
                    </v-list-item>
                  </v-list>
                  <v-alert
                    v-if="status?.state === 'CONFIGURING'"
                    class="mb-4"
                    type="info"
                    variant="tonal"
                  >
                    检测到未完成的初始化。重新验证部署密钥即可从已有数据继续，不会重复创建学校。
                  </v-alert>
                  <v-alert
                    v-if="!status?.canStart"
                    class="mb-4"
                    type="warning"
                    variant="tonal"
                  >
                    请部署人员先补齐服务器环境变量并重启 KV 后端，然后刷新本页。
                  </v-alert>
                  <v-text-field
                    v-model="setupKey"
                    :append-inner-icon="showSetupKey ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    autocomplete="off"
                    label="BOOTSTRAP_SETUP_KEY"
                    :type="showSetupKey ? 'text' : 'password'"
                    variant="outlined"
                    @click:append-inner="showSetupKey = !showSetupKey"
                  />
                  <div class="text-body-2 text-medium-emphasis mb-5">
                    该密钥来自服务器部署环境，只建立15分钟的安装会话，不会成为日常登录密码。
                  </div>
                  <v-btn
                    color="primary"
                    :disabled="!setupKey || !status?.canStart"
                    :loading="saving"
                    size="large"
                    @click="authorizeSetup"
                  >
                    验证并继续
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="2">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  管理员、学校与学期
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    v-if="status?.counts?.localAccounts"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    检测到已创建的首位管理员。本步骤会保留该账号，并补齐学校和学期。
                  </v-alert>
                  <v-row>
                    <v-col
                      cols="12"
                      md="7"
                    >
                      <v-text-field
                        v-model.trim="form.schoolName"
                        label="学校名称"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="5"
                    >
                      <v-text-field
                        v-model.trim="form.schoolCode"
                        hint="部署后不建议修改，例如 TJ2HS"
                        label="学校代码"
                        persistent-hint
                        variant="outlined"
                      />
                    </v-col>
                    <template v-if="!status?.counts?.localAccounts">
                      <v-col
                        cols="12"
                        md="4"
                      >
                        <v-text-field
                          v-model.trim="form.administratorName"
                          label="管理员姓名"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="4"
                      >
                        <v-text-field
                          v-model.trim="form.username"
                          label="管理员短账号"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="4"
                      >
                        <v-text-field
                          v-model="form.pin"
                          inputmode="numeric"
                          label="管理员 PIN（4—8位数字）"
                          type="password"
                          variant="outlined"
                        />
                      </v-col>
                    </template>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-select
                        v-model="form.teacherAuthMode"
                        :items="authModeOptions"
                        item-title="title"
                        item-value="value"
                        label="教师登录方式"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      v-if="form.teacherAuthMode === 'SHARED_PASSWORD'"
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.sharedPassword"
                        label="学校通用教师密码（8—64位）"
                        type="password"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col cols="12">
                      <v-switch
                        v-model="form.allowOAuthTeacherLogin"
                        color="primary"
                        hide-details
                        label="同时保留 OAuth 邮箱登录作为备用方式"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="5"
                    >
                      <v-text-field
                        v-model.trim="form.termName"
                        label="当前学期名称"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="6"
                      md="3"
                    >
                      <v-text-field
                        v-model.number="form.academicYear"
                        label="学年起始年份"
                        type="number"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="6"
                      md="4"
                    >
                      <v-select
                        v-model="form.semester"
                        :items="semesterOptions"
                        item-title="title"
                        item-value="value"
                        label="学期"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.startsAt"
                        label="开始日期（可选）"
                        type="date"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.endsAt"
                        label="结束日期（可选）"
                        type="date"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col cols="12">
                      <v-switch
                        v-model="form.createDefaultSubjects"
                        color="primary"
                        hide-details
                        label="创建语数英、物化生、史地政九个常用科目"
                      />
                    </v-col>
                  </v-row>
                  <v-alert
                    class="my-4"
                    type="info"
                    variant="tonal"
                  >
                    此操作通过数据库事务一次完成。任一步失败都不会留下半个学校。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3">
                    <v-btn
                      color="primary"
                      :loading="saving"
                      size="large"
                      @click="initializeCore"
                    >
                      创建核心数据
                    </v-btn><v-btn
                      variant="text"
                      @click="stage = 1"
                    >
                      返回
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="3">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  组织与班级
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    已载入一份高二行政班＋走班参考方案，并自动替换为当前学校、学期和科目代码。请按实际分班修改；尚未掌握分班情况时直接跳过最稳妥。
                  </v-alert>
                  <v-textarea
                    v-model="organizationText"
                    auto-grow
                    class="organization-editor"
                    label="组织配置 JSON"
                    rows="14"
                    variant="outlined"
                    @update:model-value="organizationReport = null"
                  />
                  <validation-summary
                    v-if="organizationReport"
                    :report="organizationReport"
                  />
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      color="primary"
                      :loading="saving"
                      prepend-icon="mdi-check-decagram-outline"
                      @click="validateOrganization"
                    >
                      预检配置
                    </v-btn>
                    <v-btn
                      :disabled="!organizationReport?.valid"
                      :loading="saving"
                      prepend-icon="mdi-database-import-outline"
                      variant="tonal"
                      @click="saveOrganization"
                    >
                      确认导入
                    </v-btn>
                    <v-btn
                      variant="text"
                      @click="goToStage(4)"
                    >
                      暂不配置
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="4">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  首批教师账号与任课空间
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    v-if="setupContext?.school?.teacherAuthMode === 'OAUTH_EMAIL'"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    当前学校选择 OAuth 邮箱登录，安装向导不创建短账号。请完成初始化后在学校后台按邮箱分配教师。
                  </v-alert>
                  <v-alert
                    v-else-if="!workspaceOptions.length"
                    class="mb-5"
                    type="warning"
                    variant="tonal"
                  >
                    还没有班级或走班教学空间，暂时无法分配任课教师。可以先跳过，之后在学校后台统一处理。
                  </v-alert>
                  <template v-else>
                    <div
                      v-for="(teacher, index) in teachers"
                      :key="teacher.key"
                      class="teacher-row mb-4"
                    >
                      <div class="d-flex align-center justify-space-between mb-3">
                        <strong>教师 {{ index + 1 }}</strong><v-btn
                          v-if="teachers.length > 1"
                          icon="mdi-close"
                          size="small"
                          variant="text"
                          @click="teachers.splice(index, 1)"
                        />
                      </div>
                      <v-row>
                        <v-col
                          cols="12"
                          md="3"
                        >
                          <v-text-field
                            v-model.trim="teacher.name"
                            hide-details
                            label="姓名"
                            variant="outlined"
                          />
                        </v-col>
                        <v-col
                          cols="12"
                          md="3"
                        >
                          <v-text-field
                            v-model.trim="teacher.username"
                            hide-details
                            label="短账号"
                            variant="outlined"
                          />
                        </v-col>
                        <v-col
                          v-if="setupContext?.school?.teacherAuthMode === 'LOCAL_PIN'"
                          cols="12"
                          md="3"
                        >
                          <v-text-field
                            v-model="teacher.pin"
                            hide-details
                            inputmode="numeric"
                            label="PIN"
                            type="password"
                            variant="outlined"
                          />
                        </v-col>
                        <v-col
                          cols="12"
                          :md="setupContext?.school?.teacherAuthMode === 'LOCAL_PIN' ? 3 : 6"
                        >
                          <v-select
                            v-model="teacher.workspaceCodes"
                            chips
                            closable-chips
                            hide-details
                            :items="workspaceOptions"
                            item-title="title"
                            item-value="value"
                            label="任课班级/走班"
                            multiple
                            variant="outlined"
                          />
                        </v-col>
                      </v-row>
                    </div>
                    <v-btn
                      class="mb-4"
                      prepend-icon="mdi-account-plus-outline"
                      variant="text"
                      @click="addTeacher"
                    >
                      继续添加教师
                    </v-btn>
                    <validation-summary
                      v-if="teacherReport"
                      :report="teacherReport"
                    />
                  </template>
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL' && workspaceOptions.length"
                      color="primary"
                      :loading="saving"
                      prepend-icon="mdi-account-multiple-check-outline"
                      @click="saveTeachers"
                    >
                      预检并创建
                    </v-btn>
                    <v-btn
                      variant="text"
                      @click="goToStage(5)"
                    >
                      暂不配置
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="5">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  首个班级大屏账号
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    大屏使用独立账号登录，不需要在一体机上输入管理员账号。这里只创建账号；首次在班级一体机登录后才会绑定该设备。
                  </v-alert>
                  <v-alert
                    v-if="!administrativeClassOptions.length"
                    class="mb-5"
                    type="warning"
                    variant="tonal"
                  >
                    尚未配置行政班，无法创建大屏账号。可以安全跳过。
                  </v-alert>
                  <v-row v-else>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-select
                        v-model="screenForm.administrativeClassId"
                        :items="administrativeClassOptions"
                        item-title="title"
                        item-value="value"
                        label="所属行政班"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model.trim="screenForm.name"
                        label="大屏名称，例如 高二1班一体机"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model.trim="screenForm.loginCode"
                        hint="3—32位字母、数字、点、横线或下划线"
                        label="大屏登录账号"
                        persistent-hint
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="screenForm.pin"
                        inputmode="numeric"
                        label="大屏 PIN（4—8位数字）"
                        type="password"
                        variant="outlined"
                      />
                    </v-col>
                  </v-row>
                  <v-alert
                    v-if="screenCreated"
                    class="mb-4"
                    type="success"
                    variant="tonal"
                  >
                    大屏账号已创建，可以继续创建其他班级的大屏账号，或进入完成检查。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      v-if="administrativeClassOptions.length"
                      color="primary"
                      :loading="saving"
                      prepend-icon="mdi-monitor-account"
                      @click="saveScreen"
                    >
                      创建大屏账号
                    </v-btn><v-btn
                      variant="text"
                      @click="goToStage(6)"
                    >
                      {{ screenCreated ? '完成大屏配置' : '暂不配置' }}
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="6">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  检查并完成
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="success"
                    variant="tonal"
                  >
                    核心数据已经可用。完成后将锁定安装入口，未配置的班级、教师和大屏仍可在学校管理后台继续添加。
                  </v-alert>
                  <v-row class="mb-4">
                    <v-col
                      v-for="item in countItems"
                      :key="item.title"
                      cols="6"
                      md="3"
                    >
                      <div class="count-tile">
                        <v-icon
                          :icon="item.icon"
                          color="primary"
                        /><div><strong>{{ item.value }}</strong><span>{{ item.title }}</span></div>
                      </div>
                    </v-col>
                  </v-row>
                  <v-alert
                    v-if="!status?.counts?.workspaces"
                    class="mb-3"
                    type="warning"
                    variant="tonal"
                  >
                    尚未设置班级。完成后请优先进入“组织与教学关系”配置。
                  </v-alert>
                  <v-alert
                    v-if="!status?.counts?.screens"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    尚未创建大屏账号，不影响教师先使用系统。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3">
                    <v-btn
                      color="primary"
                      :loading="saving"
                      prepend-icon="mdi-lock-check-outline"
                      size="large"
                      @click="finishSetup"
                    >
                      完成并锁定初始化
                    </v-btn><v-btn
                      variant="text"
                      @click="stage = 3"
                    >
                      返回补充配置
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>
          </v-window>
        </template>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import {computed, defineComponent, h, onMounted, reactive, ref} from "vue";
import {useRouter} from "vue-router";
import {completeInstanceSetup, createInstanceSetupScreen, createInstanceSetupSession, describeApiError, getInstanceSetupContext, getInstanceSetupOrganizationTemplate, getInstanceSetupStatus, importInstanceSetupOrganization, importInstanceSetupTeachers, initializeInstanceCore} from "@/utils/classworksV2Client";

const ValidationSummary = defineComponent({
  props: {report: {type: Object, required: true}},
  setup(props) {
    return () => h("div", {class: "validation-summary mt-4"}, [
      h("div", {class: props.report.valid ? "text-success" : "text-error"}, props.report.valid ? "校验通过" : "校验未通过"),
      ...(props.report.errors || []).map(item => h("div", {class: "text-body-2 text-error"}, `• ${item.message}`)),
      ...(props.report.warnings || []).map(item => h("div", {class: "text-body-2 text-warning"}, `• ${item.message}`)),
    ]);
  },
});

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const status = ref(null);
const setupContext = ref(null);
const stage = ref(1);
const unlockedStage = ref(1);
const setupKey = ref("");
const showSetupKey = ref(false);
const organizationText = ref("");
const organizationReport = ref(null);
const teacherReport = ref(null);
const screenCreated = ref(false);
let teacherKey = 0;
const teachers = reactive([]);
const now = new Date();
const schoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
const form = reactive({schoolName: "", schoolCode: "", administratorName: "", username: "admin", pin: "", teacherAuthMode: "LOCAL_PIN", sharedPassword: "", allowOAuthTeacherLogin: false, termName: `${schoolYear}-${schoolYear + 1}学年第一学期`, academicYear: schoolYear, semester: 1, startsAt: "", endsAt: "", createDefaultSubjects: true});
const screenForm = reactive({administrativeClassId: "", name: "", loginCode: "", pin: ""});
const stageItems = [{value: 1, title: "服务授权"}, {value: 2, title: "核心信息"}, {value: 3, title: "班级组织"}, {value: 4, title: "教师"}, {value: 5, title: "大屏"}, {value: 6, title: "完成"}];
const authModeOptions = [{title: "教师个人账号＋PIN（推荐）", value: "LOCAL_PIN"}, {title: "教师账号＋学校通用密码", value: "SHARED_PASSWORD"}, {title: "OAuth 邮箱登录", value: "OAUTH_EMAIL"}];
const semesterOptions = [{title: "第一学期", value: 1}, {title: "第二学期", value: 2}];
const countItems = computed(() => [
  {title: "行政班/走班", value: status.value?.counts?.workspaces || 0, icon: "mdi-google-classroom"},
  {title: "教师任课关系", value: status.value?.counts?.teacherMemberships || 0, icon: "mdi-account-school-outline"},
  {title: "大屏账号", value: status.value?.counts?.screens || 0, icon: "mdi-monitor-account"},
  {title: "科目", value: status.value?.counts?.subjects || 0, icon: "mdi-book-open-page-variant-outline"},
]);
const workspaceOptions = computed(() => (setupContext.value?.workspaces || []).map(item => ({title: `${item.name}（${item.type === "ADMIN_CLASS" ? "行政班" : "走班"}）`, value: item.code})));
const administrativeClassOptions = computed(() => (setupContext.value?.workspaces || []).filter(item => item.type === "ADMIN_CLASS").map(item => ({title: item.name, value: item.id})));

function reportFromError(error) { return error?.response?.data?.data || {valid: false, errors: [{message: describeApiError(error, "校验失败")}], warnings: []}; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : undefined; }
function adaptOrganizationTemplate(template, context) {
  const codeByName = new Map((context.subjects || []).map(subject => [subject.name, subject.code]));
  const oldNameByCode = new Map((template.subjects || []).map(subject => [subject.code, subject.name]));
  const mapCode = code => codeByName.get(oldNameByCode.get(code)) || code;
  return {
    ...template,
    school: {code: context.school.code, name: context.school.name, teacherAuth: {mode: context.school.teacherAuthMode, allowOAuthFallback: context.school.allowOAuthTeacherLogin}},
    term: {name: context.term.name, academicYear: context.term.academicYear, semester: context.term.semester, startsAt: dateOnly(context.term.startsAt), endsAt: dateOnly(context.term.endsAt), status: "ACTIVE"},
    subjects: (context.subjects || template.subjects).map(({code, name, category, sortOrder}) => ({code, name, category, sortOrder})),
    administrativeClasses: (template.administrativeClasses || []).map(item => ({...item, subjectRules: Object.fromEntries(Object.entries(item.subjectRules || {}).map(([code, mode]) => [mapCode(code), mode]))})),
    courseGroups: (template.courseGroups || []).map(item => ({...item, subject: mapCode(item.subject)})),
  };
}
function addTeacher() { teachers.push({key: ++teacherKey, name: "", username: "", pin: "", workspaceCodes: []}); }
async function loadStatus() {
  loading.value = true;
  try { status.value = await getInstanceSetupStatus(); } catch (error) { errorMessage.value = describeApiError(error, "无法读取 KV 后端初始化状态"); } finally { loading.value = false; }
}
async function loadSetupResources(forceTemplate = false) {
  const [context, template] = await Promise.all([getInstanceSetupContext(), getInstanceSetupOrganizationTemplate()]);
  setupContext.value = context;
  if (!organizationText.value || forceTemplate) organizationText.value = JSON.stringify(adaptOrganizationTemplate(template, context), null, 2);
  if (!teachers.length) addTeacher();
}
async function authorizeSetup() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await createInstanceSetupSession(setupKey.value);
    setupKey.value = "";
    if (status.value?.counts?.owners && status.value?.counts?.activeTerms) {
      await loadSetupResources(true);
      stage.value = status.value?.counts?.workspaces ? (status.value?.counts?.teacherMemberships ? 5 : 4) : 3;
      unlockedStage.value = Math.max(3, stage.value);
    } else { stage.value = 2; unlockedStage.value = 2; }
  } catch (error) { errorMessage.value = describeApiError(error, "初始化密钥验证失败"); } finally { saving.value = false; }
}
async function initializeCore() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await initializeInstanceCore({...form});
    form.pin = ""; form.sharedPassword = "";
    await Promise.all([loadStatus(), loadSetupResources(true)]);
    stage.value = 3; unlockedStage.value = 3;
  } catch (error) { errorMessage.value = describeApiError(error, "核心初始化失败"); } finally { saving.value = false; }
}
function parsedOrganization() {
  try { return JSON.parse(organizationText.value); } catch (error) { organizationReport.value = {valid: false, errors: [{message: `JSON 格式错误：${error.message}`}], warnings: []}; return null; }
}
async function validateOrganization() {
  const document = parsedOrganization();
  if (!document) return;
  saving.value = true;
  try { organizationReport.value = await importInstanceSetupOrganization(document, true); } catch (error) { organizationReport.value = reportFromError(error); } finally { saving.value = false; }
}
async function saveOrganization() {
  const document = parsedOrganization();
  if (!document) return;
  saving.value = true; errorMessage.value = "";
  try { await importInstanceSetupOrganization(document, false); await Promise.all([loadStatus(), loadSetupResources()]); goToStage(4); } catch (error) { organizationReport.value = reportFromError(error); errorMessage.value = describeApiError(error, "组织配置导入失败"); } finally { saving.value = false; }
}
async function saveTeachers() {
  const assignments = teachers.map(({name, username, pin, workspaceCodes}) => ({name, username, pin, workspaceCodes, role: "TEACHER"}));
  saving.value = true; errorMessage.value = "";
  try {
    teacherReport.value = await importInstanceSetupTeachers({assignments}, true);
    if (!teacherReport.value.valid) return;
    teacherReport.value = await importInstanceSetupTeachers({assignments}, false);
    teachers.forEach(item => { item.pin = ""; });
    await Promise.all([loadStatus(), loadSetupResources()]); goToStage(5);
  } catch (error) { teacherReport.value = reportFromError(error); } finally { saving.value = false; }
}
async function saveScreen() {
  saving.value = true; errorMessage.value = "";
  try {
    await createInstanceSetupScreen({...screenForm});
    screenForm.pin = ""; screenForm.name = ""; screenForm.loginCode = ""; screenForm.administrativeClassId = ""; screenCreated.value = true;
    await Promise.all([loadStatus(), loadSetupResources()]);
  } catch (error) { errorMessage.value = describeApiError(error, "大屏账号创建失败"); } finally { saving.value = false; }
}
function goToStage(value) { stage.value = value; unlockedStage.value = Math.max(unlockedStage.value, value); }
async function finishSetup() {
  saving.value = true; errorMessage.value = "";
  try { status.value = await completeInstanceSetup(); await router.replace("/classworks-admin"); } catch (error) { errorMessage.value = describeApiError(error, "无法完成初始化"); } finally { saving.value = false; }
}
onMounted(loadStatus);
</script>

<style scoped>
.setup-page { background: radial-gradient(circle at 15% 0%, rgba(var(--v-theme-primary), .12), transparent 38%), rgb(var(--v-theme-background)); min-height: 100vh; }
.setup-heading { align-items: center; display: flex; gap: 18px; }
.stage-track { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.stage-item { align-items: center; background: transparent; border: 0; color: rgba(var(--v-theme-on-surface), .58); display: flex; gap: 8px; min-width: 0; padding: 4px; text-align: left; }
.stage-item span { align-items: center; border: 1px solid currentColor; border-radius: 50%; display: inline-flex; flex: 0 0 auto; height: 28px; justify-content: center; width: 28px; }
.stage-item div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stage-item.active { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.stage-item.done { color: rgb(var(--v-theme-success)); }
.stage-item:disabled { cursor: default; opacity: .5; }
.check-list { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.count-tile { align-items: center; background: rgba(var(--v-theme-surface-variant), .38); border-radius: 14px; display: flex; gap: 12px; min-height: 76px; padding: 14px; }
.count-tile strong, .count-tile span { display: block; }
.count-tile strong { font-size: 1.35rem; }
.count-tile span { color: rgba(var(--v-theme-on-surface), .62); font-size: .78rem; }
.teacher-row, .validation-summary { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 14px; padding: 16px; }
.organization-editor :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .83rem; line-height: 1.55; }
@media (max-width: 900px) { .stage-track { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 600px) { .setup-heading { align-items: flex-start; } .setup-heading h1 { font-size: 1.65rem !important; } .stage-track { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
