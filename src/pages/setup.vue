<template>
  <v-app>
    <v-main class="setup-page">
      <v-container
        class="py-8 py-md-12"
        max-width="1040"
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
              完成管理员、学校和学期初始化，班级与走班关系可以稍后再配置。
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
            <v-card-text class="pa-5">
              <div class="d-flex flex-wrap align-center ga-3">
                <div
                  v-for="(item, index) in stageItems"
                  :key="item.value"
                  class="stage-item"
                  :class="{active: stage === item.value, done: stage > item.value}"
                >
                  <span>{{ stage > item.value ? '✓' : index + 1 }}</span>
                  <div>{{ item.title }}</div>
                </div>
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
                    该密钥来自服务器部署环境，只用于建立15分钟的初始化会话，不会成为日常登录密码。
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
                        label="学校代码"
                        hint="部署后不建议修改，例如 TJ2HS"
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
                    </v-btn>
                    <v-btn
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
                  核心初始化完成
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="success"
                    variant="tonal"
                  >
                    管理员、学校和启用学期已经可用。现在可以锁定 OOBE，班级结构稍后在学校后台配置。
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
                    v-if="!status?.counts?.grades"
                    class="mb-5"
                    type="warning"
                    variant="tonal"
                  >
                    尚未设置年级和班级。这不会阻止完成初始化，但进入后台后应优先配置“组织与教学关系”。
                  </v-alert>
                  <v-btn
                    color="primary"
                    :loading="saving"
                    prepend-icon="mdi-lock-check-outline"
                    size="large"
                    @click="finishSetup"
                  >
                    完成并锁定初始化
                  </v-btn>
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
import {computed, onMounted, reactive, ref} from "vue";
import {useRouter} from "vue-router";
import {
  completeInstanceSetup,
  createInstanceSetupSession,
  describeApiError,
  getInstanceSetupStatus,
  initializeInstanceCore,
} from "@/utils/classworksV2Client";

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const status = ref(null);
const stage = ref(1);
const setupKey = ref("");
const showSetupKey = ref(false);
const now = new Date();
const schoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
const form = reactive({
  schoolName: "",
  schoolCode: "",
  administratorName: "",
  username: "admin",
  pin: "",
  teacherAuthMode: "LOCAL_PIN",
  sharedPassword: "",
  allowOAuthTeacherLogin: false,
  termName: `${schoolYear}-${schoolYear + 1}学年第一学期`,
  academicYear: schoolYear,
  semester: 1,
  startsAt: "",
  endsAt: "",
  createDefaultSubjects: true,
});
const stageItems = [{value: 1, title: "服务授权"}, {value: 2, title: "核心信息"}, {value: 3, title: "检查并完成"}];
const authModeOptions = [
  {title: "教师个人账号＋PIN（推荐）", value: "LOCAL_PIN"},
  {title: "教师账号＋学校通用密码", value: "SHARED_PASSWORD"},
  {title: "OAuth 邮箱登录", value: "OAUTH_EMAIL"},
];
const semesterOptions = [{title: "第一学期", value: 1}, {title: "第二学期", value: 2}];
const countItems = computed(() => [
  {title: "学校", value: status.value?.counts?.schools || 0, icon: "mdi-school-outline"},
  {title: "管理员", value: status.value?.counts?.owners || 0, icon: "mdi-account-key-outline"},
  {title: "启用学期", value: status.value?.counts?.activeTerms || 0, icon: "mdi-calendar-check-outline"},
  {title: "科目", value: status.value?.counts?.subjects || 0, icon: "mdi-book-open-page-variant-outline"},
]);

async function loadStatus() {
  loading.value = true;
  try {
    status.value = await getInstanceSetupStatus();
  } catch (error) {
    errorMessage.value = describeApiError(error, "无法读取 KV 后端初始化状态");
  } finally {
    loading.value = false;
  }
}

async function authorizeSetup() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await createInstanceSetupSession(setupKey.value);
    setupKey.value = "";
    stage.value = status.value?.counts?.owners && status.value?.counts?.activeTerms ? 3 : 2;
  } catch (error) {
    errorMessage.value = describeApiError(error, "初始化密钥验证失败");
  } finally {
    saving.value = false;
  }
}

async function initializeCore() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await initializeInstanceCore({...form});
    form.pin = "";
    form.sharedPassword = "";
    await loadStatus();
    stage.value = 3;
  } catch (error) {
    errorMessage.value = describeApiError(error, "核心初始化失败");
  } finally {
    saving.value = false;
  }
}

async function finishSetup() {
  saving.value = true;
  errorMessage.value = "";
  try {
    status.value = await completeInstanceSetup();
    await router.replace("/classworks-admin");
  } catch (error) {
    errorMessage.value = describeApiError(error, "无法完成初始化");
  } finally {
    saving.value = false;
  }
}

onMounted(loadStatus);
</script>

<style scoped>
.setup-page { background: radial-gradient(circle at 15% 0%, rgba(var(--v-theme-primary), .12), transparent 38%), rgb(var(--v-theme-background)); min-height: 100vh; }
.setup-heading { align-items: center; display: flex; gap: 18px; }
.stage-item { align-items: center; color: rgba(var(--v-theme-on-surface), .58); display: flex; flex: 1; gap: 9px; min-width: 150px; }
.stage-item span { align-items: center; border: 1px solid currentColor; border-radius: 50%; display: inline-flex; height: 30px; justify-content: center; width: 30px; }
.stage-item.active { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.stage-item.done { color: rgb(var(--v-theme-success)); }
.check-list { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.count-tile { align-items: center; background: rgba(var(--v-theme-surface-variant), .38); border-radius: 14px; display: flex; gap: 12px; min-height: 76px; padding: 14px; }
.count-tile strong, .count-tile span { display: block; }
.count-tile strong { font-size: 1.35rem; }
.count-tile span { color: rgba(var(--v-theme-on-surface), .62); font-size: .78rem; }
@media (max-width: 600px) { .setup-heading { align-items: flex-start; } .setup-heading h1 { font-size: 1.65rem !important; } }
</style>
