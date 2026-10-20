import {test, expect} from './fixture.js';
import {api} from '../e2e/environment.js';
import {todayBoardDate, shiftBoardDate} from '../../src/utils/boardDate.js';

test('copying a board excludes assignments that have not reached their publication time', async ({classroom, request}) => {
  const source = shiftBoardDate(todayBoardDate(), 1), target = todayBoardDate();
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const screenHeaders = {'X-Classworks-Screen-Token': classroom.screenToken};
  const created = [];
  for (const [content, status, publishAt] of [
    ['已经允许大屏查看的作业', 'PUBLISHED', new Date(Date.now() - 60000).toISOString()],
    ['尚未到发布时间的作业', 'PUBLISHED', new Date(Date.now() + 86400000).toISOString()],
    ['未发布的草稿', 'DRAFT', new Date(Date.now() - 60000).toISOString()],
  ]) {
    const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
      type: 'ASSIGNMENT', status, subjectId: classroom.subject.id, boardDate: source,
      targetWorkspaceIds: [classroom.workspace.id], content, publishAt,
    }});
    expect(response.status()).toBe(201); created.push((await response.json()).data);
  }
  const copy = () => request.post(`${api}/api/v2/classroom-screens/board/copy`, {
    headers: screenHeaders, data: {sourceBoardDate: source, targetBoardDate: target},
  });
  const response = await copy(); expect(response.status()).toBe(201);
  const data = (await response.json()).data;
  expect(data.createdCount).toBe(1);
  expect(data.created.map(row => row.content)).toEqual([created[0].content]);
  const repeated = await copy(); expect(repeated.status()).toBe(201);
  expect((await repeated.json()).data).toMatchObject({createdCount: 0, skippedCount: 1});
  const rows = await classroom.rows(); expect(rows).toHaveLength(4);
  const future = rows.find(row => row.id === created[1].id);
  expect(future.publishAt.toISOString()).toBe(created[1].publishAt);
  expect(future.revision).toBe(1); expect(future.content).toBe(created[1].content);
  expect(rows.filter(row => row.boardDate.toISOString().slice(0, 10) === target).map(row => row.content)).toEqual([created[0].content]);
});
