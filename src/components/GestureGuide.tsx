import { FaHandPointer, FaHandPeace, FaHandBackFist, FaShapes, FaArrowsLeftRight, FaArrowsUpDown } from "react-icons/fa6";

const GestureGuide = () => {
  return (
    <div className="gesture-guide">
      <div className="guide-item" data-tool="draw">
        <div className="guide-icon">
          <FaHandPointer />
        </div>
        <span className="guide-text">Pinch to Draw</span>
      </div>

      <div className="guide-sep" />

      <div className="guide-item" data-tool="erase">
        <div className="guide-icon">
          <FaHandPeace />
        </div>
        <span className="guide-text">2 Fingers to Erase</span>
      </div>

      <div className="guide-sep" />

      <div className="guide-item" data-tool="clear">
        <div className="guide-icon">
          <FaHandBackFist />
        </div>
        <span className="guide-text">Fist to Clear</span>
      </div>

      <div className="guide-sep" />

      <div className="guide-item" data-tool="shape">
        <div className="guide-icon">
          <FaShapes />
        </div>
        <span className="guide-text">3 Fingers for Shapes</span>
      </div>

      <div className="guide-sep" />

      <div className="guide-item" data-tool="thickness">
        <div className="guide-icon">
          <FaArrowsUpDown />
        </div>
        <span className="guide-text">Pinch & Move Up/Down for Size</span>
      </div>
    </div>
  );
};

export default GestureGuide;
