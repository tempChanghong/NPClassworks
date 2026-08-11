import {defineStore} from "pinia";
import {
  classworksV2Api,
  clearAccountTokens,
  clearClassroomScreenToken,
  consumeOAuthError,
  describeApiError,
  getAccountTokens,
  getClassroomScreenToken,
  getOAuthProviders,
} from "@/utils/classworksV2Client";
import {
  joinWorkspaces,
  leaveWorkspaces,
  on as socketOn,
  onConnect,
} from "@/utils/socketClient";
import {
  publicationTransitionDelay,
  sanitizeCourseGroupIds,
} from "@/utils/classworksSelection";
import {sanitizeBoardDate, todayBoardDate} from "@/utils/boardDate";

const SELECTION_KEY = "classworks-v2-student-selection";
let realtimeCleanup = [];
let refreshTimer = null;
let transitionTimer = null;
let fallbackTimer = null;
let courseOptionsRequest = 0;
let feedRequest = 0;

function loadSavedSelection() {
  try {
    return JSON.parse(localStorage.getItem(SELECTION_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSelection(selection) {
  localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
}

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
    studentError: "",
    studentNotice: "",
    selectionDialog: false,

    account: null,
    oauthProviders: [],
    memberships: [],
    teacherSubjects: [],
    teacherPublications: [],
    schoolMemberships: [],
    teacherLoading: false,
    teacherPublicationsLoading: false,
    teacherError: "",

    screenSession: null,
    screenLoading: false,
    screenError: "",
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
    canBindSelectedClassroomScreen(state) {
      const schoolId = state.selection.schoolId;
      return Boolean(
        state.account &&
        state.selection.administrativeClassId &&
        state.schoolMemberships.some(
          (membership) => membership.schoolId === schoolId && ["OWNER", "ADMIN"].includes(membership.role),
        )
      );
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
  },

  actions: {
    async bootstrapStudent() {
      this.studentLoading = true;
      this.studentError = "";
      try {
        this.schools = await classworksV2Api.schools();
        const savedSchoolExists = this.schools.some((school) => school.id === this.selection.schoolId);
        if (this.selection.schoolId && !savedSchoolExists) {
          this.selection = {};
          this.courseOptions = null;
          this.studentNotice = "学校配置已经更新，请重新选择行政班和走班。";
          localStorage.removeItem(SELECTION_KEY);
        }
        const schoolId = (savedSchoolExists ? this.selection.schoolId : "")
          || (this.schools.length === 1 ? this.schools[0].id : "");
        if (!schoolId) {
          this.selectionDialog = true;
          return;
        }
        await this.loadSchool(schoolId, {preserveSelection: true});
        if (this.selection.administrativeClassId) {
          const exists = this.administrativeClasses.some(
            (workspace) => workspace.id === this.selection.administrativeClassId,
          );
          if (exists) {
            this.courseOptions = await classworksV2Api.courseOptions(
              this.selection.administrativeClassId,
            );
            const sanitized = sanitizeCourseGroupIds(
              this.courseOptions,
              this.selection.courseGroupIds,
            );
            if (JSON.stringify(sanitized) !== JSON.stringify(this.selection.courseGroupIds || {})) {
              this.selection = {...this.selection, courseGroupIds: sanitized};
              saveSelection(this.selection);
              this.studentNotice = "班级配置已经更新，已移除失效的走班选择，请确认当前选班。";
            }
            if (this.feedAudience === "student") await this.loadStudentFeed();
          } else {
            this.clearStudentSelection();
            this.selectionDialog = true;
          }
        } else {
          this.selectionDialog = true;
        }
      } catch (error) {
        this.studentError = describeApiError(error, "加载学校和班级失败");
      } finally {
        this.studentLoading = false;
      }
    },

    async loadSchool(schoolId, {preserveSelection = false} = {}) {
      this.term = await classworksV2Api.currentTerm(schoolId);
      const [grades, administrativeClasses, subjects] = await Promise.all([
        classworksV2Api.grades(this.term.id),
        classworksV2Api.workspaces({termId: this.term.id, type: "ADMIN_CLASS"}),
        classworksV2Api.subjects(schoolId),
      ]);
      this.grades = grades;
      this.administrativeClasses = administrativeClasses;
      this.studentSubjects = subjects;
      if (!preserveSelection || this.selection.schoolId !== schoolId) {
        this.selection = {schoolId, courseGroupIds: {}};
        this.courseOptions = null;
      }
    },

    async loadCourseOptions(administrativeClassId) {
      const requestId = ++courseOptionsRequest;
      const result = administrativeClassId
        ? await classworksV2Api.courseOptions(administrativeClassId)
        : null;
      if (requestId === courseOptionsRequest) this.courseOptions = result;
      return result;
    },

    async commitStudentSelection({schoolId, administrativeClassId, courseGroupIds}) {
      const school = this.schools.find((item) => item.id === schoolId);
      const administrativeClass = this.administrativeClasses.find(
        (item) => item.id === administrativeClassId,
      );
      if (!school || !administrativeClass) throw new Error("请选择有效的学校和行政班");
      if (this.courseOptions?.administrativeClass?.id !== administrativeClassId) {
        await this.loadCourseOptions(administrativeClassId);
      }
      const oldWorkspaceIds = this.selectedWorkspaceIds;
      const sanitizedCourseGroupIds = sanitizeCourseGroupIds(
        this.courseOptions,
        courseGroupIds,
      );
      this.selection = {
        schoolId,
        schoolName: school.name,
        termId: this.term?.id,
        administrativeClassId,
        administrativeClassName: administrativeClass.name,
        courseGroupIds: sanitizedCourseGroupIds,
      };
      saveSelection(this.selection);
      if (this.feedAudience === "student") {
        leaveWorkspaces(oldWorkspaceIds);
        joinWorkspaces(this.selectedWorkspaceIds);
      }
      this.selectionDialog = false;
      if (this.feedAudience === "student") await this.loadStudentFeed();
    },

    clearStudentSelection() {
      if (this.feedAudience === "student") leaveWorkspaces(this.selectedWorkspaceIds);
      this.selection = {};
      this.courseOptions = null;
      this.feed = [];
      this.studentNotice = "";
      feedRequest += 1;
      clearTimeout(transitionTimer);
      transitionTimer = null;
      localStorage.removeItem(SELECTION_KEY);
    },

    async loadStudentFeed() {
      const requestId = ++feedRequest;
      if (this.selectedWorkspaceIds.length === 0) {
        if (this.feedAudience === "student") {
          this.feed = [];
          this.feedGeneratedAt = null;
        }
        return;
      }
      this.feedLoading = true;
      this.studentError = "";
      try {
        const result = await classworksV2Api.feed(this.selectedWorkspaceIds, this.boardDate);
        if (requestId !== feedRequest || this.feedAudience !== "student") return;
        this.feed = result.items || [];
        this.feedGeneratedAt = result.generatedAt;
        this.scheduleFeedTransition(result.nextTransitionAt);
      } catch (error) {
        if (requestId === feedRequest && this.feedAudience === "student") {
          this.studentError = describeApiError(error, "加载作业失败");
        }
      } finally {
        if (requestId === feedRequest) this.feedLoading = false;
      }
    },

    async loadScreenFeed() {
      if (!this.screenSession) return;
      const requestId = ++feedRequest;
      this.feedLoading = true;
      this.screenError = "";
      try {
        const result = await classworksV2Api.classroomScreenFeed(this.boardDate);
        if (requestId !== feedRequest || this.feedAudience !== "screen") return;
        this.feed = result.items || [];
        this.feedGeneratedAt = result.generatedAt;
        this.scheduleFeedTransition(result.nextTransitionAt);
      } catch (error) {
        if (requestId !== feedRequest || this.feedAudience !== "screen") return;
        this.screenError = describeApiError(error, "加载大屏作业失败");
        if ([401, 409].includes(error.response?.status)) {
          const oldWorkspaceIds = this.activeWorkspaceIds;
          leaveWorkspaces(oldWorkspaceIds);
          clearClassroomScreenToken();
          this.screenSession = null;
          this.feedAudience = "student";
          this.feed = [];
          joinWorkspaces(this.selectedWorkspaceIds);
        }
      } finally {
        if (requestId === feedRequest) this.feedLoading = false;
      }
    },

    async loadActiveFeed() {
      return this.feedAudience === "screen"
        ? this.loadScreenFeed()
        : this.loadStudentFeed();
    },

    async setBoardDate(value) {
      const nextDate = sanitizeBoardDate(value, this.boardDate);
      if (nextDate === this.boardDate) return;
      this.boardDate = nextDate;
      await this.loadActiveFeed();
    },

    async copyScreenBoardToToday() {
      const targetBoardDate = todayBoardDate();
      this.screenError = "";
      try {
        const result = await classworksV2Api.copyClassroomScreenBoard(this.boardDate, targetBoardDate);
        this.boardDate = targetBoardDate;
        await this.loadScreenFeed();
        return result;
      } catch (error) {
        this.screenError = describeApiError(error, "复制作业失败");
        throw error;
      }
    },

    async setFeedAudience(audience) {
      const nextAudience = audience === "screen" && this.screenSession ? "screen" : "student";
      if (nextAudience === this.feedAudience) return this.loadActiveFeed();
      const oldWorkspaceIds = this.activeWorkspaceIds;
      leaveWorkspaces(oldWorkspaceIds);
      this.feedAudience = nextAudience;
      this.feed = [];
      joinWorkspaces(this.activeWorkspaceIds);
      return this.loadActiveFeed();
    },

    scheduleFeedTransition(nextTransitionAt) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
      const delay = publicationTransitionDelay(nextTransitionAt);
      if (delay === null) return;
      transitionTimer = setTimeout(() => this.loadActiveFeed(), delay);
    },

    startRealtime() {
      realtimeCleanup.forEach((cleanup) => cleanup?.());
      realtimeCleanup = [];
      clearTimeout(refreshTimer);
      refreshTimer = null;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
      const refresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => this.loadActiveFeed(), 250);
      };
      for (const event of [
        "publication.created",
        "publication.updated",
        "publication.withdrawn",
        "publication.certified",
        "publication.restored",
      ]) {
        realtimeCleanup.push(socketOn(event, refresh));
      }
      realtimeCleanup.push(onConnect(() => joinWorkspaces(this.activeWorkspaceIds)));
      joinWorkspaces(this.activeWorkspaceIds);
      fallbackTimer = setInterval(() => {
        if (this.activeWorkspaceIds.length > 0 && document.visibilityState !== "hidden") {
          this.loadActiveFeed();
        }
      }, 5 * 60 * 1000);
    },

    stopRealtime() {
      realtimeCleanup.forEach((cleanup) => cleanup?.());
      realtimeCleanup = [];
      clearTimeout(refreshTimer);
      refreshTimer = null;
      clearTimeout(transitionTimer);
      transitionTimer = null;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    },

    async bootstrapTeacher() {
      this.teacherLoading = true;
      this.teacherError = consumeOAuthError();
      try {
        this.oauthProviders = await getOAuthProviders();
        if (!getAccountTokens().accessToken) return;
        const [account, memberships, publications, schoolMemberships] = await Promise.all([
          classworksV2Api.profile(),
          classworksV2Api.myWorkspaces(),
          classworksV2Api.publications({limit: 100}),
          classworksV2Api.mySchools(),
        ]);
        this.account = account;
        this.memberships = memberships;
        this.teacherPublications = publications.items || [];
        this.schoolMemberships = schoolMemberships;
        const schoolIds = [...new Set(
          memberships.map((membership) => membership.workspace.term.school.id),
        )];
        const subjectLists = await Promise.all(
          schoolIds.map((schoolId) => classworksV2Api.subjects(schoolId)),
        );
        this.teacherSubjects = subjectLists.flat();
      } catch (error) {
        this.teacherError = describeApiError(error, "加载教师工作台失败");
        if (error.response?.status === 401) {
          clearAccountTokens();
          this.account = null;
        }
      } finally {
        this.teacherLoading = false;
      }
    },

    eligibleTeacherWorkspaces(type, subjectId) {
      if (type === "NOTICE") return this.teacherWorkspaces;
      if (!subjectId) return [];
      return this.teacherWorkspaces.filter((workspace) => {
        if (workspace.type === "COURSE_GROUP") return workspace.subjectId === subjectId;
        if (workspace.type !== "ADMIN_CLASS") return false;
        return workspace.subjectRules?.some(
          (rule) => rule.subjectId === subjectId && rule.deliveryMode === "ADMIN_CLASS",
        );
      });
    },

    async publish(input) {
      this.teacherError = "";
      try {
        const publication = await classworksV2Api.createPublication(input);
        await this.refreshTeacherPublications();
        if (input.status === "PUBLISHED") await this.loadActiveFeed();
        return publication;
      } catch (error) {
        this.teacherError = describeApiError(error, "发布失败");
        throw error;
      }
    },

    async bootstrapClassroomScreen() {
      if (!getClassroomScreenToken()) {
        this.screenSession = null;
        return;
      }
      this.screenLoading = true;
      this.screenError = "";
      try {
        this.screenSession = await classworksV2Api.classroomScreenSession();
      } catch (error) {
        this.screenSession = null;
        this.screenError = describeApiError(error, "加载大屏绑定失败");
        if (error.response?.status === 401) clearClassroomScreenToken();
      } finally {
        this.screenLoading = false;
      }
    },

    async loadClassroomTools(date) {
      if (!this.screenSession) return;
      this.classroomToolsLoading = true;
      this.classroomToolsError = "";
      try {
        const [students, attendance] = await Promise.all([
          classworksV2Api.classroomStudents(),
          classworksV2Api.classroomAttendance(date),
        ]);
        this.classroomStudents = students || [];
        this.classroomAttendance = attendance || {date, absent: [], late: [], excluded: []};
      } catch (error) {
        this.classroomToolsError = describeApiError(error, "加载课堂工具数据失败");
        throw error;
      } finally {
        this.classroomToolsLoading = false;
      }
    },

    async replaceClassroomStudents(students) {
      this.classroomToolsError = "";
      try {
        this.classroomStudents = await classworksV2Api.replaceClassroomStudents(students);
        return this.classroomStudents;
      } catch (error) {
        this.classroomToolsError = describeApiError(error, "保存学生名单失败");
        throw error;
      }
    },

    async saveClassroomAttendance(date, attendance) {
      this.classroomToolsError = "";
      try {
        this.classroomAttendance = await classworksV2Api.saveClassroomAttendance(date, attendance);
        return this.classroomAttendance;
      } catch (error) {
        this.classroomToolsError = describeApiError(error, "保存考勤失败");
        throw error;
      }
    },

    async bindCurrentClassroomScreen() {
      if (!this.canBindSelectedClassroomScreen) throw new Error("需要学校管理员权限并先选择行政班");
      this.screenLoading = true;
      this.screenError = "";
      try {
        const {getVisitorId} = await import("@/utils/visitorId");
        const deviceFingerprint = await getVisitorId();
        await classworksV2Api.bindClassroomScreen(this.selection.schoolId, {
          administrativeClassId: this.selection.administrativeClassId,
          deviceFingerprint,
          name: `${this.selectedClassName}一体机`,
        });
        await this.bootstrapClassroomScreen();
        const session = this.screenSession;
        await this.signOutTeacher();
        return session;
      } catch (error) {
        this.screenError = describeApiError(error, "绑定大屏失败");
        throw error;
      } finally {
        this.screenLoading = false;
      }
    },

    screenCanEdit(publication) {
      if (!this.screenSession || publication.type !== "ASSIGNMENT" || publication.status !== "PUBLISHED") {
        return false;
      }
      const allowed = new Set(this.screenWorkspaces.map((workspace) => workspace.id));
      return publication.targets?.length === 1 && publication.targets.every(
        (target) => allowed.has(target.workspaceId),
      );
    },

    eligibleScreenWorkspaces(subjectId) {
      if (!subjectId) return [];
      return this.screenWorkspaces.filter((workspace) => {
        if (workspace.type === "COURSE_GROUP") return workspace.subjectId === subjectId;
        if (workspace.type !== "ADMIN_CLASS") return false;
        return workspace.subjectRules?.some(
          (rule) => rule.subjectId === subjectId && rule.deliveryMode === "ADMIN_CLASS",
        );
      });
    },

    async saveScreenPublication(input, publication = null) {
      this.screenError = "";
      try {
        const saved = publication
          ? await classworksV2Api.updateScreenPublication(publication, input)
          : await classworksV2Api.createScreenPublication(input);
        await this.loadActiveFeed();
        if (this.isTeacherSignedIn) await this.refreshTeacherPublications();
        return saved;
      } catch (error) {
        this.screenError = describeApiError(error, "保存大屏作业失败");
        throw error;
      }
    },

    async publicationRevisions(publication, mode = "teacher") {
      return mode === "screen"
        ? classworksV2Api.screenPublicationRevisions(publication.id)
        : classworksV2Api.publicationRevisions(publication.id);
    },

    async certify(publication) {
      try {
        const certified = await classworksV2Api.certifyPublication(publication);
        await this.refreshTeacherPublications();
        await this.loadActiveFeed();
        return certified;
      } catch (error) {
        this.teacherError = describeApiError(error, "认证失败");
        throw error;
      }
    },

    async restoreRevision(publication, sourceRevision, mode = "teacher") {
      try {
        const restored = mode === "screen"
          ? await classworksV2Api.restoreScreenPublication(publication, sourceRevision)
          : await classworksV2Api.restorePublication(publication, sourceRevision);
        if (this.isTeacherSignedIn) await this.refreshTeacherPublications();
        await this.loadActiveFeed();
        return restored;
      } catch (error) {
        const message = describeApiError(error, "恢复版本失败");
        if (mode === "screen") this.screenError = message;
        else this.teacherError = message;
        throw error;
      }
    },

    async refreshTeacherPublications() {
      this.teacherPublicationsLoading = true;
      try {
        const result = await classworksV2Api.publications({limit: 100});
        this.teacherPublications = result.items || [];
      } catch (error) {
        this.teacherError = describeApiError(error, "刷新发布记录失败");
      } finally {
        this.teacherPublicationsLoading = false;
      }
    },

    async updatePublication(publication, input) {
      this.teacherError = "";
      try {
        const updated = await classworksV2Api.updatePublication(
          publication.id,
          publication.revision,
          input,
        );
        await this.refreshTeacherPublications();
        await this.loadActiveFeed();
        return updated;
      } catch (error) {
        this.teacherError = describeApiError(error, "更新失败");
        throw error;
      }
    },

    async withdraw(publication) {
      try {
        await classworksV2Api.withdrawPublication(publication.id, publication.revision);
        await this.refreshTeacherPublications();
        await this.loadActiveFeed();
      } catch (error) {
        this.teacherError = describeApiError(error, "撤回失败");
        throw error;
      }
    },

    async clone(publication) {
      try {
        await classworksV2Api.clonePublication(publication.id, {
          boardDate: publication.type === "ASSIGNMENT" ? todayBoardDate() : null,
          dueAt: null,
        });
        await this.refreshTeacherPublications();
      } catch (error) {
        this.teacherError = describeApiError(error, "复制失败");
        throw error;
      }
    },

    async signOutTeacher() {
      try {
        if (getAccountTokens().accessToken) await classworksV2Api.logout();
      } catch {
        // 本地登出不能被临时网络故障阻塞；服务端会话仍会自然过期。
      }
      clearAccountTokens();
      this.account = null;
      this.memberships = [];
      this.teacherSubjects = [];
      this.teacherPublications = [];
      this.teacherPublicationsLoading = false;
      this.schoolMemberships = [];
    },
  },
});
