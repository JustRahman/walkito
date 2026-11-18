import { useEffect, useState } from 'react';

import { APP_STORE_RATING, CARLA_APPROVED, CARLA_PHOTO, PEOPLE_THRESHOLD, PT_GUIDELINE_URL } from '../config';
import { peopleCount } from '../lib/people';

/**
 * Small, calm lines under the plan and the price. Each one is true or hidden:
 * the guideline line waits for its source link, Dr. Shayman's line says only
 * what her contract covers, and "1,000+" waits for a real count from the server. No number here
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
      {people != null && people >= PEOPLE_THRESHOLD && <p className="small center">Used by 1,000+ people</p>}
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
          <span className="small">Dr. Carla Shayman, PT, DPT, reviewed our heel pain and flat feet guides</span>
        </div>
      )}
    </section>
  );
}
