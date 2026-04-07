import { MissionProgress } from "../api/progress";
import { ModuleSummary } from "../api/missions";

interface ModuleMapProps {
  canPlay: boolean;
  modules: ModuleSummary[];
  progress: MissionProgress[];
  selectedMissionId: string | null;
  onSelectMission: (missionId: string) => void;
}

export function ModuleMap({ canPlay, modules, progress, selectedMissionId, onSelectMission }: ModuleMapProps) {
  const completedIds = new Set(progress.filter((e) => e.completed).map((e) => e.missionId));
  const totalMissions = modules.reduce((sum, m) => sum + m.missions.length, 0);
  const totalDone = completedIds.size;

  return (
    <nav className="module-map">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🐳</div>
          <div>
            <h1>DockerMissions</h1>
            <span>{totalDone} / {totalMissions} complete</span>
          </div>
        </div>
      </div>

      <div className="sidebar-scroll">
        {modules.map((module, moduleIndex) => {
          const prevModule = modules[moduleIndex - 1];
          const prevModuleDone = !prevModule || prevModule.missions.every((m) => completedIds.has(m.id));
          const moduleDone = module.missions.every((m) => completedIds.has(m.id));

          return (
            <div className="module-block" key={module.id}>
              <div className="module-header">
                <div className={`module-num${moduleDone ? " done" : ""}`}>{module.id}</div>
                <div className="module-meta">
                  <h3>{module.title}</h3>
                  <p>{module.theme}</p>
                </div>
              </div>

              <div className="mission-grid">
                {module.missions.map((mission, index) => {
                  const prev = module.missions[index - 1];
                  const unlocked = canPlay && prevModuleDone && (index === 0 || !prev || completedIds.has(prev.id));
                  const completed = completedIds.has(mission.id);
                  const active = selectedMissionId === mission.id;

                  return (
                    <button
                      key={mission.id}
                      className={[
                        "mission-card",
                        active ? "active" : "",
                        !unlocked ? "locked" : "",
                        completed ? "completed" : ""
                      ].filter(Boolean).join(" ")}
                      disabled={!unlocked}
                      onClick={() => onSelectMission(mission.id)}
                      type="button"
                    >
                      <div className="mission-dot" />
                      <div className="mission-card-body">
                        <span className="mission-card-title">{mission.title}</span>
                        <div className="mission-card-meta">
                          <span className={`diff-badge ${mission.difficulty}`}>{mission.difficulty}</span>
                          <span className="xp-label">
                            {completed ? "✓ done" : unlocked ? `${mission.xp} xp` : canPlay ? "locked" : "enter name"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
