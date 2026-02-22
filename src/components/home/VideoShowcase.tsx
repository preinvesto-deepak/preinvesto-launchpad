import { useState } from "react";

const VideoShowcase = () => {
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="relative w-full overflow-hidden bg-primary" style={{ minHeight: "50vh" }}>
      {/* Skeleton while loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      <video
        className="w-full h-full object-cover block"
        style={{ minHeight: "50vh", maxHeight: "80vh" }}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
      >
        <source src="https://preinvesto.com/Video/Video1.mp4" type="video/mp4" />
      </video>

      {/* Subtle premium gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/30 pointer-events-none" />
    </section>
  );
};

export default VideoShowcase;
