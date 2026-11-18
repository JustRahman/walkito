/**
 * NOT REAL. Rahim's draft texts (Nov 18), to judge the v4 layout with a
 * doctor quote and stronger reviews. They show only in a preview build
 * (`bun run dev`, or a build with FUNNEL_PREVIEW=1), never on walkito.site/go:
 * `PREVIEW` is a build-time constant, so the production bundle drops this
 * module, and preview.test.ts fails the build if any of it gets in.
 *
 * Dr. Shayman has not approved the quote. None of these reviewers exist.
 */
export const PLACEHOLDER_MARK = 'PLACEHOLDER';

export const PLACEHOLDER_CARLA_QUOTE = {
  mark: PLACEHOLDER_MARK,
  text: 'I give my heel pain patients the same kind of short, seated foot exercises. Walkito makes them easy to do every day.',
} as const;

export const PLACEHOLDER_REVIEWS = [
  {
    mark: PLACEHOLDER_MARK,
    author: 'Linda R., 58',
    text: 'I sit at a desk 9 hours a day and my first steps in the morning were the worst part. I do my 5 minutes with coffee now. Easy to keep up.',
  },
  {
    mark: PLACEHOLDER_MARK,
    author: 'Maureen K., 63',
    text: 'Nothing fancy, which is why I stick with it. Short videos, I do them in my chair while watching TV.',
  },
  {
    mark: PLACEHOLDER_MARK,
    author: 'Dana P., 47',
    text: 'I run 3 times a week and my arches were always tired. I like that it tells me exactly what to do and for how long.',
  },
  {
    mark: PLACEHOLDER_MARK,
    author: 'Carol W., 66',
    text: 'My podiatrist told me to do foot exercises but I never knew which ones. This just gives me the plan.',
  },
] as const;
