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
      v-if="appReady && (!store.screenSession || screenTemporarilyUnlocked)"
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
        prepend-icon="mdi-account-tie-outline"
      >
        教师
      </v-btn>
      <v-btn
        value="screen"
        prepend-icon="mdi-monitor-dashboard"
      >
        大屏
      </v-btn>
    </v-btn-toggle>
    <v-btn
      v-if="appReady && (!store.screenSession || screenTemporarilyUnlocked)"
      class="ml-2"
      icon="mdi-cog-outline"
      title="设置"
      @click="openSettings(mode)"
    />
  </v-app-bar>

  <v-container
    class="classworks-v2-page py-6"
    :class="{'classworks-v2-page--screen': mode === 'screen'}"
    fluid
  >
    <v-alert
      v-if="screenTemporarilyUnlocked"
      class="mb-4 screen-temporary-unlock"
      color="warning"
      icon="mdi-monitor-unlock"
      variant="tonal"
    >
      <div class="d-flex align-center flex-wrap ga-3">
        <div>
          <div class="font-weight-bold">
            大屏已临时退出 · 剩余 {{ screenUnlockRemainingLabel }}
          </div>
          <div class="text-caption">
            到时或刷新页面后会自动返回大屏；定时噪声监测仍保持运行。
          </div>
        </div>
        <v-spacer />
        <v-btn
          color="warning"
          prepend-icon="mdi-monitor-lock"
          variant="flat"
          @click="returnToScreen"
        >
          立即返回大屏
        </v-btn>
      </div>
    </v-alert>
    <template v-if="mode === 'student'">
      <div class="classworks-overview mb-6">
        <classroom-time-card compact />
        <v-card
          class="selection-summary rounded-xl"
          color="primary"
          variant="tonal"
        >
          <v-card-text class="selection-summary__content">
            <div class="selection-summary__identity">
              <v-avatar
                color="primary"
                size="48"
                variant="flat"
              >
                <v-icon icon="mdi-account-school" />
              </v-avatar>
              <div class="selection-summary__copy">
                <div class="selection-summary__title font-weight-bold">
                  {{ store.selectedClassName }}
                </div>
                <div class="selection-summary__description text-medium-emphasis">
                  {{ selectionDescription }}
                </div>
              </div>
            </div>
            <div class="selection-summary__actions">
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
            </div>
          </v-card-text>
        </v-card>
      </div>

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
        <BoardDateNavigator
          class="mb-4"
          :date="store.boardDate"
          @change="store.setBoardDate"
        />
        <OrganizedHomeworkFeed
          v-if="store.feed.length"
          :publications="store.feed"
        />

        <v-empty-state
          v-else
          :headline="`${boardDateLabel}没有作业`"
          icon="mdi-check-circle-outline"
          text="可以切换到前一天、后一天或选择其他日期查看"
        />
      </template>
    </template>

    <template v-else-if="mode === 'screen'">
      <ClassroomScreenView
        v-if="store.screenSession"
        @create="openScreenComposer()"
        @edit="openScreenComposer"
        @history="openHistory($event, 'screen')"
        @settings="openSettings('screen')"
        @tools="classroomToolsDialog = true"
        @copy-board="copyScreenBoardToToday"
        @exit="openScreenExitDialog"
      />
      <ScreenAccountLogin
        v-if="!store.screenSession"
        :error="store.screenError"
        :loading="store.screenLoading"
        :schools="store.schools"
        @login="loginScreen"
      />
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
              class="teacher-login-icon"
              icon="mdi-account-tie-outline"
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
            <TeacherPublicationManager
              :loading="store.teacherPublicationsLoading"
              :publications="store.teacherPublications"
              @certify="certifyPublication"
              @clone="clonePublication"
              @edit="editingPublication = $event"
              @history="openHistory($event, 'teacher')"
              @delivery="openNotificationDelivery"
              @refresh="store.refreshTeacherPublications()"
              @withdraw="withdrawPublication"
            />
          </v-col>
        </v-row>
      </template>
    </template>
  </v-container>

  <class-selection-dialog
    v-model="store.selectionDialog"
    @screen="openScreenFromSelection"
    @teacher="openTeacherFromSelection"
  />
  <ClassroomToolsDialog
    v-if="classroomToolsDialog"
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
  <NotificationDeliveryDialog
    v-model="notificationDeliveryDialog"
    :publication="deliveryPublication"
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
  <v-dialog
    v-model="screenExitDialog"
    max-width="500"
  >
    <v-card class="rounded-xl">
      <v-card-title class="pa-5 pb-2">
        临时退出班级大屏
      </v-card-title>
      <v-card-text class="px-5">
        <v-alert
          class="mb-4"
          type="info"
          variant="tonal"
        >
          验证后可在15分钟内使用“看作业”和“教师”页面。设备不会解绑，刷新页面会立即回到大屏。
        </v-alert>
        <v-text-field
          v-model="screenExitPin"
          autofocus
          :error-messages="screenExitError"
          label="本大屏 PIN"
          prepend-inner-icon="mdi-lock-outline"
          type="password"
          variant="outlined"
          @keyup.enter="unlockScreenTemporarily"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="screenExitDialog = false">
          取消
        </v-btn>
        <v-btn
          color="primary"
          :loading="screenExitBusy"
          @click="unlockScreenTemporarily"
        >
          验证并退出
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-snackbar
    v-model="snackbar"
    color="success"
    location="bottom"
    :timeout="6000"
  >
    <div class="d-flex align-center ga-3">
      <v-icon icon="mdi-check-circle-outline" />
      <span>{{ snackbarText }}</span>
    </div>
    <template #actions>
      <v-btn
        variant="text"
        @click="snackbar = false"
      >
        知道了
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {
  classworksV2Api,
  describeApiError,
  loginWithSchoolAccount,
  startOAuthLogin,
} from "@/utils/classworksV2Client";
import ClassSelectionDialog from "@/components/v2/ClassSelectionDialog.vue";
import ScreenAccountLogin from "@/components/v2/ScreenAccountLogin.vue";
import PublicationComposer from "@/components/v2/PublicationComposer.vue";
import ScreenHomeworkDialog from "@/components/v2/ScreenHomeworkDialog.vue";
import PublicationHistoryDialog from "@/components/v2/PublicationHistoryDialog.vue";
import NotificationDeliveryDialog from "@/components/v2/NotificationDeliveryDialog.vue";
import ClassroomTimeCard from "@/components/v2/ClassroomTimeCard.vue";
import ClassroomScreenView from "@/components/v2/ClassroomScreenView.vue";
import OrganizedHomeworkFeed from "@/components/v2/OrganizedHomeworkFeed.vue";
import BoardDateNavigator from "@/components/v2/BoardDateNavigator.vue";
import TeacherPublicationManager from "@/components/v2/TeacherPublicationManager.vue";
import {boardDateRelativeLabel} from "@/utils/boardDate";
import {screenHomeworkSaveMessage} from "@/utils/screenSaveFeedback";

const ClassroomToolsDialog = defineAsyncComponent(() => import("@/components/v2/ClassroomToolsDialog.vue"));

const store = useClassworksV2Store();
const route = useRoute();
const router = useRouter();
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
const notificationDeliveryDialog = ref(false);
const deliveryPublication = ref(null);
const screenExitDialog = ref(false);
const screenExitPin = ref("");
const screenExitError = ref("");
const screenExitBusy = ref(false);
const screenTemporarilyUnlocked = ref(false);
const screenUnlockRemainingSeconds = ref(0);
let screenUnlockDeadline = 0;
let screenUnlockTimer = null;

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
const boardDateLabel = computed(() => boardDateRelativeLabel(store.boardDate));
const screenUnlockRemainingLabel = computed(() => {
  const minutes = Math.floor(screenUnlockRemainingSeconds.value / 60);
  const seconds = screenUnlockRemainingSeconds.value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
});

function openTeacherFromSelection() {
  store.selectionDialog = false;
  mode.value = "teacher";
}

function openScreenFromSelection() {
  store.selectionDialog = false;
  mode.value = "screen";
}

function openSettings(context = mode.value) {
  router.push({path: "/settings", query: {context}});
}

watch(mode, async (value) => {
  if (value === "screen" && screenTemporarilyUnlocked.value) endScreenTemporaryExit();
  if (value === "teacher" && !store.account && !store.teacherLoading) store.bootstrapTeacher();
  if (value === "screen") store.selectionDialog = false;
  if (value === "screen") await store.setFeedAudience("screen");
  if (value === "student") await store.setFeedAudience("student");
});
watch(() => store.schools, (schools) => {
  if (!loginSchoolId.value && schools.length) loginSchoolId.value = schools[0].id;
}, {deep: true, immediate: true});
watch(() => store.screenSession, (session) => {
  if (session && mode.value !== "screen" && !screenTemporarilyUnlocked.value) mode.value = "screen";
  if (!session && mode.value === "screen") mode.value = "student";
});

onMounted(async () => {
  await Promise.all([
    store.bootstrapStudent(),
    store.bootstrapTeacher(),
    store.bootstrapClassroomScreen(),
  ]);
  if (store.screenSession) mode.value = "screen";
  else if (route.query.mode === "teacher") mode.value = "teacher";
  appReady.value = true;
  store.startRealtime();
});

onUnmounted(() => {
  store.stopRealtime();
  clearInterval(screenUnlockTimer);
});

function openScreenExitDialog() {
  screenExitPin.value = "";
  screenExitError.value = "";
  screenExitDialog.value = true;
}

function updateScreenUnlockRemaining() {
  screenUnlockRemainingSeconds.value = Math.max(0, Math.ceil((screenUnlockDeadline - Date.now()) / 1000));
  if (screenUnlockRemainingSeconds.value === 0) returnToScreen();
}

function endScreenTemporaryExit() {
  screenTemporarilyUnlocked.value = false;
  screenUnlockDeadline = 0;
  screenUnlockRemainingSeconds.value = 0;
  clearInterval(screenUnlockTimer);
  screenUnlockTimer = null;
}

function returnToScreen() {
  endScreenTemporaryExit();
  mode.value = "screen";
}

async function unlockScreenTemporarily() {
  if (!screenExitPin.value) {
    screenExitError.value = "请输入本大屏 PIN";
    return;
  }
  screenExitBusy.value = true;
  screenExitError.value = "";
  try {
    await classworksV2Api.unlockClassroomScreen(screenExitPin.value);
    screenExitDialog.value = false;
    screenExitPin.value = "";
    screenTemporarilyUnlocked.value = true;
    screenUnlockDeadline = Date.now() + 15 * 60 * 1000;
    updateScreenUnlockRemaining();
    clearInterval(screenUnlockTimer);
    screenUnlockTimer = window.setInterval(updateScreenUnlockRemaining, 1000);
    mode.value = "student";
    store.selectionDialog = false;
  } catch (error) {
    screenExitError.value = describeApiError(error, "PIN 验证失败");
  } finally {
    screenExitBusy.value = false;
  }
}

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

async function loginScreen(input) {
  const school = store.schools.find((item) => item.id === input.schoolId);
  if (!school) {
    store.screenError = "请选择学校";
    return;
  }
  try {
    await store.loginClassroomScreen({
      schoolCode: school.code,
      loginCode: input.loginCode,
      pin: input.pin,
    });
    mode.value = "screen";
    snackbarText.value = "大屏登录成功，本机以后会自动进入班级大屏";
    snackbar.value = true;
  } catch {
    // Store keeps the actionable server error visible in the login card.
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

function showScreenSavedMessage(publication, context = {}) {
  screenEditingPublication.value = null;
  snackbarText.value = screenHomeworkSaveMessage(publication, context);
  snackbar.value = true;
}

function openHistory(publication, modeValue) {
  historyPublication.value = publication;
  historyMode.value = modeValue;
  historyDialog.value = true;
}

function openNotificationDelivery(publication) {
  deliveryPublication.value = publication;
  notificationDeliveryDialog.value = true;
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
  snackbarText.value = publication.type === "ASSIGNMENT" ? "已复制为今天的新草稿" : "已复制为新草稿";
  snackbar.value = true;
}

async function copyScreenBoardToToday() {
  if (!window.confirm(`将${boardDateLabel.value}的作业复制到今天吗？当天已有的相同作业会自动跳过。`)) return;
  try {
    const result = await store.copyScreenBoardToToday();
    snackbarText.value = `已复制 ${result.createdCount} 项，跳过 ${result.skippedCount} 项重复作业`;
    snackbar.value = true;
  } catch {
    // 大屏错误提示已经给出可操作原因。
  }
}
</script>

<style scoped>
.classworks-overview {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(310px, 0.78fr) minmax(0, 1.72fr);
}

.selection-summary {
  min-height: 108px;
}

.selection-summary__content {
  align-items: center;
  display: flex;
  gap: 24px;
  height: 100%;
  justify-content: space-between;
  min-height: 108px;
  padding: 18px 20px;
}

.selection-summary__identity,
.selection-summary__actions {
  align-items: center;
  display: flex;
}

.selection-summary__identity {
  gap: 14px;
  min-width: 0;
}

.selection-summary__copy {
  min-width: 0;
}

.selection-summary__title {
  font-size: clamp(1.2rem, 0.45vw + 0.95rem, 1.55rem);
  line-height: 1.2;
}

.selection-summary__description {
  font-size: 0.875rem;
  line-height: 1.4;
  margin-top: 5px;
}

.selection-summary__actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 1050px) {
  .classworks-overview {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .selection-summary__content {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
  }

  .selection-summary__actions {
    justify-content: flex-start;
  }
}
</style>

<style scoped>
.classworks-v2-page {
  max-width: 1500px;
}

.classworks-v2-page--screen {
  max-width: none;
  padding-left: clamp(10px, 1vw, 28px) !important;
  padding-right: clamp(10px, 1vw, 28px) !important;
  padding-top: clamp(10px, 1vh, 24px) !important;
}

.screen-temporary-unlock {
  position: sticky;
  top: 72px;
  z-index: 5;
}

.teacher-login-icon {
  top: 15px;
}

</style>
