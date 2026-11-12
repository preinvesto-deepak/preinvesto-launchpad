import { useEffect, useState } from "react";

// A picture that quietly disappears if it cannot be loaded (a link to a web page
// rather than a picture, a dead address, blocked content).
export default function OptionThumb({ src, onStatus, style }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => { if (onStatus) onStatus(!!src && !failed); }, [src, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src || failed) return null;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={style} />;
}
