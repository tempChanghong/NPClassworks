<template>
  <v-app-bar
    class="classworks-app-bar px-2"
    :class="{'classworks-app-bar--with-nav': showMainNavigation}"
    color="surface"
    flat
  >
    <v-app-bar-title class="classworks-app-bar__brand">
      <div class="font-weight-bold classworks-app-bar__title">
        NPClassworks 作业板
      </div>
      <div class="text-caption text-medium-emphasis">
        行政班与走班统一作业流
      </div>
    </v-app-bar-title>
    <v-btn-toggle
      v-if="showMainNavigation"
      v-model="mode"
      class="classworks-mode-nav"
      color="primary"
      mandatory
      variant="tonal"
    >
      <v-btn
        title="看作业"
        value="student"
      >
        <v-icon icon="mdi-book-open-variant" />
        <span class="classworks-mode-nav__label">看作业</span>
      </v-btn>
      <v-btn
        title="教师工作台"
        value="teacher"
      >
        <v-badge
          color="warning"
          :content="store.teacherActionCenter.summary.total"
          :model-value="store.teacherActionCenter.summary.total > 0"
        >
          <span class="classworks-mode-nav__content">
            <v-icon icon="mdi-account-tie-outline" />
            <span class="classworks-mode-nav__label">教师</span>
          </span>
        </v-badge>
      </v-btn>
      <v-btn
        title="班级大屏"
        value="screen"
      >
        <v-icon icon="mdi-monitor-dashboard" />
        <span class="classworks-mode-nav__label">大屏</span>
      </v-btn>
    </v-btn-toggle>
    <v-btn
      v-if="showMainNavigation"
      class="classworks-app-bar__settings ml-2"
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
    <v-btn
      v-if="showOobeBack"
      class="mb-4"
      prepend-icon="mdi-arrow-left"
      variant="text"
      @click="returnToOobe"
    >
      返回选择使用方式
    </v-btn>

    <ClassworksOobe
      v-if="oobeLanding"
      :school-count="store.schools.length"
      @admin="router.push('/classworks-admin')"
      @select="beginOobeRole"
    />

    <ScreenOobeChecklist
      v-else-if="screenOobePending && store.screenSession"
      :binding-id="store.screenSession.binding.id"
      :class-name="store.screenSession.binding.administrativeClass?.name"
      :screen-name="store.screenSession.binding.name"
      @complete="finishScreenOobe"
    />

    <template v-else-if="mode === 'student'">
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
          completion-enabled
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
          <v-card-text class="teacher-session-summary pa-4">
            <div class="teacher-session-summary__identity">
              <v-avatar
                :image="store.account.avatarUrl"
                color="primary"
              />
              <div class="teacher-session-summary__copy">
                <div class="font-weight-bold">
                  {{ store.account.name || store.account.username || store.account.email }}
                </div>
                <div class="text-caption">
                  已授权 {{ store.teacherWorkspaces.length }} 个教学空间
                </div>
              </div>
            </div>
            <v-spacer />
            <div class="teacher-session-summary__actions">
              <v-btn
                v-if="canOpenAdmin"
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
            </div>
          </v-card-text>
        </v-card>

        <TeacherActionCenter
          :busy-id="teacherActionBusyId"
          :center="store.teacherActionCenter"
          :loading="store.teacherActionCenterLoading"
          @certify="certifyActionItem"
          @edit="editingPublication = $event"
          @history="openHistory($event, 'teacher')"
          @refresh="store.refreshTeacherActionCenter()"
          @restore="restoreActionItem"
        />

        <v-row>
          <v-col
            cols="12"
            lg="7"
          >
            <publication-composer
              :editing-publication="editingPublication"
              @cancel="editingPublication = null"
              @published="showPublishedMessage"
              @reload-latest="editingPublication = $event"
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
    @refreshed="historyPublication = $event"
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
    :color="snackbarColor"
    location="bottom"
    :timeout="6000"
  >
    <div class="d-flex align-center ga-3">
      <v-icon :icon="snackbarIcon" />
      <div>
        <div class="font-weight-bold">
          {{ snackbarText }}
        </div>
        <div
          v-if="snackbarDetail"
          class="text-body-2 mt-1"
        >
          {{ snackbarDetail }}
        </div>
      </div>
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
import TeacherActionCenter from "@/components/v2/TeacherActionCenter.vue";
import ClassworksOobe from "@/components/v2/ClassworksOobe.vue";
import ScreenOobeChecklist from "@/components/v2/ScreenOobeChecklist.vue";
import {boardDateRelativeLabel} from "@/utils/boardDate";
import {
  screenHomeworkSaveFeedback,
  teacherPublicationSaveFeedback,
} from "@/utils/screenSaveFeedback";
import {isPublicationRevisionConflict} from "@/utils/publicationConflict";
import {
  CLASSWORKS_OOBE_VERSION,
  completeClassworksOobe,
  completeScreenOobe,
  isScreenOobeComplete,
  loadClassworksOobeState,
  rememberClassworksOobeRole,
  saveClassworksOobeState,
  shouldShowClassworksOobe,
} from "@/utils/classworksOobe";

const ClassroomToolsDialog = defineAsyncComponent(() => import("@/components/v2/ClassroomToolsDialog.vue"));

const store = useClassworksV2Store();
const route = useRoute();
const router = useRouter();
const mode = ref("student");
const appReady = ref(false);
const oobeState = ref(loadClassworksOobeState());
const oobeLanding = ref(false);
const screenOobePending = ref(false);
const snackbar = ref(false);
const snackbarText = ref("");
const snackbarDetail = ref("");
const snackbarColor = ref("success");
const snackbarIcon = ref("mdi-check-circle-outline");
const editingPublication = ref(null);
const teacherActionBusyId = ref("");
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

function showFeedback({
  title,
  detail = "",
  color = "success",
  icon = "mdi-check-circle-outline",
}) {
  snackbarText.value = title;
  snackbarDetail.value = detail;
  snackbarColor.value = color;
  snackbarIcon.value = icon;
  snackbar.value = true;
}

const teacherSchoolOptions = computed(() => store.schools.map((school) => ({
  title: school.name,
  value: school.id,
})));
const loginSchool = computed(() => store.schools.find((school) => school.id === loginSchoolId.value));
const showOAuthLogin = computed(() => Boolean(
  store.oauthProviders.length &&
  (loginSchool.value?.teacherAuthMode === "OAUTH_EMAIL" || loginSchool.value?.allowOAuthTeacherLogin),
));
const canOpenAdmin = computed(() => store.schoolMemberships.some((membership) =>
  ["OWNER", "ADMIN"].includes(membership.role),
));
const showMainNavigation = computed(() => Boolean(
  appReady.value &&
  !oobeLanding.value &&
  !screenOobePending.value &&
  (
    oobeState.value.completed ||
    store.isTeacherSignedIn ||
    store.selection.administrativeClassId ||
    store.screenSession
  ) &&
  (!store.screenSession || screenTemporarilyUnlocked.value),
));
const showOobeBack = computed(() => Boolean(
  appReady.value &&
  !oobeLanding.value &&
  !screenOobePending.value &&
  !store.screenSession &&
  !oobeState.value.completed,
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

function beginOobeRole(role) {
  oobeState.value = rememberClassworksOobeRole(role);
  oobeLanding.value = false;
  mode.value = role;
  if (role === "student") store.selectionDialog = true;
}

function returnToOobe() {
  store.selectionDialog = false;
  oobeState.value = saveClassworksOobeState({
    ...oobeState.value,
    version: CLASSWORKS_OOBE_VERSION,
    completed: false,
  });
  oobeLanding.value = true;
}

function finishRoleOobe(role) {
  oobeState.value = completeClassworksOobe(role);
  oobeLanding.value = false;
  if (route.query.oobe === "1") {
    const nextQuery = {...route.query};
    delete nextQuery.oobe;
    router.replace({path: "/", query: nextQuery});
  }
}

function finishScreenOobe() {
  const bindingId = store.screenSession?.binding?.id;
  if (bindingId) completeScreenOobe(bindingId);
  finishRoleOobe("screen");
  screenOobePending.value = false;
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
  if (session && !screenTemporarilyUnlocked.value) {
    oobeLanding.value = false;
    screenOobePending.value = !isScreenOobeComplete(session.binding.id);
  }
  if (!session && mode.value === "screen") mode.value = "student";
});
watch(() => store.account, (account) => {
  if (account && mode.value === "teacher") finishRoleOobe("teacher");
});
watch(() => store.selection.administrativeClassId, (administrativeClassId) => {
  if (administrativeClassId && mode.value === "student" && !screenTemporarilyUnlocked.value) {
    finishRoleOobe("student");
  }
});

onMounted(async () => {
  await Promise.all([
    store.bootstrapStudent({promptForSelection: false}),
    store.bootstrapTeacher(),
    store.bootstrapClassroomScreen(),
  ]);
  const hasStudentSelection = Boolean(store.selection.administrativeClassId);
  const forceOobe = route.query.oobe === "1";
  if (store.screenSession) {
    mode.value = "screen";
    oobeLanding.value = false;
    screenOobePending.value = forceOobe || !isScreenOobeComplete(store.screenSession.binding.id);
  } else if (forceOobe) {
    oobeState.value = saveClassworksOobeState({...oobeState.value, completed: false});
    oobeLanding.value = true;
  } else if (route.query.mode === "teacher") {
    mode.value = "teacher";
    oobeLanding.value = false;
  } else if (store.isTeacherSignedIn && (!hasStudentSelection || oobeState.value.roleHint === "teacher")) {
    mode.value = "teacher";
    finishRoleOobe("teacher");
  } else if (hasStudentSelection) {
    mode.value = "student";
    finishRoleOobe("student");
  } else if (
    oobeState.value.version === CLASSWORKS_OOBE_VERSION &&
    oobeState.value.completed &&
    oobeState.value.roleHint
  ) {
    mode.value = oobeState.value.roleHint;
    oobeLanding.value = false;
    if (mode.value === "student") store.selectionDialog = true;
  } else {
    oobeLanding.value = shouldShowClassworksOobe({
      state: oobeState.value,
      hasStudentSelection,
      isTeacherSignedIn: store.isTeacherSignedIn,
      hasScreenSession: Boolean(store.screenSession),
    });
  }
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
    showFeedback({title: "大屏登录成功", detail: "本机以后会自动进入班级大屏"});
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
    showFeedback({title: "PIN 已修改", detail: "请使用新 PIN 重新登录"});
  } catch (error) {
    store.teacherError = describeApiError(error, "修改 PIN 失败");
  } finally {
    changePinBusy.value = false;
  }
}

function openScreenComposer(publication = null) {
  screenEditingPublication.value = publication;
  screenComposerDialog.value = true;
}

function showScreenSavedMessage(publication, context = {}) {
  screenEditingPublication.value = null;
  showFeedback(screenHomeworkSaveFeedback(publication, context));
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
  const restored = publication.revision !== historyPublication.value?.revision;
  historyPublication.value = publication;
  showFeedback(restored
    ? {
        title: "历史版本已恢复",
        detail: `当前状态：教师已确认 · 新版本 ${publication.revision}`,
        icon: "mdi-backup-restore",
      }
    : {
        title: "当前版本已通过教师确认",
        detail: `版本 ${publication.revision} · 待处理事项已完成`,
        icon: "mdi-check-decagram-outline",
      });
}

async function certifyPublication(publication) {
  try {
    await store.certify(publication);
    showFeedback({
      title: "当前版本已通过教师确认",
      detail: `版本 ${publication.revision} · 待处理事项已完成`,
      icon: "mdi-check-decagram-outline",
    });
  } catch (error) {
    if (isPublicationRevisionConflict(error)) {
      await Promise.all([store.refreshTeacherPublications(), store.refreshTeacherActionCenter()]);
      showFeedback({
        title: "没有确认旧版本",
        detail: "内容已被其他设备修改，列表已刷新，请检查最新版本",
        color: "warning",
        icon: "mdi-alert-outline",
      });
    }
  }
}

async function certifyActionItem(item) {
  teacherActionBusyId.value = item.id;
  try {
    await store.certify(item.publication);
    showFeedback({
      title: "当前版本已通过教师确认",
      detail: `版本 ${item.publication.revision} · 待处理事项已完成`,
      icon: "mdi-check-decagram-outline",
    });
  } catch (error) {
    if (isPublicationRevisionConflict(error)) {
      await store.refreshTeacherActionCenter();
      showFeedback({
        title: "没有确认旧版本",
        detail: "内容刚刚发生变化，请重新检查最新版本",
        color: "warning",
        icon: "mdi-alert-outline",
      });
    }
  } finally {
    teacherActionBusyId.value = "";
  }
}

async function restoreActionItem(item) {
  const revision = item.lastCertifiedRevision?.revision;
  if (!revision) return;
  if (!window.confirm(`恢复教师确认的版本 #${revision} 吗？当前内容仍会保留在版本历史中。`)) return;
  teacherActionBusyId.value = item.id;
  try {
    await store.restoreRevision(item.publication, revision, "teacher");
    showFeedback({
      title: `已恢复教师确认版本 #${revision}`,
      detail: "当前状态：教师已确认 · 原来的当前版本仍保留在历史中",
      icon: "mdi-backup-restore",
    });
  } catch (error) {
    if (isPublicationRevisionConflict(error)) {
      await store.refreshTeacherActionCenter();
      showFeedback({
        title: "没有恢复旧版本",
        detail: "当前内容已发生变化，待处理中心已刷新，请重新比较版本",
        color: "warning",
        icon: "mdi-alert-outline",
      });
    }
  } finally {
    teacherActionBusyId.value = "";
  }
}

function showPublishedMessage(publication, context = {}) {
  editingPublication.value = null;
  showFeedback(teacherPublicationSaveFeedback(publication, context));
}

async function withdrawPublication(publication) {
  if (!window.confirm(`确定撤回“${publication.title || publication.content.slice(0, 20)}”吗？`)) return;
  try {
    await store.withdraw(publication);
    showFeedback({
      title: `${publication.type === "NOTICE" ? "通知" : "作业"}已撤回`,
      detail: "当前状态：不再向学生端和大屏展示",
      color: "info",
      icon: "mdi-undo-variant",
    });
  } catch (error) {
    if (isPublicationRevisionConflict(error)) {
      await Promise.all([store.refreshTeacherPublications(), store.refreshTeacherActionCenter()]);
      showFeedback({
        title: "没有撤回旧版本",
        detail: "内容已被其他设备修改，发布列表已刷新",
        color: "warning",
        icon: "mdi-alert-outline",
      });
    }
  }
}

async function clonePublication(publication) {
  await store.clone(publication);
  showFeedback({
    title: publication.type === "ASSIGNMENT" ? "已复制为今天的新作业草稿" : "已复制为新通知草稿",
    detail: "当前状态：尚未发布",
    color: "info",
    icon: "mdi-content-copy",
  });
}

async function copyScreenBoardToToday() {
  if (!window.confirm(`将${boardDateLabel.value}的作业复制到今天吗？当天已有的相同作业会自动跳过。`)) return;
  try {
    const result = await store.copyScreenBoardToToday();
    showFeedback({
      title: `已复制 ${result.createdCount} 项作业`,
      detail: `跳过 ${result.skippedCount} 项重复作业 · 新副本等待教师确认`,
      color: "warning",
      icon: "mdi-content-copy",
    });
  } catch {
    // 大屏错误提示已经给出可操作原因。
  }
}
</script>

<style scoped>
.classworks-app-bar__brand {
  flex: 1 1 auto;
  min-width: 180px;
}

.classworks-app-bar__title {
  white-space: nowrap;
}

.classworks-mode-nav__content,
.classworks-mode-nav :deep(.v-btn__content) {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.teacher-session-summary,
.teacher-session-summary__identity,
.teacher-session-summary__actions {
  align-items: center;
  display: flex;
}

.teacher-session-summary__identity {
  gap: 12px;
  min-width: 0;
}

.teacher-session-summary__copy {
  min-width: 150px;
}

.teacher-session-summary__actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

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
  .teacher-session-summary {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .teacher-session-summary > :deep(.v-spacer) {
    display: none;
  }

  .teacher-session-summary__copy {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .teacher-session-summary__actions {
    justify-content: flex-start;
  }

  .selection-summary__content {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
  }

  .selection-summary__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .classworks-app-bar--with-nav .classworks-app-bar__brand {
    display: none;
  }

  .classworks-mode-nav {
    flex: 1 1 auto;
    margin-left: 0 !important;
    min-width: 0;
  }

  .classworks-mode-nav :deep(.v-btn) {
    flex: 1 1 0;
    min-width: 0 !important;
    padding-inline: 10px;
  }

  .classworks-app-bar__settings {
    flex: 0 0 auto;
    margin-left: 4px !important;
  }
}

@media (max-width: 460px) {
  .classworks-mode-nav__label {
    display: none;
  }

  .classworks-mode-nav :deep(.v-btn__content) {
    gap: 0;
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
