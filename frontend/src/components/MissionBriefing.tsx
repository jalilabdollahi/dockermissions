import { MissionDetail } from "../api/missions";
import { RichText } from "./RichText";

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
      <div className="story">
        <RichText text={mission.story} block />
      </div>

      <div className="mission-tags">
        <span className={`tag tag-${mission.difficulty}`}>{mission.difficulty}</span>
        <span className="tag tag-xp">+{mission.xp} XP</span>
        {mission.concepts.map((concept) => (
          <span className="tag tag-concept" key={concept}>{concept}</span>
        ))}
      </div>

      {mission.startingState && (
        <div className="starting-state">
          <span className="starting-state-label">Starting state</span>
          <RichText text={mission.startingState} />
        </div>
      )}

      <p className="objectives-title">Objectives</p>
      <ul className="objectives-list">
        {mission.objectives.map((objective, i) => (
          <li key={i}>
            <span className="obj-check">○</span>
            <RichText text={objective} />
          </li>
        ))}
      </ul>
    </div>
  );
}
