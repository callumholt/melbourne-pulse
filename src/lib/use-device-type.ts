"use client";

import { useEffect, useState } from "react";

interface DeviceType {
  isMobile: boolean;
  isTouch: boolean;
}

/**
 * Detect mobile/touch devices for rendering 2D vs 3D map.
 */
export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>({ isMobile: false, isTouch: false });

  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isMobile = isTouch && window.innerWidth < 768;
    setDevice({ isMobile, isTouch });

    const handleResize = () => {
      setDevice({
        isMobile: isTouch && window.innerWidth < 768,
        isTouch,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
