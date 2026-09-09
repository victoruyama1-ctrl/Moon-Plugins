"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  EditorProvider,
  ElementsPanel,
  MEDIA_DRAG_MIME,
  mediaDragKindMime,
  importFiles,
  Preview,
  Timeline,
  importUrl,
  splitClipAtPlayhead,
  useEditor,
  useMediaLibrary,
  usePlaybackStore,
  useSelectionStore,
  useTracksStore,
  generateId,
  createDefaultDemuxerFactory,
} from "@elah/editor";
import { ArrowLeft, AudioLines, Copy, Download, Film, ImageIcon, Minus, Music2, Pause, Play, Plus, Redo2, RotateCcw, Search, Scissors, Trash2, Type, Undo2, Upload } from "lucide-react";
import { exportVideo } from "@elah/editor";
import type { TimelineRef } from "@elah/timeline";
import type { Id } from "@moon/convex-data-model";
import { api } from "@moon/convex-api";
import { navigate } from "./navigation";

// Token defaults + compiled component styles
import "@elah/editor/styles/tokens.css";
import "@elah/timeline/styles.css";
import "@elah/editor/styles.css";

interface CreativeStudioElahProps {
  projectId?: Id<"creativeProjects"> | string;
}

/**
 * Creative Studio Component using Elah Editor
 *
 * Production-grade video editor using Elah's core components:
 * - AssetPanel: Import and manage media files
 * - ElementsPanel: Draggable clip templates and elements
 * - Preview: GPU-accelerated WebGL2 video preview
 * - Timeline: Frame-accurate timeline with drag, trim, split
 *
 * Keyboard Shortcuts (built into Elah):
 * - Space: Play/pause
 * - S: Split clip at playhead
 * - Delete: Remove selected clip
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z: Redo
 * - Ctrl+Scroll: Zoom timeline
 * - Arrow keys: Frame-step playhead
 */
export default function CreativeStudioElah({ projectId }: CreativeStudioElahProps) {
  const demuxer = createDefaultDemuxerFactory();
  const [username, setUsername] = useState<string | null>(null);
  const timelineRef = useRef<TimelineRef | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(220);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const project = useQuery(api.creativeProjects.get, username && projectId ? { username, projectId: projectId as Id<"creativeProjects"> } : "skip");
  const saveTimeline = useMutation(api.creativeProjects.saveTimeline);

  useEffect(() => {
    fetch("/api/auth/current").then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && data?.user?.username) setUsername(data.user.username);
    }).catch(() => undefined);
  }, []);

  const startTimelineResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = { y: event.clientY, height: timelineHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeTimeline = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const maximumHeight = Math.max(260, Math.floor(window.innerHeight * 0.72));
    setTimelineHeight(Math.min(maximumHeight, Math.max(150, start.height - (event.clientY - start.y))));
  };

  const stopTimelineResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // TODO: Load project from Convex when projectId is provided
  useEffect(() => {
    if (projectId) {
      console.log("TODO: Load project from Convex:", projectId);
      // const project = await convex.creativeProjects.get(projectId);
      // if (project) {
      //   const restoredProject = JSON.parse(project.projectData);
      //   // Restore to editor engine
      // }
    }
  }, [projectId]);

  return (
    <EditorProvider fps={30} stage={{ width: 1920, height: 1080 }} defaultTrackHeight={36}>
      <StudioAtmosphere />
      <TimelineCrossTrackDropSupport />
      <ProjectPersistence project={project} projectId={projectId} username={username} saveTimeline={saveTimeline} />
      <AutomaticVideoCrossfade />
      <div
        className="elah-root h-full min-h-0 w-full min-w-0 overflow-hidden"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div className="studio-cursor-orb" aria-hidden="true" />
        <EditorToolbar projectName={project?.name} />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <CreativeSourcePanel projectId={projectId} username={username} />

          <div className="isolate flex min-w-0 flex-1 flex-col bg-black">
            <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
              <Preview
                demuxerFactory={demuxer}
                style={{ width: "100%", height: "100%" }}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
                <div className="pointer-events-auto">
                  <PreviewAspectToolbar />
                </div>
              </div>
            </div>
            <PreviewTransport />
          </div>
          <PropertiesPanel />
        </div>

        <div className="flex shrink-0 flex-col" style={{ height: timelineHeight }}>
          <div role="separator" aria-orientation="horizontal" aria-label="Resize timeline" onPointerDown={startTimelineResize} onPointerMove={resizeTimeline} onPointerUp={stopTimelineResize} onPointerCancel={stopTimelineResize} className="group flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center bg-[#080c13]">
            <span className="h-0.5 w-16 rounded-full bg-slate-600 transition group-hover:bg-cyan-400" />
          </div>
          <TimelineToolbar timelineRef={timelineRef} />
          <Timeline ref={timelineRef} fps={30} style={{ flex: 1, minHeight: 0 }} />
        </div>
      </div>
    </EditorProvider>
  );
}

function ProjectPersistence({ project, projectId, username, saveTimeline }: { project?: { timeline?: string; duration?: number } | null; projectId?: string; username: string | null; saveTimeline: (args: { username: string; projectId: Id<"creativeProjects">; timeline: string; duration?: number }) => Promise<unknown> }) {
  const { engine } = useEditor();
  const { assets } = useMediaLibrary();
  const restoredRef = useRef(false);
  const uploadControllersRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const local = projectId ? localStorage.getItem(`moon-creative-local:${projectId}`) : null;
    if (restoredRef.current || (!project?.timeline && !local)) return;
    try {
      const source = local ?? project?.timeline;
      if (!source) return;
      const saved = JSON.parse(source) as { project?: Parameters<typeof engine.loadProject>[0]; assets?: Array<{ src: string; name: string }> };
      if (saved.project) engine.loadProject(saved.project);
      if (saved.assets) void Promise.all(saved.assets.filter((asset) => asset.src).map((asset) => importUrl(asset.src, { name: asset.name })));
    } catch (error) {
      console.error("Could not restore creative project", error);
    }
    restoredRef.current = true;
  }, [engine, project]);

  const cacheKey = projectId ? `moon-creative-local:${projectId}` : "";
  const cacheLocal = () => {
    if (!cacheKey) return;
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
    localStorage.setItem(cacheKey, JSON.stringify({ project: engine.getProject(), assets: cached.assets ?? [] }));
  };
  const addAssetToConvex = useMutation(api.creativeProjects.addAsset);

  useEffect(() => {
    const handleChange = () => { cacheLocal(); };
    const handleUpload = (event: Event) => {
      const { file, cacheId } = (event as CustomEvent<{ file: File; cacheId: string }>).detail;
      if (!file || !username || !projectId) return;
      const controller = new AbortController();
      uploadControllersRef.current.set(cacheId, controller);
      void (async () => {
        try {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch("/api/media/upload", { method: "POST", body: form, signal: controller.signal });
          if (!response.ok) throw new Error("Cloudinary upload failed.");
          const uploaded = await response.json() as { url: string; publicId: string; resourceType: string; format?: string };
          const currentCache = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
          const stillPending = (currentCache.assets ?? []).some((asset: { id?: string }) => asset.id === cacheId);
          if (!stillPending) {
            await fetch("/api/media/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: uploaded.publicId, resourceType: uploaded.resourceType }) });
            return;
          }
          await addAssetToConvex({ username, projectId: projectId as Id<"creativeProjects">, url: uploaded.url, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, metadata: JSON.stringify({ publicId: uploaded.publicId, resourceType: uploaded.resourceType, format: uploaded.format }) });
          const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
          cached.assets = (cached.assets ?? []).filter((asset: { id?: string }) => asset.id !== cacheId);
          localStorage.setItem(cacheKey, JSON.stringify(cached));
          const currentProject = engine.getProject();
          await saveTimeline({ username, projectId: projectId as Id<"creativeProjects">, timeline: JSON.stringify({ version: 3, project: currentProject, assets: (cached.assets ?? []).map((asset: { id?: string; name: string; kind?: string; src: string; durationSec?: number; byteSize?: number }) => ({ id: asset.id, name: asset.name, kind: asset.kind, src: asset.src, durationSec: asset.durationSec, byteSize: asset.byteSize })) }), duration: Math.max(0, ...Object.values(currentProject.clips).flat().map((clip) => clip.startFrame + clip.durationFrames)) });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Could not save uploaded creative asset", error);
        } finally {
          uploadControllersRef.current.delete(cacheId);
        }
      })();
    };
    const handleCancelUpload = (event: Event) => {
      const { cacheId } = (event as CustomEvent<{ cacheId: string }>).detail;
      uploadControllersRef.current.get(cacheId)?.abort();
      uploadControllersRef.current.delete(cacheId);
    };
    engine.on("change", handleChange);
    window.addEventListener("moon:upload-creative-asset", handleUpload);
    window.addEventListener("moon:cancel-creative-upload", handleCancelUpload);
    return () => {
      engine.off("change", handleChange);
      window.removeEventListener("moon:upload-creative-asset", handleUpload);
      window.removeEventListener("moon:cancel-creative-upload", handleCancelUpload);
      uploadControllersRef.current.forEach((controller) => controller.abort());
      uploadControllersRef.current.clear();
    };
  }, [addAssetToConvex, cacheKey, engine, projectId, saveTimeline, username]);

  return null;
}

function StudioAtmosphere() {
  const hoverSoundPending = useRef(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".elah-root");
    if (!root) return;

    const playSound = (source: string, volume: number) => {
      const sound = new Audio(source);
      sound.volume = volume;
      void sound.play().catch(() => undefined);
    };
    const interactiveSelector = "button, [role=button], input, select, textarea, [draggable=true]";
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      root.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
      root.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
    };
    const handlePointerOver = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(interactiveSelector);
      const related = event.relatedTarget as Node | null;
      if (!target || (related && target.contains(related)) || hoverSoundPending.current) return;
      hoverSoundPending.current = true;
      playSound("/sounds/hover.mp3", 0.14);
      window.setTimeout(() => { hoverSoundPending.current = false; }, 160);
    };
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(interactiveSelector);
      if (!target) return;
      playSound("/sounds/click.mp3", 0.24);
      target.classList.remove("studio-click-pulse");
      void target.offsetWidth;
      target.classList.add("studio-click-pulse");
      window.setTimeout(() => target.classList.remove("studio-click-pulse"), 280);
    };
    const handleScroll = () => {
      root.classList.add("studio-is-scrolling");
      window.setTimeout(() => root.classList.remove("studio-is-scrolling"), 180);
    };

    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("click", handleClick);
    root.addEventListener("scroll", handleScroll, true);
    return () => {
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  return null;
}

function EditorToolbar({ projectName }: { projectName?: string }) {
  const { engine } = useEditor();
  const router = { push: navigate };
  const [exporting, setExporting] = useState(false);

  const exportProject = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await exportVideo(engine.getProject());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "moon-creative-export.mp4";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-[#273044] bg-[#080c13] px-3"><div className="flex items-center gap-1"><button type="button" onClick={() => router.push("/creative")} title="Back to studio" aria-label="Back to studio" className="rounded p-1.5 text-cyan-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"><ArrowLeft className="h-4 w-4" /></button><button type="button" onClick={() => engine.undo()} disabled={!engine.canUndo()} title="Undo" className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Undo2 className="h-4 w-4" /></button><button type="button" onClick={() => engine.redo()} disabled={!engine.canRedo()} title="Redo" className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Redo2 className="h-4 w-4" /></button></div><h1 className="pointer-events-none absolute left-1/2 max-w-[45%] -translate-x-1/2 truncate text-xs font-semibold tracking-wide text-white" title={projectName ?? "Creative project"}>{projectName ?? "Creative project"}</h1><button type="button" onClick={() => void exportProject()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-md bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-[#07111c] transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"><Download className="h-3.5 w-3.5" />{exporting ? "Exporting..." : "Export"}</button></header>;
}

function AutomaticVideoCrossfade() {
  const { engine } = useEditor();
  const currentFrame = usePlaybackStore((state) => state.currentFrame);
  const tracks = useTracksStore((state) => state.tracks);
  const baseOpacityRef = useRef(new Map<string, number>());

  useEffect(() => {
    const videoClips = tracks
      .filter((track) => track.kind === "video")
      .flatMap((track) => engine.getClipsOnTrack(track.id).map((clip) => ({ clip, track })))
      .sort((left, right) => left.track.order - right.track.order);
    for (const { clip } of videoClips) {
      if (!baseOpacityRef.current.has(clip.id)) baseOpacityRef.current.set(clip.id, clip.opacity ?? 1);
    }

    const activeVideos = videoClips.filter(({ clip }) => currentFrame >= clip.startFrame && currentFrame < clip.startFrame + clip.durationFrames);
    const desiredOpacity = new Map<string, number>();
    for (const { clip } of videoClips) desiredOpacity.set(clip.id, baseOpacityRef.current.get(clip.id) ?? 1);

    if (activeVideos.length >= 2) {
      const outgoing = activeVideos[0];
      const incoming = activeVideos[activeVideos.length - 1];
      if (outgoing.clip.id !== incoming.clip.id) {
        const overlapStart = Math.max(outgoing.clip.startFrame, incoming.clip.startFrame);
        const overlapEnd = Math.min(outgoing.clip.startFrame + outgoing.clip.durationFrames, incoming.clip.startFrame + incoming.clip.durationFrames);
        const progress = Math.min(1, Math.max(0, (currentFrame - overlapStart) / Math.max(1, overlapEnd - overlapStart)));
        desiredOpacity.set(outgoing.clip.id, (baseOpacityRef.current.get(outgoing.clip.id) ?? 1) * (1 - progress));
        desiredOpacity.set(incoming.clip.id, (baseOpacityRef.current.get(incoming.clip.id) ?? 1) * progress);
      }
    }

    for (const { clip } of videoClips) {
      const nextOpacity = desiredOpacity.get(clip.id) ?? 1;
      if (Math.abs((clip.opacity ?? 1) - nextOpacity) > 0.01) {
        engine.updateClip(clip.id, clip.trackId, { opacity: nextOpacity });
      }
    }
  }, [currentFrame, engine, tracks]);

  return null;
}

function TimelineCrossTrackDropSupport() {
  const { engine } = useEditor();
  const tracks = useTracksStore((state) => state.tracks);
  const zoom = usePlaybackStore((state) => state.zoom);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".elah-root");
    if (!root) return;

    const trackKindForClip = (type: string) => type === "audio" ? "audio" : type === "text" || type === "shape" || type === "freehand" ? "elements" : "video";
    let dragState: { clipId: string; destinationTrackId?: string; clientX: number } | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      const clipElement = (event.target as HTMLElement).closest<HTMLElement>("[data-elah-clip-id]");
      const selectedClipId = Array.from(useSelectionStore.getState().selectedClipIds)[0] ?? "";
      const clipId = clipElement?.dataset.elahClipId || selectedClipId;
      if (clipId) dragState = { clipId, clientX: event.clientX };
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      dragState.clientX = event.clientX;
      const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-elah-track-id]");
      dragState.destinationTrackId = lane?.dataset.elahTrackId;
    };
    const handlePointerUp = (event: PointerEvent) => {
      const state = dragState;
      dragState = null;
      if (!state?.clipId) return;
      const finalLane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-elah-track-id]");
      const destinationTrackId = finalLane?.dataset.elahTrackId ?? state.destinationTrackId;
      if (!destinationTrackId) return;
      const source = engine.findClip(state.clipId);
      const destination = tracks.find((track) => track.id === destinationTrackId);
      const lane = finalLane ?? root.querySelector<HTMLElement>(`[data-elah-track-id="${destinationTrackId}"]`);
      if (!source || !destination || !lane || source.trackId === destination.id || trackKindForClip(source.clip.type) !== destination.kind) return;
      const bounds = lane.getBoundingClientRect();
      const requestedStart = Math.max(0, Math.round((state.clientX - bounds.left + lane.scrollLeft) / zoom));
      const destinationClips = engine.getClipsOnTrack(destination.id).filter((clip) => clip.id !== source.clip.id);
      const overlaps = destinationClips.filter((clip) => requestedStart < clip.startFrame + clip.durationFrames && requestedStart + source.clip.durationFrames > clip.startFrame);
      const nextStart = overlaps.length > 0 ? Math.max(...overlaps.map((clip) => clip.startFrame + clip.durationFrames)) : requestedStart;
      window.setTimeout(() => engine.moveClip(source.clip.id, source.trackId, destination.id, nextStart), 0);
    };
    root.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    const annotateTimeline = () => {
      const lanes = Array.from(root.querySelectorAll<HTMLElement>("div")).filter((element) => element.style.position === "relative" && element.style.flex === "1 1 0%" && element.style.overflow === "visible");
      lanes.forEach((lane, laneIndex) => {
        const track = tracks[laneIndex];
        if (!track) return;
        lane.dataset.elahTrackId = track.id;
        lane.ondragover = (event) => {
          const sourceId = event.dataTransfer?.types.includes("application/x-elah-clip");
          if (sourceId) event.preventDefault();
        };
        lane.ondrop = (event) => {
          event.preventDefault();
          const clipId = event.dataTransfer?.getData("application/x-elah-clip");
          if (!clipId) return;
          const source = engine.findClip(clipId);
          const destinationTrackId = lane.dataset.elahTrackId;
          const destination = tracks.find((track) => track.id === destinationTrackId);
          if (!source || !destination || source.trackId === destination.id || trackKindForClip(source.clip.type) !== destination.kind) return;
          const bounds = lane.getBoundingClientRect();
          const requestedStart = Math.max(0, Math.round((event.clientX - bounds.left + lane.scrollLeft) / zoom));
          const destinationClips = engine.getClipsOnTrack(destination.id).filter((clip) => clip.id !== source.clip.id);
          const overlaps = destinationClips.filter((clip) => requestedStart < clip.startFrame + clip.durationFrames && requestedStart + source.clip.durationFrames > clip.startFrame);
          const nextStart = overlaps.length > 0 ? Math.max(...overlaps.map((clip) => clip.startFrame + clip.durationFrames)) : requestedStart;
          engine.moveClip(source.clip.id, source.trackId, destination.id, nextStart);
          const settleMove = () => {
            const current = engine.findClip(clipId);
            if (current && current.trackId !== destination.id) {
              engine.moveClip(clipId, current.trackId, destination.id, nextStart);
            }
          };
          window.setTimeout(settleMove, 0);
          window.setTimeout(settleMove, 120);
        };
        const laneClips = engine.getClipsOnTrack(track.id);
        Array.from(lane.querySelectorAll<HTMLElement>("[data-clip-type]")).forEach((element, clipIndex) => {
          const clip = laneClips[clipIndex];
          if (!clip) return;
          element.dataset.elahClipId = clip.id;
          element.draggable = false;
        });
      });
    };

    annotateTimeline();
    const observer = new MutationObserver(annotateTimeline);
    observer.observe(root, { childList: true, subtree: true });
    const scheduleAnnotation = () => {
      window.requestAnimationFrame(annotateTimeline);
    };
    engine.on("change", scheduleAnnotation);
    engine.on("clip:added", scheduleAnnotation);
    engine.on("clip:updated", scheduleAnnotation);
    window.requestAnimationFrame(annotateTimeline);
    return () => {
      observer.disconnect();
      engine.off("change", scheduleAnnotation);
      engine.off("clip:added", scheduleAnnotation);
      engine.off("clip:updated", scheduleAnnotation);
      root.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, [engine, tracks, zoom]);

  return null;
}

const previewRatios = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "1:1", width: 1080, height: 1080 },
] as const;

function PreviewAspectToolbar() {
  const { engine } = useEditor();
  const [selectedRatio, setSelectedRatio] = useState("16:9");

  return <div className="flex h-11 shrink-0 items-center justify-center gap-2 px-3">{previewRatios.map((ratio) => <button key={ratio.label} type="button" onClick={() => { setSelectedRatio(ratio.label); engine.setStage(ratio.width, ratio.height); }} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition ${selectedRatio === ratio.label ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-transparent text-slate-400 hover:border-white/10 hover:text-white"}`}><span className="inline-block rounded-sm border border-current" style={{ width: ratio.label === "9:16" ? 7 : ratio.label === "1:1" ? 10 : 13, height: ratio.label === "9:16" ? 13 : ratio.label === "1:1" ? 10 : 8 }} />{ratio.label}</button>)}</div>;
}

function PreviewTransport() {
  const { currentFrame, isPlaying, togglePlayPause, pause, setCurrentFrame } = usePlaybackStore();
  const totalFrames = useTracksStore((state) => state.totalFrames);
  const fps = 30;

  return <div className="flex h-12 shrink-0 items-center justify-between border-t border-[#273044] bg-[#080c13] px-4 text-[11px] text-slate-400"><span className="font-mono text-cyan-300">{formatTimecode(currentFrame, fps)} <span className="text-slate-600">|</span> <span className="text-slate-500">{formatTimecode(totalFrames, fps)}</span></span><div className="flex items-center gap-3"><button type="button" onClick={togglePlayPause} title={isPlaying ? "Pause preview" : "Play preview"} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#080c13] transition hover:bg-cyan-100">{isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button><button type="button" onClick={() => { pause(); setCurrentFrame(0); }} title="Restart preview" className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button></div><span className="w-16" /></div>;
}

function formatTimecode(frame: number, fps: number) {
  const safeFrame = Math.max(0, Math.floor(frame));
  const seconds = Math.floor(safeFrame / fps);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const frames = safeFrame % fps;
  return [hours, minutes, remainingSeconds, frames].map((value) => String(value).padStart(2, "0")).join(":");
}

function PropertiesPanel() {
  const { engine } = useEditor();
  const [, refresh] = useState(0);
  const selectedClipIds = useSelectionStore((state) => state.selectedClipIds);
  const tracks = useTracksStore((state) => state.tracks);
  useEffect(() => {
    const handleEngineChange = () => refresh((value) => value + 1);
    engine.on("change", handleEngineChange);
    return () => engine.off("change", handleEngineChange);
  }, [engine]);
  const selectedId = Array.from(selectedClipIds)[0];
  const selectedClip = selectedId ? engine.findClip(selectedId)?.clip : undefined;
  const track = selectedClip ? tracks.find((item) => item.id === selectedClip.trackId) : undefined;
  const transform = selectedClip?.transform ?? { x: 0.5, y: 0.5, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 } };

  return (
    <aside className="creative-properties-panel flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-l border-[#273044] bg-[#101620] text-slate-200">
      <div className="border-b border-[#273044] px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold text-white">Properties</h2>
        <p className="mt-2 min-h-8 break-words font-mono text-[10px] leading-4 text-slate-400">{selectedClip ? `${selectedClip.name}  ·  ${selectedClip.type}  ·  ${formatTimecode(selectedClip.startFrame, 30)}-${formatTimecode(selectedClip.startFrame + selectedClip.durationFrames, 30)}` : "Select a clip to edit properties"}</p>
      </div>
      {selectedClip?.type === "audio" ? <AudioProperties clip={selectedClip} track={track} /> : selectedClip ? <VisualProperties clip={selectedClip} transform={transform} /> : <p className="p-4 text-center text-xs text-slate-500">Select a clip to edit properties</p>}
    </aside>
  );
}

function VisualProperties({ clip, transform }: { clip: NonNullable<ReturnType<ReturnType<typeof useEditor>["engine"]["findClip"]>>["clip"]; transform: { x: number; y: number; scale: number; rotation: number; anchor: { x: number; y: number } } }) {
  const { engine } = useEditor();
  const [activeTab, setActiveTab] = useState<"transform" | "style" | "animation">("transform");
  const updateTransform = (patch: Partial<typeof transform>) => engine.updateClip(clip.id, clip.trackId, { transform: { ...transform, ...patch } });
  const updateStyle = (patch: Partial<typeof clip>) => engine.updateClip(clip.id, clip.trackId, patch);
  const updateTextAnimation = (patch: Partial<NonNullable<typeof clip.textAnimation>>) => engine.updateClip(clip.id, clip.trackId, { textAnimation: { durationFrames: clip.textAnimation?.durationFrames ?? 15, ...clip.textAnimation, ...patch } });
  const isText = clip.type === "text";
  return <>
    <div className="flex border-b border-[#273044] px-4 pt-2 text-xs"><button type="button" onClick={() => setActiveTab("transform")} className={`border-b-2 px-0 pb-2 ${activeTab === "transform" ? "border-cyan-400 text-white" : "border-transparent text-slate-400"}`}>Transform</button><button type="button" onClick={() => setActiveTab("style")} className={`ml-5 border-b-2 px-0 pb-2 ${activeTab === "style" ? "border-cyan-400 text-white" : "border-transparent text-slate-400"}`}>Style</button>{isText && <button type="button" onClick={() => setActiveTab("animation")} className={`ml-5 border-b-2 px-0 pb-2 ${activeTab === "animation" ? "border-cyan-400 text-white" : "border-transparent text-slate-400"}`}>Animation</button>}</div>
    {activeTab === "transform" ? <div className="space-y-4 overflow-y-auto p-4"><AudioSlider label="Scale" value={transform.scale} min={0.05} max={4} step={0.01} display={`${Math.round(transform.scale * 100)}%`} onChange={(value) => updateTransform({ scale: value })} /><div className="grid grid-cols-2 gap-3"><PropertyNumber label="Position X" value={Math.round(transform.x * 100)} suffix="%" min={-100} max={200} onChange={(value) => updateTransform({ x: value / 100 })} /><PropertyNumber label="Position Y" value={Math.round(transform.y * 100)} suffix="%" min={-100} max={200} onChange={(value) => updateTransform({ y: value / 100 })} /></div><PropertyNumber label="Rotation" value={Math.round((transform.rotation * 180) / Math.PI)} suffix="°" min={-360} max={360} onChange={(value) => updateTransform({ rotation: (value * Math.PI) / 180 })} /></div> : activeTab === "animation" && isText ? <div className="space-y-4 overflow-y-auto p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">Text animation</p><label className="flex items-center justify-between text-[11px] text-slate-300"><span>Fade in</span><input type="checkbox" checked={clip.textAnimation?.in === "fade"} onChange={(event) => updateTextAnimation({ in: event.target.checked ? "fade" : undefined })} className="h-4 w-4 accent-cyan-400" /></label><label className="flex items-center justify-between text-[11px] text-slate-300"><span>Fade out</span><input type="checkbox" checked={clip.textAnimation?.out === "fade"} onChange={(event) => updateTextAnimation({ out: event.target.checked ? "fade" : undefined })} className="h-4 w-4 accent-cyan-400" /></label><PropertyNumber label="Duration" value={clip.textAnimation?.durationFrames ?? 15} suffix="frames" min={1} max={300} onChange={(value) => updateTextAnimation({ durationFrames: value })} /></div> : <div className="space-y-4 overflow-y-auto p-4"><AudioSlider label="Opacity" value={clip.opacity ?? 1} min={0} max={1} step={0.01} display={`${Math.round((clip.opacity ?? 1) * 100)}%`} onChange={(value) => updateStyle({ opacity: value })} />{isText && <><label className="block text-[11px] text-slate-300"><span className="mb-1.5 block">Text</span><textarea value={clip.content ?? ""} onChange={(event) => updateStyle({ content: event.target.value })} rows={3} className="w-full resize-none rounded-md border border-[#2d3a52] bg-[#05070b] px-2 py-1.5 text-xs text-white outline-none" /></label><label className="block text-[11px] text-slate-300"><span className="mb-1.5 block">Font</span><select value={clip.fontFamily ?? "sans-serif"} onChange={(event) => updateStyle({ fontFamily: event.target.value })} className="h-8 w-full rounded-md border border-[#2d3a52] bg-[#05070b] px-2 text-xs text-white outline-none"><option value="sans-serif">Sans Serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Trebuchet MS">Trebuchet MS</option><option value="Courier New">Courier New</option></select></label><label className="block text-[11px] text-slate-300"><span className="mb-1.5 block">Weight</span><select value={clip.fontWeight ?? "normal"} onChange={(event) => updateStyle({ fontWeight: event.target.value as "normal" | "bold" })} className="h-8 w-full rounded-md border border-[#2d3a52] bg-[#05070b] px-2 text-xs text-white outline-none"><option value="normal">Normal</option><option value="bold">Bold</option></select></label><PropertyNumber label="Size" value={clip.fontSize ?? 48} suffix="px" min={6} max={400} onChange={(value) => updateStyle({ fontSize: value })} /><label className="block text-[11px] text-slate-300">Fill<input type="color" value={clip.color ?? "#ffffff"} onChange={(event) => updateStyle({ color: event.target.value })} className="mt-1 h-8 w-full cursor-pointer rounded border border-[#2d3a52] bg-[#05070b]" /></label><label className="block text-[11px] text-slate-300"><span className="mb-1.5 block">Alignment</span><select value={clip.textAlign ?? "center"} onChange={(event) => updateStyle({ textAlign: event.target.value as "left" | "center" | "right" })} className="h-8 w-full rounded-md border border-[#2d3a52] bg-[#05070b] px-2 text-xs text-white outline-none"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></>}{clip.type === "shape" && <><label className="block text-[11px] text-slate-300">Fill<input type="color" value={clip.shapeFill ?? "#22d3ee"} onChange={(event) => updateStyle({ shapeFill: event.target.value })} className="mt-1 h-8 w-full cursor-pointer rounded border border-[#2d3a52] bg-[#05070b]" /></label><label className="block text-[11px] text-slate-300">Stroke<input type="color" value={clip.shapeStroke ?? "#ffffff"} onChange={(event) => updateStyle({ shapeStroke: event.target.value })} className="mt-1 h-8 w-full cursor-pointer rounded border border-[#2d3a52] bg-[#05070b]" /></label></>}</div>}
  </>;
}

function AudioProperties({ clip, track }: { clip: NonNullable<ReturnType<ReturnType<typeof useEditor>["engine"]["findClip"]>>["clip"]; track?: { volume?: number } }) {
  const { engine } = useEditor();
  const [pitch, setPitch] = useState(0);
  const [blend, setBlend] = useState(0);
  const [spatial3d, setSpatial3d] = useState(false);
  const volume = clip.volume ?? track?.volume ?? 1;
  const updateVolume = (value: number) => engine.updateClip(clip.id, clip.trackId, { volume: value });
  return <div className="space-y-5 overflow-y-auto p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">Audio properties</p><AudioSlider label="Volume" value={volume} min={0} max={1} step={0.01} display={`${Math.round(volume * 100)}%`} onChange={updateVolume} /><AudioSlider label="Pitch" value={pitch} min={-24} max={24} step={1} display={`${pitch > 0 ? "+" : ""}${pitch} st`} onChange={setPitch} /><AudioSlider label="Blend" value={blend} min={-100} max={100} step={1} display={`${blend > 0 ? "+" : ""}${blend}%`} onChange={setBlend} /><label className="flex items-center justify-between text-[11px] text-slate-300"><span>3D audio</span><input type="checkbox" checked={spatial3d} onChange={(event) => setSpatial3d(event.target.checked)} className="h-4 w-4 accent-cyan-400" /></label><p className="text-[10px] leading-4 text-slate-500">Pitch, blend, and 3D routing are shown here but require audio-engine support before they can change playback.</p></div>;
}

function AudioSlider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  const progress = ((value - min) / (max - min)) * 100;
  return <label className="block text-[11px] text-slate-300"><span className="mb-2 flex justify-between"><span>{label}</span><span className="font-mono text-cyan-200">{display}</span></span><span style={{ position: "relative", display: "block", height: 16 }}><span style={{ position: "absolute", top: 6, right: 0, left: 0, height: 3, borderRadius: 999, background: "#334155", pointerEvents: "none" }} /><span style={{ position: "absolute", top: 6, left: 0, width: `${progress}%`, height: 3, borderRadius: 999, background: "#22d3ee", boxShadow: "0 0 8px rgba(34,211,238,.45)", pointerEvents: "none" }} /><span style={{ position: "absolute", top: 3, left: `${progress}%`, width: 10, height: 10, marginLeft: -5, border: "2px solid #080c13", borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 0 1px rgba(34,211,238,.8), 0 0 9px rgba(34,211,238,.65)", pointerEvents: "none" }} /><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ position: "absolute", inset: 0, zIndex: 2, width: "100%", height: 16, margin: 0, cursor: "pointer", opacity: 0 }} /></span></label>;
}

function PropertyNumber({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block text-[11px] text-slate-300"><span className="mb-1.5 block">{label}</span><span className="flex h-8 items-center overflow-hidden rounded-md border border-[#2d3a52] bg-[#05070b]"><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-white outline-none" /><span className="px-2 text-[10px] text-slate-500">{suffix}</span></span></label>;
}

function CreativeSourcePanel({ projectId, username }: { projectId?: string; username: string | null }) {
  const { engine } = useEditor();
  const { assets, removeAsset } = useMediaLibrary();
  const projectAssets = useQuery(api.creativeProjects.listAssets, username && projectId ? { username, projectId: projectId as Id<"creativeProjects"> } : "skip");
  const removeConvexAsset = useMutation(api.creativeProjects.removeAsset);
  const [activeTab, setActiveTab] = useState<"video" | "image" | "audio" | "elements">("video");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabs = [
    { id: "video" as const, label: "Videos", icon: Film },
    { id: "image" as const, label: "Photos", icon: ImageIcon },
    { id: "audio" as const, label: "Audio", icon: AudioLines },
    { id: "elements" as const, label: "Elements", icon: Type },
  ];
  const visibleAssets = assets.filter((asset) => {
    const matchesTab = activeTab === "video" ? asset.kind === "video" : activeTab === "image" ? asset.kind === "image" : activeTab === "audio" ? asset.kind === "audio" : false;
    return matchesTab && asset.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await importFiles(files);
    if (!projectId) return;
    const cacheKey = `moon-creative-local:${projectId}`;
    const cachedState = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
    const cachedAssets = (cachedState.assets ?? []).map((asset: { src?: string; [key: string]: unknown }) => ({
      ...asset,
      src: asset.src?.startsWith("data:") ? "" : asset.src,
    }));
    const uploadEvents: Array<{ file: File; cacheId: string }> = [];
    await Promise.all(files.map(async (file) => {
      const cacheId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cachedAssets.push({ id: cacheId, name: file.name, src: "", mimeType: file.type || "application/octet-stream", byteSize: file.size, pending: true });
      uploadEvents.push({ file, cacheId });
    }));
    localStorage.setItem(cacheKey, JSON.stringify({ assets: cachedAssets }));
    uploadEvents.forEach(({ file, cacheId }) => {
      window.dispatchEvent(new CustomEvent("moon:upload-creative-asset", { detail: { file, cacheId } }));
    });
  };

  const deleteAsset = async (asset: (typeof assets)[number]) => {
    const stored = projectAssets?.find((item) => item.url === asset.src || item.name === asset.name);
    const metadata = stored?.metadata ? JSON.parse(stored.metadata) as { publicId?: string; resourceType?: string } : undefined;
    if (projectId) {
      const cacheKey = `moon-creative-local:${projectId}`;
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
      const pending = (cached.assets ?? []).find((item: { name?: string; id?: string; pending?: boolean }) => item.name === asset.name && item.pending);
      if (pending?.id) window.dispatchEvent(new CustomEvent("moon:cancel-creative-upload", { detail: { cacheId: pending.id } }));
    }
    const found = engine.getProject().tracks
      .flatMap((track) => engine.getClipsOnTrack(track.id))
      .filter((clip) => clip.assetId === asset.id || clip.src === asset.src || clip.name === asset.name);
    for (const clip of found) engine.removeClip(clip.id, clip.trackId);
    removeAsset(asset.id);
    if (stored && username && projectId) {
      await removeConvexAsset({ username, projectId: projectId as Id<"creativeProjects">, assetId: stored._id });
    }
    if (metadata?.publicId) {
      await fetch("/api/media/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: metadata.publicId, resourceType: metadata.resourceType }) });
    }
    if (projectId) {
      const cacheKey = `moon-creative-local:${projectId}`;
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
      cached.assets = (cached.assets ?? []).filter((item: { name?: string }) => item.name !== asset.name);
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    }
  };

  return (
    <aside className="flex h-full w-[306px] shrink-0 overflow-hidden border-r border-[#273044] bg-[#101620] text-slate-200">
      <nav className="flex w-[66px] shrink-0 flex-col items-center border-r border-[#273044] bg-[#080c13] py-3">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex w-full flex-col items-center gap-1.5 py-3 text-[10px] transition ${activeTab === id ? "bg-cyan-400 text-[#07111c]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon className="h-5 w-5" /><span>{label}</span></button>)}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {activeTab === "elements" ? <ElementsPanel activateOnTap className="min-h-0 flex-1 overflow-y-auto" /> : <>
          <div className="flex h-12 items-center justify-between border-b border-[#273044] px-3"><h2 className="text-sm font-semibold text-white">{tabs.find((tab) => tab.id === activeTab)?.label}</h2><button type="button" disabled={!username || !projectId} onClick={() => fileInputRef.current?.click()} title={!username || !projectId ? "Preparing project storage" : "Upload media"} className="inline-flex items-center gap-1 rounded-md bg-cyan-400 px-2.5 py-1.5 text-[11px] font-semibold text-[#07111c] hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50"><Upload className="h-3 w-3" /> Upload</button><input ref={fileInputRef} type="file" multiple accept="video/*,audio/*,image/*" onChange={uploadFiles} className="sr-only" disabled={!username || !projectId} /></div>
          <div className="border-b border-[#273044] p-3"><div className="flex h-8 items-center gap-2 rounded-md border border-[#2d3a52] bg-[#080c13] px-2"><Search className="h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeTab === "image" ? "photos" : activeTab === "audio" ? "audio" : "videos"}...`} className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500" /></div><div className="mt-2 flex items-center justify-between text-[9px] text-slate-500"><span>Powered by</span><span className="text-emerald-300">Local library</span></div></div>
          <div className="creative-source-scroll grid min-h-0 flex-1 grid-cols-2 content-start items-start gap-2 overflow-y-auto p-3">{visibleAssets.map((asset) => <div key={asset.id} className="group relative flex h-[124px] min-w-0"><button type="button" draggable onDragStart={(event) => { event.dataTransfer.setData(MEDIA_DRAG_MIME, JSON.stringify({ kind: "media-asset", assetId: asset.id })); event.dataTransfer.setData(mediaDragKindMime(asset.kind), ""); event.dataTransfer.effectAllowed = "copy"; }} className="flex h-full min-w-0 w-full cursor-grab flex-col text-left active:cursor-grabbing"><span className="relative block h-[88px] shrink-0 overflow-hidden rounded-md border border-[#2d3a52] bg-[#080c13]">{asset.thumbnailUrl || asset.src ? <img src={asset.thumbnailUrl || asset.src} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-slate-500"><Music2 className="h-5 w-5" /></span>}<span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[9px] text-white">{asset.durationSec ? `${Math.floor(asset.durationSec / 60)}:${String(Math.floor(asset.durationSec % 60)).padStart(2, "0")}` : ""}</span></span><span className="mt-1 block h-7 truncate text-[10px] leading-3 text-slate-300">{asset.name}</span></button><button type="button" onClick={() => void deleteAsset(asset)} aria-label={`Delete ${asset.name}`} title="Delete file" className="absolute right-1 top-1 rounded bg-rose-500/85 p-1 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-rose-400"><Trash2 className="h-3 w-3" /></button></div>)}{visibleAssets.length === 0 && <p className="col-span-2 py-8 text-center text-[10px] text-slate-500">Upload media to get started.</p>}</div>
        </>}
      </div>
    </aside>
  );
}

function TimelineToolbar({ timelineRef }: { timelineRef: MutableRefObject<TimelineRef | null> }) {
  const { engine } = useEditor();
  const tracks = useTracksStore((state) => state.tracks);
  const selectedClipIds = useSelectionStore((state) => state.selectedClipIds);
  const setZoom = usePlaybackStore((state) => state.setZoom);
  const zoom = usePlaybackStore((state) => state.zoom);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false);

  const addTrack = (kind: "video" | "audio" | "elements", label: string) => {
    const matchingTracks = tracks.filter((track) => track.kind === kind).length;
    if (kind === "video" && matchingTracks > 0) {
      const project = engine.getProject();
      const trackId = generateId();
      engine.loadProject({
        ...project,
        tracks: [...project.tracks, { id: trackId, kind, name: `${label} ${matchingTracks + 1}`, order: project.tracks.length, height: 36, locked: false, disabled: false, muted: false, solo: false }],
        clips: { ...project.clips, [trackId]: [] },
      });
    } else {
      engine.addTrack(kind, { name: `${label} ${matchingTracks + 1}`, order: tracks.length });
    }
    setAddTrackMenuOpen(false);
  };

  const split = () => {
    splitClipAtPlayhead(engine);
  };

  const duplicate = () => {
    const duplicatedIds: string[] = [];
    for (const clipId of selectedClipIds) {
      const found = engine.findClip(clipId);
      if (!found) continue;
      const duplicateId = engine.cloneClip(found.clip.id, found.trackId, found.clip.startFrame + found.clip.durationFrames);
      if (duplicateId) duplicatedIds.push(duplicateId);
    }
    if (duplicatedIds.length > 0) useSelectionStore.getState().selectClips(duplicatedIds);
  };

  const remove = () => {
    engine.batch(() => {
      for (const clipId of selectedClipIds) {
        const found = engine.findClip(clipId);
        if (found) engine.removeClip(found.clip.id, found.trackId);
      }
    }, "Delete clip");
    useSelectionStore.getState().clearSelection();
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-y border-[#273044] bg-[#0a0f1a] px-3 text-slate-300">
      <div className="flex items-center gap-1">
        <div className="relative">
          <button type="button" onClick={() => setAddTrackMenuOpen((open) => !open)} aria-expanded={addTrackMenuOpen} title="Add track" className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs transition hover:bg-white/10 hover:text-white"><Plus className="h-3.5 w-3.5" /> Add Track</button>
          {addTrackMenuOpen && <div className="absolute bottom-full left-0 z-20 mb-2 w-40 rounded-md border border-[#2d3a52] bg-[#111827] p-1.5 shadow-xl">
            <button type="button" onClick={() => addTrack("video", "Video")} className="flex w-full items-center rounded px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-cyan-400/10 hover:text-white">Video track</button>
            <button type="button" onClick={() => addTrack("audio", "Audio")} className="flex w-full items-center rounded px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-cyan-400/10 hover:text-white">Audio track</button>
            <button type="button" onClick={() => addTrack("elements", "Text")} className="flex w-full items-center rounded px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-cyan-400/10 hover:text-white">Text track</button>
          </div>}
        </div>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button type="button" onClick={split} disabled={selectedClipIds.size === 0} title="Split clip at playhead" className="rounded p-1.5 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><Scissors className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={duplicate} disabled={selectedClipIds.size === 0} title="Duplicate selected clip" className="rounded p-1.5 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={remove} disabled={selectedClipIds.size === 0} title="Delete selected clip" className="rounded p-1.5 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} title="Zoom out" className="rounded p-1.5 transition hover:bg-white/10 hover:text-white"><Minus className="h-3.5 w-3.5" /></button>
        <input type="range" min="0.1" max="4" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Timeline zoom" className="w-24 accent-cyan-400" />
        <button type="button" onClick={() => setZoom(Math.min(4, zoom + 0.1))} title="Zoom in" className="rounded p-1.5 transition hover:bg-white/10 hover:text-white"><Plus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => timelineRef.current?.fitToWindow()} title="Fit timeline to window" className="rounded px-2 py-1.5 text-xs transition hover:bg-white/10 hover:text-white">Fit</button>
      </div>
    </div>
  );
}
