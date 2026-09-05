import {
  classworksV2Api,
  clearClassroomScreenToken,
  describeApiError,
  getClassroomScreenToken,
} from "@/utils/classworksV2Client";
import {withScreenPublicationRequestId} from "@/utils/screenPublicationQueue";
import {clearCachedScreenSession, loadCachedScreenSession, saveCachedScreenSession} from "@/utils/screenOfflineCache";
import {isTransientScreenRequestError} from "./screenRequestError";

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const screenSessionActions = {
  async bootstrapClassroomScreen() {
    if (!getClassroomScreenToken()) {
      this.screenSession = null;
      return;
    }
    this.screenLoading = true;
    this.screenError = "";
    try {
      this.screenSession = await classworksV2Api.classroomScreenSession();
      saveCachedScreenSession(this.screenSession);
    } catch (error) {
      const cached = isTransientScreenRequestError(error) ? loadCachedScreenSession() : null;
      this.screenSession = cached;
      this.screenError = cached
        ? "网络不可用，已载入这台大屏上次同步的班级配置"
        : describeApiError(error, "加载大屏绑定失败");
      if (error.response?.status === 401) {
        clearClassroomScreenToken();
        clearCachedScreenSession();
      }
    } finally {
      this.screenLoading = false;
    }
  },

  async loginClassroomScreen({schoolCode, loginCode, pin}) {
    this.screenLoading = true;
    this.screenError = "";
    try {
      const {getVisitorId} = await import("@/utils/visitorId");
      const deviceFingerprint = await getVisitorId();
      await classworksV2Api.loginClassroomScreen({
        schoolCode,
        loginCode,
        pin,
        deviceFingerprint,
      });
      await this.bootstrapClassroomScreen();
      await this.signOutTeacher();
      return this.screenSession;
    } catch (error) {
      this.screenError = describeApiError(error, "大屏登录失败");
      throw error;
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

  screenCanEdit(publication) {
    if (!this.screenSession || publication.type !== "ASSIGNMENT" || publication.status !== "PUBLISHED") {
      return false;
    }
    return Boolean(this.screenEditableWorkspaceId(publication));
  },

  screenEditableWorkspaceId(publication) {
    const allowed = new Set(this.screenWorkspaces.map((workspace) => workspace.id));
    return publication?.targets?.find((target) => allowed.has(target.workspaceId))?.workspaceId || "";
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

  async saveScreenPublication(input, publication = null, queueContext = {}) {
    this.screenError = "";
    if (!publication) input = withScreenPublicationRequestId(input);
    if (publication && !this.screenNetworkOnline) {
      const error = new Error("离线状态下不能修改现有作业，当前输入已保留为草稿，请联网后再保存");
      this.screenError = error.message;
      throw error;
    }
    if (!publication && !this.screenNetworkOnline) {
      return this.enqueueOfflineScreenPublication(input, queueContext);
    }
    try {
      const saved = publication
        ? await classworksV2Api.updateScreenPublication(publication, input)
        : await classworksV2Api.createScreenPublication(input);
      await this.loadActiveFeed();
      if (this.isTeacherSignedIn) {
        await Promise.all([this.refreshTeacherPublications(), this.refreshTeacherActionCenter()]);
      }
      return saved;
    } catch (error) {
      if (!publication && isTransientScreenRequestError(error)) {
        this.screenError = "";
        return this.enqueueOfflineScreenPublication(input, queueContext);
      }
      this.screenError = describeApiError(error, "保存大屏作业失败");
      throw error;
    }
  },
};
