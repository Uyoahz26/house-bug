"use client";

import { useEffect, useRef, useState } from "react";

interface InteractiveCharactersProps {
  focusMode: "none" | "email" | "password";
  showPassword: boolean;
  passwordLen: number;
}

export function InteractiveCharacters({
  focusMode,
  showPassword,
  passwordLen,
}: InteractiveCharactersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const purpleEyesRef = useRef<HTMLDivElement>(null);
  const blackEyesRef = useRef<HTMLDivElement>(null);
  const orangeEyesRef = useRef<HTMLDivElement>(null);
  const yellowEyesRef = useRef<HTMLDivElement>(null);
  const yellowMouthRef = useRef<HTMLDivElement>(null);

  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Blinking logic
  const [purpleBlink, setPurpleBlink] = useState(false);
  const [blackBlink, setBlackBlink] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const scheduleBlink = (setter: (v: boolean) => void) => {
      const delay = Math.random() * 4000 + 3000;
      timeoutId = setTimeout(() => {
        setter(true);
        setTimeout(() => {
          setter(false);
          scheduleBlink(setter);
        }, 150);
      }, delay);
    };
    scheduleBlink(setPurpleBlink);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const scheduleBlink = (setter: (v: boolean) => void) => {
      const delay = Math.random() * 4000 + 3000;
      timeoutId = setTimeout(() => {
        setter(true);
        setTimeout(() => {
          setter(false);
          scheduleBlink(setter);
        }, 150);
      }, delay);
    };
    scheduleBlink(setBlackBlink);
    return () => clearTimeout(timeoutId);
  }, []);

  // Peeking logic
  const [purplePeeking, setPurplePeeking] = useState(false);
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const schedulePeek = () => {
      if (passwordLen > 0 && showPassword) {
        const delay = Math.random() * 3000 + 2000;
        timeoutId = setTimeout(() => {
          if (passwordLen > 0 && showPassword) {
            setPurplePeeking(true);
            setTimeout(() => {
              setPurplePeeking(false);
              schedulePeek();
            }, 800);
          }
        }, delay);
      }
    };

    const intervalId = setInterval(() => {
      if (passwordLen > 0 && showPassword && !purplePeeking) {
        schedulePeek();
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [passwordLen, showPassword, purplePeeking]);

  // Animation Frame Loop
  useEffect(() => {
    let animationFrameId: number;

    const calcPos = (el: HTMLElement | null) => {
      if (!el) return { faceX: 0, faceY: 0, bodySkew: 0 };
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 3;
      const dx = mousePosRef.current.x - cx;
      const dy = mousePosRef.current.y - cy;
      return {
        faceX: Math.max(-15, Math.min(15, dx / 20)),
        faceY: Math.max(-10, Math.min(10, dy / 30)),
        bodySkew: Math.max(-6, Math.min(6, -dx / 120)),
      };
    };

    const eyePupilOffset = (
      el: HTMLElement | null,
      maxDist: number,
      forceX?: number,
      forceY?: number,
    ) => {
      if (forceX !== undefined && forceY !== undefined)
        return { x: forceX, y: forceY };
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mousePosRef.current.x - cx;
      const dy = mousePosRef.current.y - cy;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
      const angle = Math.atan2(dy, dx);
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    };

    const render = () => {
      const pp = calcPos(purpleRef.current);
      const bp = calcPos(blackRef.current);
      const op = calcPos(orangeRef.current);
      const yp = calcPos(yellowRef.current);

      const isEmailFocus = focusMode === "email";
      const isPasswordFocus = focusMode === "password";
      const isShowingPw = isPasswordFocus && passwordLen > 0 && showPassword;

      // Purple
      if (purpleRef.current && purpleEyesRef.current) {
        if (isPasswordFocus) {
          purpleRef.current.style.transform = "skewX(0deg)";
          purpleRef.current.style.height = "400px";
        } else if (isEmailFocus) {
          purpleRef.current.style.transform = `skewX(${(pp.bodySkew || 0) - 8}deg) translateX(24px)`;
          purpleRef.current.style.height = "420px";
        } else {
          purpleRef.current.style.transform = `skewX(${pp.bodySkew || 0}deg)`;
          purpleRef.current.style.height = "400px";
        }

        let pfx, pfy;
        if (isPasswordFocus) {
          purpleEyesRef.current.style.left = "20px";
          purpleEyesRef.current.style.top = "35px";
          pfx = purplePeeking ? 4 : -4;
          pfy = purplePeeking ? 5 : -4;
        } else if (isEmailFocus) {
          purpleEyesRef.current.style.left = "55px";
          purpleEyesRef.current.style.top = "65px";
          pfx = 3;
          pfy = 4;
        } else {
          purpleEyesRef.current.style.left = 45 + pp.faceX + "px";
          purpleEyesRef.current.style.top = 40 + pp.faceY + "px";
          pfx = undefined;
          pfy = undefined;
        }

        const purpleEyeL = purpleEyesRef.current.children[0] as HTMLElement;
        const purpleEyeR = purpleEyesRef.current.children[1] as HTMLElement;

        if (purpleEyeL && purpleEyeR) {
          const lOffset = eyePupilOffset(purpleEyeL, 5, pfx, pfy);
          const rOffset = eyePupilOffset(purpleEyeR, 5, pfx, pfy);

          const lPupil = purpleEyeL.querySelector(".pupil") as HTMLElement;
          const rPupil = purpleEyeR.querySelector(".pupil") as HTMLElement;

          if (lPupil)
            lPupil.style.transform = `translate(${lOffset.x}px, ${lOffset.y}px)`;
          if (rPupil)
            rPupil.style.transform = `translate(${rOffset.x}px, ${rOffset.y}px)`;
        }
      }

      // Black
      if (blackRef.current && blackEyesRef.current) {
        if (isPasswordFocus) {
          blackRef.current.style.transform = "skewX(0deg)";
        } else if (isEmailFocus) {
          blackRef.current.style.transform = `skewX(${(bp.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)`;
        } else {
          blackRef.current.style.transform = `skewX(${bp.bodySkew || 0}deg)`;
        }

        let bfx, bfy;
        if (isPasswordFocus) {
          blackEyesRef.current.style.left = "10px";
          blackEyesRef.current.style.top = "28px";
          bfx = -4;
          bfy = -4;
        } else if (isEmailFocus) {
          blackEyesRef.current.style.left = "32px";
          blackEyesRef.current.style.top = "12px";
          bfx = 0;
          bfy = -4;
        } else {
          blackEyesRef.current.style.left = 26 + bp.faceX + "px";
          blackEyesRef.current.style.top = 32 + bp.faceY + "px";
          bfx = undefined;
          bfy = undefined;
        }

        const blackEyeL = blackEyesRef.current.children[0] as HTMLElement;
        const blackEyeR = blackEyesRef.current.children[1] as HTMLElement;

        if (blackEyeL && blackEyeR) {
          const lOffset = eyePupilOffset(blackEyeL, 4, bfx, bfy);
          const rOffset = eyePupilOffset(blackEyeR, 4, bfx, bfy);

          const lPupil = blackEyeL.querySelector(".pupil") as HTMLElement;
          const rPupil = blackEyeR.querySelector(".pupil") as HTMLElement;

          if (lPupil)
            lPupil.style.transform = `translate(${lOffset.x}px, ${lOffset.y}px)`;
          if (rPupil)
            rPupil.style.transform = `translate(${rOffset.x}px, ${rOffset.y}px)`;
        }
      }

      // Orange
      if (orangeRef.current && orangeEyesRef.current) {
        if (isPasswordFocus) {
          orangeRef.current.style.transform = "skewX(0deg)";
        } else if (isEmailFocus) {
          orangeRef.current.style.transform = `skewX(${(op.bodySkew || 0) + 2}deg) translateX(12px)`;
        } else {
          orangeRef.current.style.transform = `skewX(${op.bodySkew || 0}deg)`;
        }

        let ofx, ofy;
        if (isPasswordFocus) {
          orangeEyesRef.current.style.left = "50px";
          orangeEyesRef.current.style.top = "85px";
          ofx = -5;
          ofy = -4;
        } else {
          orangeEyesRef.current.style.left = 82 + (op.faceX || 0) + "px";
          orangeEyesRef.current.style.top = 90 + (op.faceY || 0) + "px";
          ofx = undefined;
          ofy = undefined;
        }

        const orangeEyeL = orangeEyesRef.current.children[0] as HTMLElement;
        const orangeEyeR = orangeEyesRef.current.children[1] as HTMLElement;

        if (orangeEyeL && orangeEyeR) {
          const lOffset = eyePupilOffset(orangeEyeL, 5, ofx, ofy);
          const rOffset = eyePupilOffset(orangeEyeR, 5, ofx, ofy);
          orangeEyeL.style.transform = `translate(${lOffset.x}px, ${lOffset.y}px)`;
          orangeEyeR.style.transform = `translate(${rOffset.x}px, ${rOffset.y}px)`;
        }
      }

      // Yellow
      if (
        yellowRef.current &&
        yellowEyesRef.current &&
        yellowMouthRef.current
      ) {
        if (isPasswordFocus) {
          yellowRef.current.style.transform = "skewX(0deg)";
        } else if (isEmailFocus) {
          yellowRef.current.style.transform = `skewX(${(yp.bodySkew || 0) - 2}deg) translateX(-12px)`;
        } else {
          yellowRef.current.style.transform = `skewX(${yp.bodySkew || 0}deg)`;
        }

        let yfx, yfy;
        if (isPasswordFocus) {
          yellowEyesRef.current.style.left = "20px";
          yellowEyesRef.current.style.top = "35px";
          yellowMouthRef.current.style.left = "10px";
          yellowMouthRef.current.style.top = "88px";
          yfx = -5;
          yfy = -4;
        } else {
          yellowEyesRef.current.style.left = 52 + (yp.faceX || 0) + "px";
          yellowEyesRef.current.style.top = 40 + (yp.faceY || 0) + "px";
          yellowMouthRef.current.style.left = 40 + (yp.faceX || 0) + "px";
          yellowMouthRef.current.style.top = 88 + (yp.faceY || 0) + "px";
          yfx = undefined;
          yfy = undefined;
        }

        const yellowEyeL = yellowEyesRef.current.children[0] as HTMLElement;
        const yellowEyeR = yellowEyesRef.current.children[1] as HTMLElement;

        if (yellowEyeL && yellowEyeR) {
          const lOffset = eyePupilOffset(yellowEyeL, 5, yfx, yfy);
          const rOffset = eyePupilOffset(yellowEyeR, 5, yfx, yfy);
          yellowEyeL.style.transform = `translate(${lOffset.x}px, ${lOffset.y}px)`;
          yellowEyeR.style.transform = `translate(${rOffset.x}px, ${rOffset.y}px)`;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [focusMode, showPassword, passwordLen, purplePeeking]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-400 via-zinc-500 to-zinc-600 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-950 text-white"
    >
      {/* Background blobs */}
      <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full bg-zinc-300/20 blur-[60px] pointer-events-none dark:bg-indigo-900/40" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full bg-zinc-200/20 blur-[60px] pointer-events-none dark:bg-purple-900/30" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 20px)",
        }}
      />

      <div className="relative z-20 flex w-full flex-1 items-end justify-center pb-[15%]">
        <div className="relative h-[400px] w-[550px] scale-[0.6] sm:scale-75 xl:scale-100 origin-bottom">
          {/* Purple Char */}
          <div
            ref={purpleRef}
            className="absolute bottom-0 left-[70px] z-10 w-[180px] h-[400px] bg-[#6c3ff5] rounded-t-[10px] origin-bottom transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          >
            <div
              ref={purpleEyesRef}
              className="absolute flex gap-8 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ left: "45px", top: "40px" }}
            >
              <div
                className="flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full bg-white transition-[height] duration-150"
                style={{ height: purpleBlink ? "2px" : "18px" }}
              >
                <div className="pupil h-[7px] w-[7px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              </div>
              <div
                className="flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full bg-white transition-[height] duration-150"
                style={{ height: purpleBlink ? "2px" : "18px" }}
              >
                <div className="pupil h-[7px] w-[7px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              </div>
            </div>
          </div>

          {/* Black Char */}
          <div
            ref={blackRef}
            className="absolute bottom-0 left-[240px] z-20 w-[120px] h-[310px] bg-[#2d2d2d] rounded-t-[8px] origin-bottom transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          >
            <div
              ref={blackEyesRef}
              className="absolute flex gap-6 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ left: "26px", top: "32px" }}
            >
              <div
                className="flex h-[16px] w-[16px] items-center justify-center overflow-hidden rounded-full bg-white transition-[height] duration-150"
                style={{ height: blackBlink ? "2px" : "16px" }}
              >
                <div className="pupil h-[6px] w-[6px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              </div>
              <div
                className="flex h-[16px] w-[16px] items-center justify-center overflow-hidden rounded-full bg-white transition-[height] duration-150"
                style={{ height: blackBlink ? "2px" : "16px" }}
              >
                <div className="pupil h-[6px] w-[6px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              </div>
            </div>
          </div>

          {/* Orange Char */}
          <div
            ref={orangeRef}
            className="absolute bottom-0 left-0 z-30 w-[240px] h-[200px] bg-[#ff9b6b] rounded-t-[120px] origin-bottom transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          >
            <div
              ref={orangeEyesRef}
              className="absolute flex gap-8 transition-all duration-200 ease-out"
              style={{ left: "82px", top: "90px" }}
            >
              <div className="pupil-only h-[12px] w-[12px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              <div className="pupil-only h-[12px] w-[12px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
            </div>
          </div>

          {/* Yellow Char */}
          <div
            ref={yellowRef}
            className="absolute bottom-0 left-[310px] z-40 w-[140px] h-[230px] bg-[#e8d754] rounded-t-[70px] origin-bottom transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          >
            <div
              ref={yellowEyesRef}
              className="absolute flex gap-6 transition-all duration-200 ease-out"
              style={{ left: "52px", top: "40px" }}
            >
              <div className="pupil-only h-[12px] w-[12px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
              <div className="pupil-only h-[12px] w-[12px] rounded-full bg-[#2d2d2d] transition-transform duration-100 ease-out" />
            </div>
            <div
              ref={yellowMouthRef}
              className="absolute h-[4px] w-[80px] rounded-[4px] bg-[#2d2d2d] transition-all duration-200 ease-out"
              style={{ left: "40px", top: "88px" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
