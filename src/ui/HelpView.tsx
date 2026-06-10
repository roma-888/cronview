import { KEYMAP, VERSION } from "../cli";
import { UI } from "./theme";

/** Full-screen keymap card, opened with ? and closed with ?/q/Esc. */
export function HelpView() {
  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <box style={{ height: 1, backgroundColor: UI.headerBg }}>
        <text>
          <span fg={UI.accent}>{" help "}</span>
          <span fg={UI.dim}>{`cronview ${VERSION}`}</span>
        </text>
      </box>
      <box style={{ flexDirection: "column", flexGrow: 1, paddingTop: 1, paddingLeft: 2 }}>
        {KEYMAP.map(([key, desc]) => (
          <text key={key}>
            <span fg={UI.accent}>{key.padEnd(9)}</span>
            <span fg={UI.text}>{desc}</span>
          </text>
        ))}
      </box>
      <text fg={UI.dim}>{" ? or q to close"}</text>
    </box>
  );
}
