import { AuthUser } from "../api/auth";

const TIER_SIZE = 500;
const TIERS = ["Recruit", "Sailor", "Engineer", "Captain", "Admiral", "Legend"];

export function XPBar({ user }: { user: AuthUser | null }) {
  const xp = user?.totalXp ?? 0;
  const tierIndex = Math.min(Math.floor(xp / TIER_SIZE), TIERS.length - 1);
  const tierXp = xp % TIER_SIZE;
  const pct = Math.min((tierXp / TIER_SIZE) * 100, 100);
  const tier = TIERS[tierIndex];
  const nextTier = TIERS[tierIndex + 1];

  return (
    <div className="panel xp-panel">
      <div className="panel-heading">
        <span className="panel-label">Progress</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
          {xp} XP
        </span>
      </div>
      <div className="xp-numbers">
        <span className="xp-total">{tier}</span>
        {nextTier && <span className="xp-tier">{TIER_SIZE - tierXp} xp → {nextTier}</span>}
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="xp-hint">
        {xp === 0 ? "Complete missions to earn XP and rise through the ranks." : `${tierXp} / ${TIER_SIZE} XP this tier`}
      </p>
    </div>
  );
}
