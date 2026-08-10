<template>
  <v-app-bar
    class="px-2"
    color="surface"
    flat
  >
    <v-app-bar-title>
      <div class="font-weight-bold">
        Classworks 作业板
      </div>
      <div class="text-caption text-medium-emphasis">
        行政班与走班统一作业流
      </div>
    </v-app-bar-title>
    <v-btn-toggle
      v-if="appReady && !store.screenSession"
      v-model="mode"
      color="primary"
      mandatory
      variant="tonal"
    >
      <v-btn
        value="student"
        prepend-icon="mdi-book-open-variant"
      >
        看作业
      </v-btn>
      <v-btn
        value="teacher"
        prepend-icon="mdi-human-male-board"
      >
        教师
      </v-btn>
    </v-btn-toggle>
  </v-app-bar>

  <v-container
    class="classworks-v2-page py-6"
    fluid
  >
    <template v-if="mode === 'student'">
      <v-row class="mb-6 align-stretch">
        <v-col
          cols="12"
          lg="4"
        >
          <classroom-time-card />
        </v-col>
        <v-col
          cols="12"
          lg="8"
        >
          <v-card
            class="selection-summary fill-height rounded-xl"
            color="primary"
            variant="tonal"
          >
            <v-card-text class="d-flex align-center flex-wrap ga-3 pa-5 h-100">
              <v-avatar
                color="primary"
                variant="flat"
              >
                <v-icon icon="mdi-account-school" />
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">
                  {{ store.selectedClassName }}
                </div>
                <div class="text-body-2 text-medium-emphasis">
                  {{ selectionDescription }}
                </div>
              </div>
              <v-spacer />
              <v-btn
                prepend-icon="mdi-tune-variant"
                variant="tonal"
                @click="store.selectionDialog = true"
              >
                修改选班
              </v-btn>
              <v-btn
                v-if="store.canBindSelectedClassroomScreen && !store.screenSession"
                :loading="store.screenLoading"
                prepend-icon="mdi-monitor-lock"
                variant="tonal"
                @click="bindScreen"
              >
                绑定为本班大屏
              </v-btn>
              <v-btn
                :loading="store.feedLoading"
                icon="mdi-refresh"
                title="刷新"
                variant="text"
                @click="store.loadStudentFeed()"
              />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-alert
        v-if="store.studentNotice"
        class="mb-5"
        closable
        type="info"
        variant="tonal"
        @click:close="store.studentNotice = ''"
      >
        {{ store.studentNotice }}
      </v-alert>

      <v-alert
        v-if="store.screenError"
        class="mb-5"
        closable
        type="warning"
        variant="tonal"
      >
        {{ store.screenError }}
      </v-alert>

      <v-alert
        v-if="store.studentError"
        class="mb-5"
        closable
        type="error"
        variant="tonal"
      >
        {{ store.studentError }}
      </v-alert>

      <v-skeleton-loader
        v-if="store.studentLoading"
        type="article, article"
      />

      <template v-else-if="store.selectedWorkspaceIds.length">
        <HomeworkFeedGrid
          v-if="store.feed.length"
          :publications="store.feed"
        />

        <v-empty-state
          v-else
          headline="目前没有新作业"
          icon="mdi-check-circle-outline"
          text="已发布的作业和通知会自动出现在这里"
        />
      </template>
    </template>

    <template v-else-if="mode === 'screen'">
      <ClassroomScreenView
        v-if="store.screenSession"
        @create="openScreenComposer()"
        @edit="openScreenComposer"
        @history="openHistory($event, 'screen')"
        @tools="classroomToolsDialog = true"
      />
      <v-alert
        v-else
        type="warning"
        variant="tonal"
      >
        当前浏览器尚未绑定为班级大屏，请使用管理员账号在学生端选择行政班后完成绑定。
      </v-alert>
    </template>

    <template v-else>
      <v-progress-linear
        v-if="store.teacherLoading"
        class="mb-4"
        indeterminate
        rounded
      />
      <v-alert
        v-if="store.teacherError"
        class="mb-5"
        closable
        type="error"
        variant="tonal"
      >
        {{ store.teacherError }}
      </v-alert>

      <v-card
        v-if="!store.isTeacherSignedIn"
        class="mx-auto rounded-xl"
        max-width="680"
      >
        <v-card-text class="pa-8">
          <v-avatar
            class="d-block mx-auto mb-4"
            color="primary"
            size="72"
            variant="tonal"
          >
            <v-icon
              icon="mdi-human-male-board"
              size="40"
            />
          </v-avatar>
          <div class="text-h5 font-weight-bold mb-2 text-center">
            登录教师工作台
          </div>
          <div class="text-body-1 text-medium-emphasis mb-6 text-center">
            登录一次即可看到自己负责的所有行政班和走班教学班，无需切换浏览器或多个 UUID。
          </div>
          <v-select
            v-model="loginSchoolId"
            :items="teacherSchoolOptions"
            item-title="title"
            item-value="value"
            label="学校"
            variant="outlined"
          />
          <template v-if="loginSchool?.teacherAuthMode !== 'OAUTH_EMAIL'">
            <v-text-field
              v-model.trim="loginUsername"
              autocomplete="username"
              label="教师短账号"
              prepend-inner-icon="mdi-account-outline"
              variant="outlined"
              @keyup.enter="loginTeacher"
            />
            <v-text-field
              v-model="loginPassword"
              autocomplete="current-password"
              :label="loginSchool?.teacherAuthMode === 'SHARED_PASSWORD' ? '学校通用教师口令' : '个人 PIN'"
              prepend-inner-icon="mdi-lock-outline"
              type="password"
              variant="outlined"
              @keyup.enter="loginTeacher"
            />
            <v-btn
              block
              color="primary"
              :loading="localLoginBusy"
              size="large"
              @click="loginTeacher"
            >
              登录
            </v-btn>
            <div class="text-caption text-medium-emphasis text-center mt-3">
              登录状态会在本设备保留 30 天；输错 5 次后该账号会暂时锁定。
            </div>
          </template>
          <v-alert
            v-else
            class="mb-4"
            type="info"
            variant="tonal"
          >
            该学校选择了 OAuth 邮箱登录。
          </v-alert>
          <v-divider
            v-if="showOAuthLogin"
            class="my-6"
          />
          <div
            v-if="showOAuthLogin"
            class="d-flex justify-center flex-wrap ga-3"
          >
            <v-btn
              v-for="provider in store.oauthProviders"
              :key="provider.id"
              :color="provider.brandColor || provider.color || 'primary'"
              size="large"
              variant="elevated"
              @click="startOAuthLogin(provider.id)"
            >
              使用 {{ provider.displayName || provider.name }} 登录
            </v-btn>
          </div>
          <v-alert
            v-if="loginSchool?.teacherAuthMode === 'OAUTH_EMAIL' && !store.oauthProviders.length && !store.teacherLoading"
            class="mt-5"
            type="warning"
            variant="tonal"
          >
            该学校要求 OAuth 登录，但后端尚未配置可用的 OAuth 提供者。
          </v-alert>
        </v-card-text>
      </v-card>

      <template v-else>
        <v-card
          class="mb-6 rounded-xl"
          variant="tonal"
        >
          <v-card-text class="d-flex align-center pa-4">
            <v-avatar
              class="mr-3"
              :image="store.account.avatarUrl"
              color="primary"
            />
            <div>
              <div class="font-weight-bold">
                {{ store.account.name || store.account.username || store.account.email }}
              </div>
              <div class="text-caption">
                已授权 {{ store.teacherWorkspaces.length }} 个教学空间
              </div>
            </div>
            <v-spacer />
            <v-btn
              prepend-icon="mdi-school-outline"
              variant="text"
              @click="$router.push('/classworks-admin')"
            >
              学校管理
            </v-btn>
            <v-btn
              v-if="store.account.provider === 'school-local'"
              prepend-icon="mdi-lock-reset"
              variant="text"
              @click="changePinDialog = true"
            >
              修改 PIN
            </v-btn>
            <v-btn
              variant="text"
              @click="store.signOutTeacher()"
            >
              退出
            </v-btn>
          </v-card-text>
        </v-card>

        <v-row>
          <v-col
            cols="12"
            lg="7"
          >
            <publication-composer
              :editing-publication="editingPublication"
              @cancel="editingPublication = null"
              @published="showPublishedMessage"
            />
          </v-col>
          <v-col
            cols="12"
            lg="5"
          >
            <v-card
              class="rounded-xl"
              variant="flat"
            >
              <v-card-title class="d-flex align-center pa-5">
                最近发布
                <v-spacer />
                <v-btn
                  icon="mdi-refresh"
                  variant="text"
                  @click="store.refreshTeacherPublications()"
                />
              </v-card-title>
              <v-list lines="three">
                <template
                  v-for="publication in store.teacherPublications"
                  :key="publication.id"
                >
                  <v-list-item
                    :subtitle="publicationSummary(publication)"
                    :title="publication.title || publication.content || '未命名草稿'"
                  >
                    <template #prepend>
                      <v-avatar
                        :color="statusColor(publication.status)"
                        variant="tonal"
                      >
                        <v-icon :icon="publication.type === 'NOTICE' ? 'mdi-bullhorn-outline' : 'mdi-book-outline'" />
                      </v-avatar>
                    </template>
                    <template #append>
                      <v-menu>
                        <template #activator="{props}">
                          <v-btn
                            v-bind="props"
                            icon="mdi-dots-vertical"
                            variant="text"
                          />
                        </template>
                        <v-list>
                          <v-list-item
                            v-if="publication.status === 'PUBLISHED' && !publication.isCertified"
                            class="text-success"
                            prepend-icon="mdi-check-decagram-outline"
                            title="认证当前版本"
                            @click="certifyPublication(publication)"
                          />
                          <v-list-item
                            prepend-icon="mdi-history"
                            title="版本历史与恢复"
                            @click="openHistory(publication, 'teacher')"
                          />
                          <v-list-item
                            v-if="publication.status !== 'WITHDRAWN'"
                            prepend-icon="mdi-pencil-outline"
                            title="编辑"
                            @click="editingPublication = publication"
                          />
                          <v-list-item
                            prepend-icon="mdi-content-copy"
                            title="复制为草稿"
                            @click="clonePublication(publication)"
                          />
                          <v-list-item
                            v-if="publication.status !== 'WITHDRAWN'"
                            class="text-error"
                            prepend-icon="mdi-undo-variant"
                            title="撤回"
                            @click="withdrawPublication(publication)"
                          />
                        </v-list>
                      </v-menu>
                    </template>
                  </v-list-item>
                  <v-divider />
                </template>
              </v-list>
              <v-empty-state
                v-if="!store.teacherPublications.length"
                icon="mdi-text-box-plus-outline"
                text="还没有发布记录"
              />
            </v-card>
          </v-col>
        </v-row>
      </template>
    </template>
  </v-container>

  <class-selection-dialog
    v-model="store.selectionDialog"
  />
  <ClassroomToolsDialog
    v-model="classroomToolsDialog"
  />
  <screen-homework-dialog
    v-model="screenComposerDialog"
    :publication="screenEditingPublication"
    @saved="showScreenSavedMessage"
  />
  <publication-history-dialog
    v-model="historyDialog"
    :mode="historyMode"
    :publication="historyPublication"
    @changed="handleHistoryChanged"
  />
  <v-dialog
    v-model="changePinDialog"
    max-width="480"
  >
    <v-card class="rounded-xl">
      <v-card-title class="pa-5 pb-2">
        修改个人 PIN
      </v-card-title>
      <v-card-text class="px-5">
        <v-text-field
          v-model="currentPin"
          label="当前 PIN"
          type="password"
          variant="outlined"
        />
        <v-text-field
          v-model="newPin"
          hint="4～8位数字"
          label="新 PIN"
          persistent-hint
          type="password"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="changePinDialog = false">
          取消
        </v-btn>
        <v-btn
          color="primary"
          :loading="changePinBusy"
          @click="changePin"
        >
          确认修改
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-snackbar
    v-model="snackbar"
    color="success"
  >
    {{ snackbarText }}
  </v-snackbar>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {
  classworksV2Api,
  describeApiError,
  loginWithSchoolAccount,
  startOAuthLogin,
} from "@/utils/classworksV2Client";
import ClassSelectionDialog from "@/components/v2/ClassSelectionDialog.vue";
import PublicationComposer from "@/components/v2/PublicationComposer.vue";
import ScreenHomeworkDialog from "@/components/v2/ScreenHomeworkDialog.vue";
import PublicationHistoryDialog from "@/components/v2/PublicationHistoryDialog.vue";
import ClassroomTimeCard from "@/components/v2/ClassroomTimeCard.vue";
import ClassroomToolsDialog from "@/components/v2/ClassroomToolsDialog.vue";
import ClassroomScreenView from "@/components/v2/ClassroomScreenView.vue";
import HomeworkFeedGrid from "@/components/v2/HomeworkFeedGrid.vue";

const store = useClassworksV2Store();
const mode = ref("student");
const appReady = ref(false);
const snackbar = ref(false);
const snackbarText = ref("");
const editingPublication = ref(null);
const loginSchoolId = ref("");
const loginUsername = ref("");
const loginPassword = ref("");
const localLoginBusy = ref(false);
const changePinDialog = ref(false);
const changePinBusy = ref(false);
const currentPin = ref("");
const newPin = ref("");
const screenComposerDialog = ref(false);
const screenEditingPublication = ref(null);
const historyDialog = ref(false);
const historyPublication = ref(null);
const historyMode = ref("teacher");
const classroomToolsDialog = ref(false);

const teacherSchoolOptions = computed(() => store.schools.map((school) => ({
  title: school.name,
  value: school.id,
})));
const loginSchool = computed(() => store.schools.find((school) => school.id === loginSchoolId.value));
const showOAuthLogin = computed(() => Boolean(
  store.oauthProviders.length &&
  (loginSchool.value?.teacherAuthMode === "OAUTH_EMAIL" || loginSchool.value?.allowOAuthTeacherLogin),
));

const selectionDescription = computed(() => {
  const groups = Object.values(store.selection.courseGroupIds || {})
    .map((id) => store.courseOptions?.subjects
      ?.flatMap((item) => item.courseGroups || [])
      .find((group) => group.id === id)?.name)
    .filter(Boolean);
  return groups.length ? `已选走班：${groups.join("、")}` : "全部课程随行政班，或尚未选择走班课程";
});

watch(mode, async (value) => {
  if (value === "teacher" && !store.account && !store.teacherLoading) store.bootstrapTeacher();
  if (value === "screen") await store.setFeedAudience("screen");
  if (value === "student") await store.setFeedAudience("student");
});
watch(() => store.schools, (schools) => {
  if (!loginSchoolId.value && schools.length) loginSchoolId.value = schools[0].id;
}, {deep: true, immediate: true});
watch(() => store.screenSession, (session) => {
  if (session && mode.value !== "screen") mode.value = "screen";
  if (!session && mode.value === "screen") mode.value = "student";
});

onMounted(async () => {
  await Promise.all([
    store.bootstrapStudent(),
    store.bootstrapTeacher(),
    store.bootstrapClassroomScreen(),
  ]);
  if (store.screenSession) mode.value = "screen";
  appReady.value = true;
  store.startRealtime();
});

onUnmounted(() => store.stopRealtime());

async function loginTeacher() {
  if (!loginSchool.value || !loginUsername.value || !loginPassword.value) {
    store.teacherError = "请选择学校并输入教师短账号和口令";
    return;
  }
  localLoginBusy.value = true;
  store.teacherError = "";
  try {
    await loginWithSchoolAccount({
      schoolCode: loginSchool.value.code,
      username: loginUsername.value,
      password: loginPassword.value,
    });
    loginPassword.value = "";
    await store.bootstrapTeacher();
  } catch (error) {
    store.teacherError = describeApiError(error, "教师登录失败");
  } finally {
    localLoginBusy.value = false;
  }
}

async function changePin() {
  changePinBusy.value = true;
  store.teacherError = "";
  try {
    await classworksV2Api.changeLocalPin({
      currentPin: currentPin.value,
      newPin: newPin.value,
    });
    currentPin.value = "";
    newPin.value = "";
    changePinDialog.value = false;
    await store.signOutTeacher();
    snackbarText.value = "PIN 已修改，请使用新 PIN 重新登录";
    snackbar.value = true;
  } catch (error) {
    store.teacherError = describeApiError(error, "修改 PIN 失败");
  } finally {
    changePinBusy.value = false;
  }
}

function statusColor(status) {
  return {PUBLISHED: "success", DRAFT: "warning", WITHDRAWN: "grey"}[status] || "primary";
}

function publicationSummary(publication) {
  const status = {PUBLISHED: "已发布", DRAFT: "草稿", WITHDRAWN: "已撤回"}[publication.status];
  const targets = publication.targets?.map((target) => target.workspace.name).join("、") || "无目标";
  const certification = publication.isCertified ? "已认证" : "待确认";
  return `${status} · ${certification} · ${targets} · 版本 ${publication.revision}`;
}

async function bindScreen() {
  try {
    await store.bindCurrentClassroomScreen();
    mode.value = "screen";
    snackbarText.value = "大屏绑定成功，管理员已安全退出，现在可以直接使用大屏";
    snackbar.value = true;
  } catch {
    // Store shows the server error in the page alert.
  }
}

function openScreenComposer(publication = null) {
  screenEditingPublication.value = publication;
  screenComposerDialog.value = true;
}

function showScreenSavedMessage(publication) {
  screenEditingPublication.value = null;
  snackbarText.value = publication.isCertified
    ? "已恢复教师确认版本"
    : "已保存为待教师确认版本，原内容可随时恢复";
  snackbar.value = true;
}

function openHistory(publication, modeValue) {
  historyPublication.value = publication;
  historyMode.value = modeValue;
  historyDialog.value = true;
}

function handleHistoryChanged(publication) {
  historyPublication.value = publication;
  snackbarText.value = publication.isCertified ? "当前版本已通过教师确认" : "历史版本已恢复";
  snackbar.value = true;
}

async function certifyPublication(publication) {
  try {
    await store.certify(publication);
    snackbarText.value = "当前版本已认证";
    snackbar.value = true;
  } catch {
    // Teacher error alert already contains the actionable reason.
  }
}

function showPublishedMessage(publication) {
  editingPublication.value = null;
  snackbarText.value = publication.status === "DRAFT" ? "草稿已保存" : "发布成功";
  snackbar.value = true;
}

async function withdrawPublication(publication) {
  if (!window.confirm(`确定撤回“${publication.title || publication.content.slice(0, 20)}”吗？`)) return;
  await store.withdraw(publication);
  snackbarText.value = "已撤回";
  snackbar.value = true;
}

async function clonePublication(publication) {
  await store.clone(publication);
  snackbarText.value = "已复制为新草稿";
  snackbar.value = true;
}
</script>

<style scoped>
.classworks-v2-page {
  max-width: 1500px;
}

</style>
