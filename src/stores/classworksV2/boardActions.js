import {classworksV2Api, clearClassroomScreenToken, describeApiError} from "@/utils/classworksV2Client";
import {joinWorkspaces, leaveWorkspaces, on as socketOn, onConnect} from "@/utils/socketClient";
import {publicationTransitionDelay, sanitizeCourseGroupIds} from "@/utils/classworksSelection";
import {sanitizeBoardDate, todayBoardDate} from "@/utils/boardDate";
import {clearCachedScreenSession, loadCachedScreenFeed, saveCachedScreenFeed} from "@/utils/screenOfflineCache";
import {SELECTION_KEY, saveSelection} from "./studentSelection";
import {isTransientScreenRequestError} from "./screenRequestError";

let realtimeCleanup = [];
let refreshTimer = null;
let transitionTimer = null;
let fallbackTimer = null;
let courseOptionsRequest = 0;
let feedRequest = 0;

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const boardActions = {
  async bootstrapStudent({promptForSelection = true} = {}) {
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
        this.selectionDialog = promptForSelection;
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
          try {
            const validation = await classworksV2Api.validateStudentSelection(
              this.selection.administrativeClassId,
              {
                courseGroupIds: this.selection.courseGroupIds || {},
                declinedSubjectIds: this.selection.declinedSubjectIds || [],
              },
            );
            this.selectionIssues = validation.issues || [];
            this.selectionNeedsConfirmation = false;
            this.selection = {
              ...this.selection,
              courseGroupIds: validation.normalized.courseGroupIds,
              declinedSubjectIds: validation.normalized.declinedSubjectIds,
              confirmedAt: validation.confirmedAt,
            };
            saveSelection(this.selection);
          } catch (validationError) {
            const validation = validationError.response?.data?.data;
            this.selectionIssues = validation?.issues || [];
            this.selectionNeedsConfirmation = true;
            this.studentNotice = "请重新确认走班选择：每个走班科目都要选择教学班或明确标记为不修读。";
            this.selectionDialog = promptForSelection;
          }
          if (this.feedAudience === "student") await this.loadStudentFeed();
        } else {
          this.clearStudentSelection();
          this.selectionDialog = promptForSelection;
        }
      } else {
        this.selectionDialog = promptForSelection;
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
      this.selectionIssues = [];
      this.selectionNeedsConfirmation = false;
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

  async commitStudentSelection({schoolId, administrativeClassId, courseGroupIds, declinedSubjectIds}) {
    const school = this.schools.find((item) => item.id === schoolId);
    const administrativeClass = this.administrativeClasses.find(
      (item) => item.id === administrativeClassId,
    );
    if (!school || !administrativeClass) throw new Error("请选择有效的学校和行政班");
    if (this.courseOptions?.administrativeClass?.id !== administrativeClassId) {
      await this.loadCourseOptions(administrativeClassId);
    }
    const oldWorkspaceIds = this.selectedWorkspaceIds;
    let validation;
    try {
      validation = await classworksV2Api.validateStudentSelection(administrativeClassId, {
        courseGroupIds,
        declinedSubjectIds,
      });
    } catch (error) {
      this.selectionIssues = error.response?.data?.data?.issues || [];
      this.selectionNeedsConfirmation = true;
      throw error;
    }
    const sanitizedCourseGroupIds = validation.normalized.courseGroupIds;
    this.selection = {
      schoolId,
      schoolName: school.name,
      termId: this.term?.id,
      administrativeClassId,
      administrativeClassName: administrativeClass.name,
      courseGroupIds: sanitizedCourseGroupIds,
      declinedSubjectIds: validation.normalized.declinedSubjectIds,
      confirmedAt: validation.confirmedAt,
    };
    this.selectionIssues = validation.issues || [];
    this.selectionNeedsConfirmation = false;
    saveSelection(this.selection);
    if (this.feedAudience === "student") {
      leaveWorkspaces(oldWorkspaceIds);
      joinWorkspaces(this.realtimeWorkspaceIds);
    }
    this.selectionDialog = false;
    if (this.feedAudience === "student") await this.loadStudentFeed();
  },

  clearStudentSelection() {
    if (this.feedAudience === "student") leaveWorkspaces(this.selectedWorkspaceIds);
    this.selection = {};
    this.courseOptions = null;
    this.feed = [];
    this.feedLoadError = "";
    this.feedUsingCache = false;
    this.studentNotice = "";
    this.selectionIssues = [];
    this.selectionNeedsConfirmation = false;
    feedRequest += 1;
    clearTimeout(transitionTimer);
    transitionTimer = null;
    localStorage.removeItem(SELECTION_KEY);
    joinWorkspaces(this.realtimeWorkspaceIds);
  },

  async loadStudentFeed() {
    const requestId = ++feedRequest;
    if (this.selectedWorkspaceIds.length === 0) {
      if (this.feedAudience === "student") {
        this.feed = [];
        this.feedGeneratedAt = null;
        this.feedLoadError = "";
        this.feedUsingCache = false;
      }
      return;
    }
    this.feedLoading = true;
    this.feedLoadError = "";
    this.feedUsingCache = false;
    this.studentError = "";
    try {
      const result = await classworksV2Api.feed(this.selectedWorkspaceIds, this.boardDate);
      if (requestId !== feedRequest || this.feedAudience !== "student") return;
      this.feed = result.items || [];
      this.feedGeneratedAt = result.generatedAt;
      this.scheduleFeedTransition(result.nextTransitionAt);
    } catch (error) {
      if (requestId === feedRequest && this.feedAudience === "student") {
        this.feed = [];
        this.feedGeneratedAt = null;
        this.feedLoadError = describeApiError(error, "加载作业失败");
      }
    } finally {
      if (requestId === feedRequest) this.feedLoading = false;
    }
  },

  async loadScreenFeed() {
    if (!this.screenSession) return;
    const requestId = ++feedRequest;
    this.feedLoading = true;
    this.feedLoadError = "";
    this.feedUsingCache = false;
    try {
      const result = await classworksV2Api.classroomScreenFeed(this.boardDate);
      if (requestId !== feedRequest || this.feedAudience !== "screen") return;
      this.feed = result.items || [];
      this.feedGeneratedAt = result.generatedAt;
      saveCachedScreenFeed(this.screenSession.binding.id, this.boardDate, result);
      this.scheduleFeedTransition(result.nextTransitionAt);
    } catch (error) {
      if (requestId !== feedRequest || this.feedAudience !== "screen") return;
      const cached = isTransientScreenRequestError(error)
        ? loadCachedScreenFeed(this.screenSession?.binding?.id, this.boardDate)
        : null;
      if (cached) {
        this.feed = cached.items || [];
        this.feedGeneratedAt = cached.generatedAt;
        this.feedUsingCache = true;
        this.feedLoadError = "当前无法连接服务器，正在显示这台大屏上次同步的内容";
        return;
      }
      this.feed = [];
      this.feedGeneratedAt = null;
      this.feedLoadError = describeApiError(error, "加载大屏作业失败");
      if ([401, 409].includes(error.response?.status)) {
        const oldWorkspaceIds = this.activeWorkspaceIds;
        leaveWorkspaces(oldWorkspaceIds);
        clearClassroomScreenToken();
        clearCachedScreenSession();
        this.screenSession = null;
        this.feedAudience = "student";
        this.feed = [];
        this.feedLoadError = "";
        this.feedUsingCache = false;
        joinWorkspaces(this.realtimeWorkspaceIds);
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
    this.feedLoadError = "";
    this.feedUsingCache = false;
    joinWorkspaces(this.realtimeWorkspaceIds);
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
      refreshTimer = setTimeout(() => {
        void this.loadActiveFeed();
        if (this.isTeacherSignedIn) {
          void this.refreshTeacherPublications();
          void this.refreshTeacherActionCenter();
        }
      }, 250);
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
    realtimeCleanup.push(onConnect(() => joinWorkspaces(this.realtimeWorkspaceIds)));
    joinWorkspaces(this.realtimeWorkspaceIds);
    fallbackTimer = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        if (this.activeWorkspaceIds.length > 0) void this.loadActiveFeed();
        if (this.isTeacherSignedIn) void this.refreshTeacherActionCenter();
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
};
