import { MissionDetail } from "../api/missions";

export function MissionBriefing({ mission }: { mission: MissionDetail }) {
  return (
    <div className="briefing">
      <div className="briefing-eyebrow">
        <span className="module-crumb">
          MOD {String(mission.moduleId).padStart(2, "0")} · LVL {String(mission.levelId).padStart(2, "0")}
        </span>
        <span style={{ color: "var(--text-faint)", fontSize: 11, marginLeft: 4 }}>
          {mission.moduleTitle}
        </span>
      </div>

      <h1>{mission.title}</h1>
      <p className="story">{mission.story}</p>

      <div className="mission-tags">
        <span className={`tag tag-${mission.difficulty}`}>{mission.difficulty}</span>
        <span className="tag tag-xp">+{mission.xp} XP</span>
      </div>

      <p className="objectives-title">Objectives</p>
      <ul className="objectives-list">
        {mission.objectives.map((obj, i) => (
          <li key={i}>
            <span className="obj-check">○</span>
            <span>{obj}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
