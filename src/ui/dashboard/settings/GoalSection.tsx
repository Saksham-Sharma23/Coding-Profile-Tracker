import type { SectionProps } from './types';

const GOAL_CHOICES = [0, 1, 2, 3, 5, 10];

export function GoalSection({ state, updateSettings }: SectionProps) {
  return (
    <>
      <h2>Daily goal</h2>
      <section className="settings-row">
        <label htmlFor="goal">Aim for</label>
        <select
          id="goal"
          value={state.settings.dailyGoal}
          onChange={(e) => void updateSettings({ dailyGoal: Number(e.target.value) })}
        >
          {GOAL_CHOICES.map((goal) => (
            <option key={goal} value={goal}>
              {goal === 0 ? 'No goal' : `${goal} problem${goal === 1 ? '' : 's'} a day`}
            </option>
          ))}
        </select>
        <span className="muted hint">
          Counted from the problems themselves where a platform says which ones you solved,
          and from the day-over-day change in your totals everywhere else — those need a day
          of history first.
        </span>
      </section>
    </>
  );
}
