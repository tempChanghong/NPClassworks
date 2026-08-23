import axios from "axios";
import {getServerUrl} from "@/utils/socketClient";

const ACCESS_TOKEN_KEY = "classworks-v2-access-token";
const REFRESH_TOKEN_KEY = "classworks-v2-refresh-token";
const OAUTH_RETURN_KEY = "classworks-v2-oauth-return";
const OAUTH_ERROR_KEY = "classworks-v2-oauth-error";
const SCREEN_TOKEN_KEY = "classworks-v2-screen-token";
const SETUP_TOKEN_KEY = "classworks-v2-setup-token";

const client = axios.create({
  timeout: 15000,
  headers: {Accept: "application/json"},
});

let refreshPromise = null;

function baseUrl() {
  return getServerUrl().replace(/\/$/, "");
}

function unwrap(response) {
  return response.data?.data ?? response.data;
}

export function getAccountTokens() {
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || "",
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || "",
  };
}

export function saveAccountTokens({accessToken, refreshToken}) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAccountTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getClassroomScreenToken() {
  return localStorage.getItem(SCREEN_TOKEN_KEY) || "";
}

export function saveClassroomScreenToken(token) {
  if (token) localStorage.setItem(SCREEN_TOKEN_KEY, token);
}

export function clearClassroomScreenToken() {
  localStorage.removeItem(SCREEN_TOKEN_KEY);
}

export function clearSetupToken() {
  sessionStorage.removeItem(SETUP_TOKEN_KEY);
}

function setupHeaders() {
  return {"X-Classworks-Setup-Token": sessionStorage.getItem(SETUP_TOKEN_KEY) || ""};
}

export async function getInstanceSetupStatus({timeout} = {}) {
  return unwrap(await client.get("/api/v2/setup/status", {
    ...(Number.isFinite(timeout) && timeout > 0 ? {timeout} : {}),
  }));
}

export async function createInstanceSetupSession(setupKey) {
  const result = unwrap(await client.post("/api/v2/setup/session", {setupKey}));
  sessionStorage.setItem(SETUP_TOKEN_KEY, result.token);
  return result;
}

export async function initializeInstanceCore(input) {
  const result = unwrap(await client.post("/api/v2/setup/initialize", input, {headers: setupHeaders()}));
  saveAccountTokens({accessToken: result.access_token, refreshToken: result.refresh_token});
  return result;
}

export async function getInstanceSetupContext() {
  return unwrap(await client.get("/api/v2/setup/context", {headers: setupHeaders()}));
}

export async function getInstanceSetupOrganizationTemplate() {
  return unwrap(await client.get("/api/v2/setup/organization/template", {headers: setupHeaders()}));
}

export async function getInstanceSetupStaffConfigurationTemplate() {
  return unwrap(await client.get("/api/v2/setup/staff-configuration/template", {headers: setupHeaders()}));
}

export async function importInstanceSetupOrganization(organization, dryRun = true) {
  return unwrap(await client.post("/api/v2/setup/organization/import", organization, {
    headers: setupHeaders(),
    params: {dryRun},
  }));
}

export async function importInstanceSetupTeachers(assignmentPlan, dryRun = true) {
  return unwrap(await client.post("/api/v2/setup/teachers/import", assignmentPlan, {
    headers: setupHeaders(),
    params: {dryRun},
    timeout: 120000,
  }));
}

export async function importInstanceSetupStaffConfiguration(staffConfiguration, dryRun = true) {
  return unwrap(await client.post("/api/v2/setup/staff-configuration/import", staffConfiguration, {
    headers: setupHeaders(),
    params: {dryRun},
    timeout: 120000,
  }));
}

export async function createInstanceSetupScreen(input) {
  return unwrap(await client.post("/api/v2/setup/screens", input, {headers: setupHeaders()}));
}

export async function verifyInstanceSetupLogin(input) {
  return unwrap(await client.post("/api/v2/setup/verify-login", input, {headers: setupHeaders()}));
}

export async function completeInstanceSetup() {
  const result = unwrap(await client.post("/api/v2/setup/complete", {}, {headers: setupHeaders()}));
  clearSetupToken();
  return result;
}

function screenHeaders(extra = {}) {
  return {
    ...extra,
    "X-Classworks-Screen-Token": getClassroomScreenToken(),
  };
}

export function captureOAuthCallback() {
  const url = new URL(window.location.href);
  const success = url.searchParams.get("success");
  const accessToken = url.searchParams.get("access_token");
  const refreshToken = url.searchParams.get("refresh_token");
  if (success !== "true" && success !== "false" && !accessToken) return false;

  if (success === "true" && accessToken) {
    saveAccountTokens({accessToken, refreshToken});
    sessionStorage.removeItem(OAUTH_ERROR_KEY);
  } else {
    sessionStorage.setItem(
      OAUTH_ERROR_KEY,
      url.searchParams.get("error") || "教师账户登录失败",
    );
  }

  const returnPath = sessionStorage.getItem(OAUTH_RETURN_KEY) || "/";
  sessionStorage.removeItem(OAUTH_RETURN_KEY);
  window.history.replaceState({}, "", returnPath);
  return true;
}

export function consumeOAuthError() {
  const error = sessionStorage.getItem(OAUTH_ERROR_KEY) || "";
  sessionStorage.removeItem(OAUTH_ERROR_KEY);
  return error;
}

async function refreshAccountToken() {
  const {refreshToken} = getAccountTokens();
  if (!refreshToken) throw new Error("没有可用的刷新令牌");
  if (!refreshPromise) {
    refreshPromise = axios.post(`${baseUrl()}/accounts/refresh`, {
      refresh_token: refreshToken,
    }).then((response) => {
      const data = unwrap(response);
      saveAccountTokens({accessToken: data.access_token});
      return data.access_token;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

client.interceptors.request.use((config) => {
  config.baseURL = baseUrl();
  const {accessToken} = getAccountTokens();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

client.interceptors.response.use((response) => {
  const renewedToken = response.headers["x-new-access-token"];
  if (renewedToken) saveAccountTokens({accessToken: renewedToken});
  return response;
}, async (error) => {
  const original = error.config;
  if (error.response?.status === 401 && !original?._v2Retried && getAccountTokens().refreshToken) {
    original._v2Retried = true;
    try {
      const token = await refreshAccountToken();
      original.headers.Authorization = `Bearer ${token}`;
      return client(original);
    } catch {
      clearAccountTokens();
    }
  }
  return Promise.reject(error);
});

export function describeApiError(error, fallback = "请求失败") {
  const data = error?.response?.data;
  const validation = data?.details?.errors?.[0];
  return validation?.message || data?.message || error?.message || fallback;
}

export async function getOAuthProviders() {
  return unwrap(await client.get("/accounts/oauth/providers"));
}

export async function getLocalAuthStatus() {
  return unwrap(await client.get("/accounts/local/status"));
}

export async function loginWithSchoolAccount({schoolCode, username, password}) {
  const result = unwrap(await client.post("/accounts/local/login", {
    schoolCode,
    username,
    password,
  }));
  saveAccountTokens({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
  });
  return result.account;
}

export async function bootstrapSchoolAdministrator(input) {
  const result = unwrap(await client.post("/accounts/local/bootstrap", input));
  saveAccountTokens({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
  });
  return result.account;
}

export async function recoverSchoolOwner(input) {
  return unwrap(await client.post("/accounts/local/recover-owner", input));
}

export function startOAuthLogin(provider, returnPath = "/") {
  sessionStorage.setItem(OAUTH_RETURN_KEY, returnPath);
  const redirectUri = `${window.location.origin}${returnPath}`;
  window.location.assign(
    `${baseUrl()}/accounts/oauth/${encodeURIComponent(provider)}?redirect_uri=${encodeURIComponent(redirectUri)}`,
  );
}

export const classworksV2Api = {
  async schools() {
    return unwrap(await client.get("/api/v2/catalog/schools"));
  },
  async currentTerm(schoolId) {
    return unwrap(await client.get("/api/v2/catalog/terms/current", {params: {schoolId}}));
  },
  async grades(termId) {
    return unwrap(await client.get("/api/v2/catalog/grades", {params: {termId}}));
  },
  async subjects(schoolId) {
    return unwrap(await client.get("/api/v2/catalog/subjects", {params: {schoolId}}));
  },
  async publicSchoolHomeworkSettings(schoolId) {
    return unwrap(await client.get(`/api/v2/catalog/schools/${schoolId}/homework-settings`));
  },
  async workspaces(params) {
    return unwrap(await client.get("/api/v2/catalog/workspaces", {params}));
  },
  async courseOptions(administrativeClassId) {
    return unwrap(await client.get(
      `/api/v2/catalog/administrative-classes/${administrativeClassId}/course-options`,
    ));
  },
  async validateStudentSelection(administrativeClassId, input) {
    return unwrap(await client.post(
      `/api/v2/catalog/administrative-classes/${administrativeClassId}/student-selection/validate`,
      input,
    ));
  },
  async feed(workspaceIds, boardDate) {
    return unwrap(await client.get("/api/v2/publications/feed", {
      params: {workspaceIds: workspaceIds.join(","), boardDate},
    }));
  },
  async profile() {
    return unwrap(await client.get("/accounts/profile"));
  },
  async logout() {
    return unwrap(await client.post("/accounts/logout"));
  },
  async changeLocalPin(input) {
    return unwrap(await client.post("/accounts/local/change-pin", input));
  },
  async teacherTargetPreferences() {
    return unwrap(await client.get("/accounts/preferences/teacher-targets"));
  },
  async saveTeacherTargetPreferences(preferences) {
    return unwrap(await client.put("/accounts/preferences/teacher-targets", {preferences}));
  },
  async myWorkspaces() {
    return unwrap(await client.get("/api/v2/me/workspaces"));
  },
  async mySchools() {
    return unwrap(await client.get("/api/v2/me/schools"));
  },
  async loginClassroomScreen(input) {
    const result = unwrap(await client.post("/api/v2/classroom-screens/login", input));
    saveClassroomScreenToken(result.token);
    return result;
  },
  async unlockClassroomScreen(pin) {
    return unwrap(await client.post(
      "/api/v2/classroom-screens/unlock",
      {pin},
      {headers: screenHeaders()},
    ));
  },
  async classroomScreenSession() {
    return unwrap(await client.get("/api/v2/classroom-screens/session", {
      headers: screenHeaders(),
    }));
  },
  async classroomScreenHeartbeat(status) {
    return unwrap(await client.post("/api/v2/classroom-screens/heartbeat", status, {
      headers: screenHeaders(),
    }));
  },
  async acknowledgeClassroomScreenCommand(commandId, input) {
    return unwrap(await client.post(
      `/api/v2/classroom-screens/commands/${commandId}/ack`,
      input,
      {headers: screenHeaders()},
    ));
  },
  async classroomScreenFeed(boardDate) {
    return unwrap(await client.get("/api/v2/classroom-screens/feed", {
      params: {boardDate},
      headers: screenHeaders(),
    }));
  },
  async acknowledgeScreenNotifications(items) {
    return unwrap(await client.post(
      "/api/v2/classroom-screens/notification-deliveries",
      {items},
      {headers: screenHeaders()},
    ));
  },
  async copyClassroomScreenBoard(sourceBoardDate, targetBoardDate) {
    return unwrap(await client.post(
      "/api/v2/classroom-screens/board/copy",
      {sourceBoardDate, targetBoardDate},
      {headers: screenHeaders()},
    ));
  },
  async classroomStudents() {
    return unwrap(await client.get("/api/v2/classroom-screens/students", {
      headers: screenHeaders(),
    }));
  },
  async replaceClassroomStudents(students) {
    return unwrap(await client.put(
      "/api/v2/classroom-screens/students",
      {students},
      {headers: screenHeaders()},
    ));
  },
  async classroomAttendance(date) {
    return unwrap(await client.get(`/api/v2/classroom-screens/attendance/${date}`, {
      headers: screenHeaders(),
    }));
  },
  async saveClassroomAttendance(date, attendance) {
    return unwrap(await client.put(
      `/api/v2/classroom-screens/attendance/${date}`,
      attendance,
      {headers: screenHeaders()},
    ));
  },
  async createScreenPublication(input) {
    return unwrap(await client.post("/api/v2/classroom-screens/publications", input, {
      headers: screenHeaders(),
    }));
  },
  async updateScreenPublication(publication, input) {
    return unwrap(await client.patch(
      `/api/v2/classroom-screens/publications/${publication.id}`,
      input,
      {headers: screenHeaders({"If-Match": `"${publication.revision}"`})},
    ));
  },
  async screenPublication(publicationId) {
    return unwrap(await client.get(
      `/api/v2/classroom-screens/publications/${publicationId}`,
      {headers: screenHeaders()},
    ));
  },
  async screenPublicationRevisions(publicationId) {
    return unwrap(await client.get(
      `/api/v2/classroom-screens/publications/${publicationId}/revisions`,
      {headers: screenHeaders()},
    ));
  },
  async restoreScreenPublication(publication, sourceRevision) {
    return unwrap(await client.post(
      `/api/v2/classroom-screens/publications/${publication.id}/restore`,
      {sourceRevision},
      {headers: screenHeaders({"If-Match": `"${publication.revision}"`})},
    ));
  },
  async organizationTemplate() {
    return unwrap(await client.get("/api/v2/admin/organization/template"));
  },
  async importOrganization(organization, dryRun = true) {
    return unwrap(await client.post("/api/v2/admin/organization/import", organization, {
      params: {dryRun},
    }));
  },
  async workspaceMemberships(schoolId, termId) {
    return unwrap(await client.get(
      `/api/v2/admin/schools/${schoolId}/workspace-memberships`,
      {params: termId ? {termId} : {}},
    ));
  },
  async managedAcademicStructure(schoolId, termId) {
    return unwrap(await client.get(
      `/api/v2/admin/schools/${schoolId}/academic-structure`,
      {params: {termId}},
    ));
  },
  async teachingRelationships(schoolId, termId, gradeId = "") {
    return unwrap(await client.get(
      `/api/v2/admin/schools/${schoolId}/teaching-relationships`,
      {params: {termId, ...(gradeId ? {gradeId} : {})}},
    ));
  },
  async staffResponsibilities(schoolId, termId) {
    return unwrap(await client.get(
      `/api/v2/admin/schools/${schoolId}/staff-responsibilities`,
      {params: {termId}},
    ));
  },
  async saveGradeLeadership(schoolId, input) {
    return unwrap(await client.put(`/api/v2/admin/schools/${schoolId}/grade-leaderships`, input));
  },
  async removeGradeLeadership(schoolId, leadershipId) {
    return unwrap(await client.delete(
      `/api/v2/admin/schools/${schoolId}/grade-leaderships/${leadershipId}`,
    ));
  },
  async saveClassLeadership(schoolId, input) {
    return unwrap(await client.put(`/api/v2/admin/schools/${schoolId}/class-leaderships`, input));
  },
  async removeClassLeadership(schoolId, leadershipId) {
    return unwrap(await client.delete(
      `/api/v2/admin/schools/${schoolId}/class-leaderships/${leadershipId}`,
    ));
  },
  async updateStaffResponsibilityPolicy(schoolId, input) {
    return unwrap(await client.put(
      `/api/v2/admin/schools/${schoolId}/staff-responsibility-policy`,
      input,
    ));
  },
  async saveTeachingAssignment(schoolId, input) {
    return unwrap(await client.put(
      `/api/v2/admin/schools/${schoolId}/teaching-assignments`,
      input,
    ));
  },
  async saveTeachingAssignmentsBulk(schoolId, input) {
    return unwrap(await client.put(
      `/api/v2/admin/schools/${schoolId}/teaching-assignments/bulk`,
      input,
    ));
  },
  async removeTeachingAssignment(schoolId, assignmentId) {
    return unwrap(await client.delete(
      `/api/v2/admin/schools/${schoolId}/teaching-assignments/${assignmentId}`,
    ));
  },
  async replaceAdministrativeClassSubjectRules(schoolId, administrativeClassId, input) {
    return unwrap(await client.put(
      `/api/v2/admin/schools/${schoolId}/administrative-classes/${administrativeClassId}/subject-rules`,
      input,
    ));
  },
  async createManagedCourseGroup(schoolId, input) {
    return unwrap(await client.post(`/api/v2/admin/schools/${schoolId}/course-groups`, input));
  },
  async updateManagedCourseGroup(schoolId, courseGroupId, input) {
    return unwrap(await client.patch(
      `/api/v2/admin/schools/${schoolId}/course-groups/${courseGroupId}`,
      input,
    ));
  },
  async importWorkspaceMemberships(input, dryRun = true) {
    return unwrap(await client.post("/api/v2/admin/workspace-memberships/import", input, {
      params: {dryRun},
    }));
  },
  async importLocalTeachers(input, dryRun = true) {
    return unwrap(await client.post("/api/v2/admin/local-teachers/import", input, {
      params: {dryRun},
    }));
  },
  async localAccounts(schoolId) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/local-accounts`));
  },
  async createLocalAdministrator(schoolId, input) {
    return unwrap(await client.post(`/api/v2/admin/schools/${schoolId}/local-admins`, input));
  },
  async updateLocalAccount(schoolId, accountId, input) {
    return unwrap(await client.patch(
      `/api/v2/admin/schools/${schoolId}/local-accounts/${accountId}`,
      input,
    ));
  },
  async deactivateLocalAccount(schoolId, accountId) {
    return unwrap(await client.delete(
      `/api/v2/admin/schools/${schoolId}/local-accounts/${accountId}`,
    ));
  },
  async classroomScreens(schoolId) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/classroom-screens`));
  },
  async issueClassroomScreenCommand(schoolId, bindingId, type, payload = undefined) {
    return unwrap(await client.post(
      `/api/v2/admin/schools/${schoolId}/classroom-screens/${bindingId}/commands`,
      {type, payload},
    ));
  },
  async auditLogs(schoolId, params = {}) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/audit-logs`, {params}));
  },
  async schoolHomeworkSettings(schoolId) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/homework-settings`));
  },
  async updateSchoolHomeworkSettings(schoolId, input) {
    return unwrap(await client.put(`/api/v2/admin/schools/${schoolId}/homework-settings`, input));
  },
  async createClassroomScreenAccount(schoolId, input) {
    return unwrap(await client.post(
      `/api/v2/admin/schools/${schoolId}/classroom-screen-accounts`,
      input,
    ));
  },
  async updateClassroomScreenAccount(schoolId, bindingId, input) {
    return unwrap(await client.patch(
      `/api/v2/admin/schools/${schoolId}/classroom-screens/${bindingId}`,
      input,
    ));
  },
  async resetClassroomScreenDevice(schoolId, bindingId) {
    return unwrap(await client.post(
      `/api/v2/admin/schools/${schoolId}/classroom-screens/${bindingId}/reset-device`,
    ));
  },
  async schoolMembers(schoolId) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/members`));
  },
  async managementOverview(schoolId, termId) {
    return unwrap(await client.get(`/api/v2/admin/schools/${schoolId}/management-overview`, {
      params: {termId},
    }));
  },
  async setTermStatus(termId, status) {
    return unwrap(await client.post(`/api/v2/admin/terms/${termId}/status`, {status}));
  },
  async cloneTerm(termId, input) {
    return unwrap(await client.post(`/api/v2/admin/terms/${termId}/clone`, input));
  },
  async previewTermTransition(termId, input) {
    return unwrap(await client.post(`/api/v2/admin/terms/${termId}/transition/preview`, input));
  },
  async createTermTransition(termId, input) {
    return unwrap(await client.post(`/api/v2/admin/terms/${termId}/transition`, input));
  },
  async termTransitionReadiness(termId) {
    return unwrap(await client.get(`/api/v2/admin/terms/${termId}/transition-readiness`));
  },
  async activateTermTransition(termId, input = {}) {
    return unwrap(await client.post(`/api/v2/admin/terms/${termId}/activate`, input));
  },
  async removeWorkspaceMember(workspaceId, accountId) {
    await client.delete(`/api/v2/admin/workspaces/${workspaceId}/members/${accountId}`);
  },
  async removeWorkspaceInvitation(workspaceId, invitationId) {
    await client.delete(`/api/v2/admin/workspaces/${workspaceId}/invitations/${invitationId}`);
  },
  async publications(params = {}) {
    return unwrap(await client.get("/api/v2/publications", {params}));
  },
  async actionRequiredPublications(params = {}) {
    return unwrap(await client.get("/api/v2/publications/action-required", {params}));
  },
  async createPublication(input) {
    return unwrap(await client.post("/api/v2/publications", input));
  },
  async publication(id) {
    return unwrap(await client.get(`/api/v2/publications/${id}`));
  },
  async publicationRevisions(id) {
    return unwrap(await client.get(`/api/v2/publications/${id}/revisions`));
  },
  async notificationScreenDeliveries(id) {
    return unwrap(await client.get(`/api/v2/publications/${id}/screen-deliveries`));
  },
  async certifyPublication(publication) {
    return unwrap(await client.post(
      `/api/v2/publications/${publication.id}/certify`,
      {},
      {headers: {"If-Match": `"${publication.revision}"`}},
    ));
  },
  async restorePublication(publication, sourceRevision) {
    return unwrap(await client.post(
      `/api/v2/publications/${publication.id}/restore`,
      {sourceRevision},
      {headers: {"If-Match": `"${publication.revision}"`}},
    ));
  },
  async updatePublication(id, revision, input) {
    return unwrap(await client.patch(`/api/v2/publications/${id}`, input, {
      headers: {"If-Match": `"${revision}"`},
    }));
  },
  async withdrawPublication(id, revision) {
    return unwrap(await client.post(`/api/v2/publications/${id}/withdraw`, {}, {
      headers: {"If-Match": `"${revision}"`},
    }));
  },
  async clonePublication(id, input = {}) {
    return unwrap(await client.post(`/api/v2/publications/${id}/clone`, input));
  },
};

export default client;
