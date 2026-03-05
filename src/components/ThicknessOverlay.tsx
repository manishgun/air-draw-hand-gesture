import { FaArrowsUpDown } from "react-icons/fa6";

interface ThicknessOverlayProps {
  value: number;
  visible: boolean;
  tool: "draw" | "erase";
}

const ThicknessOverlay = ({ value, visible, tool }: ThicknessOverlayProps) => {
  if (!visible) return null;

  // Percentage for the visual bar (assuming 1-50 range)
  const percent = ((value - 1) / 49) * 100;

  return (
    <div className="thickness-overlay">
      <div className="overlay-badge" data-tool={tool}>
        <div className="overlay-icon">
          <FaArrowsUpDown />
        </div>
        <div className="overlay-value">{value}</div>
        <div className="overlay-label">{tool === "erase" ? "Eraser Size" : "Pencil Size"}</div>

        <div className="overlay-visual-bar">
          <div className="overlay-visual-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

export default ThicknessOverlay;
