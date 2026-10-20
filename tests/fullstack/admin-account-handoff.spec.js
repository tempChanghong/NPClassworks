import {readFile} from 'node:fs/promises';
import {test, expect} from './fixture.js';
import {api, origin} from '../e2e/environment.js';

test('creating an administrator exports its submitted credentials while keeping later form edits', async ({classroom}) => {
  await classroom.prisma.schoolMember.update({where: {schoolId_accountId: {schoolId: classroom.school.id, accountId: classroom.account.id}}, data: {role: 'OWNER'}});
  const {page, errors} = await classroom.open('teacher');
  await page.goto(`${origin}/classworks-admin?section=accounts&school=${classroom.school.id}&term=${classroom.workspace.termId}`);
  const username = page.getByLabel('管理员短账号', {exact: true}), name = page.getByLabel('管理员姓名', {exact: true}), pin = page.getByLabel('初始 PIN', {exact: true});
  const submittedUsername = `admin-${classroom.school.id.slice(-8)}`;
  await username.fill(submittedUsername); await name.fill('实际提交的管理员'); await pin.fill('1357');
  let release, submitted = null;
  const gate = new Promise(resolve => { release = resolve; }), endpoint = `${api}/api/v2/admin/schools/${classroom.school.id}/local-admins`;
  await page.route(endpoint, async route => {
    const actual = await route.fetch(); expect(actual.status()).toBe(201);
    submitted = route.request().postDataJSON(); await gate; await route.fulfill({response: actual});
  });
  try {
    await page.getByRole('button', {name: '创建管理员', exact: true}).click();
    await expect.poll(() => submitted).not.toBeNull();
    expect(submitted).toMatchObject({username: submittedUsername, name: '实际提交的管理员', pin: '1357'});
    await username.fill('later-admin'); await name.fill('后续未提交的草稿'); await pin.fill('2468');
    release();
    await expect(page.getByText('第二管理员已创建；可用账号管理工具栏的下载按钮导出本次凭据。', {exact: true})).toBeVisible();
    await expect(username).toHaveValue('later-admin'); await expect(name).toHaveValue('后续未提交的草稿'); await expect(pin).toHaveValue('2468');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', {name: '下载本次初始凭据', exact: true}).click();
    const download = await downloading, csv = await readFile(await download.path(), 'utf8');
    const fields = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/)[1].split(',').map(value => value.replace(/^"|"$/g, ''));
    expect(fields[1]).toBe('实际提交的管理员'); expect(fields[2]).toBe(submittedUsername); expect(fields[3]).toBe('1357');
    expect(csv).not.toContain('later-admin'); expect(csv).not.toContain('后续未提交的草稿');
    expect(await classroom.prisma.account.count({where: {localUsername: submittedUsername, name: '实际提交的管理员'}})).toBe(1);
    expect(await classroom.prisma.account.count({where: {localUsername: 'later-admin'}})).toBe(0);
    expect(errors).toEqual([]);
  } finally { release(); }
});
