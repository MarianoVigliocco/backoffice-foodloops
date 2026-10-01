import dayjs from 'dayjs';
import type { CohortMetric, MetricPoint, MetricResponse, SortDirection, UserSortKey } from './api';
import type { UserRow } from '../types';

const DEMO_NOW = () => dayjs().startOf('day');

function seededNumber(seed: string, min: number, max: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 4294967295;
  return Math.round(min + normalized * (max - min));
}

function metricPoint(value: number | null, previous: number | null): MetricPoint {
  const change = value != null && previous != null && previous !== 0
    ? Math.round(((value - previous) / Math.abs(previous)) * 100)
    : value === 0 && previous === 0 ? 0 : null;
  return {
    value,
    previous,
    change_percent: change,
    comparison_available: value != null && previous != null && previous >= 10,
  };
}

function cohortMetric(value: number, denominator: number, previousValue: number): CohortMetric {
  const numerator = Math.round((value / 100) * denominator);
  const previousDenominator = Math.max(12, Math.round(denominator * 0.91));
  return {
    ...metricPoint(value, previousValue),
    numerator,
    denominator,
    low_sample: denominator < 10,
    previous_numerator: Math.round((previousValue / 100) * previousDenominator),
    previous_denominator: previousDenominator,
  };
}

function dateRange(from?: string, to?: string) {
  const start = from ? dayjs(from).startOf('day') : DEMO_NOW().subtract(29, 'day');
  const exclusiveEnd = to ? dayjs(to).startOf('day') : DEMO_NOW().add(1, 'day');
  const safeEnd = exclusiveEnd.isAfter(start) ? exclusiveEnd : start.add(1, 'day');
  const days = Math.min(366, safeEnd.diff(start, 'day'));
  return { start, exclusiveEnd: start.add(days, 'day'), days };
}

function startOfMonday(date: dayjs.Dayjs) {
  return date.subtract((date.day() + 6) % 7, 'day').startOf('day');
}

export function demoMetrics(params?: { from?: string; to?: string; timezone?: string }): MetricResponse {
  const range = dateRange(params?.from, params?.to);
  const daily = Array.from({ length: range.days }, (_, index) => {
    const date = range.start.add(index, 'day');
    const monthWave = Math.sin((date.month() / 12) * Math.PI * 2) * 5;
    const growth = Math.max(0, date.diff(DEMO_NOW().subtract(12, 'month'), 'month')) * 0.55;
    const weekend = date.day() === 0 || date.day() === 6 ? 4 : 0;
    const imported = Math.max(4, Math.round(18 + monthWave + growth + weekend + seededNumber(date.format('YYYY-MM-DD'), -4, 5)));
    const saved = Math.max(2, Math.round(imported * 0.72 + seededNumber(`save-${date.format('YYYY-MM-DD')}`, -3, 5)));
    return { day: date.format('YYYY-MM-DD'), created: imported, saved };
  });

  const recipesImported = daily.reduce((sum, item) => sum + item.created, 0);
  const recipesSaved = daily.reduce((sum, item) => sum + item.saved, 0);
  const newUsers = daily.reduce((sum, item) => sum + Math.max(3, Math.round(item.created * 0.42)), 0);
  const activeUsers = Math.round(155 + range.days * 7.1 + recipesImported * 0.11);
  const weeklyValueUsers = Math.round(285 + Math.min(range.days, 30) * 3.8);
  const previousImported = Math.max(1, Math.round(recipesImported / 1.14));
  const previousNewUsers = Math.max(1, Math.round(newUsers / 1.09));
  const previousWeeklyValue = Math.max(1, Math.round(weeklyValueUsers / 1.12));

  const dailyActive: { period: string; users: number }[] = [];
  const weeklyBuckets = new Map<string, { users: number; imports: number }>();
  const monthlyBuckets = new Map<string, { users: number; imports: number }>();
  daily.forEach((item) => {
    const date = dayjs(item.day);
    dailyActive.push({
      period: item.day,
      users: Math.round(item.created * 1.55 + item.saved * 0.45),
    });
    const weekKey = startOfMonday(date).format('YYYY-MM-DD');
    const monthKey = date.format('YYYY-MM');
    const week = weeklyBuckets.get(weekKey) ?? { users: 0, imports: 0 };
    week.imports += item.created;
    week.users += Math.round(item.created * 1.9 + item.saved * 0.6);
    weeklyBuckets.set(weekKey, week);
    const month = monthlyBuckets.get(monthKey) ?? { users: 0, imports: 0 };
    month.imports += item.created;
    month.users += Math.round(item.created * 1.35 + item.saved * 0.35);
    monthlyBuckets.set(monthKey, month);
  });

  const weeklyActive = Array.from(weeklyBuckets, ([period, value]) => ({ period, users: value.users }));
  const monthlyActive = Array.from(monthlyBuckets, ([period, value]) => ({ period, users: value.users }));
  const weeklyImports = Array.from(weeklyBuckets, ([period, value]) => ({
    period,
    instagram: seededNumber(`ig-${period}`, 88, 96),
    tiktok: seededNumber(`tt-${period}`, 79, 91),
    instagram_attempts: Math.round(value.imports * 0.58),
    tiktok_attempts: Math.round(value.imports * 0.42),
  }));
  const monthlyImports = Array.from(monthlyBuckets, ([period, value]) => ({
    period,
    instagram: seededNumber(`ig-month-${period}`, 89, 95),
    tiktok: seededNumber(`tt-month-${period}`, 81, 90),
    instagram_attempts: Math.round(value.imports * 0.58),
    tiktok_attempts: Math.round(value.imports * 0.42),
  }));

  const instagramAttempts = Math.max(24, Math.round(recipesImported * 0.62));
  const tiktokAttempts = Math.max(18, Math.round(recipesImported * 0.46));
  const instagramPending = Math.round(instagramAttempts * 0.02);
  const tiktokPending = Math.round(tiktokAttempts * 0.03);
  const instagramResolved = instagramAttempts - instagramPending;
  const tiktokResolved = tiktokAttempts - tiktokPending;
  const instagramSuccesses = Math.round(instagramResolved * 0.93);
  const tiktokSuccesses = Math.round(tiktokResolved * 0.86);
  const overallResolved = instagramResolved + tiktokResolved;
  const overallSuccess = Math.round(((instagramSuccesses + tiktokSuccesses) / overallResolved) * 100);

  const mom = {
    comparison_from: range.start.subtract(1, 'month').toISOString(),
    comparison_to_exclusive: range.exclusiveEnd.subtract(1, 'month').toISOString(),
    new_users: metricPoint(newUsers, previousNewUsers),
    weekly_value_users: metricPoint(weeklyValueUsers, previousWeeklyValue),
    recipes_created: metricPoint(recipesImported, previousImported),
    import_success_rate: metricPoint(overallSuccess, Math.max(1, overallSuccess - 3)),
  };
  const yoy = {
    comparison_from: range.start.subtract(1, 'year').toISOString(),
    comparison_to_exclusive: range.exclusiveEnd.subtract(1, 'year').toISOString(),
    new_users: metricPoint(newUsers, Math.round(newUsers / 1.34)),
    weekly_value_users: metricPoint(weeklyValueUsers, Math.round(weeklyValueUsers / 1.29)),
    recipes_created: metricPoint(recipesImported, Math.round(recipesImported / 1.41)),
    import_success_rate: metricPoint(overallSuccess, Math.max(1, overallSuccess - 6)),
  };

  return {
    now: DEMO_NOW().add(12, 'hour').toISOString(),
    range: {
      from: range.start.toISOString(),
      to_exclusive: range.exclusiveEnd.toISOString(),
      timezone: params?.timezone || 'America/Argentina/Cordoba',
      days: range.days,
    },
    active_users: activeUsers,
    new_users: newUsers,
    weekly_value_users: weeklyValueUsers,
    recipes_created: recipesImported,
    recipes_saved: recipesSaved,
    recipes_per_day: daily.map((item) => ({ day: item.day, count: item.created })),
    recipe_activity_per_day: daily,
    activation_7d: cohortMetric(67, Math.max(24, Math.round(newUsers * 0.72)), 61),
    retention: {
      d1: cohortMetric(54, Math.max(20, Math.round(newUsers * 0.76)), 49),
      d7: cohortMetric(38, Math.max(18, Math.round(newUsers * 0.64)), 34),
      d30: cohortMetric(24, Math.max(15, Math.round(newUsers * 0.48)), 21),
    },
    user_mix: {
      new_users: Math.round(activeUsers * 0.41),
      returning_users: Math.round(activeUsers * 0.59),
    },
    import_performance: {
      tracking_since: DEMO_NOW().subtract(12, 'month').format('YYYY-MM-DD'),
      platforms: [
        {
          platform: 'Instagram',
          attempts: instagramAttempts,
          resolved_attempts: instagramResolved,
          low_sample: false,
          successes: instagramSuccesses,
          failures: instagramResolved - instagramSuccesses,
          pending: instagramPending,
          success_rate: Math.round((instagramSuccesses / instagramResolved) * 100),
          average_duration_seconds: 19,
          median_duration_seconds: 16,
          imported_recipes: Math.round(recipesImported * 0.58),
          mom: metricPoint(93, 90),
          yoy: metricPoint(93, 86),
        },
        {
          platform: 'TikTok',
          attempts: tiktokAttempts,
          resolved_attempts: tiktokResolved,
          low_sample: false,
          successes: tiktokSuccesses,
          failures: tiktokResolved - tiktokSuccesses,
          pending: tiktokPending,
          success_rate: Math.round((tiktokSuccesses / tiktokResolved) * 100),
          average_duration_seconds: 24,
          median_duration_seconds: 20,
          imported_recipes: Math.round(recipesImported * 0.42),
          mom: metricPoint(86, 82),
          yoy: metricPoint(86, 79),
        },
      ],
    },
    comparisons: { mom, yoy },
    trends: {
      active_users: { daily: dailyActive, weekly: weeklyActive, monthly: monthlyActive },
      import_success: { weekly: weeklyImports, monthly: monthlyImports },
    },
    seasonality: {
      coverage_from: DEMO_NOW().subtract(12, 'month').format('YYYY-MM-DD'),
      coverage_months: 12,
      reliable: true,
      seasons: [
        { season: 'Primavera', period: 'Sep – Nov', recipes_created: 1840, recipes_saved: 1215, value_users: 968, top_tag: 'Ensaladas', complete: true },
        { season: 'Verano', period: 'Dic – Feb', recipes_created: 2215, recipes_saved: 1562, value_users: 1184, top_tag: 'Fresco', complete: true },
        { season: 'Otoño', period: 'Mar – May', recipes_created: 1986, recipes_saved: 1398, value_users: 1062, top_tag: 'Vegetariano', complete: true },
        { season: 'Invierno', period: 'Jun – Ago', recipes_created: 2472, recipes_saved: 1733, value_users: 1268, top_tag: 'Sopas', complete: true },
      ],
    },
    top_tags: [
      { name: 'Saludable', uses: 684 },
      { name: 'Rápido', uses: 596 },
      { name: 'Vegetariano', uses: 472 },
      { name: 'Proteico', uses: 398 },
      { name: 'Sin gluten', uses: 321 },
      { name: 'Postres', uses: 284 },
    ],
    top_source_authors: [
      { username: '@cocina.simple', platform: 'Instagram', recipes: 146, saves: 982 },
      { username: '@nutri.recetas', platform: 'TikTok', recipes: 132, saves: 874 },
      { username: '@sabores.casa', platform: 'Instagram', recipes: 118, saves: 769 },
      { username: '@food.en.minutos', platform: 'TikTok', recipes: 105, saves: 694 },
      { username: '@verde.y.rico', platform: 'Instagram', recipes: 94, saves: 621 },
    ],
    top_saved_recipes: [],
    diets_distribution: [
      { name: 'Omnívora', users: 1248 },
      { name: 'Vegetariana', users: 734 },
      { name: 'Vegana', users: 391 },
      { name: 'Keto', users: 218 },
      { name: 'Pescetariana', users: 176 },
    ],
    allergies_distribution: [
      { name: 'Sin alergias declaradas', users: 1842 },
      { name: 'Lactosa', users: 486 },
      { name: 'Gluten', users: 362 },
      { name: 'Frutos secos', users: 194 },
      { name: 'Mariscos', users: 128 },
    ],
    data_quality: {
      min_reliable_sample: 10,
      total_users: 4286,
      new_users_low_sample: false,
      users_with_diet: 2767,
      users_with_allergy: 3012,
      import_events_tracked: instagramAttempts + tiktokAttempts,
      orphan_events_ignored: 0,
    },
  };
}

const demoFirstNames = ['Sofía', 'Mateo', 'Valentina', 'Benjamín', 'Martina', 'Joaquín', 'Catalina', 'Tomás', 'Olivia', 'Felipe', 'Camila', 'Bruno'];
const demoLastNames = ['Demo', 'Ejemplo', 'Muestra', 'Prueba'];
const demoCountries = ['Argentina', 'Uruguay', 'Chile', 'México', 'Colombia'];

const demoUsers: UserRow[] = Array.from({ length: 87 }, (_, index) => {
  const first = demoFirstNames[index % demoFirstNames.length];
  const last = demoLastNames[Math.floor(index / demoFirstNames.length) % demoLastNames.length];
  return {
    id_user: 9000 + index,
    name: first,
    last_name: last,
    email: `usuario.demo.${String(index + 1).padStart(2, '0')}@example.com`,
    created_at: DEMO_NOW().subtract(seededNumber(`user-${index}`, 1, 364), 'day').toISOString(),
    enabled: index % 13 !== 0,
    country: demoCountries[index % demoCountries.length],
  };
});

export function demoUsersList(params: {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: UserSortKey;
  sortDirection?: SortDirection;
}) {
  const query = (params.q ?? '').trim().toLowerCase();
  const filtered = query
    ? demoUsers.filter((user) => `${user.name} ${user.last_name} ${user.email}`.toLowerCase().includes(query))
    : [...demoUsers];
  const sortBy = params.sortBy ?? 'created_at';
  const direction = params.sortDirection === 'asc' ? 1 : -1;
  filtered.sort((a, b) => String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? ''), 'es', { numeric: true }) * direction);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 20);
  return { data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length };
}

const recipeNames = [
  'Bowl mediterráneo', 'Pasta cremosa de calabaza', 'Tacos de lentejas', 'Pollo al limón',
  'Ensalada de quinoa', 'Sopa thai de vegetales', 'Focaccia integral', 'Cheesecake de frutos rojos',
  'Risotto de hongos', 'Wrap proteico', 'Curry de garbanzos', 'Granola casera',
];

const demoRecipes = Array.from({ length: 73 }, (_, index) => ({
  id_recipe: 7000 + index,
  title: `${recipeNames[index % recipeNames.length]}${index >= recipeNames.length ? ` #${Math.floor(index / recipeNames.length) + 1}` : ''}`,
  calories_per_serving_kcal: seededNumber(`kcal-${index}`, 240, 690),
  difficulty: ['Fácil', 'Media', 'Difícil'][index % 3],
  source_platform: index % 5 < 3 ? 'Instagram' : 'TikTok',
  source_username: `@autor.demo${String((index % 18) + 1).padStart(2, '0')}`,
  created_at: DEMO_NOW().subtract(seededNumber(`recipe-${index}`, 0, 364), 'day').toISOString(),
}));

export function demoRecipesList(params: { q?: string; page?: number; pageSize?: number }) {
  const query = (params.q ?? '').trim().toLowerCase();
  const filtered = query
    ? demoRecipes.filter((recipe) => `${recipe.title} ${recipe.source_username}`.toLowerCase().includes(query))
    : demoRecipes;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 20);
  return { data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length };
}
