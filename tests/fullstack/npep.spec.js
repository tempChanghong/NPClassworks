import {randomBytes, randomUUID} from "node:crypto";
import {test, expect} from "./fixture.js";
import {api, origin} from "../e2e/environment.js";

test("NPEP school UI approves a real pairing and revokes the confirmed PostgreSQL device", async ({classroom}) => {
  test.skip(process.env.FULLSTACK_NPEP !== "true", "Requires the paired N1 backend and explicit isolated NPEP gate");
  await classroom.prisma.schoolMember.update({where: {schoolId_accountId: {schoolId: classroom.school.id, accountId: classroom.account.id}}, data: {role: "ADMIN"}});
  async function native(path, body, bearer) {
    const response = await fetch(`${api}/api/v2/npep${path}`, {method: body ? "POST" : "GET",
      headers: {"Content-Type": "application/json", "X-NPEP-Version": "0.1", ...(body ? {} : {"X-Request-Id": randomUUID()}), ...(bearer ? {Authorization: `Bearer ${bearer}`} : {})},
      ...(body ? {body: JSON.stringify({requestId: randomUUID(), ...body})} : {})});
    return {status: response.status, ...(await response.json())};
  }
  const identity = (await native("/info")).data;
  const pairingSecret = randomBytes(32).toString("base64url");
  const created = await native("/pairings", {serverInstanceId: identity.serverInstanceId, deploymentEpoch: identity.deploymentEpoch,
    installationId: randomUUID(), deviceName: "真实互联测试设备", appVersion: "N1-test", pairingSecret, requestedCapabilities: ["device.status"]});
  expect(created.status).toBe(201);
  const pairingId = created.data.pairingId, pairBearer = `npepp1.${pairingId}.${pairingSecret}`;
  const teacher = await classroom.open("teacher"), page = teacher.page;
  await page.goto(`${origin}/classworks-admin?section=screens&school=${classroom.school.id}&term=${classroom.workspace.termId}`);
  await page.getByRole("button", {name: "打开 NPEP 设备互联"}).click();
  const panel = page.locator(".npep-device-manager");
  await expect(panel).toContainText("当前没有已登记");
  await panel.getByLabel("8 位配对短码").fill(created.data.userCode);
  await panel.getByRole("button", {name: "核对配对申请", exact: true}).click();
  await expect(panel.locator(".npep-candidate")).toContainText("真实互联测试设备");
  await panel.locator(".v-select").filter({hasText: "关联的大屏与班级"}).click();
  await page.getByRole("option", {name: "测试大屏 · 高一一班", exact: true}).click();
  await panel.getByLabel("已核对设备、学校和班级，仅授权查看状态").check();
  await panel.getByRole("button", {name: "批准并等待现场确认", exact: true}).click();
  await expect(panel).toContainText("批准已保存");
  expect(await classroom.prisma.npepDevice.count({where: {schoolId: classroom.school.id}})).toBe(0);
  const approval = (await native(`/pairings/${pairingId}`, null, pairBearer)).data;
  const credentialId = randomUUID(), deviceSecret = randomBytes(32).toString("base64url");
  const confirmed = await native(`/pairings/${pairingId}/confirm`, {serverInstanceId: identity.serverInstanceId, deploymentEpoch: identity.deploymentEpoch,
    approvalId: approval.approvalId, credentialId, deviceSecret}, pairBearer);
  expect(confirmed.status).toBe(201);
  const deviceBearer = `npep1.${credentialId}.${deviceSecret}`;
  const instance = {serverInstanceId: identity.serverInstanceId, deploymentEpoch: identity.deploymentEpoch};
  const session = await native("/device/sessions", {...instance, runId: randomUUID(), expectedStatusEpoch: 0}, deviceBearer);
  expect(session.status).toBe(201);
  expect((await native("/device/status", {...instance, sessionId: session.data.sessionId, statusEpoch: session.data.statusEpoch,
    sequence: 1, sampleAgeMs: 1, status: {appVersion: "N1-test", mode: "DAILY", modePhase: "IDLE", modeRevision: null,
      automaticRecording: "ENABLED", recording: "IDLE", classIsland: {connection: "UNKNOWN", bridgeVersion: null}, examAware: {connection: "UNKNOWN", bridgeVersion: null}}}, deviceBearer)).status).toBe(200);
  await panel.getByRole("button", {name: "刷新互联设备", exact: true}).click();
  await expect(panel.locator(".npep-device")).toContainText("在线");
  await expect(panel.locator(".npep-device")).toContainText("录制状态：未录制");
  await panel.screenshot({path: "test-results/npep-manager.png"});
  await panel.getByRole("button", {name: "撤销互联授权", exact: true}).click();
  await page.getByRole("button", {name: "确认撤销互联授权", exact: true}).click();
  await expect(panel.locator(".npep-device")).toContainText("已撤销");
  expect((await native("/device/me", null, deviceBearer)).status).toBe(401);
  expect((await classroom.prisma.npepDevice.findUnique({where: {id: confirmed.data.deviceId}})).state).toBe("REVOKED");
  expect(teacher.errors).toEqual([]);
});
