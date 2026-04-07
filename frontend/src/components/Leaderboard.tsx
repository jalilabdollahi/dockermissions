import { LeaderboardEntry } from "../api/progress";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="panel leaderboard-panel">
      <div className="panel-heading">
        <span className="panel-label">Leaderboard</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Top Pilots</span>
      </div>

      {entries.length === 0 ? (
        <p className="badge-empty">No scores yet. Be the first to finish a mission.</p>
      ) : (
        <div className="leaderboard-list">
          {entries.slice(0, 8).map((entry) => (
            <div className="leaderboard-row" key={entry.username}>
              <span className={`lb-rank${entry.rank <= 3 ? " top" : ""}`}>
                {entry.rank <= 3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
              </span>
              <span className="lb-name">{entry.username}</span>
              <span className="lb-xp">{entry.totalXp.toLocaleString()} xp</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
