import { Fragment } from 'react';
import { Badge } from './ui';

const NAMES = { SAME_DISTRICT: 'Same district', SAME_STATE: 'Same state', NATIONAL: 'Anywhere in India' };

/**
 * The search walks outward: same district -> same state -> anywhere in India,
 * and stops at the first ring that holds a compatible unit. This strip shows
 * what the database found in each ring and which one was used.
 */
export default function TierRings({ tiers = [], selectedTier }) {
  return (
    <div className="tiers">
      {tiers.map((t, i) => (
        <Fragment key={t.search_tier}>
          {i > 0 && <div className="tier-arrow">›</div>}
          <div className={`tier ${t.search_tier === selectedTier ? 'selected' : ''} ${t.sample_count ? '' : 'empty-tier'}`}>
            {t.search_tier === selectedTier && <span className="tier-flag">searched here</span>}
            <div className="tier-name">{NAMES[t.search_tier]}</div>
            <div className="tier-count num">{t.sample_count}</div>
            <div className="tier-meta">{t.sample_count ? `best match ${t.best_score}/6` : 'no compatible unit'}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export function TierBadge({ tier }) {
  return <Badge value={tier}>{NAMES[tier] || tier}</Badge>;
}
