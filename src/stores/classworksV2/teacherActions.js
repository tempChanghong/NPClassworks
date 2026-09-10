import {
  classworksV2Api,
  clearAccountTokens,
  consumeOAuthError,
  describeApiError,
  getAccountTokens,
  getOAuthProviders,
  endLocalAccountSession,
} from "@/utils/classworksV2Client";
import {joinWorkspaces, leaveWorkspaces} from "@/utils/socketClient";
import {todayBoardDate} from "@/utils/boardDate";
import {completeTeacherCollection} from "@/utils/completeTeacherCollection";
import {
  loadTeacherTargetPreferences,
  loadTeacherTargetSyncState,
  reconcileTeacherTargetPreferences,
  rememberTeacherTargets,
  sanitizeTeacherTargetPreferences,
  saveTeacherTargetPreferences,
  toggleFavoriteTeacherTargets,
} from "@/utils/teacherTargetPreferences";

const teacherTargetSyncTasks = new WeakMap();

function collectionRequest(store, key) {
  const sessionVersion = store.teacherSessionVersion;
  const version = ++store[key];
  return () => sessionVersion === store.teacherSessionVersion && version === store[key];
}

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const teacherActions = {
  async bootstrapTeacher() {
    const sessionVersion = ++this.teacherSessionVersion;
    const publicationsCurrent = collectionRequest(this, "teacherPublicationsRequestVersion");
    const actionsCurrent = collectionRequest(this, "teacherActionCenterRequestVersion");
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
        completeTeacherCollection(params => classworksV2Api.publications(params), {isCurrent: publicationsCurrent}),
        completeTeacherCollection(params => classworksV2Api.actionRequiredPublications(params), {isCurrent: actionsCurrent}),
        classworksV2Api.mySchools(),
      ]);
      if (sessionVersion !== this.teacherSessionVersion) return;
      this.account = account;
      this.memberships = memberships;
      if (publications && publicationsCurrent()) this.teacherPublications = publications.items;
      if (actionCenter && actionsCurrent()) this.teacherActionCenter = actionCenter;
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
    if (!this.teacherTargetPreferencesSyncing) {
      this.teacherTargetPreferences = loadTeacherTargetPreferences(this.account.id);
    }
    await this.syncTeacherTargetPreferences({hydrate: true});
  },

  async syncTeacherTargetPreferences({hydrate = false} = {}) {
    if (!this.account?.id) return;
    const accountId = this.account.id;
    const sessionVersion = this.teacherSessionVersion;
    const previous = teacherTargetSyncTasks.get(this);
    if (previous?.sessionVersion === sessionVersion && previous.accountId === accountId) {
      this.teacherTargetPreferencesSyncPending = true;
      return previous.promise;
    }
    const task = {accountId, sessionVersion, promise: null};
    teacherTargetSyncTasks.set(this, task);
    const isCurrent = () => teacherTargetSyncTasks.get(this) === task
      && sessionVersion === this.teacherSessionVersion && accountId === this.account?.id;
    this.teacherTargetPreferencesSyncing = true;
    this.teacherTargetPreferencesError = "";
    task.promise = (async () => {
      try {
        // Let an older write for this account settle before reading and merging.
        // A new session owns the status immediately; the older task cannot clear it.
        if (previous?.accountId === accountId) await previous.promise;
        if (!isCurrent()) return;
        do {
          this.teacherTargetPreferencesSyncPending = false;
          // Fetch first so offline edits are applied to the latest known remote
          // list, preserving favorites added on another device while offline.
          const remoteResult = await classworksV2Api.teacherTargetPreferences();
          if (!isCurrent()) return;
          const remote = sanitizeTeacherTargetPreferences(remoteResult.preferences);
          // Read AFTER GET: edits made while the fetch was pending must participate.
          const local = loadTeacherTargetPreferences(accountId);
          const syncState = loadTeacherTargetSyncState(accountId);
          const remoteEmpty = !remote.favorites.length && !remote.recent.length;
          const migrateLocal = !syncState.lastSyncedAt && remoteEmpty && (local.favorites.length || local.recent.length);
          const next = syncState.dirty || migrateLocal
            ? reconcileTeacherTargetPreferences(local, remote, syncState)
            : remote;
          let saved = next;
          if (!hydrate || syncState.dirty || migrateLocal) {
            const result = await classworksV2Api.saveTeacherTargetPreferences(next);
            if (!isCurrent()) return;
            saved = result.preferences;
          }
          if (loadTeacherTargetSyncState(accountId).revision !== syncState.revision) {
            // A late response may acknowledge only its own snapshot. Keep newer
            // edits and removal records until the following request succeeds.
            this.teacherTargetPreferencesSyncPending = true;
            continue;
          }
          this.teacherTargetPreferences = saveTeacherTargetPreferences(accountId, saved, localStorage, {dirty: false});
          this.teacherTargetPreferencesSynced = true;
        } while (this.teacherTargetPreferencesSyncPending);
      } catch (error) {
        if (!isCurrent()) return;
        this.teacherTargetPreferencesSynced = false;
        this.teacherTargetPreferencesError = describeApiError(error, "同步失败，偏好已保存在本机");
        this.teacherTargetPreferencesSyncPending = false;
      } finally {
        if (teacherTargetSyncTasks.get(this) === task) {
          this.teacherTargetPreferencesSyncing = false;
          teacherTargetSyncTasks.delete(this);
        }
      }
    })();
    return task.promise;
  },

  rememberTeacherTargetCombination(combination) {
    if (!this.account?.id) return;
    try {
      this.teacherTargetPreferences = rememberTeacherTargets(this.account.id, combination);
    } catch {
      this.teacherTargetPreferencesSynced = false;
      this.teacherTargetPreferencesError = "最近目标未能保存在本机，不影响发布结果。";
      return false;
    }
    this.teacherTargetPreferencesSynced = false;
    void this.syncTeacherTargetPreferences();
    return true;
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

  async publicationRevisions(publication, mode = "teacher", page) {
    return mode === "screen"
      ? classworksV2Api.screenPublicationRevisions(publication.id, page)
      : classworksV2Api.publicationRevisions(publication.id, page);
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
    const isCurrent = collectionRequest(this, "teacherPublicationsRequestVersion");
    this.teacherPublicationsLoading = true;
    try {
      const result = await completeTeacherCollection(params => classworksV2Api.publications(params), {isCurrent});
      if (!result || !isCurrent()) return;
      this.teacherPublications = result.items;
    } catch (error) {
      if (!isCurrent()) return;
      this.teacherError = describeApiError(error, "刷新发布记录失败");
    } finally {
      if (isCurrent()) this.teacherPublicationsLoading = false;
    }
  },

  async refreshTeacherActionCenter() {
    if (!this.isTeacherSignedIn) return;
    const isCurrent = collectionRequest(this, "teacherActionCenterRequestVersion");
    this.teacherActionCenterLoading = true;
    try {
      const result = await completeTeacherCollection(params => classworksV2Api.actionRequiredPublications(params), {isCurrent});
      if (!result || !isCurrent()) return;
      this.teacherActionCenter = result;
    } catch (error) {
      if (!isCurrent()) return;
      this.teacherError = describeApiError(error, "刷新待处理事项失败");
    } finally {
      if (isCurrent()) this.teacherActionCenterLoading = false;
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
    const pending = endLocalAccountSession();
    this.clearTeacherSessionState();
    await pending;
  },

  clearTeacherSessionState() {
    this.teacherSessionVersion += 1;
    const teacherWorkspaceIds = this.teacherWorkspaces.map((workspace) => workspace.id);
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
