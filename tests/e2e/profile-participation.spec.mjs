import { expect, prepareApp, test } from './helpers/browser.mjs';

async function personalHistoryFixture(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareApp(page, { allowPlanner: true });
  // The actual lazy-loaded Supabase runtime supplies the profile functions.
  // Account/network operations are outside this synthetic personal-history test.
  await page.waitForFunction(() => typeof getProfilePlannedEvents === 'function');
  await page.evaluate(async () => {
    const statuses = ['', 'Finished', 'DNF', 'DNS', 'DSQ', 'Finisher', 'Finished', 'Finished', 'Finished'];
    const history = statuses.map((status, index) => ({
      event_id: 7, edition_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      _planner_key: `historic-race|10.09.${2010 + index}|berlin|germany`,
      event_key: `historic-race|10.09.${2010 + index}|berlin|germany`,
      event_name: `Personal edition ${2010 + index}`, date: `10.09.${2010 + index}`,
      end_date: `${2010 + index}-09-10`, city: 'Berlin', country: 'Germany', sport: 'Running',
      distance: '10 km', race_formats: [{ label: '10 km', distance_km: 10 }], event_status: 'completed'
    }));
    const seasonMeta = Object.fromEntries(history.map((row, index) => [row._planner_key, {
      edition_id: row.edition_id, priority: 'Maybe', planner_details: {
        result: { finish_status: statuses[index], finish_time: statuses[index] === 'Finished' ? '00:45:00' : '' },
        post_race: { archived: index > 5 }
      }
    }]));
    // Mimic a successful read-only lookup of owned historical editions. They do
    // not enter the public Discovery `events` collection.
    window.loadPersonalPlannedEditions = async refs => history.filter(row => refs.some(ref => ref.edition_id === row.edition_id));
    window.applyRemotePlanningState({ favorites: [], plannedEditions: history.map(row => row._planner_key), seasonMeta });
    await window.refreshPersonalPlannedCatalog();
    window.profileTestHistory = history;
    renderProfileCompletedEvents();
    document.getElementById('profileModal').classList.add('open');
  });
}

test('profile: lifetime badges use own explicit finishes and retain archived editions outside Discovery', async ({ page }, testInfo) => {
  await personalHistoryFixture(page);
  await expect(page.locator('#profileCompletedCount')).toHaveText('5 completed');
  await expect(page.locator('#profileAchievementBadges .is-unlocked')).toHaveCount(1);
  expect(await page.evaluate(() => getProfileFavoriteEvents().length)).toBe(0);
  expect(await page.evaluate(() => getProfileCompletedArchiveEvents().length)).toBe(9);
  expect(await page.evaluate(() => getProfileArchiveFilterCounts(getProfileCompletedArchiveEvents()))).toEqual({
    all: 9, finisher: 5, dnf_dns: 3, with_result: 8, without_result: 1
  });
  await page.evaluate(() => { profileCompletedArchiveOpen = true; renderProfileCompletedArchive(); });
  await expect(page.locator('#profileCompletedArchiveList .profile-completed-archive-card')).toHaveCount(9);
  await expect(page.locator('[data-profile-completed-filter="finisher"] strong')).toHaveText('5');
  await expect(page.locator('[data-profile-completed-filter="dnf_dns"] strong')).toHaveText('3');
  const overflow = await page.locator('#profileModal .profile-card').evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.locator('#profileAchievementBadges').screenshot({ path: testInfo.outputPath('profile-personal-badges-mobile.png') });
});

test('profile: changing and removing an outcome refreshes derived badges once without moving personal history', async ({ page }) => {
  await personalHistoryFixture(page);
  const key = await page.evaluate(() => window.profileTestHistory[1]._planner_key);
  await page.evaluate(key => setSeasonPlannerDetailField(key, 'result.finish_status', 'DNF'), key);
  await expect(page.locator('#profileCompletedCount')).toHaveText('4 completed');
  await expect(page.locator('#profileAchievementBadges .is-unlocked')).toHaveCount(0);
  await page.evaluate(key => setSeasonPlannerDetailField(key, 'result.finish_status', 'Finished'), key);
  await expect(page.locator('#profileCompletedCount')).toHaveText('5 completed');
  await page.evaluate(key => {
    setSeasonPlannerDetailField(key, 'post_race.archived', true);
    setSeasonPlannerDetailField(key, 'result.finish_status', 'Finished');
  }, key);
  await expect(page.locator('#profileAchievementBadges .is-unlocked')).toHaveCount(1);
  expect(await page.evaluate(() => getProfilePlannedEvents().length)).toBe(9);
  await page.evaluate(key => setSeasonPlannerDetailField(key, 'result.finish_status', ''), key);
  await expect(page.locator('#profileCompletedCount')).toHaveText('4 completed');
  expect(await page.evaluate(() => getProfileCompletedArchiveEvents().length)).toBe(9);
});
