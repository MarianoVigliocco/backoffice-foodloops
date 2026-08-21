export const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsRange = {
  from: Date;
  toExclusive: Date;
};

export type AnalyticsUser = {
  id: number;
  createdAt: Date;
};

export type ActivityEvent = {
  userId: number;
  at: Date;
  kind: "recipe" | "import" | "save" | "conversation" | "meal_plan";
};

export type CohortStat = {
  value: number | null;
  numerator: number;
  denominator: number;
};

export type MetricPoint = {
  value: number | null;
  previous: number | null;
  change_percent: number | null;
};

export function previousRange(range: AnalyticsRange): AnalyticsRange {
  const duration = range.toExclusive.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - duration),
    toExclusive: new Date(range.from),
  };
}

export function metricPoint(
  value: number | null,
  previous: number | null,
): MetricPoint {
  let changePercent: number | null = null;
  if (value != null && previous != null) {
    if (previous === 0) {
      changePercent = value === 0 ? 0 : null;
    } else {
      changePercent = round(((value - previous) / Math.abs(previous)) * 100);
    }
  }

  return {
    value: value == null ? null : round(value),
    previous: previous == null ? null : round(previous),
    change_percent: changePercent,
  };
}

export function eventsInRange(
  events: ActivityEvent[],
  range: AnalyticsRange,
) {
  const from = range.from.getTime();
  const to = range.toExclusive.getTime();
  return events.filter((event) => {
    const at = event.at.getTime();
    return at >= from && at < to;
  });
}

export function uniqueUsers(
  events: ActivityEvent[],
  range: AnalyticsRange,
) {
  return new Set(eventsInRange(events, range).map((event) => event.userId));
}

export function usersRegisteredInRange(
  users: AnalyticsUser[],
  range: AnalyticsRange,
) {
  const from = range.from.getTime();
  const to = range.toExclusive.getTime();
  return users.filter((user) => {
    const createdAt = user.createdAt.getTime();
    return createdAt >= from && createdAt < to;
  });
}

export function activation(
  cohort: AnalyticsUser[],
  valueEvents: ActivityEvent[],
  asOf: Date,
): CohortStat {
  const eligible = cohort.filter((user) =>
    user.createdAt.getTime() + 7 * DAY_MS <= asOf.getTime()
  );
  const firstValues = firstEventByUser(valueEvents);
  const activated = eligible.filter((user) => {
    const first = firstValues.get(user.id);
    if (!first) return false;
    const elapsed = first.getTime() - user.createdAt.getTime();
    return elapsed >= 0 && elapsed <= 7 * DAY_MS;
  });

  return cohortStat(activated.length, eligible.length);
}

export function retention(
  cohort: AnalyticsUser[],
  activityEvents: ActivityEvent[],
  day: 1 | 7 | 30,
  asOf: Date,
): CohortStat {
  const eligible = cohort.filter((user) =>
    user.createdAt.getTime() + (day + 1) * DAY_MS <= asOf.getTime()
  );
  const eventsByUser = groupEventsByUser(activityEvents);
  const retained = eligible.filter((user) => {
    const from = user.createdAt.getTime() + day * DAY_MS;
    const to = from + DAY_MS;
    return (eventsByUser.get(user.id) ?? []).some((event) => {
      const at = event.getTime();
      return at >= from && at < to;
    });
  });

  return cohortStat(retained.length, eligible.length);
}

export function timeToFirstValue(
  cohort: AnalyticsUser[],
  valueEvents: ActivityEvent[],
  asOf: Date,
) {
  const eligible = cohort.filter((user) =>
    user.createdAt.getTime() + 7 * DAY_MS <= asOf.getTime()
  );
  const firstValues = firstEventByUser(valueEvents);
  const durations = eligible.flatMap((user) => {
    const first = firstValues.get(user.id);
    if (!first) return [];
    const elapsed = first.getTime() - user.createdAt.getTime();
    if (elapsed < 0 || elapsed > 7 * DAY_MS) return [];
    return [elapsed / DAY_MS];
  }).sort((a, b) => a - b);

  return {
    average_days: durations.length
      ? round(
        durations.reduce((sum, value) => sum + value, 0) / durations.length,
      )
      : null,
    median_days: durations.length ? round(median(durations)) : null,
    sample_size: durations.length,
    eligible_users: eligible.length,
  };
}

export function activeUserMix(
  users: AnalyticsUser[],
  activityEvents: ActivityEvent[],
  range: AnalyticsRange,
) {
  const active = uniqueUsers(activityEvents, range);
  const usersById = new Map(users.map((user) => [user.id, user]));
  let newUsers = 0;
  let returningUsers = 0;

  active.forEach((id) => {
    const user = usersById.get(id);
    if (!user) return;
    if (user.createdAt >= range.from && user.createdAt < range.toExclusive) {
      newUsers += 1;
    } else if (user.createdAt < range.from) {
      returningUsers += 1;
    }
  });

  return { new_users: newUsers, returning_users: returningUsers };
}

export function ratePerActiveUser(
  eventCount: number,
  activeUsers: number,
) {
  return activeUsers ? round(eventCount / activeUsers, 2) : null;
}

export function percentage(numerator: number, denominator: number) {
  return denominator ? round((numerator / denominator) * 100) : null;
}

export function compareCohortStats(
  current: CohortStat,
  previous: CohortStat,
) {
  return {
    ...metricPoint(current.value, previous.value),
    numerator: current.numerator,
    denominator: current.denominator,
    previous_numerator: previous.numerator,
    previous_denominator: previous.denominator,
  };
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cohortStat(numerator: number, denominator: number): CohortStat {
  return {
    value: percentage(numerator, denominator),
    numerator,
    denominator,
  };
}

function firstEventByUser(events: ActivityEvent[]) {
  const result = new Map<number, Date>();
  events.forEach((event) => {
    const current = result.get(event.userId);
    if (!current || event.at < current) result.set(event.userId, event.at);
  });
  return result;
}

function groupEventsByUser(events: ActivityEvent[]) {
  const result = new Map<number, Date[]>();
  events.forEach((event) => {
    const current = result.get(event.userId) ?? [];
    current.push(event.at);
    result.set(event.userId, current);
  });
  return result;
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
