import { MissionDetail } from "../api/missions";
import { ValidationResult } from "../api/sandbox";
import { RichText } from "./RichText";

interface ValidationPanelProps {
  mission: MissionDetail;
  result: ValidationResult | null;
  onValidate: () => void;
  validating: boolean;
}

export function ValidationPanel({ mission, result, onValidate, validating }: ValidationPanelProps) {
  // Before the first check, list the requirements as "pending".
  const checks = result?.checks?.length
    ? result.checks
    : mission.validation.map((check) => ({ description: check.description, passed: null as boolean | null }));

  return (
    <div className="validation-panel">
      <div className="panel-heading">
        <span className="panel-label">Validation</span>
        <button
          className="btn btn-primary btn-sm"
          onClick={onValidate}
          disabled={validating}
          type="button"
        >
          {validating ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, border: "1.5px solid #0d1117", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
              Checking…
            </span>
          ) : "▶ Check Mission"}
        </button>
      </div>

      <ul className="requirement-list">
        {checks.map((check, index) => (
          <li
            key={index}
            className={`requirement ${check.passed === null ? "pending" : check.passed ? "met" : "unmet"}`}
          >
            <span className="requirement-mark">{check.passed === null ? "○" : check.passed ? "✓" : "✗"}</span>
            <RichText text={check.description} />
          </li>
        ))}
      </ul>

      {result && (
        <div className={`validation-result ${result.passed ? "success" : "error"}`}>
          <div className="validation-result-title">
            {result.passed ? "✓ Mission complete" : "✗ Not complete yet"}
          </div>

          {result.passed && result.progress?.xpEarned ? (
            <div className="validation-xp">+{result.progress.xpEarned} XP earned</div>
          ) : null}

          {result.passed && result.debrief ? (
            <div className="validation-debrief">
              <span className="validation-debrief-label">Debrief</span>
              <RichText text={result.debrief} block />
            </div>
          ) : null}

          {!result.passed && result.message ? (
            <pre className="validation-message">{result.message}</pre>
          ) : null}
        </div>
      )}
    </div>
  );
}
