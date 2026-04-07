import { ValidationResult } from "../api/sandbox";

interface ValidationPanelProps {
  result: ValidationResult | null;
  onValidate: () => void;
  validating: boolean;
}

export function ValidationPanel({ result, onValidate, validating }: ValidationPanelProps) {
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

      {!result && (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
          Complete the mission steps in the terminal, then click Check Mission.
        </p>
      )}

      {result && (
        <div className={`validation-result ${result.passed ? "success" : "error"}`}>
          <div className="validation-result-title">
            {result.passed ? "✓" : "✗"} {result.message}
          </div>

          {result.passed && result.progress?.xpEarned ? (
            <div className="validation-xp">+{result.progress.xpEarned} XP earned</div>
          ) : null}

          {!result.passed && result.failedChecks.length > 0 && (
            <ul className="validation-checks">
              {result.failedChecks.map((check) => (
                <li key={check} className="validation-check-item">
                  <span>✗</span> {check}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
