export function BadgeGallery({ badges }: { badges: string[] }) {
  return (
    <div className="panel badge-panel">
      <div className="panel-heading">
        <span className="panel-label">Badges</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
          {badges.length} earned
        </span>
      </div>

      {badges.length === 0 ? (
        <p className="badge-empty">Complete a full module to earn your first badge.</p>
      ) : (
        <div className="badge-grid">
          {badges.map((badge) => (
            <span className="badge-chip" key={badge}>
              🏅 {badge.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
