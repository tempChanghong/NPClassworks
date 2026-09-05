import {
  classworksV2Api,
  clearAccountTokens,
  consumeOAuthError,
  describeApiError,
  getAccountTokens,
  getOAuthProviders,
} from "@/utils/classworksV2Client";
import {joinWorkspaces, leaveWorkspaces} from "@/utils/socketClient";
import {todayBoardDate} from "@/utils/boardDate";
import {
  loadTeacherTargetPreferences,
  loadTeacherTargetSyncState,
  mergeTeacherTargetPreferences,
  rememberTeacherTargets,
  sanitizeTeacherTargetPreferences,
  saveTeacherTargetPreferences,
  toggleFavoriteTeacherTargets,
} from "@/utils/teacherTargetPreferences";

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const teacherActions = {
  async bootstrapTeacher() {
    const sessionVersion = ++this.teacherSessionVersion;
    this.teacherLoading = true;
    this.teacherError = consumeOAuthError();
    try {
      const providers = await getOAuthProviders();
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.oauthProviders = providers;
      if (!getAccountTokens().accessToken) return;
      const [account, memberships, publications, actionCenter, schoolMemberships] = await Promise.all([
        classworksV2Api.profile(),
        classworksV2Api.myWorkspaces(),
        classworksV2Api.publications({limit: 100}),
        classworksV2Api.actionRequiredPublications({limit: 50}),
        classworksV2Api.mySchools(),
      ]);
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.account = account;
      this.memberships = memberships;
      this.teacherPublications = publications.items || [];
      this.teacherActionCenter = actionCenter;
      this.schoolMemberships = schoolMemberships;
      joinWorkspaces(this.realtimeWorkspaceIds);
      await this.hydrateTeacherTargetPreferences();
      if (sessionVersion !== this.teacherSessionVersion) return;
      const schoolIds = [...new Set(
        memberships.map((membership) => membership.workspace.term.school.id),
      )];
      const [subjectLists, homeworkSettings] = await Promise.all([
        Promise.all(schoolIds.map((schoolId) => classworksV2Api.subjects(schoolId))),
        Promise.all(schoolIds.map(async (schoolId) => [
          schoolId,
          await classworksV2Api.publicSchoolHomeworkSettings(schoolId),
        ])),
      ]);
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherSubjects = subjectLists.flat();
      this.teacherHomeworkSettingsBySchool = Object.fromEntries(homeworkSettings);
    } catch (error) {
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherError = describeApiError(error, "加载教师工作台失败");
      if (error.response?.status === 401) {
        clearAccountTokens();
        this.account = null;
      }
    } finally {
      if (sessionVersion === this.teacherSessionVersion) this.teacherLoading = false;
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

  async hydrateTeacherTargetPreferences() {
    if (!this.account?.id) return;
    const accountId = this.account.id;
    const sessionVersion = this.teacherSessionVersion;
    const local = loadTeacherTargetPreferences(accountId);
    const syncState = loadTeacherTargetSyncState(accountId);
    this.teacherTargetPreferences = local;
    this.teacherTargetPreferencesSyncing = true;
    this.teacherTargetPreferencesError = "";
    try {
      const remoteResult = await classworksV2Api.teacherTargetPreferences();
      if (sessionVersion !== this.teacherSessionVersion) return;
      const remote = sanitizeTeacherTargetPreferences(remoteResult.preferences);
      const remoteEmpty = !remote.favorites.length && !remote.recent.length;
      const next = syncState.dirty || remoteEmpty
        ? mergeTeacherTargetPreferences(local, remote)
        : remote;
      if (syncState.dirty || (remoteEmpty && (next.favorites.length || next.recent.length))) {
        await classworksV2Api.saveTeacherTargetPreferences(next);
      }
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherTargetPreferences = saveTeacherTargetPreferences(
        accountId,
        next,
        localStorage,
        {dirty: false},
      );
      this.teacherTargetPreferencesSynced = true;
    } catch (error) {
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherTargetPreferencesSynced = false;
      this.teacherTargetPreferencesError = describeApiError(error, "偏好暂存于本机，联网后可重新同步");
    } finally {
      if (sessionVersion === this.teacherSessionVersion) this.teacherTargetPreferencesSyncing = false;
    }
  },

  async syncTeacherTargetPreferences() {
    if (!this.account?.id) return;
    const accountId = this.account.id;
    const sessionVersion = this.teacherSessionVersion;
    if (this.teacherTargetPreferencesSyncing) {
      this.teacherTargetPreferencesSyncPending = true;
      return;
    }
    this.teacherTargetPreferencesSyncing = true;
    this.teacherTargetPreferencesError = "";
    do {
      this.teacherTargetPreferencesSyncPending = false;
      const snapshot = this.teacherTargetPreferences;
      const serializedSnapshot = JSON.stringify(snapshot);
      try {
        const result = await classworksV2Api.saveTeacherTargetPreferences(snapshot);
        if (sessionVersion !== this.teacherSessionVersion) return;
        if (JSON.stringify(this.teacherTargetPreferences) === serializedSnapshot) {
          this.teacherTargetPreferences = saveTeacherTargetPreferences(
            accountId,
            result.preferences,
            localStorage,
            {dirty: false},
          );
          this.teacherTargetPreferencesSynced = true;
        } else {
          this.teacherTargetPreferencesSyncPending = true;
        }
      } catch (error) {
        if (sessionVersion !== this.teacherSessionVersion) return;
        this.teacherTargetPreferencesSynced = false;
        this.teacherTargetPreferencesError = describeApiError(error, "同步失败，偏好已保存在本机");
        this.teacherTargetPreferencesSyncPending = false;
      }
    } while (this.teacherTargetPreferencesSyncPending);
    this.teacherTargetPreferencesSyncing = false;
  },

  rememberTeacherTargetCombination(combination) {
    if (!this.account?.id) return;
    this.teacherTargetPreferences = rememberTeacherTargets(this.account.id, combination);
    this.teacherTargetPreferencesSynced = false;
    void this.syncTeacherTargetPreferences();
  },

  toggleTeacherTargetFavorite(combination) {
    if (!this.account?.id) return;
    this.teacherTargetPreferences = toggleFavoriteTeacherTargets(this.account.id, combination);
    this.teacherTargetPreferencesSynced = false;
    void this.syncTeacherTargetPreferences();
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

  async publicationRevisions(publication, mode = "teacher") {
    return mode === "screen"
      ? classworksV2Api.screenPublicationRevisions(publication.id)
      : classworksV2Api.publicationRevisions(publication.id);
  },

  async latestPublication(publicationId, mode = "teacher") {
    return mode === "screen"
      ? classworksV2Api.screenPublication(publicationId)
      : classworksV2Api.publication(publicationId);
  },

  async certify(publication) {
    try {
      const certified = await classworksV2Api.certifyPublication(publication);
      await Promise.all([this.refreshTeacherPublications(), this.refreshTeacherActionCenter()]);
      await this.loadActiveFeed();
      return certified;
    } catch (error) {
      this.teacherError = describeApiError(error, "教师确认失败");
      throw error;
    }
  },

  async restoreRevision(publication, sourceRevision, mode = "teacher") {
    try {
      const restored = mode === "screen"
        ? await classworksV2Api.restoreScreenPublication(publication, sourceRevision)
        : await classworksV2Api.restorePublication(publication, sourceRevision);
      if (this.isTeacherSignedIn) {
        await Promise.all([this.refreshTeacherPublications(), this.refreshTeacherActionCenter()]);
      }
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
    const sessionVersion = this.teacherSessionVersion;
    this.teacherPublicationsLoading = true;
    try {
      const result = await classworksV2Api.publications({limit: 100});
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherPublications = result.items || [];
    } catch (error) {
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherError = describeApiError(error, "刷新发布记录失败");
    } finally {
      if (sessionVersion === this.teacherSessionVersion) this.teacherPublicationsLoading = false;
    }
  },

  async refreshTeacherActionCenter() {
    if (!this.isTeacherSignedIn) return;
    const sessionVersion = this.teacherSessionVersion;
    this.teacherActionCenterLoading = true;
    try {
      const result = await classworksV2Api.actionRequiredPublications({limit: 50});
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherActionCenter = result;
    } catch (error) {
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.teacherError = describeApiError(error, "刷新待处理事项失败");
    } finally {
      if (sessionVersion === this.teacherSessionVersion) this.teacherActionCenterLoading = false;
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
      await Promise.all([this.refreshTeacherPublications(), this.refreshTeacherActionCenter()]);
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
      await Promise.all([this.refreshTeacherPublications(), this.refreshTeacherActionCenter()]);
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
    // Invalidate outstanding account requests before waiting for the logout API.
    const sessionVersion = ++this.teacherSessionVersion;
    const teacherWorkspaceIds = this.teacherWorkspaces.map((workspace) => workspace.id);
    try {
      if (getAccountTokens().accessToken) await classworksV2Api.logout();
    } catch {
      // 本地登出不能被临时网络故障阻塞；服务端会话仍会自然过期。
    }
    if (sessionVersion !== this.teacherSessionVersion) return;
    clearAccountTokens();
    this.account = null;
    this.memberships = [];
    this.teacherSubjects = [];
    this.teacherHomeworkSettingsBySchool = {};
    this.teacherPublications = [];
    this.teacherActionCenter = {
      items: [],
      total: 0,
      summary: {total: 0, changedAfterCertified: 0, createdByScreen: 0, other: 0, dueSoon: 0, overdue: 0},
    };
    this.teacherPublicationsLoading = false;
    this.teacherLoading = false;
    this.teacherActionCenterLoading = false;
    this.schoolMemberships = [];
    this.teacherTargetPreferences = sanitizeTeacherTargetPreferences();
    this.teacherTargetPreferencesSynced = false;
    this.teacherTargetPreferencesSyncing = false;
    this.teacherTargetPreferencesSyncPending = false;
    this.teacherTargetPreferencesError = "";
    leaveWorkspaces(teacherWorkspaceIds);
    joinWorkspaces(this.activeWorkspaceIds);
  },
};
