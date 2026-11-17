import { useEffect, useState } from 'react';

import { APP_STORE_RATING, CARLA_APPROVED, CARLA_PHOTO, PEOPLE_THRESHOLD, PT_GUIDELINE_URL } from '../config';
import { peopleCount } from '../lib/people';

/**
 * Small, calm lines under the plan and the price. Each one is true or hidden:
 * the guideline line waits for its source link, Dr. Shayman's line for her
 * written OK, and "1,000+" for a real count from the server. No number here
 * is typed in by hand except the App Store rating.
 */
export function TrustLines() {
  const [people, setPeople] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void peopleCount().then((n) => {
      if (live) setPeople(n);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="trust stack gap-s" aria-label="About Walkito">
      <p className="small center">Join women across the US doing 5 minutes a day.</p>
      {people != null && people >= PEOPLE_THRESHOLD && <p className="small center">Used by 1,000+ women</p>}
      <p className="small center">Rated {APP_STORE_RATING} ★ on the App Store</p>
      {PT_GUIDELINE_URL !== '' && (
        <p className="small center">
          Exercise is what physical therapists recommend first for heel pain.{' '}
          <a href={PT_GUIDELINE_URL} target="_blank" rel="noopener noreferrer">
            source
          </a>
        </p>
      )}
      {CARLA_APPROVED && (
        <div className="reviewer">
          <img src={CARLA_PHOTO} alt="" width={40} height={40} />
          <span className="small">Exercises reviewed by Dr. Carla Shayman, PT, DPT</span>
        </div>
      )}
    </section>
  );
}
