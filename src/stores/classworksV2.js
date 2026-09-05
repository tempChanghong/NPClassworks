import {defineStore} from "pinia";
import {getAccountTokens} from "@/utils/classworksV2Client";
import {todayBoardDate} from "@/utils/boardDate";
import {sanitizeTeacherTargetPreferences} from "@/utils/teacherTargetPreferences";
import {loadSavedSelection} from "./classworksV2/studentSelection";
import {boardActions} from "./classworksV2/boardActions";
import {teacherActions} from "./classworksV2/teacherActions";
import {screenSessionActions} from "./classworksV2/screenSessionActions";
import {screenSyncActions} from "./classworksV2/screenSyncActions";

export const useClassworksV2Store = defineStore("classworks-v2", {
  state: () => ({
    schools: [],
    term: null,
    grades: [],
    administrativeClasses: [],
    courseOptions: null,
    studentSubjects: [],
    selection: loadSavedSelection(),
    feed: [],
    boardDate: todayBoardDate(),
    feedGeneratedAt: null,
    feedAudience: "student",
    studentLoading: false,
    feedLoading: false,
    feedLoadError: "",
    feedUsingCache: false,
    studentError: "",
    studentNotice: "",
    selectionIssues: [],
    selectionNeedsConfirmation: false,
    selectionDialog: false,

    account: null,
    teacherSessionVersion: 0,
    oauthProviders: [],
    memberships: [],
    teacherSubjects: [],
    teacherHomeworkSettingsBySchool: {},
    teacherPublications: [],
    teacherActionCenter: {
      items: [],
      total: 0,
      summary: {total: 0, changedAfterCertified: 0, createdByScreen: 0, other: 0, dueSoon: 0, overdue: 0},
    },
    schoolMemberships: [],
    teacherLoading: false,
    teacherPublicationsLoading: false,
    teacherActionCenterLoading: false,
    teacherError: "",
    teacherTargetPreferences: sanitizeTeacherTargetPreferences(),
    teacherTargetPreferencesSynced: false,
    teacherTargetPreferencesSyncing: false,
    teacherTargetPreferencesSyncPending: false,
    teacherTargetPreferencesError: "",

    screenSession: null,
    screenLoading: false,
    screenError: "",
    screenNetworkOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    screenRealtimeConnected: false,
    screenPendingUploads: [],
    screenSyncing: false,
    screenLastSyncedAt: null,
    screenHeartbeatAt: null,
    classroomStudents: [],
    classroomAttendance: {date: "", absent: [], late: [], excluded: []},
    classroomToolsLoading: false,
    classroomToolsError: "",
  }),

  getters: {
    selectedWorkspaceIds(state) {
      const ids = [];
      if (state.selection.administrativeClassId) ids.push(state.selection.administrativeClassId);
      ids.push(...Object.values(state.selection.courseGroupIds || {}).filter(Boolean));
      return [...new Set(ids)];
    },
    selectedClassName(state) {
      return state.selection.administrativeClassName || "尚未选择班级";
    },
    teacherWorkspaces(state) {
      const writableRoles = new Set(["OWNER", "TEACHER", "ASSISTANT"]);
      return state.memberships
        .filter((membership) => writableRoles.has(membership.role))
        .map((membership) => ({
          ...membership.workspace,
          membershipRole: membership.role,
        }));
    },
    isTeacherSignedIn(state) {
      return Boolean(state.account && getAccountTokens().accessToken);
    },
    screenWorkspaces(state) {
      return state.screenSession?.workspaces || [];
    },
    activeWorkspaceIds(state) {
      if (state.feedAudience === "screen") {
        return (state.screenSession?.workspaces || []).map((workspace) => workspace.id);
      }
      const ids = [];
      if (state.selection.administrativeClassId) ids.push(state.selection.administrativeClassId);
      ids.push(...Object.values(state.selection.courseGroupIds || {}).filter(Boolean));
      return [...new Set(ids)];
    },
    realtimeWorkspaceIds() {
      return [...new Set([
        ...this.activeWorkspaceIds,
        ...this.teacherWorkspaces.map((workspace) => workspace.id),
      ])];
    },
    screenPendingReviewCount(state) {
      return state.screenPendingUploads.filter((item) => item.status === "needs_review").length;
    },
    screenSyncState(state) {
      if (!state.screenNetworkOnline) return "offline";
      if (state.screenSyncing) return "syncing";
      if (state.screenPendingUploads.length) return "pending";
      if (!state.screenRealtimeConnected) return "reconnecting";
      return "synced";
    },
  },

  actions: {
    ...boardActions,
    ...teacherActions,
    ...screenSessionActions,
    ...screenSyncActions,
  },
});
