import { useEffect, useState } from "react";
import { MissionDetail } from "../api/missions";

export function HintPanel({
  mission,
  hintsUsed,
  onReveal
}: {
  mission: MissionDetail;
  hintsUsed: number;
  onReveal: (nextHintsUsed: number) => void;
}) {
  const [revealed, setRevealed] = useState(Math.max(1, hintsUsed || 1));

  useEffect(() => {
    setRevealed(Math.max(1, hintsUsed || 1));
  }, [hintsUsed, mission.id]);

  const revealNext = () => {
    const next = Math.min(revealed + 1, mission.hints.length);
    setRevealed(next);
    onReveal(next);
  };

  const hasMore = revealed < mission.hints.length;

  return (
    <div className="hints-panel">
      <div className="panel-heading">
        <span className="panel-label">Hints ({revealed}/{mission.hints.length})</span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={!hasMore}
          onClick={revealNext}
          type="button"
        >
          {hasMore ? "Reveal next" : "All revealed"}
        </button>
      </div>

      {revealed > 1 && (
        <div className="hint-xp-warning">
          ⚠ Using hints beyond the first reduces your XP reward.
        </div>
      )}

      <ol className="hint-list">
        {mission.hints.slice(0, revealed).map((hint, i) => (
          <li key={i} className="hint-item">
            <span className="hint-num">{i + 1}</span>
            <span>{hint}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
